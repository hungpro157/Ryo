import { config } from '../config/index.js';
import { log } from '../utils/logger.js';
import { embeddingCache } from '../services/cache.js';
import { ollamaEmbed } from './providers/embedding/ollama.js';
import { llamaCppEmbed } from './providers/embedding/llamacpp.js';

const embeddingProviders = {
  ollama: ollamaEmbed,
  llamacpp: llamaCppEmbed,
};

function providerConfig() {
  if (config.embedding.provider === 'ollama') {
    return { ...config.providers.ollama, model: config.embedding.model };
  }
  if (config.embedding.provider === 'llamacpp') {
    return { ...config.providers.llamacpp, model: config.embedding.model };
  }
  throw new Error(`Unsupported EMBEDDING_PROVIDER: ${config.embedding.provider}`);
}

export async function getEmbedding(text) {
  if (!text || text.trim().length === 0) return null;
  const [embedding] = await getEmbeddingsBatch([text]);
  return embedding || null;
}

export async function getEmbeddingsBatch(texts) {
  const normalized = texts.map((text) => String(text || '').trim());
  const results = new Array(normalized.length).fill(null);
  const missingTexts = [];
  const missingIndexes = [];

  normalized.forEach((text, index) => {
    if (!text) return;
    const cached = embeddingCache.get(text);
    if (cached) results[index] = cached;
    else {
      missingTexts.push(text);
      missingIndexes.push(index);
    }
  });

  if (missingTexts.length === 0) return results;

  const handler = embeddingProviders[config.embedding.provider];
  if (!handler) throw new Error(`Unsupported embedding provider: ${config.embedding.provider}`);

  const startedAt = Date.now();
  try {
    const vectors = await handler(missingTexts, providerConfig());
    if (vectors.length !== missingTexts.length) {
      throw new Error(`Expected ${missingTexts.length} embeddings but received ${vectors.length}`);
    }

    vectors.forEach((vector, position) => {
      if (!Array.isArray(vector) || vector.length === 0) {
        throw new Error(`Invalid embedding at batch position ${position}`);
      }
      const originalIndex = missingIndexes[position];
      results[originalIndex] = vector;
      embeddingCache.set(missingTexts[position], vector);
    });

    log.perf('EMBED', Date.now() - startedAt, `Provider: ${config.embedding.provider}, Batch: ${missingTexts.length}`);
    return results;
  } catch (error) {
    log.error('EMBED', `Embedding failed: ${error.message}`);
    throw error;
  }
}
