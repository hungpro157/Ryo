const POSITIVE = /\b(hay|tốt|tuyệt|đỉnh|thích|hữu ích|dễ hiểu|rõ ràng|cuốn|funny|great|good|love|helpful|amazing)\b/iu;
const NEGATIVE = /\b(dở|tệ|chê|sai|lỗi|thiếu|nhỏ|rè|lag|khó hiểu|thất vọng|bad|wrong|error|issue|problem|missing|hate)\b/iu;

export function classifySentiment(text) {
  const positive = POSITIVE.test(text);
  const negative = NEGATIVE.test(text);
  if (positive && negative) return 'mixed';
  if (positive) return 'positive';
  if (negative) return 'negative';
  return 'neutral';
}
