// utils/config.js — Tất cả constants cấu hình của bot

export const PREFIX           = "!";
export const RESPOND_CHANCE   = 0.12;   // % tự reply tin nhắn không mention (đỡ spam)
export const REACTION_ONLY_RATE = 0.5; // trong số random trigger, % chỉ react emoji thay vì reply
export const TRIGGER_WORDS    = ["ryo", "りょ", "リョ"];

// OWNER_ID chỉ dùng làm fallback khi chat qua DM (DM không có "server" nên không
// detect được owner tự động). Trong server, Ryo tự nhận biết owner/admin/mod qua
// Discord API — không cần config gì thêm, tự đúng ở MỌI server bot được add vào.
export const OWNER_ID         = process.env.OWNER_ID ?? null;

export const IDLE_MIN_HOURS   = 24;
export const IDLE_MAX_HOURS   = 48;
export const IDLE_CHANNEL_ID  = process.env.IDLE_CHANNEL_ID ?? null;

export const POSITIVE_WORDS   = ["vui", "sướng", "yêu", "thích", "ngon", "tốt", "hay", "happy", "love"];
export const NEGATIVE_WORDS   = ["buồn", "tệ", "chán", "mệt", "ghét", "khó", "sad", "tức", "khổ", "stress"];
export const POSITIVE_EMOJIS  = ["👍", "🔥", "❤️", "😂", "✨"];
export const NEGATIVE_EMOJIS  = ["😢", "💀", "😬", "🫂"];
export const NEUTRAL_EMOJIS   = ["👀", "😂", "🤔", "💯", "😏"];

