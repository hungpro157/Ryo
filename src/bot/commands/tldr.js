// commands/tldr.js — !tldr: Tóm tắt chat gần đây

import { EmbedBuilder } from "discord.js";
import { log } from "../../utils/logger.js";

export async function handleTldr(msg, body, { ai }) {
  let n = parseInt(body, 10);
  if (!Number.isFinite(n) || n <= 0) n = 30;
  n = Math.min(n, 100);

  await msg.channel.sendTyping();

  let fetched;
  try {
    fetched = await msg.channel.messages.fetch({ limit: n });
  } catch (err) {
    log.error("TLDR", err.message);
    return msg.reply({ content: "Không đọc được lịch sử channel này, có thể em thiếu quyền 😵", allowedMentions: { repliedUser: false } });
  }

  const sorted     = [...fetched.values()].reverse();
  const transcript = sorted
    .filter(m => m.content && m.content.trim().length > 0)
    .map(m => `${m.member?.displayName ?? m.author.username}: ${m.content}`)
    .join("\n");

  if (!transcript) {
    return msg.reply({ content: "Không có gì để tóm tắt cả, toàn ảnh/sticker không à 🤷", allowedMentions: { repliedUser: false } });
  }

  try {
    const summary = await ai.summarizeChannel(transcript);
    const embed = new EmbedBuilder()
      .setTitle(`📋 TL;DR — ${sorted.length} tin nhắn gần nhất`)
      .setColor(0x3498DB)
      .setDescription(summary);
    await msg.reply({ embeds: [embed], allowedMentions: { repliedUser: false } });
  } catch (err) {
    log.error("TLDR", err.message);
    await msg.reply({ content: "Tóm tắt thất bại rồi, thử lại sau nhé 😵", allowedMentions: { repliedUser: false } });
  }
}
