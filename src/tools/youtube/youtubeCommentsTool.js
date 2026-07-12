import { youtubeCommentConfig } from '../../config/youtubeCommentConfig.js';
import { youtube } from './index.js';
import { processComments } from './comments/commentPipeline.js';
import { LRUCache } from 'lru-cache';
import { extractVideoId } from './youtubeUrl.js';

export function createYouTubeCommentsTool({ youtubeService = youtube, config = youtubeCommentConfig } = {}) {
  const resultCache = new LRUCache({ max: 100, ttl: 15 * 60 * 1000 });
  const inFlight = new Map();
  const stats = { hits: 0, misses: 0, shared: 0 };
  return {
    async analyzeYoutubeComments({ videoUrl, mode = 'overall_reaction', query = null, fetchLimit, resultLimit, includeReplies = false }) {
      const cacheKey = JSON.stringify({ videoId: extractVideoId(videoUrl), mode, query, fetchLimit, resultLimit, includeReplies, version: 'comments-v1' });
      const cached = resultCache.get(cacheKey);
      if (cached) { stats.hits += 1; return { ...cached, cacheHit: true }; }
      if (inFlight.has(cacheKey)) { stats.shared += 1; return inFlight.get(cacheKey); }
      stats.misses += 1;
      const work = (async () => {
      const target = Math.min(fetchLimit || config.fetchLimit, config.processLimit);
      const comments = [];
      let video = null;
      let pageToken = null;

      do {
        const remaining = target - comments.length;
        const options = { maxResults: Math.min(50, remaining), pageToken, includeReplies };
        let page;
        if (youtubeService.getTopLevelComments) {
          if (!video) video = await youtubeService.getVideoInfo(videoUrl);
          page = await youtubeService.getTopLevelComments(videoUrl, options);
        } else {
          page = await youtubeService.getComments(videoUrl, options);
          video ||= page.video;
        }
        const pageComments = (page.comments || []).flatMap((comment) => [
          { ...comment, replies: undefined },
          ...(includeReplies ? (comment.replies || []) : []),
        ]);
        comments.push(...pageComments.slice(0, remaining));
        pageToken = page.nextPageToken || null;
      } while (pageToken && comments.length < target);

      const result = processComments({ rawComments: comments, video, mode, query, resultLimit, config });
      resultCache.set(cacheKey, result);
      return { ...result, cacheHit: false };
      })();
      inFlight.set(cacheKey, work);
      try { return await work; } finally { inFlight.delete(cacheKey); }
    },
    getCacheStats() { return { entries: resultCache.size, inFlight: inFlight.size, ...stats }; },
  };
}

export const youtubeCommentsTool = createYouTubeCommentsTool();
