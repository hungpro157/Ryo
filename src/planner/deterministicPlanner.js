import { findYouTubeUrl } from '../tools/youtube/youtubeUrl.js';
import { analyzeYouTubeRequest } from '../conversation/youtubeRequest.js';
import { emptyPlan, PLAN_VERSION } from './plannerTypes.js';

const VIDEO_REFERENCE = /(video (?:này|nay|lúc nãy|luc nay|vừa rồi|vua roi|đầu tiên|dau tien|thứ hai|thu hai|cuối|cuoi|trước|truoc))/iu;
const CREATOR_VIEWERS = /(tác giả|tac gia|người nói|nguoi noi).{0,50}(người xem|nguoi xem|mọi người|moi nguoi)|(?:người xem|nguoi xem).{0,50}(tác giả|tac gia|người nói|nguoi noi)/iu;
const TIMESTAMP = /(phút mấy|phut may|timestamp|nhắc đến|nhac den|nói về|noi ve)/iu;
const SUMMARY = /(video.{0,20}(nói gì|noi gi|tóm tắt|tom tat)|tóm tắt.{0,30}video)/iu;
const RANGE = /(?:từ|tu)\s*(\d{1,3})(?::(\d{2}))?\s*(?:đến|den|tới|toi)\s*(\d{1,3})(?::(\d{2}))?/iu;

function resolveUrl(message, history = []) {
  const direct = findYouTubeUrl(message);
  if (direct) return direct;
  for (const item of [...history].reverse()) {
    const found = findYouTubeUrl(item.content || '');
    if (found) return found;
  }
  return null;
}

function step(id, tool, action, input, expectedOutput, options = {}) {
  return { id, tool, action, dependsOn: [], canRunInParallel: true, input, expectedOutput, required: true, ...options };
}

export function createDeterministicPlan({ message, intent, history = [], registry }) {
  if (intent !== 'youtube_request' && !VIDEO_REFERENCE.test(message)) return emptyPlan();
  const url = resolveUrl(message, history);
  const request = analyzeYouTubeRequest(message, history);
  const needsTranscript = CREATOR_VIEWERS.test(message) || TIMESTAMP.test(message) || SUMMARY.test(message) || RANGE.test(message);
  const needsComments = CREATOR_VIEWERS.test(message) || request.operation === 'comments';
  if (!url) return {
    ...emptyPlan('youtube_missing_url'), requiresClarification: true,
    clarificationQuestion: 'gửi mình link video với', responseMode: 'clarification',
  };
  const steps = [];
  if (CREATOR_VIEWERS.test(message) && registry.has('youtube.metadata')) steps.push(step('metadata', 'youtube.metadata', 'get_video_info', { videoUrl: url }, 'video_metadata'));
  if (needsTranscript && registry.has('youtube.transcript')) {
    const range = message.match(RANGE);
    const action = range ? 'summarize_range' : TIMESTAMP.test(message) ? 'search' : 'summarize';
    const query = action === 'search' ? message.replace(/https?:\/\/\S+/gu, '').trim() : undefined;
    const input = { videoUrl: url, ...(query ? { query } : {}), ...(range ? { startSeconds: Number(range[1]) * 60 + Number(range[2] || 0), endSeconds: Number(range[3]) * 60 + Number(range[4] || 0) } : {}) };
    steps.push(step('transcript', 'youtube.transcript', action, input, 'transcript_evidence', CREATOR_VIEWERS.test(message) && steps.length ? { dependsOn: ['metadata'] } : {}));
  }
  if (needsComments && registry.has('youtube.comments')) steps.push(step('comments', 'youtube.comments', 'analyze', {
    videoUrl: url, mode: request.mode, query: request.query, resultLimit: request.resultLimit, includeReplies: request.includeReplies,
  }, 'comment_evidence', CREATOR_VIEWERS.test(message) && steps.some((item) => item.id === 'metadata') ? { dependsOn: ['metadata'] } : {}));
  if (!steps.length && registry.has('youtube.metadata')) steps.push(step('metadata', 'youtube.metadata', 'get_video_info', { videoUrl: url }, 'video_metadata'));
  const responseMode = CREATOR_VIEWERS.test(message) ? 'compare_creator_and_viewers'
    : needsComments ? 'youtube_comment_analysis' : TIMESTAMP.test(message) ? 'youtube_topic_search' : 'youtube_summary';
  return { version: PLAN_VERSION, requestType: responseMode, requiresClarification: false, clarificationQuestion: null, steps, responseMode, limitations: needsTranscript && !registry.has('youtube.transcript') ? ['Transcript tool is unavailable; legacy routing may be used.'] : [] };
}

export { resolveUrl };
