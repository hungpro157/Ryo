// commands/ryo.js — !ryo subcommand handlers

import { EmbedBuilder } from "discord.js";
import { log } from "../../utils/logger.js";
import { detectIsOwner, detectMemberRole, getServerEmojis } from "../permissions.js";

async function sendHelp(msg) {
  const embed = new EmbedBuilder()
    .setTitle("🌸 Ryo — AI Discord Bot")
    .setDescription("Mention em hoặc gõ 'ryo' để chat. Em học và nhớ theo thời gian, không chỉ nhớ vẹt.")
    .setColor(0xFF6B9D)
    .addFields(
      { name: "💬 Cách chat", value: "Mention @Ryo · Gõ 'ryo' trong tin nhắn · Nhắn DM trực tiếp · Gửi kèm ảnh để em xem", inline: false },
      { name: "🧠 Memory Commands",
        value: [
          "`!ryo <tin nhắn>` — Chat trực tiếp",
          "`!ryo memory` — Ryo nhớ gì về bạn + độ thân thiết",
          "`!ryo digest` — Tóm tắt dài hạn của channel này",
          "`!ryo forget` / `!ryo forget me` — Xóa bộ nhớ",
          "`!ryo stats` — Thống kê hệ thống",
          "`!ryo mood` — Tâm trạng hiện tại"
        ].join("\n"),
        inline: false
      },
      { name: "🛠️ Tiện ích AI",
        value: [
          "`!tldr [số tin nhắn]` — Tóm tắt chat gần đây (mặc định 30)",
          "`!translate <ngôn ngữ> <nội dung>` — Dịch (hoặc reply + lệnh để dịch tin nhắn đó)",
          "`!imagine <prompt>` — Vẽ ảnh bằng AI (DALL·E 3)",
          "`!poll <câu hỏi> | <lựa chọn 1> | <lựa chọn 2>...` — Tạo bình chọn",
          "`!8ball <câu hỏi>` — Hỏi quả cầu ma thuật"
        ].join("\n"),
        inline: false
      }
    )
    .setFooter({ text: "Ryo v4.0 · Smart Memory · Vision · Node.js · OpenAI" });

  await msg.reply({ embeds: [embed], allowedMentions: { repliedUser: false } });
}

async function sendMemory(msg, { memory }) {
  const uid     = String(msg.author.id);
  const cid     = String(msg.channel.id);
  const profile = memory.getUserProfileText(uid);
  const chSumm  = memory.getChannelSummaryText(cid);

  const embed = new EmbedBuilder().setTitle("🧠 Bộ nhớ của Ryo").setColor(0x9B59B6);
  if (profile) embed.addFields({ name: `📁 Về ${msg.member?.displayName ?? msg.author.username}`, value: profile });
  if (chSumm)  embed.addFields({ name: "📜 Channel này", value: chSumm });
  if (!profile && !chSumm) embed.setDescription("Em chưa nhớ gì về bạn cả... Chúng ta mới quen mà 🤷");

  await msg.reply({ embeds: [embed], allowedMentions: { repliedUser: false } });
}

async function sendDigest(msg, { memory }) {
  const digest = memory.getDigest(String(msg.channel.id));
  const embed = new EmbedBuilder()
    .setTitle("📜 Tóm tắt dài hạn — Channel này")
    .setColor(0x3498DB)
    .setDescription(digest || "Chưa có gì để tóm tắt — channel còn mới hoặc chưa đủ tin nhắn để em reflect 🤷");
  await msg.reply({ embeds: [embed], allowedMentions: { repliedUser: false } });
}

async function forgetChannel(msg, { memory }) {
  memory.clearChannel(String(msg.channel.id));
  log.warn("MEM", `Channel ${msg.channel.id} cleared by ${msg.author.username}`);
  await msg.reply({ content: "🗑️ Xóa hết rồi, kể cả tóm tắt dài hạn. Fresh start nào~ ✨", allowedMentions: { repliedUser: false } });
}

async function forgetUser(msg, { memory }) {
  memory.clearUser(String(msg.author.id));
  log.warn("MEM", `User ${msg.author.id} (${msg.author.username}) data cleared`);
  await msg.reply({
    content: `🗑️ Đã xóa toàn bộ data về **${msg.member?.displayName ?? msg.author.username}**. Bạn là ai vậy nhỉ? 👀`,
    allowedMentions: { repliedUser: false }
  });
}

async function sendStats(msg, { memory }) {
  const s = memory.getStats();
  const embed = new EmbedBuilder()
    .setTitle("📊 Ryo Memory Stats")
    .setColor(0x2ECC71)
    .addFields(
      { name: "👥 Users đã chat",      value: String(s.totalUsers),    inline: true },
      { name: "💬 Channels đang nhớ",  value: String(s.totalChannels), inline: true },
      { name: "📝 Tổng tin nhắn",      value: String(s.totalMessages), inline: true },
      { name: "🧠 Facts đã học",       value: String(s.totalFacts),    inline: true },
      { name: "📜 Digest dài hạn",     value: String(s.totalDigests),  inline: true },
    );
  await msg.reply({ embeds: [embed], allowedMentions: { repliedUser: false } });
}

async function sendMood(msg, { ai }) {
  await msg.reply({ content: `🎭 Mood hiện tại: ${ai.mood}`, allowedMentions: { repliedUser: false } });
}

export async function handleRyoSub(msg, body, { memory, ai }) {
  if (!body || body.toLowerCase() === "help") return sendHelp(msg);

  const arg = body.toLowerCase();
  if (arg === "memory")    return sendMemory(msg, { memory });
  if (arg === "digest")    return sendDigest(msg, { memory });
  if (arg === "forget")    return forgetChannel(msg, { memory });
  if (arg === "forget me") return forgetUser(msg, { memory });
  if (arg === "stats")     return sendStats(msg, { memory });
  if (arg === "mood")      return sendMood(msg, { ai });

  const isOwner    = detectIsOwner(msg);
  const memberRole = detectMemberRole(msg);
  memory.addMessage(String(msg.channel.id), String(msg.author.id),
    msg.member?.displayName ?? msg.author.username, body, "user");

  await msg.channel.sendTyping();
  const reply = await ai.generateResponse({
    channelId:   String(msg.channel.id),
    userId:      String(msg.author.id),
    username:    msg.member?.displayName ?? msg.author.username,
    userMessage: body,
    guildName:   msg.guild?.name ?? "DM",
    isOwner,
    memberRole,
    serverEmojis: getServerEmojis(msg.guild)
  });

  memory.addMessage(String(msg.channel.id), "ryo", "Ryo", reply, "assistant");
  await msg.reply({ content: reply, allowedMentions: { repliedUser: false } });
}
