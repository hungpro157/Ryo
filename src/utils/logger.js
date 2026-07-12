import fs from 'fs';
import path from 'path';

const logsDir = path.resolve(process.cwd(), 'logs');
fs.mkdirSync(logsDir, { recursive: true });
const levels = { debug: 10, info: 20, warn: 30, error: 40 };
const configuredLevel = (process.env.LOG_LEVEL || 'info').toLowerCase();
const threshold = levels[configuredLevel] ?? levels.info;

export function redact(value) {
  return String(value ?? '')
    .replace(/([?&](?:key|api_key|token)=)[^&\s]+/giu, '$1[REDACTED]')
    .replace(/\b(?:sk|sk-proj)-[A-Za-z0-9_-]{16,}\b/gu, '[REDACTED]')
    .replace(/\b[A-Za-z\d_-]{4,}\.[A-Za-z\d_-]{6,}\.[A-Za-z\d_-]{20,}\b/gu, '[REDACTED_TOKEN]');
}

function ts() { return new Date().toLocaleString('vi-VN', { hour12: false }); }

function write(level, tag, message, metadata) {
  if ((levels[level] ?? 100) < threshold) return;
  const safeMeta = metadata && Object.keys(metadata).length ? ` ${redact(JSON.stringify(metadata))}` : '';
  const line = `[${ts()}] [${level.toUpperCase()}] [${tag}] ${redact(message)}${safeMeta}`;
  console.log(line);
  fs.appendFileSync(path.join(logsDir, 'app.log'), `${line}\n`, 'utf8');
}

export const log = {
  debug: (tag, message, metadata = {}) => write('debug', tag, message, metadata),
  info: (tag, message, metadata = {}) => write('info', tag, message, metadata),
  warn: (tag, message, metadata = {}) => write('warn', tag, message, metadata),
  error: (tag, message, metadata = {}) => write('error', tag, message, metadata),
  msg: (tag, message, metadata = {}) => write('info', tag, message, metadata),
  perf: (tag, ms, details = '') => write('info', tag, 'Performance', { durationMs: ms, details }),
};

export { ts };
