import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { getMemoryTable } from '../database/lancedb/index.js';
import { getEmbeddingsBatch } from '../ai/embedding.js';
import { chunkText } from '../utils/chunker.js';
import { log } from '../utils/logger.js';
import { retrieverCache, promptCache } from './cache.js';
import { config } from '../config/index.js';

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export async function indexDocument(content, sourceMetadata = {}) {
  const normalized = String(content || '').trim();
  if (!normalized) throw new Error('Document is empty');

  const chunks = chunkText(normalized);
  log.info('INGEST', `Chunked document into ${chunks.length} parts`);
  const embeddings = config.rag.mode === 'keyword'
    ? chunks.map(() => [])
    : await getEmbeddingsBatch(chunks);
  const documentHash = sha256(normalized);
  const records = [];

  for (let i = 0; i < chunks.length; i += 1) {
    records.push({
      id: uuidv4(),
      text: chunks[i],
      vector: embeddings[i] || [],
      guildId: sourceMetadata.guildId || 'global',
      channelId: sourceMetadata.channelId || 'global',
      userId: sourceMetadata.userId || 'system',
      timestamp: Date.now(),
      source: sourceMetadata.source || 'file',
      type: sourceMetadata.type || 'knowledge',
      metadata: JSON.stringify({
        ...sourceMetadata,
        documentHash,
        chunkHash: sha256(chunks[i]),
        chunkIndex: i,
        chunkCount: chunks.length,
      }),
    });
  }

  if (records.length > 0) {
    await getMemoryTable().add(records);
    retrieverCache.clear();
    promptCache.clear();
    log.info('INGEST', `Indexed ${records.length} chunks into LanceDB`);
  }
  return records.length;
}

export async function parseFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (['.txt', '.md', '.json', '.csv'].includes(ext)) return fs.readFileSync(filePath, 'utf-8');
  throw new Error(`Unsupported file type on mobile: ${ext}`);
}

export async function ingestFile(filePath, guildId, userId, channelId = 'global', sourceName = null) {
  const content = await parseFile(filePath);
  return indexDocument(content, {
    source: sourceName || path.basename(filePath), guildId, channelId, userId, type: 'knowledge',
  });
}
