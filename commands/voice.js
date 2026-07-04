// commands/voice.js — Discord voice/TTS commands
// Lệnh:
//   !voice join
//   !voice leave
//   !voice say <text>
//   !voice read      // đọc tin nhắn được reply
//   !speak <text>    // alias nhanh, route từ commands/index.js

import fs from "fs";
import os from "os";
import path from "path";
import crypto from "crypto";
import { spawn } from "child_process";
import OpenAI from "openai";
import ffmpegPath from "ffmpeg-static";
import { AttachmentBuilder, PermissionsBitField } from "discord.js";
import { StreamType } from "@discordjs/voice";
import {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  entersState,
  getVoiceConnection,
  NoSubscriberBehavior
} from "@discordjs/voice";

let resolvedFfmpegPath = null;
async function getExecutableFfmpegPath() {
  if (resolvedFfmpegPath) return resolvedFfmpegPath;

  // /sdcard thường bị chặn execute nên binary ffmpeg-static không spawn trực tiếp được.
  // Copy sang /tmp rồi chmod để chạy trong môi trường Linux/proot.
  const source = ffmpegPath || "ffmpeg";
  if (source === "ffmpeg") {
    resolvedFfmpegPath = source;
    return resolvedFfmpegPath;
  }

  const target = path.join(os.tmpdir(), "ryo-ffmpeg");
  await fs.promises.copyFile(source, target);
  await fs.promises.chmod(target, 0o755);
  resolvedFfmpegPath = target;
  return resolvedFfmpegPath;
}

let openai = null;
function getOpenAI() {
  if (!openai) {
    openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      maxRetries: 3,
      timeout: 45_000,
    });
  }
  return openai;
}

// Mỗi guild giữ 1 player riêng để tránh chồng tiếng lung tung
const players = new Map(); // guildId -> AudioPlayer
const voiceDebugConnections = new WeakSet();

function permissionLabel(allowed) {
  return allowed ? "OK" : "NO";
}

function getVoicePermissionReport(msg, channel) {
  const me = msg.guild?.members?.me;
  const perms = me ? channel.permissionsFor(me) : null;
  if (!perms) return "unknown-permissions";

  return [
    `ViewChannel=${permissionLabel(perms.has(PermissionsBitField.Flags.ViewChannel))}`,
    `Connect=${permissionLabel(perms.has(PermissionsBitField.Flags.Connect))}`,
    `Speak=${permissionLabel(perms.has(PermissionsBitField.Flags.Speak))}`,
    `UseVAD=${permissionLabel(perms.has(PermissionsBitField.Flags.UseVAD))}`
  ].join(" ");
}

function assertVoicePermissions(msg, channel) {
  const me = msg.guild?.members?.me;
  const perms = me ? channel.permissionsFor(me) : null;
  if (!perms) return;

  const missing = [];
  if (!perms.has(PermissionsBitField.Flags.ViewChannel)) missing.push("View Channel");
  if (!perms.has(PermissionsBitField.Flags.Connect)) missing.push("Connect");
  if (!perms.has(PermissionsBitField.Flags.Speak)) missing.push("Speak");

  if (missing.length) {
    throw new Error(`Bot thiếu quyền voice: ${missing.join(", ")}.`);
  }
}

function attachVoiceDebug(connection, msg, channel) {
  if (voiceDebugConnections.has(connection)) return;
  voiceDebugConnections.add(connection);

  const guildName = msg.guild?.name || msg.guild?.id || "unknown-guild";
  const channelName = channel?.name || channel?.id || "unknown-channel";

  console.log(
    `[VOICE] join requested guild=${guildName}(${msg.guild?.id}) channel=${channelName}(${channel?.id}) ` +
    `type=${channel?.type} full=${channel?.full ?? "n/a"} ` +
    `userLimit=${channel?.userLimit ?? "n/a"} rtcRegion=${channel?.rtcRegion ?? "auto"} ` +
    `perms=${getVoicePermissionReport(msg, channel)}`
  );

  connection.on("stateChange", (oldState, newState) => {
    console.log(`[VOICE] connection state ${oldState.status} -> ${newState.status}`);
  });

  connection.on("error", (err) => {
    console.error("[VOICE] connection error:", err);
  });

  connection.on("debug", (message) => {
    console.log(`[VOICE:debug] ${message}`);
  });
}


function getPlayer(guildId) {
  let player = players.get(guildId);
  if (!player) {
    player = createAudioPlayer({
      behaviors: {
        noSubscriber: NoSubscriberBehavior.Play
      }
    });

    player.on("error", (err) => {
      console.error(`[VOICE] Audio player error in guild ${guildId}:`, err.message);
    });

    players.set(guildId, player);
  }
  return player;
}

function cleanText(text = "") {
  return String(text)
    .replace(/<@!?(\d+)>/g, "người dùng")
    .replace(/<@&(\d+)>/g, "role")
    .replace(/<#(\d+)>/g, "channel")
    .replace(/https?:\/\/\S+/gi, "link")
    .replace(/\s+/g, " ")
    .trim();
}

function getUserVoiceChannel(msg) {
  return msg.member?.voice?.channel ?? null;
}

async function ensureVoiceConnection(msg) {
  if (!msg.guild) throw new Error("Voice chỉ dùng được trong server, không dùng trong DM.");

  const channel = getUserVoiceChannel(msg);
  if (!channel) throw new Error("Bạn phải vào voice channel trước đã.");
  assertVoicePermissions(msg, channel);

  let connection = getVoiceConnection(msg.guild.id);
  if (connection && connection.joinConfig.channelId === channel.id) {
    return connection;
  }

  // Nếu bot đang ở channel khác trong cùng guild, destroy để join lại channel của người gọi
  if (connection) connection.destroy();

  connection = joinVoiceChannel({
    channelId: channel.id,
    guildId: msg.guild.id,
    adapterCreator: msg.guild.voiceAdapterCreator,
    // Bot hiện chỉ phát TTS, không nghe voice ở Phase 1 => selfDeaf=true ổn định hơn.
    selfDeaf: true,
    selfMute: false,
  });
  attachVoiceDebug(connection, msg, channel);

  const player = getPlayer(msg.guild.id);
  connection.subscribe(player);

  try {
    await entersState(connection, VoiceConnectionStatus.Ready, 45_000);
  } catch (err) {
    const status = connection.state?.status || "unknown";
    connection.destroy();
    throw new Error(`Không join voice được: ${err.message} (status cuối: ${status})`);
  }

  return connection;
}

async function createTtsFile(text) {
  const safeText = cleanText(text).slice(0, 3800);
  if (!safeText) throw new Error("Không có nội dung để đọc.");

  const model = process.env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts";
  const voice = process.env.OPENAI_TTS_VOICE || "alloy";

  const response = await getOpenAI().audio.speech.create({
    model,
    voice,
    input: safeText,
    response_format: "mp3",
  });

  const buffer = Buffer.from(await response.arrayBuffer());
  const file = path.join(os.tmpdir(), `ryo-tts-${crypto.randomUUID()}.mp3`);
  await fs.promises.writeFile(file, buffer);
  return file;
}

async function playText(msg, text) {
  const connection = await ensureVoiceConnection(msg);
  const player = getPlayer(msg.guild.id);
  connection.subscribe(player);

  const file = await createTtsFile(text);
  const executableFfmpeg = await getExecutableFfmpegPath();
  const ffmpeg = spawn(executableFfmpeg, [
    "-i", file,
    "-analyzeduration", "0",
    "-loglevel", "0",
    "-f", "s16le",
    "-ar", "48000",
    "-ac", "2",
    "pipe:1"
  ]);
  const resource = createAudioResource(ffmpeg.stdout, { inputType: StreamType.Raw });

  return new Promise((resolve, reject) => {
    let settled = false;

    const cleanup = async () => {
      player.off(AudioPlayerStatus.Idle, onIdle);
      player.off("error", onError);
      try { ffmpeg.kill("SIGKILL"); } catch {}
      try { await fs.promises.unlink(file); } catch {}
    };

    const onIdle = async () => {
      if (settled) return;
      settled = true;
      await cleanup();
      resolve();
    };

    const onError = async (err) => {
      if (settled) return;
      settled = true;
      await cleanup();
      reject(err);
    };

    ffmpeg.once("error", onError);
    player.once(AudioPlayerStatus.Idle, onIdle);
    player.once("error", onError);
    player.play(resource);
  });
}

async function sendTtsFileFallback(msg, text, reason = "unknown") {
  const file = await createTtsFile(text);
  const shortReason = cleanText(reason).slice(0, 180) || "không rõ lỗi";

  try {
    const attachment = new AttachmentBuilder(file, { name: "ryo-tts.mp3" });
    await msg.reply({
      content:
        "Không phát được trong voice nên tao gửi file TTS ở đây." +
        `
Lý do: ${shortReason}`,
      files: [attachment],
      allowedMentions: { repliedUser: false }
    });
  } finally {
    try { await fs.promises.unlink(file); } catch {}
  }
}

async function getRepliedMessageText(msg) {
  if (!msg.reference?.messageId) {
    throw new Error("Hãy reply một tin nhắn rồi dùng `!voice read`.");
  }

  const replied = await msg.channel.messages.fetch(msg.reference.messageId);
  const text = cleanText(replied.content || "");

  if (text) return text;
  if (replied.attachments.size) return "Tin nhắn này có file hoặc ảnh đính kèm, nhưng không có chữ để đọc.";
  return "Tin nhắn này trống hoặc bot không đọc được nội dung.";
}

export async function handleVoice(msg, body = "") {
  const [rawSub, ...rest] = body.trim().split(/\s+/);
  const sub = (rawSub || "help").toLowerCase();
  const text = rest.join(" ").trim();

  try {
    switch (sub) {
      case "join": {
        const channel = getUserVoiceChannel(msg);
        await ensureVoiceConnection(msg);
        return msg.reply({ content: `Đã vào voice: **${channel.name}**.`, allowedMentions: { repliedUser: false } });
      }

      case "leave":
      case "disconnect": {
        const connection = getVoiceConnection(msg.guild?.id);
        if (!connection) {
          return msg.reply({ content: "Bot chưa ở voice channel nào.", allowedMentions: { repliedUser: false } });
        }
        connection.destroy();
        return msg.reply({ content: "Đã rời voice.", allowedMentions: { repliedUser: false } });
      }

      case "say":
      case "speak": {
        if (!text) {
          return msg.reply({ content: "Dùng: `!voice say nội dung cần đọc`", allowedMentions: { repliedUser: false } });
        }
        await msg.react("🔊").catch(() => {});
        try {
          await playText(msg, text);
        } catch (err) {
          console.error("[VOICE] Voice playback failed, sending TTS file fallback:", err);
          await sendTtsFileFallback(msg, text, err.message);
        }
        return;
      }

      case "read": {
        const repliedText = await getRepliedMessageText(msg);
        await msg.react("🔊").catch(() => {});
        try {
          await playText(msg, repliedText);
        } catch (err) {
          console.error("[VOICE] Voice playback failed, sending TTS file fallback:", err);
          await sendTtsFileFallback(msg, repliedText, err.message);
        }
        return;
      }

      case "help":
      default:
        return msg.reply({
          content:
            "Voice commands:\n" +
            "`!voice join` — vào voice channel của bạn\n" +
            "`!voice say <text>` — đọc text trong voice\n" +
            "`!voice read` — reply một tin nhắn rồi dùng lệnh này để đọc\n" +
            "`!voice leave` — rời voice\n" +
            "Alias nhanh: `!speak <text>`",
          allowedMentions: { repliedUser: false }
        });
    }
  } catch (err) {
    console.error("[VOICE]", err);
    return msg.reply({
      content: `Voice lỗi: ${err.message}`,
      allowedMentions: { repliedUser: false }
    });
  }
}

export async function handleSpeak(msg, body = "") {
  return handleVoice(msg, `say ${body}`);
}
