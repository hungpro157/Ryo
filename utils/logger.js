// utils/logger.js — Logger dùng chung toàn bot
// Text thuần, không ANSI color — hiển thị đúng trên mọi hosting panel

function ts() {
  return new Date().toLocaleString("vi-VN", { hour12: false });
}

export const log = {
  info:  (tag, msg) => console.log(`[${ts()}] [${tag}] ${msg}`),
  warn:  (tag, msg) => console.log(`[${ts()}] [${tag}] [WARN] ${msg}`),
  error: (tag, msg) => console.log(`[${ts()}] [${tag}] [ERROR] ${msg}`),
  msg:   (tag, msg) => console.log(`[${ts()}] [${tag}] ${msg}`),
};

export { ts };
