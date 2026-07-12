const GREETINGS = /^(alo|hello|hi|hey|chào|chao|halo|yo)(\s+(ryo|bot))?[!.?]*$/iu;
const PINGS = /^(ryo|ê|ey|ơi|này|ping|hửm)[!.?]*$/iu;
const SHORT_REACTIONS = /^(ừ|uh|ờ|ok|okay|lol|haha|hmm|hm|vậy à|thật á|:v|=\)+|\?+)$/iu;
const ROLEPLAY = /\b(roleplay|nhập vai|đóng vai|diễn vai|giả làm|hãy làm .* nhân vật)\b/iu;
const YOUTUBE = /(youtube|youtu\.be|video yt|clip yt|bình luận|binh luan|comment|mọi người (phản ứng|chê|khen)|moi nguoi (phan ung|che|khen)|báo lỗi|bao loi|câu hài|cau hai|đáng chú ý|dang chu y|liên quan (đến|tới)|lien quan (den|toi)|lọc bỏ comment rác|loc bo comment rac)/iu;
const TECHNICAL = /\b(ollama|rag|llm|model|api|code|javascript|node\.js|discord\.js|sqlite|lancedb|embedding|vector|database|server|docker|linux|windows|bug|lỗi|error)\b/iu;

export function classifyIntent(analysis) {
  const text = analysis.normalized;
  if (analysis.isCommand) return 'command';
  if (YOUTUBE.test(text)) return 'youtube_request';
  if (ROLEPLAY.test(text)) return 'explicit_roleplay';
  if (analysis.isEmojiOnly) return 'emoji';
  if (GREETINGS.test(text)) return 'greeting';
  if (PINGS.test(text) || (analysis.usernameLike && analysis.wordCount === 1 && !analysis.isQuestion)) return 'ping';
  if (TECHNICAL.test(text) && analysis.isQuestion) return 'technical_question';
  if (analysis.isQuestion) return 'question';
  if (SHORT_REACTIONS.test(text) || analysis.isVeryShort) return 'short_reaction';
  if (analysis.hasHistory) return 'conversation_continuation';
  return 'casual_conversation';
}

export function getGenerationProfile(intent, analysis, generationConfig) {
  if (intent === 'technical_question' || intent === 'youtube_request') return generationConfig.technical;
  if (analysis.isVeryShort || ['ping', 'emoji', 'short_reaction', 'greeting'].includes(intent)) {
    return generationConfig.veryShort;
  }
  return generationConfig.normal;
}
