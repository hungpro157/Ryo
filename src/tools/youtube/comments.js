import { YouTubeError } from './errors.js';
import { normalizeComment } from './normalize.js';
import { extractVideoId } from './youtubeUrl.js';

function clamp(value, fallback, maximum) {
  const parsed = Number.parseInt(value ?? fallback, 10);
  return Math.min(maximum, Math.max(1, Number.isFinite(parsed) ? parsed : fallback));
}

function normalizeOrder(order) {
  return order === 'time' ? 'time' : 'relevance';
}

export async function fetchCommentReplies(client, parentCommentId, options = {}) {
  const parentId = String(parentCommentId || '').trim();
  if (!parentId) throw new YouTubeError('INVALID_URL', 'A parent comment ID is required');
  const data = await client.request('comments', {
    part: 'snippet',
    parentId,
    maxResults: clamp(options.maxResults, 20, 50),
    pageToken: options.pageToken,
    textFormat: 'plainText',
  });
  if (!Array.isArray(data.items)) throw new YouTubeError('MALFORMED_RESPONSE', 'Missing reply items');
  return {
    parentCommentId: parentId,
    replies: data.items.map((item) => normalizeComment(item, 0)),
    nextPageToken: data.nextPageToken || null,
    pageInfo: data.pageInfo || { totalResults: data.items.length, resultsPerPage: data.items.length },
  };
}

export async function fetchTopLevelComments(client, urlOrId, options = {}) {
  const videoId = extractVideoId(urlOrId);
  const maxResults = clamp(options.maxResults, 20, 50);
  const data = await client.request('commentThreads', {
    part: 'snippet',
    videoId,
    maxResults,
    order: normalizeOrder(options.order),
    pageToken: options.pageToken,
    textFormat: 'plainText',
  });
  if (!Array.isArray(data.items)) throw new YouTubeError('MALFORMED_RESPONSE', 'Missing comment thread items');

  const comments = data.items.map((thread) => {
    const topLevel = thread?.snippet?.topLevelComment;
    return normalizeComment(topLevel, thread?.snippet?.totalReplyCount || 0);
  });

  if (options.includeReplies) {
    const replyLimit = clamp(options.replyMaxResults, 20, 50);
    for (const comment of comments) {
      comment.replies = comment.replyCount > 0
        ? (await fetchCommentReplies(client, comment.id, { maxResults: replyLimit })).replies
        : [];
    }
  }

  return {
    videoId,
    comments,
    nextPageToken: data.nextPageToken || null,
    pageInfo: data.pageInfo || { totalResults: comments.length, resultsPerPage: comments.length },
  };
}
