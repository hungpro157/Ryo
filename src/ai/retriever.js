import { getMemoryTable } from '../database/lancedb/index.js';
import { getEmbedding } from './embedding.js';
import { retrieverCache } from '../services/cache.js';
import { config } from '../config/index.js';
import { log } from '../utils/logger.js';

function escapeSql(value) {
  return String(value).replaceAll("'", "''");
}

function buildWhere(filters) {
  const clauses = [];
  if (filters.guildId) clauses.push(`\`guildId\` = '${escapeSql(filters.guildId)}'`);
  if (filters.channelId) clauses.push(`\`channelId\` = '${escapeSql(filters.channelId)}'`);
  if (filters.userId) clauses.push(`\`userId\` = '${escapeSql(filters.userId)}'`);
  if (filters.type) clauses.push(`type = '${escapeSql(filters.type)}'`);
  return clauses.join(' AND ');
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFKC')
    .toLocaleLowerCase('vi-VN')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function textMatchScore(text, query) {
  const normalizedText = normalizeText(text);
  const normalizedQuery = normalizeText(query);
  if (!normalizedText || !normalizedQuery) return 0;
  if (normalizedText.includes(normalizedQuery)) return 100;

  const terms = [...new Set(normalizedQuery.split(/\s+/).filter((term) => term.length > 1))];
  if (!terms.length) return 0;
  const matched = terms.filter((term) => normalizedText.includes(term)).length;
  return matched / terms.length;
}

async function keywordFallback(table, queryText, where, limit) {
  try {
    let scan = table.filter(where || "type = 'knowledge'").limit(config.rag.keywordScanLimit);
    const rows = await scan.execute();
    return rows
      .map((row) => ({ ...row, _keywordScore: textMatchScore(row.text, queryText) }))
      .filter((row) => row._keywordScore >= config.rag.keywordMinScore)
      .sort((a, b) => b._keywordScore - a._keywordScore)
      .slice(0, limit);
  } catch (error) {
    log.warn('RETRIEVER', `Keyword fallback failed: ${error.message}`);
    return [];
  }
}

function mergeResults(vectorResults, keywordResults, topK) {
  const merged = new Map();
  for (const row of keywordResults) merged.set(row.id, row);
  for (const row of vectorResults) {
    if (!merged.has(row.id)) merged.set(row.id, row);
  }
  return [...merged.values()].slice(0, topK);
}

export async function retrieveRelevantContext(queryText, filters = {}, topK = config.rag.topK) {
  if (!queryText?.trim()) return [];

  const cacheKey = `${queryText.trim()}_${JSON.stringify(filters)}_${topK}`;
  const cached = retrieverCache.get(cacheKey);
  if (cached) return cached;

  const start = Date.now();
  try {
    const table = getMemoryTable();
    const where = buildWhere(filters);

    // Exact IDs, model names and error codes are often retrieved more reliably by text matching.
    const keywordResults = await keywordFallback(table, queryText, where, topK);

    let vectorResults = [];
    if (config.rag.mode !== 'keyword') {
      try {
        const queryEmbedding = await getEmbedding(queryText);
        if (queryEmbedding) {
          let search = table.search(queryEmbedding).limit(Math.max(topK, config.rag.vectorCandidateLimit));
          if (where) search = search.where(where);
          vectorResults = await search.execute();
        }
      } catch (error) {
        log.warn('RETRIEVER', `Vector search failed, using keyword fallback: ${error.message}`);
      }
    }

    const results = mergeResults(vectorResults, keywordResults, topK);
    log.perf(
      'RETRIEVER',
      Date.now() - start,
      `Returned ${results.length} docs (vector=${vectorResults.length}, keyword=${keywordResults.length})${where ? `, filter: ${where}` : ''}`,
    );

    retrieverCache.set(cacheKey, results);
    return results;
  } catch (err) {
    log.error('RETRIEVER', `Search failed: ${err.message}`);
    return [];
  }
}
