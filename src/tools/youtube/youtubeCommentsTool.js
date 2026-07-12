import { youtubeCommentConfig } from '../../config/youtubeCommentConfig.js';
import { youtube } from './index.js';
import { processComments } from './comments/commentPipeline.js';

export function createYouTubeCommentsTool({ youtubeService = youtube, config = youtubeCommentConfig } = {}) {
  return {
    async analyzeYoutubeComments({ videoUrl, mode = 'overall_reaction', query = null, fetchLimit, resultLimit, includeReplies = false }) {
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

      return processComments({ rawComments: comments, video, mode, query, resultLimit, config });
    },
  };
}

export const youtubeCommentsTool = createYouTubeCommentsTool();
