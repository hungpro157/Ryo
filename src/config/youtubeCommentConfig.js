function integer(name, fallback) {
  const value = Number.parseInt(process.env[name] || String(fallback), 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function decimal(name, fallback) {
  const value = Number.parseFloat(process.env[name] || String(fallback));
  return Number.isFinite(value) ? value : fallback;
}

export const youtubeCommentConfig = {
  fetchLimit: integer('YOUTUBE_COMMENT_FETCH_LIMIT', 100),
  processLimit: integer('YOUTUBE_COMMENT_PROCESS_LIMIT', 300),
  llmLimit: integer('YOUTUBE_COMMENT_LLM_LIMIT', 30),
  topicLimit: integer('YOUTUBE_COMMENT_TOPIC_LIMIT', 8),
  quotesPerTopic: integer('YOUTUBE_COMMENT_QUOTES_PER_TOPIC', 3),
  similarityThreshold: decimal('YOUTUBE_COMMENT_SIMILARITY_THRESHOLD', 0.84),
  minimumQuality: decimal('YOUTUBE_COMMENT_MIN_QUALITY', 0.2),
  minimumRelevance: decimal('YOUTUBE_COMMENT_MIN_RELEVANCE', 0.12),
  weights: {
    textValue: 0.34,
    specificity: 0.22,
    likes: 0.1,
    replies: 0.08,
    duplicateSupport: 0.06,
    relevance: 0.2,
    spamPenalty: 0.55,
    noisePenalty: 0.35,
    linkPenalty: 0.2,
    formattingPenalty: 0.12,
  },
};
