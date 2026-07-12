import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ryo-routing-'));
process.env.MEMORY_DB_PATH = path.join(tempDir, 'memory.sqlite');
const memory = await import('../src/database/sqlite/memory.js');
const { generateConversationResponse } = await import('../src/conversation/pipeline.js');

test.before(() => memory.initMemoryDB());
test.after(() => { memory.closeMemoryDB(); fs.rmSync(tempDir, { recursive: true, force: true }); });

const base = { guildId: 'g', channelId: 'c', userId: 'u', username: 'User', history: [] };
const prompt = async () => Object.assign([{ role: 'system', content: 'test' }], { ragSources: [] });

test('technical request does not call YouTube tools', async () => {
  let calls = 0;
  const result = await generateConversationResponse({ ...base, userMessage: 'Ollama là gì?' }, {
    youtubeTool: { getVideoInfo: async () => { calls += 1; } }, buildPrompt: prompt,
    generate: async () => 'Ollama chạy model local.',
  });
  assert.equal(calls, 0);
  assert.deepEqual(result.diagnostics.selectedTools, []);
});

test('comments request calls comments once and retry reuses evidence', async () => {
  let toolCalls = 0;
  let generations = 0;
  const result = await generateConversationResponse({ ...base, userMessage: 'mọi người chê gì? https://youtu.be/dQw4w9WgXcQ' }, {
    youtubeCommentsTool: { analyzeYoutubeComments: async () => { toolCalls += 1; return {
      video: { id: 'dQw4w9WgXcQ', commentCount: 20 }, sample: { processedCount: 1, fetchedCount: 10 },
      request: { mode: 'criticism' }, topics: [{ label: 'âm thanh' }], selectedComments: [{ text: 'âm thanh nhỏ' }], limitations: ['sample'],
    }; } },
    buildPrompt: prompt,
    generate: async () => (++generations === 1 ? 'Tao nghe nói mọi người ghét video.' : 'Trong mẫu comment, ý chê nổi bật là âm thanh nhỏ.'),
  });
  assert.equal(toolCalls, 1);
  assert.equal(generations, 2);
  assert.deepEqual(result.diagnostics.selectedTools, ['youtube_comments']);
  assert.equal(result.diagnostics.retryCount, 1);
});

test('ambiguous YouTube request selects metadata only', async () => {
  let metadata = 0;
  let comments = 0;
  const result = await generateConversationResponse({ ...base, userMessage: 'xem video này https://youtu.be/dQw4w9WgXcQ' }, {
    youtubeTool: { getVideoInfo: async () => { metadata += 1; return { id: 'dQw4w9WgXcQ', title: 'Video' }; } },
    youtubeCommentsTool: { analyzeYoutubeComments: async () => { comments += 1; } },
    buildPrompt: prompt, generate: async () => 'Video này có tiêu đề Video.',
  });
  assert.equal(metadata, 1);
  assert.equal(comments, 0);
  assert.deepEqual(result.diagnostics.selectedTools, ['youtube_metadata']);
});
