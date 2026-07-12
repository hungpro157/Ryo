import { getMemoryTable } from '../../database/lancedb/index.js';
import { getEmbedding } from '../embedding.js';
import { config } from '../../config/index.js';
import { v4 as uuidv4 } from 'uuid';

export async function storeGuildFact(guildId, factText, source = 'chat') {
  const table = getMemoryTable();
  const vector = config.rag.mode === 'keyword' ? [] : await getEmbedding(factText);
  if (config.rag.mode !== 'keyword' && !vector) return;

  await table.add([{
    id: uuidv4(),
    text: factText,
    vector,
    guildId,
    channelId: 'global',
    userId: 'system',
    timestamp: Date.now(),
    source,
    type: 'guild_fact',
    metadata: '{}',
  }]);
}
