// commands/eightball.js — !8ball: Hỏi quả cầu ma thuật

import { rand } from "../utils/helpers.js";

const EIGHTBALL_ANSWERS = [
  "Chắc chắn luôn 💯", "Ừ, đúng vậy", "Có thể... 50/50 thôi",
  "Không đời nào", "Hỏi lại sau đi, giờ chưa rõ", "100% không",
  "Em thấy có khả năng đó", "Đừng mong đợi nhiều", "Yes, rõ ràng",
  "Nope, quên đi", "Vũ trụ đang nói có", "Tốt nhất đừng hỏi câu này",
];

export async function handle8ball(msg, question) {
  if (!question) {
    return msg.reply({ content: "Hỏi gì đi rồi em mới đoán được chứ 🎱", allowedMentions: { repliedUser: false } });
  }
  await msg.reply({ content: `🎱 ${rand(EIGHTBALL_ANSWERS)}`, allowedMentions: { repliedUser: false } });
}
