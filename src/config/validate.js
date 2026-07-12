import fs from 'fs';
import path from 'path';
import { config } from './index.js';

export function validateConfig({ requireDiscord = true } = {}) {
  const fatal = [];
  const warnings = [];
  if (requireDiscord && !config.discord.token) fatal.push('DISCORD_TOKEN is required');
  if (!['ollama', 'llamacpp'].includes(config.llm.provider)) fatal.push(`Unsupported AI_PROVIDER: ${config.llm.provider}`);
  for (const [name, value] of [
    ['LLM_TIMEOUT', config.llm.timeout], ['LLM_CONTEXT_LIMIT', config.llm.contextLimit],
    ['LLM_MAX_TOKENS', config.llm.maxTokens], ['YOUTUBE_API_TIMEOUT', config.youtube.timeoutMs],
  ]) if (!Number.isFinite(value) || value <= 0) fatal.push(`${name} must be a positive number`);
  if (config.youtube.commentsEnabled && !config.youtube.apiKey) warnings.push('YouTube comments disabled: YOUTUBE_API_KEY is missing');
  try {
    const dir = path.dirname(path.resolve(config.memory.databasePath));
    fs.mkdirSync(dir, { recursive: true });
    fs.accessSync(dir, fs.constants.W_OK);
  } catch { fatal.push('Memory database directory is not writable'); }
  return { ok: fatal.length === 0, fatal, warnings };
}
