import { YouTubeError } from './errors.js';
import { normalizeVideo } from './normalize.js';
import { extractVideoId } from './youtubeUrl.js';

export async function fetchVideoInfo(client, urlOrId, { language } = {}) {
  const videoId = extractVideoId(urlOrId);
  const data = await client.request('videos', {
    part: 'snippet,statistics,contentDetails,status',
    id: videoId,
    hl: language,
  });
  if (!Array.isArray(data.items)) throw new YouTubeError('MALFORMED_RESPONSE', 'Missing video items');
  if (data.items.length === 0) {
    throw new YouTubeError('VIDEO_NOT_FOUND', 'Video not found, deleted, or private');
  }
  return normalizeVideo(data.items[0]);
}
