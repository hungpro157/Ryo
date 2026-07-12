import { findYouTubeUrl } from '../tools/youtube/youtubeUrl.js';

const COMMENT_REQUEST = /\b(comment|comments|bình luận|binh luan|phản ứng|phan ung|bị chê|bi che|chê gì|che gi|khen gì|khen gi|mọi người.{0,20}(nói|nghĩ)|moi nguoi.{0,20}(noi|nghi))\b/iu;
const REPLY_REQUEST = /\b(reply|replies|trả lời bình luận|tra loi binh luan|phản hồi bình luận|phan hoi binh luan)\b/iu;

export function analyzeYouTubeRequest(message, history = []) {
  const text = String(message || '');
  let url = findYouTubeUrl(text);
  if (!url) {
    for (const item of [...history].reverse()) {
      url = findYouTubeUrl(item.content || '');
      if (url) break;
    }
  }
  return {
    requested: COMMENT_REQUEST.test(text) || Boolean(url),
    operation: COMMENT_REQUEST.test(text) ? 'comments' : 'video_info',
    includeReplies: REPLY_REQUEST.test(text),
    url,
  };
}

export function compactYouTubeToolResult(result, operation) {
  if (operation === 'video_info') return { operation, video: result };
  return {
    operation,
    video: result.video,
    comments: result.comments.map((comment) => ({
      ...comment,
      text: comment.text.slice(0, 600),
      replies: comment.replies?.map((reply) => ({ ...reply, text: reply.text.slice(0, 400) })),
    })),
    returnedCommentCount: result.comments.length,
    sampleIsSmall: result.comments.length < 5,
    nextPageToken: result.nextPageToken,
  };
}
