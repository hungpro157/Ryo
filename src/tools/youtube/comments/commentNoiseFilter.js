const EMOJI_OR_PUNCTUATION_ONLY = /^[\s\p{Punctuation}\p{Emoji}\p{Emoji_Modifier}\p{Emoji_Component}\p{Emoji_Presentation}\p{Extended_Pictographic}]+$/u;
const ENGAGEMENT_BAIT = /^(first|đầu tiên|ai\s*(còn\s*)?(xem\s*)?(năm\s*)?20\d{2}|ai 20\d{2}|điểm danh|like thứ \d+|team .* điểm danh)[!.?\s]*$/iu;
const PROMOTION = /\b(sub chéo|sub4sub|đăng ký kênh|subscribe (to )?my channel|ghé kênh|follow me|kiếm tiền|liên hệ zalo|telegram|whatsapp)\b/iu;
const USEFUL_SHORT = /\b(âm thanh|audio|mic|tiếng|rè|nhỏ|sai|lỗi|bug|phút\s*\d+|thiếu|phụ đề|caption|pin|nóng|lag|mờ|chậm|nhanh)\b/iu;
const GENERIC_SHORT = /^(hay|ok|okay|nice|good|tuyệt|đỉnh|lol|haha|wow|thanks|cảm ơn|cam on)[!.?\s]*$/iu;

export function assessNoise(comment) {
  const text = comment.text;
  const reasons = [];
  let spamProbability = 0;
  let noiseScore = 0;
  const hasLink = /https?:\/\/|www\.|\.com\b|\.net\b/iu.test(text);

  if (EMOJI_OR_PUNCTUATION_ONLY.test(text)) { reasons.push('emoji_or_punctuation_only'); noiseScore = 1; }
  if (!comment.normalizedText) { reasons.push('no_meaningful_text'); noiseScore = 1; }
  if (ENGAGEMENT_BAIT.test(text)) { reasons.push('engagement_bait'); spamProbability = 0.95; }
  if (PROMOTION.test(text)) { reasons.push('promotion'); spamProbability = 1; }
  if (hasLink) { reasons.push('external_link'); spamProbability = Math.max(spamProbability, 0.65); }
  if (/(.)\1{7,}/iu.test(text)) { reasons.push('repeated_characters'); noiseScore = Math.max(noiseScore, 0.7); }
  if (GENERIC_SHORT.test(text) && !USEFUL_SHORT.test(text)) { reasons.push('generic_short'); noiseScore = Math.max(noiseScore, 0.85); }
  if (comment.normalizedText.length < 3 && !USEFUL_SHORT.test(text)) noiseScore = Math.max(noiseScore, 0.9);

  return {
    keep: spamProbability < 0.9 && noiseScore < 0.9,
    reasons,
    spamProbability,
    noiseScore,
    hasLink,
    usefulShort: USEFUL_SHORT.test(text),
  };
}
