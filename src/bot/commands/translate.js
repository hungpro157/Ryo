// commands/translate.js — !translate / !dich

import { log } from "../../utils/logger.js";
import { chatCompletion } from '../../ai/llm.js';

export async function handleTranslate(msg, body) {
  const [langRaw, ...rest] = body.split(/\s+/);
  const lang = langRaw;
  let text   = rest.join(" ").trim();

  // Nếu không kèm text và đang reply 1 tin nhắn khác, dịch tin nhắn đó
  if (!text && msg.reference) {
    try {
      const refMsg = await msg.channel.messages.fetch(msg.reference.messageId);
      text = refMsg.content;
    } catch { /* bỏ qua */ }
  }

  if (!lang || !text) {
    return msg.reply({
      content: "Cú pháp: `!translate <ngôn ngữ> <nội dung>`\nHoặc: reply vào tin nhắn cần dịch rồi gõ `!translate <ngôn ngữ>`",
      allowedMentions: { repliedUser: false }
    });
  }

  await msg.channel.sendTyping();
  try {
    const translated = await chatCompletion([
      { role: 'system', content: `Dịch nội dung sang ${lang}. Chỉ trả về bản dịch, không giải thích.` },
      { role: 'user', content: text.slice(0, 10000) },
    ], { maxTokens: 500, temperature: 0.1 });
    await msg.reply({ content: translated, allowedMentions: { repliedUser: false } });
  } catch (err) {
    log.error("TRANSLATE", err.message);
    await msg.reply({ content: "Dịch thất bại rồi, thử lại sau 😵", allowedMentions: { repliedUser: false } });
  }
}
