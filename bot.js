/**
 * ╔══════════════════════════════════════════╗
 * ║         RYO — Discord AI Bot  v4         ║
 * ║   Smart Memory • Vision • Vibe Upgrade   ║
 * ╚══════════════════════════════════════════╝
 *
 * Stack: Node.js · discord.js v14 · OpenAI SDK v4
 */

import "dotenv/config";
import {
  Client, GatewayIntentBits, Partials,
  ActivityType, Events
} from "discord.js";
import { MemorySystem } from "./memory.js";
import { RyoAI }        from "./openai.js";

// Import utilities, configs, core & commands
import { log } from "./utils/logger.js";
import { rand, sleep } from "./utils/helpers.js";
import {
  PREFIX, RESPOND_CHANCE, REACTION_ONLY_RATE, TRIGGER_WORDS, OWNER_ID, IDLE_CHANNEL_ID,
  POSITIVE_WORDS, NEGATIVE_WORDS, POSITIVE_EMOJIS, NEGATIVE_EMOJIS, NEUTRAL_EMOJIS
} from "./utils/config.js";
import { detectIsOwner, detectMemberRole, getServerEmojis } from "./core/permissions.js";
import { startIdleChecker } from "./core/idle.js";
import { handleCommand } from "./commands/index.js";

// ── Bắt lỗi toàn cục — KHÔNG để bot chết im lặng ────────────
process.on("uncaughtException", (err) => {
  console.error("\n========== UNCAUGHT EXCEPTION ==========");
  console.error(err);
  console.error("=========================================\n");
});
process.on("unhandledRejection", (reason) => {
  console.error("\n========== UNHANDLED REJECTION ==========");
  console.error(reason);
  console.error("==========================================\n");
});

log.info("BOT", "Đang khởi động Ryo...");

// ── Validate env ──────────────────────────────────────────
if (!process.env.DISCORD_TOKEN)  { log.error("ENV", "❌ DISCORD_TOKEN missing in .env"); process.exit(1); }
if (!process.env.OPENAI_API_KEY) { log.error("ENV", "❌ OPENAI_API_KEY missing in .env"); process.exit(1); }
log.info("ENV", "✅ Environment variables loaded");

// ── Init ──────────────────────────────────────────────────
const memory = new MemorySystem();
const ai     = new RyoAI(memory);

// Sử dụng object reference để chia sẻ biến mutable qua các module
const lastActivityTimeRef = { value: Date.now() };

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildEmojisAndStickers,
  ],
  partials: [Partials.Channel]
});

// ── Ready ─────────────────────────────────────────────────
client.once(Events.ClientReady, async () => {
  const stats = memory.getStats();
  console.log(`
==============================================
   RYO IS ONLINE (Smart Memory v4)
==============================================
Tag      : ${client.user.tag}
User ID  : ${client.user.id}
Servers  : ${client.guilds.cache.size}
----------------------------------------------
Model    : ${process.env.OPENAI_MODEL ?? "gpt-4o-mini"}
Owner ID : ${OWNER_ID ?? "tự detect theo từng server"}
Idle Ch  : ${IDLE_CHANNEL_ID ?? "not set"}
----------------------------------------------
Users remembered   : ${stats.totalUsers}
Channels in memory : ${stats.totalChannels}
Facts learned       : ${stats.totalFacts}
Long-term digests   : ${stats.totalDigests}
Total messages      : ${stats.totalMessages}
==============================================`);

  client.user.setActivity("everyone 👀 | !ryo help", { type: ActivityType.Watching });

  // Backfill embedding cho facts cũ (nếu có) — chạy ngầm, không block bot
  log.info("MEM", "🧠 Đang kiểm tra & backfill embeddings cho facts cũ...");
  const n = await ai.backfillEmbeddings();
  log.info("MEM", n > 0 ? `✅ Backfilled ${n} facts` : "✅ Không có fact nào cần backfill");

  startIdleChecker(client, lastActivityTimeRef);
});

// ── Vibe: phản ứng emoji nhẹ nhàng thay vì lúc nào cũng phải trả lời ──
async function reactToMessage(msg) {
  const lower = msg.content.toLowerCase();
  let pool = NEUTRAL_EMOJIS;
  if (POSITIVE_WORDS.some(w => lower.includes(w))) pool = POSITIVE_EMOJIS;
  else if (NEGATIVE_WORDS.some(w => lower.includes(w))) pool = NEGATIVE_EMOJIS;
  try { await msg.react(rand(pool)); } catch { /* thiếu quyền react thì bỏ qua, không crash */ }
}

// ── Message Handler ───────────────────────────────────────
client.on(Events.MessageCreate, async (msg) => {
  if (msg.author.bot) return;

  const content = msg.content.trim();
  const lower   = content.toLowerCase();
  const isDM    = !msg.guild;
  const isMentioned  = msg.mentions.has(client.user);
  const hasKeyword   = TRIGGER_WORDS.some(kw => lower.includes(kw));
  const isCommand    = content.startsWith(PREFIX);
  const randomChance = !isCommand && Math.random() < RESPOND_CHANCE;

  if (isCommand) {
    log.info("CMD", `${msg.author.username} → ${content}`);
    await handleCommand(msg, content.slice(PREFIX.length).trim(), { memory, ai });
    return;
  }

  if (!isMentioned && !hasKeyword && !isDM && !randomChance) return;

  lastActivityTimeRef.value = Date.now();
  const isOwner    = detectIsOwner(msg);
  const memberRole = detectMemberRole(msg);
  const trigger     = isMentioned ? "mention" : hasKeyword ? "keyword" : isDM ? "DM" : "random";
  const location    = isDM ? "DM" : `#${msg.channel.name} (${msg.guild.name})`;

  // ── Vibe upgrade: nếu là trigger "random" (không được gọi trực tiếp),
  // một nửa số lần chỉ react emoji cho tự nhiên, đỡ giống bot lúc nào cũng phải nói gì đó
  if (trigger === "random" && Math.random() < REACTION_ONLY_RATE) {
    log.msg("REACT", `${msg.author.username} @ ${location} — chỉ react, không reply`);
    return reactToMessage(msg);
  }

  log.msg("CHAT", `[${trigger}] ${isOwner ? "👑 " : ""}${memberRole ? `[${memberRole}] ` : ""}${msg.author.username} @ ${location}`);
  log.msg("CHAT", `↳ "${content.slice(0, 80)}${content.length > 80 ? "..." : ""}"`);

  // ── Vision: nếu có ảnh đính kèm, gửi luôn cho AI "xem"
  const imageUrls = [...msg.attachments.values()]
    .filter(a => a.contentType?.startsWith("image/"))
    .map(a => a.url);
  if (imageUrls.length) log.msg("VISION", `${msg.author.username} gửi ${imageUrls.length} ảnh`);

  memory.addMessage(String(msg.channel.id), String(msg.author.id),
    msg.member?.displayName ?? msg.author.username, content || "[gửi ảnh]", "user");

  await msg.channel.sendTyping();
  const t0 = Date.now();

  try {
    const reply = await ai.generateResponse({
      channelId:   String(msg.channel.id),
      userId:      String(msg.author.id),
      username:    msg.member?.displayName ?? msg.author.username,
      userMessage: content,
      guildName:   msg.guild?.name ?? "DM",
      isOwner,
      memberRole,
      imageUrls,
      serverEmojis: getServerEmojis(msg.guild)
    });

    const ms = Date.now() - t0;
    log.info("CHAT", `↳ Ryo (${ms}ms): "${reply.slice(0, 80)}${reply.length > 80 ? "..." : ""}"`);

    memory.addMessage(String(msg.channel.id), "ryo", "Ryo", reply, "assistant");

    if (reply.length > 2000) {
      const chunks = reply.match(/.{1,1990}/gs) ?? [reply];
      for (const chunk of chunks) {
        await msg.reply({ content: chunk, allowedMentions: { repliedUser: false } });
        await sleep(500);
      }
    } else {
      await msg.reply({ content: reply, allowedMentions: { repliedUser: false } });
    }
  } catch (err) {
    log.error("CHAT", `OpenAI error: ${err.message}`);
    const sad = ["Uh... cái gì đó sai rồi 😵", "bị lag... thử lại đi", "404: vibe not found 💀"];
    await msg.reply({ content: rand(sad), allowedMentions: { repliedUser: false } });
  }
});

// ── Graceful shutdown ──────────────────────────────────────
process.on("SIGINT",  () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

function shutdown(sig) {
  log.warn("BOT", `${sig} received — saving memory and exiting...`);
  memory.saveAll();
  client.destroy();
  process.exit(0);
}

// ── Connect ────────────────────────────────────────────────
log.info("BOT", "Connecting to Discord...");
client.login(process.env.DISCORD_TOKEN).catch((err) => {
  console.error("\n========== LOGIN FAILED ==========");
  console.error("Không login được Discord. Nguyên nhân thường gặp:");
  console.error("  1. DISCORD_TOKEN trong .env sai hoặc đã bị reset");
  console.error("  2. Token bị dán thừa dấu cách / xuống dòng");
  console.error("  3. Bot app đã bị xóa trên Discord Developer Portal");
  console.error("Chi tiết lỗi:", err.message);
  console.error("===================================\n");
  process.exit(1);
});
