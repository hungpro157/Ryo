import { tokens } from './textUtils.js';

const MODE_TERMS = {
  praise: ['hay', 'tốt', 'tuyệt', 'đỉnh', 'thích', 'hữu ích', 'dễ hiểu', 'rõ ràng', 'good', 'great', 'love'],
  criticism: ['chê', 'dở', 'tệ', 'sai', 'thiếu', 'khó hiểu', 'thất vọng', 'bad', 'wrong'],
  problems: ['lỗi', 'bug', 'error', 'problem', 'issue', 'lag', 'rè', 'nhỏ', 'hỏng', 'không hoạt động'],
  questions: ['?', 'tại sao', 'vì sao', 'làm sao', 'khi nào', 'ai biết', 'why', 'how', 'what'],
  disagreement: ['không đồng ý', 'tranh luận', 'sai rồi', 'ngược lại', 'nhưng', 'disagree'],
  funny_comments: ['haha', 'hài', 'cười', 'lol', 'lmao', '=))'],
};
const SYNONYMS = {
  'âm thanh': ['audio', 'mic', 'volume', 'tiếng', 'rè', 'nhỏ'],
  pin: ['battery', 'thời lượng pin', 'sạc'],
  'phụ đề': ['caption', 'subtitle', 'sub'],
};

function lexicalOverlap(text, query) {
  const commentTokens = tokens(text);
  const queryTokens = tokens(query);
  if (queryTokens.size === 0) return 0;
  let matches = 0;
  for (const token of queryTokens) if (commentTokens.has(token)) matches += 1;
  return matches / queryTokens.size;
}

export function scoreRelevance(comment, { mode = 'overall_reaction', query = null } = {}) {
  const text = comment.text.toLocaleLowerCase('vi');
  let score = ['overall_reaction', 'representative_sample', 'useful_quotes'].includes(mode) ? 0.45 : 0.08;
  const terms = MODE_TERMS[mode] || [];
  const termMatches = terms.filter((term) => text.includes(term)).length;
  score += Math.min(0.75, termMatches * 0.28);

  if (mode === 'topic_search' && query) {
    score = lexicalOverlap(text, query);
    for (const [topic, related] of Object.entries(SYNONYMS)) {
      if (query.toLocaleLowerCase('vi').includes(topic) && related.some((term) => text.includes(term))) score = Math.max(score, 0.8);
    }
  }
  if (mode === 'praise' && comment.sentiment === 'positive') score += 0.35;
  if (['criticism', 'problems'].includes(mode) && comment.sentiment === 'negative') score += 0.35;
  if (mode === 'questions' && text.includes('?')) score += 0.5;
  if (mode === 'useful_quotes') score += comment.qualityScore * 0.45;
  if (mode === 'funny_comments' && /[😂🤣]|=\)+/u.test(comment.text)) score += 0.35;
  return Number(Math.max(0, Math.min(1, score)).toFixed(4));
}
