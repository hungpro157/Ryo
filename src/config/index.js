import 'dotenv/config';

const llmProvider = (process.env.AI_PROVIDER || 'ollama').toLowerCase();
const embeddingProvider = (process.env.EMBEDDING_PROVIDER || llmProvider).toLowerCase();

export const config = {
  llm: {
    provider: llmProvider,
    model: process.env.LLM_MODEL || (llmProvider === 'ollama' ? 'qwen3:4b-instruct' : 'local-model'),
    temperature: Number.parseFloat(process.env.LLM_TEMPERATURE || '0.7'),
    maxTokens: Number.parseInt(process.env.LLM_MAX_TOKENS || '300', 10),
    timeout: Number.parseInt(process.env.LLM_TIMEOUT || '120000', 10),
    contextLimit: Number.parseInt(process.env.LLM_CONTEXT_LIMIT || '4096', 10),
    retries: Number.parseInt(process.env.LLM_RETRIES || '1', 10),
  },
  embedding: {
    provider: embeddingProvider,
    model: process.env.EMBEDDING_MODEL || 'qwen3-embedding:0.6b',
    dimensions: Number.parseInt(process.env.EMBEDDING_DIMENSIONS || '1024', 10),
  },
  providers: {
    ollama: {
      baseUrl: (process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434').replace(/\/$/, ''),
    },
    llamacpp: {
      baseUrl: (process.env.LLAMACPP_BASE_URL || 'http://127.0.0.1:8080').replace(/\/$/, ''),
      apiKey: process.env.LLAMACPP_API_KEY || '',
    },
  },
  rag: {
    chunkSize: Number.parseInt(process.env.CHUNK_SIZE || '450', 10),
    chunkOverlap: Number.parseInt(process.env.CHUNK_OVERLAP || '80', 10),
    topK: Number.parseInt(process.env.RAG_TOP_K || '4', 10),
    vectorCandidateLimit: Number.parseInt(process.env.RAG_VECTOR_CANDIDATES || '10', 10),
    keywordScanLimit: Number.parseInt(process.env.RAG_KEYWORD_SCAN_LIMIT || '1000', 10),
    keywordMinScore: Number.parseFloat(process.env.RAG_KEYWORD_MIN_SCORE || '0.5'),
    minQueryLength: Number.parseInt(process.env.RAG_MIN_QUERY_LENGTH || '8', 10),
    mode: (process.env.RAG_MODE || 'hybrid').toLowerCase(),
    maxRecords: Number.parseInt(process.env.RAG_MAX_RECORDS || '100000', 10),
  },
  memory: {
    reflectionInterval: Number.parseInt(process.env.REFLECTION_INTERVAL || '50', 10),
    conversationHistoryLimit: Number.parseInt(process.env.CONVERSATION_HISTORY_LIMIT || '10', 10),
    databasePath: process.env.MEMORY_DB_PATH || './data/memory.sqlite',
    databaseMaxMb: Number.parseInt(process.env.MEMORY_DB_MAX_MB || '64', 10),
    summaryMaxTokens: Number.parseInt(process.env.MEMORY_SUMMARY_MAX_TOKENS || '300', 10),
  },
  youtube: {
    apiKey: process.env.YOUTUBE_API_KEY || '',
    timeoutMs: Number.parseInt(process.env.YOUTUBE_API_TIMEOUT || '15000', 10),
    defaultMaxResults: Number.parseInt(process.env.YOUTUBE_MAX_COMMENTS || '20', 10),
    maxResults: Number.parseInt(process.env.YOUTUBE_MAX_COMMENTS_LIMIT || '50', 10),
    language: process.env.YOUTUBE_LANGUAGE || 'vi',
    commentsEnabled: (process.env.YOUTUBE_COMMENTS_ENABLED || 'true').toLowerCase() === 'true',
  },
  discord: {
    token: process.env.DISCORD_TOKEN,
    prefix: process.env.PREFIX || '!',
    ownerId: process.env.OWNER_ID || null,
    idleChannelId: process.env.IDLE_CHANNEL_ID || null,
    idleMinHours: Number.parseFloat(process.env.IDLE_MIN_HOURS || '24'),
    idleMaxHours: Number.parseFloat(process.env.IDLE_MAX_HOURS || '48'),
    respondChance: Number.parseFloat(process.env.RESPOND_CHANCE || '0'),
    reactionOnlyRate: Number.parseFloat(process.env.REACTION_ONLY_RATE || '0'),
    triggerWords: ['ryo', 'りょ', 'リョ'],
  },
  paths: {
    db: process.env.LANCEDB_PATH || './data/lancedb',
    logs: './logs',
  },
};
