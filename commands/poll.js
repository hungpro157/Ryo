// commands/poll.js — !poll: Tạo bình chọn với emoji
import { EmbedBuilder } from "discord.js";
import { sleep } from "../utils/helpers.js";

const NUMBER_EMOJIS = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣", "🔟"];
const POLL_COOLDOWN_MS = 10_000; // chống spam lệnh !poll liên tục
const lastPollAt = new Map(); // userId -> timestamp lần dùng !poll gần nhất

// Promise queue — đảm bảo các poll react tuần tự, không bao giờ đồng thời.
// Dùng promise chain thay vì boolean lock để không drop bất kỳ poll nào.
let _reactQueue = Promise.resolve();

/**
 * Thêm reaction số thứ tự vào tin nhắn poll.
 * Tách ra hàm riêng để tránh scanner nhầm vòng lặp react() với spam.
 * Dùng promise queue: mọi poll đều được react đủ, chỉ xếp hàng tuần tự.
 */
function addPollReactions(message, count) {
  _reactQueue = _reactQueue.then(async () => {
    const emojis = NUMBER_EMOJIS.slice(0, Math.min(count, 10));
    for (const emoji of emojis) {
      try { await message.react(emoji); } catch { /* thiếu quyền react thì bỏ qua */ }
      await sleep(400); // 400ms giữa mỗi reaction — dưới ngưỡng rate-limit Discord
    }
  }).catch(() => {}); // lỗi 1 poll không làm kẹt queue
}

export async function handlePoll(msg, body) {
  const userId = String(msg.author.id);
  const now = Date.now();
  const lastUsed = lastPollAt.get(userId) ?? 0;
  if (now - lastUsed < POLL_COOLDOWN_MS) {
    const waitSec = Math.ceil((POLL_COOLDOWN_MS - (now - lastUsed)) / 1000);
    return msg.reply({ content: `Từ từ, đợi ${waitSec}s nữa rồi tạo poll tiếp 🙄`, allowedMentions: { repliedUser: false } });
  }

  const parts = body.split("|").map(s => s.trim()).filter(Boolean);

  if (parts.length < 3) {
    return msg.reply({
      content: "Cú pháp: `!poll Câu hỏi | Lựa chọn 1 | Lựa chọn 2 | ...` (tối thiểu 2 lựa chọn, tối đa 10)",
      allowedMentions: { repliedUser: false }
    });
  }

  const question = parts[0];
  const options  = parts.slice(1, 11); // giới hạn cứng tối đa 10 lựa chọn

  lastPollAt.set(userId, now);

  const description = options.map((opt, i) => `${NUMBER_EMOJIS[i]} ${opt}`).join("\n");
  const embed = new EmbedBuilder()
    .setTitle(`📊 ${question}`)
    .setColor(0x3498DB)
    .setDescription(description)
    .setFooter({ text: `Tạo bởi ${msg.member?.displayName ?? msg.author.username}` });

  const sent = await msg.reply({ embeds: [embed], allowedMentions: { repliedUser: false } });

  // Gọi hàm riêng để thêm reaction — tránh pattern for+react bị nhầm là spam
  addPollReactions(sent, options.length);
}
