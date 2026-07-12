// utils/logger.js
import fs from 'fs';
import path from 'path';

const logsDir = path.resolve(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

function ts() {
  return new Date().toLocaleString("vi-VN", { hour12: false });
}

function writeLog(level, tag, msg) {
  const line = `[${ts()}] [${level}] [${tag}] ${msg}`;
  console.log(line);
  fs.appendFileSync(path.join(logsDir, 'app.log'), line + '\n', 'utf-8');
}

export const log = {
  info: (tag, msg) => writeLog('INFO', tag, msg),
  warn: (tag, msg) => writeLog('WARN', tag, msg),
  error: (tag, msg) => writeLog('ERROR', tag, msg),
  msg: (tag, msg) => writeLog('CHAT', tag, msg),
  perf: (tag, ms, details) => writeLog('PERF', tag, `${ms}ms - ${details}`)
};

export { ts };
