import fs from 'fs';
import path from 'path';
import os from 'os';
import { randomUUID } from 'crypto';
import { retrieveRelevantContext } from '../../ai/retriever.js';
import { getDatabaseStats } from '../../database/lancedb/index.js';
import { ingestFile } from '../../services/ingestion.js';

const ALLOWED_EXTENSIONS = new Set(['.txt', '.md', '.json', '.csv']);
const MAX_FILE_SIZE = 10 * 1024 * 1024;

function parseMetadata(row) {
  try { return JSON.parse(row.metadata || '{}'); } catch { return {}; }
}

export async function handleKnowledge(msg, body) {
  const [actionRaw, ...rest] = body.trim().split(/\s+/);
  const action = (actionRaw || '').toLowerCase();
  const query = rest.join(' ').trim();

  if (action === 'stats') {
    const stats = await getDatabaseStats();
    return msg.reply({
      content: `📚 Knowledge chunks: **${stats.knowledgeChunks}**\nAll records: **${stats.totalChunks}**`,
      allowedMentions: { repliedUser: false },
    });
  }

  if (action === 'search') {
    if (!query) return msg.reply('Usage: `!knowledge search <query>`');
    const guildId = msg.guild?.id || 'DM';
    const results = await retrieveRelevantContext(query, { guildId, type: 'knowledge' }, 5);
    if (!results.length) return msg.reply('🔍 No matching chunks found for that query.');

    const lines = results.slice(0, 5).map((row, index) => {
      const meta = parseMetadata(row);
      const snippet = String(row.text || '').replace(/\s+/g, ' ').slice(0, 240);
      return `**${index + 1}. ${row.source || 'unknown'} · chunk ${(meta.chunkIndex ?? index) + 1}**\n${snippet}`;
    });
    return msg.reply({ content: `🔍 **Knowledge results**\n\n${lines.join('\n\n')}`, allowedMentions: { repliedUser: false } });
  }

  if (action === 'add') {
    const attachment = msg.attachments.first();
    if (!attachment) {
      return msg.reply('📎 Please attach a file (.txt, .md, .json, .csv) with your `!knowledge add` command.');
    }
    const ext = path.extname(attachment.name || '').toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) return msg.reply(`❌ Unsupported file type: ${ext || 'unknown'}`);
    if (attachment.size > MAX_FILE_SIZE) return msg.reply('❌ File is too large. Maximum size is 10 MB.');

    const tempPath = path.join(os.tmpdir(), `ryo-${randomUUID()}${ext}`);
    try {
      const response = await fetch(attachment.url);
      if (!response.ok) throw new Error(`Download failed with HTTP ${response.status}`);
      fs.writeFileSync(tempPath, Buffer.from(await response.arrayBuffer()));
      const count = await ingestFile(
        tempPath,
        msg.guild?.id || 'DM',
        msg.author.id,
        msg.channel.id,
        attachment.name,
      );
      return msg.reply({
        content: `✅ Indexed **${attachment.name}** — ${count} chunk(s) added to the knowledge base.`,
        allowedMentions: { repliedUser: false },
      });
    } finally {
      try { fs.unlinkSync(tempPath); } catch {}
    }
  }

  return msg.reply('Usage: `!knowledge stats`, `!knowledge search <query>`, or attach a file with `!knowledge add`.');
}
