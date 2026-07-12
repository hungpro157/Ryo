// services/cache.js
import { LRUCache } from 'lru-cache';

// Embedding Cache: Maps text -> embedding vector
export const embeddingCache = new LRUCache({
  max: 5000, 
  ttl: 1000 * 60 * 60 * 24 // 24 hours
});

// Retriever Cache: Maps query -> Top 10 documents
export const retrieverCache = new LRUCache({
  max: 1000,
  ttl: 1000 * 60 * 60 // 1 hour
});

// Prompt Cache: Maps conversation state -> Constructed Prompt
export const promptCache = new LRUCache({
  max: 500,
  ttl: 1000 * 60 * 15 // 15 mins
});
