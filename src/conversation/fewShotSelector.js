import { fewShotLibrary } from './fewShotLibrary.js';

const cursors = new Map();

function hash(text) {
  let value = 0;
  for (const character of text) value = ((value * 31) + character.codePointAt(0)) >>> 0;
  return value;
}

export function selectFewShots(intent, input, { min = 2, max = 4 } = {}) {
  const examples = fewShotLibrary[intent] || fewShotLibrary.casual_conversation;
  if (examples.length === 0) return [];
  const count = Math.min(examples.length, Math.max(min, Math.min(max, 3)));
  const cursor = cursors.get(intent) || 0;
  const start = (hash(String(input || '')) + cursor) % examples.length;
  cursors.set(intent, (cursor + 1) % examples.length);
  return Array.from({ length: count }, (_, index) => examples[(start + index) % examples.length]);
}
