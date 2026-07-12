const EMOJI_ONLY = /^[\s\p{Punctuation}\p{Emoji}\p{Emoji_Modifier}\p{Emoji_Component}\p{Emoji_Presentation}\p{Extended_Pictographic}:;=xXdDpP8()]+$/u;
const USERNAME_LIKE = /^[\p{L}\p{N}_.-]{2,32}$/u;

export function analyzeMessage(content, { prefix = '!', history = [] } = {}) {
  const rawText = String(content || '').trim();
  const hasDiscordMention = /<@!?\d+>/u.test(rawText);
  const withoutMentions = rawText.replace(/<@!?\d+>/gu, '').trim();
  const text = withoutMentions || (hasDiscordMention ? 'ryo' : rawText);
  const normalized = text.toLocaleLowerCase('vi');
  const words = text ? text.split(/\s+/u) : [];
  const isEmojiOnly = Boolean(text) && EMOJI_ONLY.test(text);
  const isCommand = Boolean(prefix) && text.startsWith(prefix);
  const isQuestion = /[?？]$/.test(text) || /^(ai|gì|sao|tại sao|vì sao|khi nào|ở đâu|how|what|why|who|where|when)\b/iu.test(normalized);
  const usernameLike = USERNAME_LIKE.test(text) && !isEmojiOnly && !isCommand;

  return {
    text,
    rawText,
    hasDiscordMention,
    normalized,
    words,
    wordCount: words.length,
    characterCount: [...text].length,
    isVeryShort: words.length <= 2 && [...text].length <= 18,
    isEmojiOnly,
    isCommand,
    isQuestion,
    usernameLike,
    hasHistory: history.length > 0,
  };
}
