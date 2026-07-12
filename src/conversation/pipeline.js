import { buildDynamicPrompt } from '../ai/prompt.js';
import { chatCompletion } from '../ai/llm.js';
import { getConversationSummary } from '../ai/memory/conversation.js';
import { config } from '../config/index.js';
import { conversationConfig } from '../config/conversationConfig.js';
import { log } from '../utils/logger.js';
import { analyzeMessage } from './messageAnalyzer.js';
import { classifyIntent, getGenerationProfile } from './intentClassifier.js';
import { selectFewShots } from './fewShotSelector.js';
import { validateResponse } from './responseValidator.js';
import { youtube, YouTubeError, youtubeErrorMessage } from '../tools/youtube/index.js';
import { analyzeYouTubeRequest, compactYouTubeToolResult } from './youtubeRequest.js';
import { createYouTubeCommentsTool, youtubeCommentsTool as defaultYouTubeCommentsTool } from '../tools/youtube/youtubeCommentsTool.js';

function safeFallback(intent, input) {
  const choices = {
    ping: ['gì á', 'hửm', 'sao á', '?'],
    emoji: ['?', '👀', '=))'],
    greeting: ['chào nha', 'đây', 'hello 👀'],
    short_reaction: ['ừa', 'hửm', '=))'],
  }[intent] || ['mình chưa rõ ý bạn lắm', 'ủa sao á'];
  const seed = [...String(input)].reduce((total, char) => total + char.codePointAt(0), 0);
  return choices[seed % choices.length];
}

export async function generateConversationResponse(input, dependencies = {}) {
  const history = input.history || [];
  const analysis = analyzeMessage(input.userMessage, { prefix: config.discord.prefix, history });
  const intent = classifyIntent(analysis);
  const fewShots = selectFewShots(intent, input.userMessage, conversationConfig.fewShots);
  const generation = getGenerationProfile(intent, analysis, conversationConfig.generation);
  const summary = getConversationSummary(input.guildId, input.channelId, input.userId);
  const generate = dependencies.generate || chatCompletion;
  const buildPrompt = dependencies.buildPrompt || buildDynamicPrompt;
  const youtubeTool = dependencies.youtubeTool || youtube;
  const commentTool = dependencies.youtubeCommentsTool
    || (dependencies.youtubeTool ? createYouTubeCommentsTool({ youtubeService: youtubeTool }) : defaultYouTubeCommentsTool);
  let toolContext = null;
  let lastResponse = '';
  let lastViolations = [];

  if (intent === 'youtube_request') {
    const request = analyzeYouTubeRequest(input.userMessage, history);
    if (request.requested && !request.url) {
      return { reply: 'gửi kèm link YouTube để mình xem bình luận nha', intent, analysis, generation, ragSources: [] };
    }
    if (request.url) {
      try {
        const result = request.operation === 'comments'
          ? await commentTool.analyzeYoutubeComments({
            videoUrl: request.url,
            mode: request.mode,
            query: request.query,
            resultLimit: request.resultLimit,
            includeReplies: request.includeReplies,
          })
          : await youtubeTool.getVideoInfo(request.url, { language: config.youtube.language });
        if (request.operation === 'comments' && result.sample.processedCount === 0) {
          return { reply: 'mình không tìm thấy bình luận đủ nội dung sau khi lọc rác.', intent, analysis, generation, ragSources: [] };
        }
        toolContext = compactYouTubeToolResult(result, request.operation);
      } catch (error) {
        const normalized = error instanceof YouTubeError ? error : new YouTubeError('API_ERROR', 'Unexpected YouTube tool error');
        log.error('YOUTUBE', `Tool failed: code=${normalized.code}, status=${normalized.status ?? 'none'}`);
        return { reply: youtubeErrorMessage(normalized), intent, analysis, generation, ragSources: [] };
      }
    }
  }

  for (let attempt = 0; attempt <= conversationConfig.validationRetries; attempt += 1) {
    const messages = await buildPrompt({
      ...input,
      history,
      analysis,
      intent,
      fewShots,
      retryFeedback: attempt > 0 ? lastViolations : [],
      toolContext,
    });
    lastResponse = await generate(messages, generation);
    const validation = validateResponse({ response: lastResponse, analysis, intent, history, summary });
    if (validation.valid) {
      return { reply: lastResponse.trim(), intent, analysis, generation, ragSources: messages.ragSources || [], toolContext };
    }
    lastViolations = validation.violations;
    log.warn('CONVERSATION', `Response rejected for intent=${intent}, attempt=${attempt + 1}, rules=${lastViolations.join(',')}`);
  }

  log.warn('CONVERSATION', `Using safe fallback after validation retries for intent=${intent}`);
  return { reply: safeFallback(intent, input.userMessage), intent, analysis, generation, ragSources: [] };
}
