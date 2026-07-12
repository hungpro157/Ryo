import { jaccard } from './textUtils.js';

function editSimilarity(left, right) {
  if (left === right) return 1;
  if (!left || !right || Math.max(left.length, right.length) > 300) return 0;
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    let diagonal = previous[0];
    previous[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      const old = previous[j];
      previous[j] = Math.min(previous[j] + 1, previous[j - 1] + 1, diagonal + (left[i - 1] === right[j - 1] ? 0 : 1));
      diagonal = old;
    }
  }
  return 1 - (previous[right.length] / Math.max(left.length, right.length));
}

function representativeValue(comment) {
  return Math.log1p(comment.likeCount) + Math.min(comment.normalizedText.length, 160) / 160;
}

export function deduplicateComments(comments, threshold = 0.84) {
  const unique = [];
  let duplicateCount = 0;
  for (const comment of comments) {
    const matchIndex = unique.findIndex((candidate) => {
      if (candidate.normalizedText === comment.normalizedText) return true;
      const similarity = Math.max(jaccard(candidate.normalizedText, comment.normalizedText), editSimilarity(candidate.normalizedText, comment.normalizedText));
      return similarity >= threshold;
    });
    if (matchIndex === -1) {
      unique.push({ ...comment, duplicateCount: 1 });
      continue;
    }
    duplicateCount += 1;
    const existing = unique[matchIndex];
    const combinedCount = existing.duplicateCount + 1;
    if (representativeValue(comment) > representativeValue(existing)) {
      unique[matchIndex] = { ...comment, duplicateCount: combinedCount };
    } else {
      existing.duplicateCount = combinedCount;
    }
  }
  return { comments: unique, duplicateCount };
}
