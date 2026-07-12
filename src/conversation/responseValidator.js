const UNSUPPORTED_ASSUMPTIONS = [
  /\b(tao|tôi|mình)\s+nghe\s+nói\b/iu,
  /\b(tôi|tao|mình)\s+nhớ\s+(bạn|mày|cậu)\b/iu,
  /\b(mày|bạn|cậu)\s+chắc\s+là\b/iu,
  /\b(chúng ta|hai đứa mình)\s+(đã|từng)\b/iu,
  /\b(bạn|mày|cậu)\s+(vẫn luôn|hồi trước|ngày trước)\b/iu,
];
const STAGE_DIRECTION = /(^|\n)\s*(\*[^*\n]{2,}\*|\[[^\]\n]*(nhìn|cười|thở|bước|quay|mắt|hành động)[^\]\n]*\])/iu;
const BIOGRAPHY_VERBS = /\b(là|thích|ghét|sống|làm việc|đang hẹn hò|quen với|bạn của|người yêu|từng)\b/iu;

function contextText(history = [], summary = '') {
  return `${summary}\n${history.map((message) => message.content || '').join('\n')}`.toLocaleLowerCase('vi');
}

export function validateResponse({ response, analysis, intent, history = [], summary = '', toolContext = null }) {
  const text = String(response || '').trim();
  const violations = [];
  const evidence = contextText(history, summary);

  if (!text) violations.push('empty_response');
  if (intent !== 'explicit_roleplay' && STAGE_DIRECTION.test(text)) violations.push('unrequested_roleplay');

  for (const pattern of UNSUPPORTED_ASSUMPTIONS) {
    const match = text.match(pattern)?.[0];
    if (match && !evidence.includes(match.toLocaleLowerCase('vi'))) {
      violations.push('unsupported_assumption');
      break;
    }
  }

  if (analysis.usernameLike && analysis.wordCount === 1) {
    const escaped = analysis.text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const claimsAboutToken = new RegExp(`\\b${escaped}\\b.{0,35}${BIOGRAPHY_VERBS.source}`, 'iu').test(text);
    const tokenWasKnown = evidence.includes(analysis.normalized);
    if (claimsAboutToken && !tokenWasKnown) violations.push('unknown_name_claim');
  }

  if (analysis.isVeryShort && !['technical_question', 'explicit_roleplay'].includes(intent)) {
    if (text.length > 160 || text.split(/\n/u).length > 3) violations.push('too_long_for_short_input');
  }

  if (intent === 'youtube_request' && /\b\d+(?:[.,]\d+)?\s*(%|phần trăm)\b/iu.test(text)) {
    violations.push('unsupported_percentage');
  }

  if (intent === 'youtube_request' && toolContext?.operation === 'comments') {
    const evidenceQuotes = (toolContext.selectedComments || []).map((item) => String(item.text || '').toLocaleLowerCase('vi'));
    const quotes = [...text.matchAll(/["“”]([^"“”]{4,500})["“”]/gu)].map((match) => match[1].toLocaleLowerCase('vi'));
    if (quotes.some((quote) => !evidenceQuotes.some((evidence) => evidence.includes(quote)))) violations.push('fabricated_comment_quote');
    const limited = toolContext.limitations?.length || (toolContext.video?.commentCount || 0) > (toolContext.sample?.fetchedCount || 0);
    if (limited && /(đã (đọc|xử lý|phân tích) (toàn bộ|tất cả)|tất cả bình luận|toàn bộ bình luận)/iu.test(text)) violations.push('false_complete_comment_sample');
  }

  if (/\{\s*"?(toolContext|selectedComments|ragSources|system_prompt)"?\s*:/iu.test(text)) violations.push('internal_json_leak');
  const sentences = text.split(/(?<=[.!?])\s+/u).map((item) => item.trim().toLocaleLowerCase('vi')).filter((item) => item.length > 12);
  if (sentences.some((sentence) => sentences.filter((item) => item === sentence).length >= 3)) violations.push('repetitive_output');
  if (text.length > 6000) violations.push('excessive_output');

  return { valid: violations.length === 0, violations: [...new Set(violations)] };
}
