import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ryo-conversation-'));
process.env.MEMORY_DB_PATH = path.join(tempDir, 'memory.sqlite');

const { initMemoryDB, closeMemoryDB } = await import('../src/database/sqlite/memory.js');
const { analyzeMessage } = await import('../src/conversation/messageAnalyzer.js');
const { classifyIntent, getGenerationProfile } = await import('../src/conversation/intentClassifier.js');
const { selectFewShots } = await import('../src/conversation/fewShotSelector.js');
const { validateResponse } = await import('../src/conversation/responseValidator.js');
const { conversationConfig } = await import('../src/config/conversationConfig.js');
const { generateConversationResponse } = await import('../src/conversation/pipeline.js');

test.before(() => initMemoryDB());
test.after(() => {
  closeMemoryDB();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

function intentFor(text, history = []) {
  return classifyIntent(analyzeMessage(text, { history }));
}

test('classifies ê and Ryo as short pings', () => {
  for (const input of ['ê', 'Ryo']) {
    const analysis = analyzeMessage(input);
    assert.equal(classifyIntent(analysis), 'ping');
    assert.equal(getGenerationProfile('ping', analysis, conversationConfig.generation).maxTokens, 24);
  }
});

test('classifies a Discord mention as a ping', () => {
  assert.equal(intentFor('<@123456789>'), 'ping');
});

test('classifies emoji and selects only relevant few-shots', () => {
  assert.equal(intentFor('👀'), 'emoji');
  const examples = selectFewShots('emoji', '👀', { min: 2, max: 5 });
  assert.ok(examples.length >= 2 && examples.length <= 5);
  assert.ok(examples.every((example) => example.user && example.assistant));
});

test('unknown username claim is rejected and retried', async () => {
  const generated = ['Tao nghe nói Hoshino_al là streamer nổi tiếng.', 'ủa sao á'];
  let calls = 0;
  const result = await generateConversationResponse({
    guildId: 'g', channelId: 'c', userId: 'u', username: 'User', userMessage: 'Hoshino_al', history: [],
  }, {
    buildPrompt: async () => Object.assign([{ role: 'system', content: 'test' }], { ragSources: [] }),
    generate: async () => generated[calls++],
  });
  assert.equal(result.intent, 'ping');
  assert.equal(result.reply, 'ủa sao á');
  assert.equal(calls, 2);
});

test('classifies Ollama question as technical and permits a useful answer', () => {
  const analysis = analyzeMessage('Ollama là gì?');
  const intent = classifyIntent(analysis);
  assert.equal(intent, 'technical_question');
  assert.equal(getGenerationProfile(intent, analysis, conversationConfig.generation).maxTokens, 400);
  assert.equal(validateResponse({
    response: 'Ollama là công cụ chạy model ngôn ngữ ngay trên máy local.', analysis, intent,
  }).valid, true);
});

test('allows stage directions only for explicit roleplay', () => {
  const roleplayAnalysis = analyzeMessage('nhập vai thám tử đi');
  const roleplayIntent = classifyIntent(roleplayAnalysis);
  assert.equal(roleplayIntent, 'explicit_roleplay');
  assert.equal(validateResponse({ response: '*nhìn quanh phòng* Có dấu chân ở đây.', analysis: roleplayAnalysis, intent: roleplayIntent }).valid, true);

  const casualAnalysis = analyzeMessage('nay sao rồi');
  assert.equal(validateResponse({ response: '*mắt trợn lên* Gì?', analysis: casualAnalysis, intent: 'casual_conversation' }).valid, false);
});

test('detects a normal conversation continuation', () => {
  const history = [{ role: 'assistant', content: 'nghe cũng ổn đó' }];
  assert.equal(intentFor('tui cũng nghĩ vậy đó', history), 'conversation_continuation');
});

test('passes normalized YouTube comments into the existing prompt pipeline', async () => {
  let receivedToolContext;
  const result = await generateConversationResponse({
    guildId: 'g', channelId: 'c', userId: 'u', username: 'User',
    userMessage: 'tóm tắt bình luận YouTube https://youtu.be/dQw4w9WgXcQ', history: [],
  }, {
    youtubeTool: {
      getComments: async () => ({
        video: { id: 'dQw4w9WgXcQ', title: 'Test video' },
        comments: [{ id: 'c1', author: 'A', text: 'hay', likeCount: 1, publishedAt: '', updatedAt: '', replyCount: 0 }],
        nextPageToken: null,
      }),
    },
    buildPrompt: async ({ toolContext }) => {
      receivedToolContext = toolContext;
      return Object.assign([{ role: 'system', content: 'test' }], { ragSources: [] });
    },
    generate: async () => 'Mới lấy được một bình luận và người đó khen video hay.',
  });
  assert.equal(result.intent, 'youtube_request');
  assert.equal(receivedToolContext.comments[0].text, 'hay');
  assert.match(result.reply, /một bình luận/u);
});

test('does not ask the model to invent comments when the API returns none', async () => {
  let generated = false;
  const result = await generateConversationResponse({
    guildId: 'g', channelId: 'c', userId: 'u', username: 'User',
    userMessage: 'comment video này nói gì https://youtu.be/dQw4w9WgXcQ', history: [],
  }, {
    youtubeTool: {
      getComments: async () => ({ video: { title: 'Video' }, comments: [], nextPageToken: null }),
    },
    generate: async () => { generated = true; return 'invented'; },
  });
  assert.equal(generated, false);
  assert.match(result.reply, /không có bình luận công khai/u);
});
