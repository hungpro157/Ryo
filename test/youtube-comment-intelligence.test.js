import assert from 'node:assert/strict';
import test from 'node:test';
import { youtubeCommentConfig } from '../src/config/youtubeCommentConfig.js';
import { assessNoise } from '../src/tools/youtube/comments/commentNoiseFilter.js';
import { deduplicateComments } from '../src/tools/youtube/comments/duplicateDetector.js';
import { normalizeCommentForAnalysis } from '../src/tools/youtube/comments/normalizeComment.js';
import { processComments } from '../src/tools/youtube/comments/commentPipeline.js';
import { scoreQuality } from '../src/tools/youtube/comments/qualityScorer.js';
import { scoreRelevance } from '../src/tools/youtube/comments/relevanceScorer.js';
import { classifySentiment } from '../src/tools/youtube/comments/sentimentClassifier.js';
import { analyzeYouTubeRequest } from '../src/conversation/youtubeRequest.js';
import { createYouTubeCommentsTool } from '../src/tools/youtube/youtubeCommentsTool.js';

function raw(id, text, likeCount = 0, replyCount = 0) {
  return { id, author: `user-${id}`, text, likeCount, replyCount, publishedAt: '', updatedAt: '' };
}

function normalized(id, text, likes = 0) {
  return normalizeCommentForAnalysis(raw(id, text, likes));
}

function scored(id, text, mode, query = null, likes = 0) {
  const comment = normalized(id, text, likes);
  comment.sentiment = classifySentiment(text);
  Object.assign(comment, scoreQuality(comment, assessNoise(comment), youtubeCommentConfig.weights));
  comment.relevanceScore = scoreRelevance(comment, { mode, query });
  return comment;
}

const video = { id: 'dQw4w9WgXcQ', title: 'Video', commentCount: 100 };

test('removes emoji-only comments, first and engagement bait', () => {
  for (const text of ['😂😂😂😂', '....', 'first', 'ai còn xem năm 2026', 'điểm danh']) {
    assert.equal(assessNoise(normalized(text, text)).keep, false, text);
  }
});

test('preserves useful short criticism', () => {
  for (const text of ['âm thanh nhỏ', 'sai ở phút 12', 'thiếu phụ đề']) {
    assert.equal(assessNoise(normalized(text, text)).keep, true, text);
  }
});

test('merges exact and near duplicates', () => {
  const exact = deduplicateComments([normalized('1', 'Âm thanh nhỏ!'), normalized('2', 'âm thanh nhỏ 😂')]);
  assert.equal(exact.comments.length, 1);
  assert.equal(exact.comments[0].duplicateCount, 2);

  const near = deduplicateComments([
    normalized('3', 'Âm thanh rất nhỏ ở phút 12'),
    normalized('4', 'Âm thanh rất nhỏ phút 12'),
  ]);
  assert.equal(near.comments.length, 1);
});

test('uses logarithmic like scaling', () => {
  const low = normalized('1', 'Giải thích rõ vì có ví dụ cụ thể', 10);
  const high = normalized('2', 'Giải thích rõ vì có ví dụ cụ thể', 1000);
  const lowScore = scoreQuality(low, assessNoise(low), youtubeCommentConfig.weights).qualitySignals.likes;
  const highScore = scoreQuality(high, assessNoise(high), youtubeCommentConfig.weights).qualitySignals.likes;
  assert.ok(highScore > lowScore);
  assert.ok(highScore / lowScore < 4);
});

test('high likes do not override obvious spam', () => {
  const spam = normalized('spam', 'sub chéo nha, đăng ký kênh mình https://spam.example', 100000);
  const useful = normalized('useful', 'Âm thanh nhỏ ở phút 12 nên hơi khó nghe', 2);
  const spamScore = scoreQuality(spam, assessNoise(spam), youtubeCommentConfig.weights).qualityScore;
  const usefulScore = scoreQuality(useful, assessNoise(useful), youtubeCommentConfig.weights).qualityScore;
  assert.equal(assessNoise(spam).keep, false);
  assert.ok(usefulScore > spamScore);
});

test('criticism and praise modes prioritize matching sentiment', () => {
  const negative = scored('n', 'Âm thanh nhỏ và giải thích đoạn này sai', 'criticism');
  const positive = scored('p', 'Giải thích rất hay và dễ hiểu', 'criticism');
  assert.ok(negative.relevanceScore > positive.relevanceScore);
  assert.ok(
    scoreRelevance(positive, { mode: 'praise' }) > scoreRelevance(negative, { mode: 'praise' }),
  );
});

test('topic search prioritizes related Vietnamese and English keywords', () => {
  const audio = scored('a', 'Mic hơi rè và volume quá nhỏ', 'topic_search', 'âm thanh');
  const unrelated = scored('b', 'Màu thumbnail nhìn khá đẹp', 'topic_search', 'âm thanh');
  assert.ok(audio.relevanceScore > unrelated.relevanceScore);
});

test('representative quotes preserve original text unchanged', () => {
  const original = 'Âm thanh nhỏ &amp; rè ở phút 12!';
  const result = processComments({ rawComments: [raw('1', original)], video, mode: 'criticism' });
  assert.equal(result.selectedComments[0].text, original);
});

test('respects process, topic, quote and LLM limits', () => {
  const comments = Array.from({ length: 20 }, (_, index) => raw(String(index), `Âm thanh nhỏ ở phút ${index + 1} vì mic bị rè`, index));
  const config = { ...youtubeCommentConfig, processLimit: 8, llmLimit: 4, topicLimit: 2, quotesPerTopic: 1 };
  const result = processComments({ rawComments: comments, video, mode: 'problems', resultLimit: 10, config });
  assert.ok(result.selectedComments.length <= 4);
  assert.ok(result.topics.length <= 2);
  assert.ok(result.topics.every((topic) => topic.representativeQuotes.length <= 1));
  assert.ok(result.sample.normalizedCount <= 8);
});

test('handles empty and malformed comments without crashing', () => {
  const empty = processComments({ rawComments: [], video, mode: 'overall_reaction' });
  assert.equal(empty.sample.processedCount, 0);
  assert.deepEqual(empty.selectedComments, []);

  const malformed = processComments({ rawComments: [null, {}, { id: 'x', text: 42 }, raw('ok', 'Thiếu phụ đề ở đoạn cuối')], video, mode: 'problems' });
  assert.equal(malformed.sample.normalizedCount, 1);
});

test('preserves Vietnamese text and detects language', () => {
  const comment = normalized('vi', 'Giải thích rất dễ hiểu, nhưng âm thanh hơi nhỏ.');
  assert.equal(comment.text, 'Giải thích rất dễ hiểu, nhưng âm thanh hơi nhỏ.');
  assert.equal(comment.language, 'vi');
});

test('penalizes URLs and promotional comments', () => {
  const linked = normalized('link', 'Xem thêm tại https://spam.example để đăng ký kênh mình');
  const assessment = assessNoise(linked);
  assert.equal(assessment.hasLink, true);
  assert.ok(assessment.spamProbability >= 0.65);
});

test('structured output excludes the uncontrolled raw comment dump', () => {
  const comments = Array.from({ length: 60 }, (_, index) => raw(String(index), `Góp ý cụ thể số ${index}: âm thanh nhỏ ở phút ${index + 1}`, index));
  const config = { ...youtubeCommentConfig, llmLimit: 5, topicLimit: 2, quotesPerTopic: 1 };
  const result = processComments({ rawComments: comments, video, mode: 'overall_reaction', config });
  assert.equal('rawComments' in result, false);
  assert.ok(result.selectedComments.length <= 5);
  assert.ok(JSON.stringify(result).length < JSON.stringify(comments).length);
});

test('maps natural Discord requests to intent-aware comment modes', () => {
  const cases = [
    ['mọi người khen gì?', 'praise'],
    ['video này bị chê gì?', 'criticism'],
    ['có ai báo lỗi không?', 'problems'],
    ['comment nào nói về âm thanh?', 'topic_search'],
    ['lấy mấy câu đáng chú ý', 'useful_quotes'],
    ['lấy vài câu hài nhất', 'funny_comments'],
    ['mọi người phản ứng sao?', 'overall_reaction'],
    ['lọc bỏ comment rác rồi tóm tắt', 'representative_sample'],
  ];
  const history = [{ content: 'https://youtu.be/dQw4w9WgXcQ' }];
  for (const [message, mode] of cases) {
    const request = analyzeYouTubeRequest(message, history);
    assert.equal(request.mode, mode, message);
    assert.ok(request.url, message);
  }
  const topic = analyzeYouTubeRequest('lấy 10 câu liên quan đến pin', history);
  assert.equal(topic.query, 'pin');
  assert.equal(topic.resultLimit, 10);
});

test('fetches pages up to the configured limit before compact processing', async () => {
  let calls = 0;
  const service = {
    getVideoInfo: async () => ({ ...video, commentCount: 500 }),
    getTopLevelComments: async (_url, options) => {
      calls += 1;
      const start = (calls - 1) * 50;
      const comments = Array.from({ length: options.maxResults }, (_, index) => raw(
        String(start + index),
        `Góp ý cụ thể ${start + index}: âm thanh nhỏ ở phút ${start + index + 1}`,
      ));
      return { comments, nextPageToken: start + options.maxResults < 60 ? `page-${calls + 1}` : null };
    },
  };
  const config = { ...youtubeCommentConfig, fetchLimit: 60, processLimit: 60, llmLimit: 5 };
  const tool = createYouTubeCommentsTool({ youtubeService: service, config });
  const result = await tool.analyzeYoutubeComments({ videoUrl: 'https://youtu.be/dQw4w9WgXcQ', mode: 'problems' });
  assert.equal(calls, 2);
  assert.equal(result.sample.fetchedCount, 60);
  assert.ok(result.selectedComments.length <= 5);
});
