export const PLAN_VERSION = 1;
export const RESPONSE_MODES = new Set([
  'direct_answer', 'youtube_summary', 'youtube_topic_search', 'youtube_comment_analysis',
  'compare_creator_and_viewers', 'compare_videos', 'clarification', 'partial_result',
]);

export function emptyPlan(requestType = 'no_tools') {
  return {
    version: PLAN_VERSION, requestType, requiresClarification: false,
    clarificationQuestion: null, steps: [], responseMode: 'direct_answer', limitations: [],
  };
}
