function clamp(value) {
  return Math.max(0, Math.min(1, value));
}

export function scoreQuality(comment, noise, weights) {
  const length = comment.normalizedText.length;
  const textValue = clamp(Math.log1p(length) / Math.log(181));
  const concrete = /\b\d+(?::\d+)?\b|\b(phút|giây|âm thanh|audio|mic|phụ đề|lỗi|sai|vì|nhưng|do|nên|cần|đề nghị)\b/iu.test(comment.text);
  const specificity = clamp((concrete ? 0.65 : 0.15) + Math.min(comment.normalizedText.split(/\s+/u).length, 20) / 50);
  const likes = clamp(Math.log1p(comment.likeCount) / Math.log(1001));
  const replies = clamp(Math.log1p(comment.replyCount) / Math.log(101));
  const duplicateSupport = clamp(Math.log1p(comment.duplicateCount - 1) / Math.log(11));
  const formattingPenalty = /(.)\1{5,}|[!?]{5,}|[A-ZÀ-Ỹ\s]{25,}/u.test(comment.text) ? 1 : 0;
  const score = (
    textValue * weights.textValue
    + specificity * weights.specificity
    + likes * weights.likes
    + replies * weights.replies
    + duplicateSupport * weights.duplicateSupport
    - noise.spamProbability * weights.spamPenalty
    - noise.noiseScore * weights.noisePenalty
    - (noise.hasLink ? weights.linkPenalty : 0)
    - formattingPenalty * weights.formattingPenalty
  );
  return {
    qualityScore: Number(clamp(score).toFixed(4)),
    qualitySignals: { textValue, specificity, likes, replies, duplicateSupport },
  };
}
