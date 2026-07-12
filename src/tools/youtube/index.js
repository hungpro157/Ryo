import { config } from '../../config/index.js';
import { createYouTubeClient } from './youtubeClient.js';
import { fetchCommentReplies, fetchTopLevelComments } from './comments.js';
import { fetchVideoInfo } from './videoInfo.js';
export { YouTubeError, youtubeErrorMessage } from './errors.js';
export { extractVideoId, findYouTubeUrl } from './youtubeUrl.js';

export function createYouTubeService(options = {}) {
  const client = createYouTubeClient({
    apiKey: options.apiKey ?? config.youtube.apiKey,
    timeoutMs: options.timeoutMs ?? config.youtube.timeoutMs,
    fetchImpl: options.fetchImpl ?? fetch,
  });
  function withLimits(requestOptions = {}) {
    return {
      ...requestOptions,
      maxResults: Math.min(
        config.youtube.maxResults,
        Number.parseInt(requestOptions.maxResults ?? config.youtube.defaultMaxResults, 10),
      ),
    };
  }
  return {
    getVideoInfo: (urlOrId, requestOptions = {}) => fetchVideoInfo(client, urlOrId, requestOptions),
    getCommentReplies: (parentCommentId, requestOptions = {}) => fetchCommentReplies(client, parentCommentId, withLimits(requestOptions)),
    getTopLevelComments: (urlOrId, requestOptions = {}) => fetchTopLevelComments(client, urlOrId, withLimits(requestOptions)),
    async getComments(urlOrId, requestOptions = {}) {
      const video = await fetchVideoInfo(client, urlOrId, requestOptions);
      const result = await fetchTopLevelComments(client, urlOrId, withLimits(requestOptions));
      return { video, ...result };
    },
  };
}

export const youtube = createYouTubeService();
