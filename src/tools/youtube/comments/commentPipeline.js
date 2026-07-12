import { youtubeCommentConfig } from '../../../config/youtubeCommentConfig.js';
import { assessNoise } from './commentNoiseFilter.js';
import { deduplicateComments } from './duplicateDetector.js';
import { normalizeCommentForAnalysis } from './normalizeComment.js';
import { scoreQuality } from './qualityScorer.js';
import { scoreRelevance } from './relevanceScorer.js';
import { classifySentiment } from './sentimentClassifier.js';
import { groupTopics } from './topicGrouper.js';
import { toRepresentativeQuote } from './quoteSelector.js';

export function processComments({ rawComments, video, mode = 'overall_reaction', query = null, resultLimit, config = youtubeCommentConfig }) {
  const sourceUrl = video?.id ? `https://www.youtube.com/watch?v=${video.id}` : null;
  const input = Array.isArray(rawComments) ? rawComments.slice(0, config.processLimit) : [];
  const normalized = input.map((comment) => normalizeCommentForAnalysis(comment, sourceUrl)).filter(Boolean);
  const assessed = normalized.map((comment) => ({ comment, noise: assessNoise(comment) }));
  const noiseFiltered = assessed.filter(({ noise }) => noise.keep);
  const deduplicated = deduplicateComments(noiseFiltered.map(({ comment }) => comment), config.similarityThreshold);

  const scored = deduplicated.comments.map((comment) => {
    const noise = assessed.find((item) => item.comment.id === comment.id)?.noise || assessNoise(comment);
    const sentiment = classifySentiment(comment.text);
    const quality = scoreQuality(comment, noise, config.weights);
    const withQuality = { ...comment, ...quality, sentiment };
    const relevanceScore = scoreRelevance(withQuality, { mode, query });
    return { ...withQuality, relevanceScore, combinedScore: quality.qualityScore * 0.55 + relevanceScore * 0.45 };
  });
  const eligible = scored
    .filter((comment) => comment.qualityScore >= config.minimumQuality)
    .filter((comment) => mode !== 'topic_search' || comment.relevanceScore >= config.minimumRelevance)
    .sort((left, right) => right.combinedScore - left.combinedScore);
  const limit = Math.min(resultLimit || config.llmLimit, config.llmLimit);
  const topics = groupTopics(eligible, config);
  const selectedComments = eligible.slice(0, limit).map((comment) => toRepresentativeQuote(comment, null));
  const fetchedCount = Array.isArray(rawComments) ? rawComments.length : 0;
  const processedCount = eligible.length;
  const limitations = [];
  if ((video?.commentCount || 0) > fetchedCount) limitations.push(`Chỉ phân tích ${fetchedCount} trên ${video.commentCount} bình luận được YouTube báo cáo.`);
  if (fetchedCount > config.processLimit) limitations.push(`Chỉ xử lý ${config.processLimit} bình luận theo giới hạn cấu hình.`);
  if (deduplicated.duplicateCount > 0) limitations.push('Các comment trùng hoặc gần trùng đã được gộp.');
  if (processedCount < 5) limitations.push('Mẫu comment hữu ích còn ít; kết luận có độ bao phủ thấp.');
  limitations.push('Sentiment và topic dùng luật từ khóa nên có thể không nhận ra mỉa mai hoặc ngữ cảnh phức tạp.');

  return {
    video: { id: video?.id || null, title: video?.title || null },
    sample: {
      fetchedCount,
      normalizedCount: normalized.length,
      processedCount,
      removedCount: Math.max(0, fetchedCount - processedCount - deduplicated.duplicateCount),
      duplicateCount: deduplicated.duplicateCount,
    },
    request: { mode, query: query || null },
    topics,
    selectedComments,
    limitations,
  };
}
