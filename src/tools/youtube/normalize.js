import { YouTubeError } from './errors.js';

function numberOrZero(value) {
  const parsed = Number.parseInt(value ?? '0', 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function normalizeComment(resource, replyCount = 0) {
  const snippet = resource?.snippet;
  if (!resource?.id || !snippet || typeof snippet.textDisplay !== 'string') {
    throw new YouTubeError('MALFORMED_RESPONSE', 'Malformed YouTube comment resource');
  }
  return {
    id: resource.id,
    author: String(snippet.authorDisplayName || 'Unknown'),
    text: snippet.textDisplay,
    likeCount: numberOrZero(snippet.likeCount),
    publishedAt: String(snippet.publishedAt || ''),
    updatedAt: String(snippet.updatedAt || snippet.publishedAt || ''),
    replyCount: numberOrZero(replyCount),
  };
}

export function normalizeVideo(resource) {
  const snippet = resource?.snippet;
  if (!resource?.id || !snippet || typeof snippet.title !== 'string') {
    throw new YouTubeError('MALFORMED_RESPONSE', 'Malformed YouTube video resource');
  }
  const statistics = resource.statistics || {};
  return {
    id: resource.id,
    title: snippet.localized?.title || snippet.title,
    description: snippet.localized?.description || snippet.description || '',
    channelId: String(snippet.channelId || ''),
    channelTitle: String(snippet.channelTitle || ''),
    publishedAt: String(snippet.publishedAt || ''),
    tags: Array.isArray(snippet.tags) ? snippet.tags : [],
    thumbnailUrl: snippet.thumbnails?.maxres?.url || snippet.thumbnails?.high?.url || snippet.thumbnails?.default?.url || '',
    duration: String(resource.contentDetails?.duration || ''),
    privacyStatus: String(resource.status?.privacyStatus || ''),
    viewCount: numberOrZero(statistics.viewCount),
    likeCount: numberOrZero(statistics.likeCount),
    commentCount: numberOrZero(statistics.commentCount),
  };
}
