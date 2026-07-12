import { config } from '../../config/index.js';
import { getDatabaseStats } from '../../database/lancedb/index.js';
import { getMemoryStats } from '../../database/sqlite/memory.js';

function formatBytes(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export async function handleHealth(msg) {
  try {
    const stats = await getDatabaseStats();
    const memoryStats = getMemoryStats(msg.guild?.id || 'DM');
    const memory = process.memoryUsage();
    const uptimeSeconds = Math.floor(process.uptime());
    const text = [
      '🩺 **Ryo Health**',
      `Discord: ✅ Online`,
      `AI provider: \`${config.llm.provider}\``,
      `LLM model: \`${config.llm.model}\``,
      `Embedding: \`${config.embedding.provider}/${config.embedding.model}\``,
      `LanceDB: ✅ Online`,
      `SQLite memory: \`${memoryStats.messages} messages / ${memoryStats.summaries} summaries\``,
      `RAG mode: \`${config.rag.mode}\``,
      `Knowledge chunks: \`${stats.knowledgeChunks}\``,
      `Total records: \`${stats.totalChunks}\``,
      `RAM: \`${formatBytes(memory.rss)}\``,
      `Uptime: \`${uptimeSeconds}s\``,
      `Node.js: \`${process.version}\``,
    ].join('\n');
    await msg.reply({ content: text, allowedMentions: { repliedUser: false } });
  } catch (error) {
    await msg.reply({ content: `❌ Health check failed: ${error.message}`, allowedMentions: { repliedUser: false } });
  }
}
