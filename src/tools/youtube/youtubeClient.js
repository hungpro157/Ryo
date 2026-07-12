import { YouTubeError } from './errors.js';

const API_BASE_URL = 'https://www.googleapis.com/youtube/v3';

function classifyApiError(status, data) {
  const reasons = (data?.error?.errors || []).map((item) => item.reason);
  const reason = reasons[0] || data?.error?.status || '';
  if (reasons.includes('quotaExceeded') || reasons.includes('dailyLimitExceeded')) return 'QUOTA_EXCEEDED';
  if (reasons.includes('commentsDisabled')) return 'COMMENTS_DISABLED';
  if (reasons.includes('videoNotFound') || reason === 'NOT_FOUND' || status === 404) return 'VIDEO_NOT_FOUND';
  return 'API_ERROR';
}

export function createYouTubeClient({ apiKey, timeoutMs = 15000, fetchImpl = fetch } = {}) {
  return {
    async request(resource, parameters = {}) {
      if (!apiKey) throw new YouTubeError('MISSING_API_KEY', 'YOUTUBE_API_KEY is not configured');
      const url = new URL(`${API_BASE_URL}/${resource}`);
      for (const [key, value] of Object.entries(parameters)) {
        if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
      }
      url.searchParams.set('key', apiKey);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetchImpl(url, { signal: controller.signal });
        const data = await response.json().catch(() => null);
        if (!response.ok) {
          const code = classifyApiError(response.status, data);
          throw new YouTubeError(code, `YouTube API ${response.status}`, { status: response.status });
        }
        if (!data || typeof data !== 'object') {
          throw new YouTubeError('MALFORMED_RESPONSE', 'YouTube API returned malformed JSON');
        }
        return data;
      } catch (error) {
        if (error instanceof YouTubeError) throw error;
        if (error?.name === 'AbortError') {
          throw new YouTubeError('API_TIMEOUT', 'YouTube API request timed out', { cause: error });
        }
        throw new YouTubeError('API_ERROR', 'YouTube API request failed', { cause: error });
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}
