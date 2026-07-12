const HTML_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

export function decodeHtmlEntities(text) {
  return String(text || '').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/giu, (match, entity) => {
    if (entity[0] === '#') {
      const hex = entity[1]?.toLowerCase() === 'x';
      const value = Number.parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10);
      return Number.isFinite(value) ? String.fromCodePoint(value) : match;
    }
    return HTML_ENTITIES[entity.toLowerCase()] ?? match;
  });
}

export function normalizeText(text) {
  return decodeHtmlEntities(text)
    .replace(/[\u200B-\u200D\u2060\uFEFF]/gu, '')
    .normalize('NFC')
    .replace(/\s+/gu, ' ')
    .trim();
}

export function comparisonText(text) {
  return normalizeText(text)
    .toLocaleLowerCase('vi')
    .replace(/[\p{Emoji}\p{Emoji_Modifier}\p{Emoji_Component}\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

export function tokens(text) {
  return new Set(comparisonText(text).split(/\s+/u).filter((token) => token.length > 1));
}

export function jaccard(left, right) {
  const a = tokens(left);
  const b = tokens(right);
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const token of a) if (b.has(token)) intersection += 1;
  return intersection / (a.size + b.size - intersection);
}
