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

export function validateResponse({ response, analysis, intent, history = [], summary = '' }) {
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

  return { valid: violations.length === 0, violations: [...new Set(violations)] };
}
