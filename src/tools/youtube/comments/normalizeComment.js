import { comparisonText, normalizeText } from './textUtils.js';

const VIETNAMESE_MARKS = /[ăâđêôơưáàảãạấầẩẫậắằẳẵặéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵ]/iu;
const VI_WORDS = /\b(không|và|của|là|mình|video|này|quá|nhưng|được|với|cho|thấy|nghe)\b/giu;
const EN_WORDS = /\b(the|and|this|that|video|with|for|but|very|great|good|bad|why|what)\b/giu;

export function detectLanguage(text) {
  if (!text) return null;
  if (VIETNAMESE_MARKS.test(text)) return 'vi';
  const vi = text.match(VI_WORDS)?.length || 0;
  const en = text.match(EN_WORDS)?.length || 0;
  if (vi > en && vi > 0) return 'vi';
  if (en > vi && en > 0) return 'en';
  return null;
}

export function normalizeCommentForAnalysis(comment, sourceUrl = null) {
  if (!comment || typeof comment.text !== 'string') return null;
  const text = normalizeText(comment.text);
  if (!text) return null;
  return {
    id: String(comment.id || ''),
    author: comment.author ? String(comment.author) : null,
    text,
    originalText: comment.text,
    normalizedText: comparisonText(text),
    likeCount: Math.max(0, Number(comment.likeCount) || 0),
    replyCount: Math.max(0, Number(comment.replyCount) || 0),
    publishedAt: comment.publishedAt || null,
    updatedAt: comment.updatedAt || null,
    language: detectLanguage(text),
    sourceUrl,
    duplicateCount: 1,
  };
}
