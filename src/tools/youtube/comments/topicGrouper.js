import { selectRepresentativeQuotes } from './quoteSelector.js';

const TOPIC_RULES = [
  ['âm thanh', /\b(âm thanh|audio|mic|volume|tiếng (nhỏ|rè|to)|rè)\b/iu],
  ['phụ đề', /\b(phụ đề|caption|subtitle|sub việt)\b/iu],
  ['lỗi hoặc vấn đề', /\b(lỗi|bug|error|problem|issue|lag|hỏng|không hoạt động)\b/iu],
  ['độ chính xác', /\b(sai|chính xác|accuracy|nhầm|fact|nguồn)\b/iu],
  ['dễ hiểu', /\b(dễ hiểu|rõ ràng|giải thích (hay|tốt)|chi tiết)\b/iu],
  ['mong phần tiếp theo', /\b(phần (sau|tiếp|2)|làm thêm|video tiếp|more)\b/iu],
  ['câu hỏi', /\?|\b(tại sao|vì sao|làm sao|ai biết|why|how|what)\b/iu],
  ['hài hước', /[😂🤣]|\b(haha|hài|lol|lmao)\b|=\)+/iu],
];

function labelFor(comment) {
  for (const [label, pattern] of TOPIC_RULES) if (pattern.test(comment.text)) return label;
  if (comment.sentiment === 'positive') return 'khen chung';
  if (comment.sentiment === 'negative') return 'chê chung';
  return 'phản ứng khác';
}

function aggregateSentiment(comments) {
  const values = new Set(comments.map((comment) => comment.sentiment));
  if (values.size === 1) return values.values().next().value;
  if (values.has('positive') && values.has('negative')) return 'mixed';
  return values.has('mixed') ? 'mixed' : 'neutral';
}

export function groupTopics(comments, { topicLimit, quotesPerTopic }) {
  const groups = new Map();
  for (const comment of comments) {
    const label = labelFor(comment);
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label).push(comment);
  }
  return [...groups.entries()]
    .map(([label, items], index) => ({
      topicId: `topic-${index + 1}`,
      label,
      commentCount: items.length,
      duplicateAdjustedCount: items.reduce((total, item) => total + item.duplicateCount, 0),
      averageQualityScore: Number((items.reduce((total, item) => total + item.qualityScore, 0) / items.length).toFixed(4)),
      sentiment: aggregateSentiment(items),
      representativeQuotes: selectRepresentativeQuotes(items, label, quotesPerTopic),
    }))
    .sort((left, right) => (
      right.duplicateAdjustedCount - left.duplicateAdjustedCount
      || right.averageQualityScore - left.averageQualityScore
    ))
    .slice(0, topicLimit);
}
