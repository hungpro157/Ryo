import assert from 'node:assert/strict';
import test from 'node:test';
import { YouTubeError } from '../src/tools/youtube/errors.js';
import { createYouTubeService } from '../src/tools/youtube/index.js';
import { extractVideoId } from '../src/tools/youtube/youtubeUrl.js';

const VIDEO_ID = 'dQw4w9WgXcQ';

test('extracts IDs from standard, short, Shorts and parameterized URLs', () => {
  const urls = [
    `https://www.youtube.com/watch?v=${VIDEO_ID}`,
    `https://youtu.be/${VIDEO_ID}`,
    `https://www.youtube.com/shorts/${VIDEO_ID}`,
    `https://www.youtube.com/watch?v=${VIDEO_ID}&list=abc&t=42s`,
  ];
  for (const url of urls) assert.equal(extractVideoId(url), VIDEO_ID);
});

test('rejects an invalid YouTube URL', () => {
  assert.throws(() => extractVideoId('https://example.com/watch?v=dQw4w9WgXcQ'), (error) => error.code === 'INVALID_URL');
});

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

test('maps comments disabled response', async () => {
  const service = createYouTubeService({
    apiKey: 'test-key',
    fetchImpl: async () => jsonResponse(403, { error: { errors: [{ reason: 'commentsDisabled' }] } }),
  });
  await assert.rejects(service.getCommentReplies('parent-id'), (error) => error instanceof YouTubeError && error.code === 'COMMENTS_DISABLED');
});

test('maps quota exceeded response', async () => {
  const service = createYouTubeService({
    apiKey: 'test-key',
    fetchImpl: async () => jsonResponse(403, { error: { errors: [{ reason: 'quotaExceeded' }] } }),
  });
  await assert.rejects(service.getVideoInfo(VIDEO_ID), (error) => error.code === 'QUOTA_EXCEEDED');
});

test('returns empty comments as a valid structured result', async () => {
  const responses = [
    jsonResponse(200, { items: [{ id: VIDEO_ID, snippet: { title: 'Video', channelTitle: 'Channel' } }] }),
    jsonResponse(200, { items: [], pageInfo: { totalResults: 0, resultsPerPage: 0 } }),
  ];
  const service = createYouTubeService({ apiKey: 'test-key', fetchImpl: async () => responses.shift() });
  const result = await service.getComments(VIDEO_ID);
  assert.equal(result.video.title, 'Video');
  assert.deepEqual(result.comments, []);
  assert.equal(result.pageInfo.totalResults, 0);
});

test('normalizes video, comments and replies', async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    if (url.pathname.endsWith('/videos')) {
      return jsonResponse(200, { items: [{
        id: VIDEO_ID,
        snippet: {
          title: 'Original title', localized: { title: 'Tiêu đề' }, channelId: 'channel-id',
          channelTitle: 'Channel', publishedAt: '2025-01-01T00:00:00Z', thumbnails: { high: { url: 'https://img' } },
        },
        statistics: { viewCount: '123', likeCount: '12', commentCount: '3' },
        contentDetails: { duration: 'PT2M' }, status: { privacyStatus: 'public' },
      }] });
    }
    if (url.pathname.endsWith('/commentThreads')) {
      return jsonResponse(200, { items: [{
        snippet: {
          totalReplyCount: 1,
          topLevelComment: { id: 'top-1', snippet: {
            authorDisplayName: 'Alice', textDisplay: 'hay quá', likeCount: 7,
            publishedAt: '2025-01-02T00:00:00Z', updatedAt: '2025-01-03T00:00:00Z',
          } },
        },
      }] });
    }
    return jsonResponse(200, { items: [{ id: 'reply-1', snippet: {
      authorDisplayName: 'Bob', textDisplay: 'đồng ý', likeCount: 2,
      publishedAt: '2025-01-04T00:00:00Z', updatedAt: '2025-01-04T00:00:00Z',
    } }] });
  };
  const service = createYouTubeService({ apiKey: 'test-key', fetchImpl });
  const result = await service.getComments(VIDEO_ID, { includeReplies: true, maxResults: 10, order: 'time', language: 'vi' });

  assert.deepEqual(result.video, {
    id: VIDEO_ID, title: 'Tiêu đề', description: '', channelId: 'channel-id', channelTitle: 'Channel',
    publishedAt: '2025-01-01T00:00:00Z', tags: [], thumbnailUrl: 'https://img', duration: 'PT2M',
    privacyStatus: 'public', viewCount: 123, likeCount: 12, commentCount: 3,
  });
  assert.deepEqual(result.comments[0], {
    id: 'top-1', author: 'Alice', text: 'hay quá', likeCount: 7,
    publishedAt: '2025-01-02T00:00:00Z', updatedAt: '2025-01-03T00:00:00Z', replyCount: 1,
    replies: [{
      id: 'reply-1', author: 'Bob', text: 'đồng ý', likeCount: 2,
      publishedAt: '2025-01-04T00:00:00Z', updatedAt: '2025-01-04T00:00:00Z', replyCount: 0,
    }],
  });
  assert.equal(calls.length, 3);
  assert.equal(calls[1].searchParams.get('order'), 'time');
  assert.equal(calls[0].searchParams.get('hl'), 'vi');
});
