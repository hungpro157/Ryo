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
import { createExecutionContext } from './executionContext.js';
import { plannerConfig } from '../config/plannerConfig.js';
import { createYouTubeToolRegistry } from '../planner/tools/toolRegistry.js';
import { selectPlan } from '../planner/planner.js';
import { executePlan } from '../planner/planExecutor.js';
import { combinePlanResult } from '../planner/resultCombiner.js';

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

function evidenceFallback(toolContext, intent, input) {
  const topic = toolContext?.topics?.[0];
  if (topic) return `Trong ${toolContext.sample?.processedCount || 0} bình luận đã xử lý, ý nổi bật là ${topic.label}.`;
  return safeFallback(intent, input);
}

export async function generateConversationResponse(input, dependencies = {}) {
  const execution = createExecutionContext(input);
  const history = input.history || [];
  const analysis = execution.measureSync('analyze', () => analyzeMessage(input.userMessage, { prefix: config.discord.prefix, history }));
  const intent = execution.measureSync('intent', () => classifyIntent(analysis));
  const fewShots = selectFewShots(intent, input.userMessage, conversationConfig.fewShots);
  const generation = getGenerationProfile(intent, analysis, conversationConfig.generation);
  const summary = getConversationSummary(input.guildId, input.channelId, input.userId);
  const generate = dependencies.generate || chatCompletion;
  const buildPrompt = dependencies.buildPrompt || buildDynamicPrompt;
  const youtubeTool = dependencies.youtubeTool || youtube;
  const commentTool = dependencies.youtubeCommentsTool
    || (dependencies.youtubeTool ? createYouTubeCommentsTool({ youtubeService: youtubeTool }) : defaultYouTubeCommentsTool);
  let toolContext = null;
  let plannerFallback = false;
  let lastResponse = '';
  let lastViolations = [];
  const finish = (result) => {
    const diagnostics = execution.diagnostics();
    log.info('PIPELINE', 'Request complete', { intent, tools: diagnostics.selectedTools, retries: diagnostics.retryCount, timings: diagnostics.timings });
    return { ...result, diagnostics };
  };

  const activePlannerConfig = dependencies.plannerConfig || plannerConfig;
  const registry = dependencies.toolRegistry || createYouTubeToolRegistry({ youtubeService: youtubeTool, commentsTool: commentTool, transcriptTool: dependencies.youtubeTranscriptTool });
  if (activePlannerConfig.enabled) {
    try {
      const selection = await execution.measure('planner', () => selectPlan({ message: input.userMessage, intent, history }, { config: activePlannerConfig, registry, llmGenerate: dependencies.plannerGenerate }));
      if (selection.plan?.requiresClarification) return finish({ reply: selection.plan.clarificationQuestion, intent, analysis, generation, ragSources: [] });
      if (selection.plan?.steps.length) {
        const planResult = await execution.measure('tools', () => executePlan(selection.plan, registry, { executionContext: execution, limits: activePlannerConfig, signal: input.signal }));
        log.info('PLANNER', 'Plan execution complete', {
          durationMs: planResult.steps.reduce((total, step) => total + (step.durationMs || 0), 0),
          steps: planResult.steps.map((step) => ({ id: step.id, status: step.status, cacheHit: Boolean(step.cacheHit), errorCode: step.errorCode || null })),
          partialFailure: planResult.partialFailure,
        });
        toolContext = combinePlanResult(planResult, { maxChars: activePlannerConfig.maxEvidenceChars });
        execution.selectedTools.push(...selection.plan.steps.map((step) => step.tool.replace('youtube.', 'youtube_')));
        if (toolContext.operation === 'comments' && toolContext.sample?.processedCount === 0) {
          return finish({ reply: 'mình không tìm thấy bình luận đủ nội dung sau khi lọc rác.', intent, analysis, generation, ragSources: [] });
        }
      } else if (intent === 'youtube_request' && selection.plan?.limitations.length) plannerFallback = true;
    } catch (error) {
      plannerFallback = true;
      log.warn('PLANNER', 'Plan validation or execution fallback', { errorCode: error?.code || error?.name || 'PLANNER_ERROR' });
    }
  }

  if (intent === 'youtube_request' && (!activePlannerConfig.enabled || plannerFallback || !toolContext)) {
    const request = analyzeYouTubeRequest(input.userMessage, history);
    if ((!config.youtube.commentsEnabled || !config.youtube.apiKey) && !dependencies.youtubeTool && !dependencies.youtubeCommentsTool) {
      return finish({ reply: 'YouTube tool chưa được cấu hình API key.', intent, analysis, generation, ragSources: [] });
    }
    if (request.requested && !request.url) {
      return finish({ reply: 'gửi kèm link YouTube để mình xem bình luận nha', intent, analysis, generation, ragSources: [] });
    }
    if (request.url) {
      try {
        const result = await execution.runTool(request.operation === 'comments' ? 'youtube_comments' : 'youtube_metadata', () => (
          request.operation === 'comments' ? commentTool.analyzeYoutubeComments({
            videoUrl: request.url,
            mode: request.mode,
            query: request.query,
            resultLimit: request.resultLimit,
            includeReplies: request.includeReplies,
          }) : youtubeTool.getVideoInfo(request.url, { language: config.youtube.language })
        ));
        if (request.operation === 'comments' && result.sample.processedCount === 0) {
          return finish({ reply: 'mình không tìm thấy bình luận đủ nội dung sau khi lọc rác.', intent, analysis, generation, ragSources: [] });
        }
        toolContext = compactYouTubeToolResult(result, request.operation);
      } catch (error) {
        const normalized = error instanceof YouTubeError ? error : new YouTubeError('API_ERROR', 'Unexpected YouTube tool error');
        log.error('YOUTUBE', `Tool failed: code=${normalized.code}, status=${normalized.status ?? 'none'}`);
        return finish({ reply: youtubeErrorMessage(normalized), intent, analysis, generation, ragSources: [] });
      }
    }
  }

  for (let attempt = 0; attempt <= conversationConfig.validationRetries; attempt += 1) {
    const messages = await execution.measure('prompt', () => buildPrompt({
      ...input,
      history,
      analysis,
      intent,
      fewShots,
      retryFeedback: attempt > 0 ? lastViolations : [],
      toolContext,
    }));
    lastResponse = await execution.measure('generation', () => generate(messages, generation));
    const validation = execution.measureSync('validation', () => validateResponse({ response: lastResponse, analysis, intent, history, summary, toolContext }));
    if (validation.valid) {
      return finish({ reply: lastResponse.trim(), intent, analysis, generation, ragSources: messages.ragSources || [], toolContext });
    }
    execution.retryCount = attempt + 1;
    lastViolations = validation.violations;
    log.warn('CONVERSATION', `Response rejected for intent=${intent}, attempt=${attempt + 1}, rules=${lastViolations.join(',')}`);
  }

  log.warn('CONVERSATION', `Using safe fallback after validation retries for intent=${intent}`);
  return finish({ reply: evidenceFallback(toolContext, intent, input.userMessage), intent, analysis, generation, ragSources: [] });
}
