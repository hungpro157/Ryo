import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzeMessage } from '../src/conversation/messageAnalyzer.js';
import { classifyIntent } from '../src/conversation/intentClassifier.js';
import { validateResponse } from '../src/conversation/responseValidator.js';
import { classifyError } from '../src/utils/errors.js';
import { redact } from '../src/utils/logger.js';

function validation(input, response, intent = null) {
  const analysis = analyzeMessage(input);
  return validateResponse({ response, analysis, intent: intent || classifyIntent(analysis) });
}

test('short conversation responses stay natural and grounded', () => {
  for (const [input, response] of [['ê', 'hửm'], ['Ryo', 'gì á'], ['👀', '?'], ['Hoshino_al', 'ủa sao á']]) {
    const result = validation(input, response);
    assert.equal(result.valid, true);
    assert.ok(response.length < 40);
    assert.doesNotMatch(response, /tao nghe nói|khách hàng|\*.+\*/iu);
  }
});

test('unknown username biography is rejected', () => {
  assert.equal(validation('Hoshino_al', 'Tao nghe nói Hoshino_al là streamer nổi tiếng.').valid, false);
});

test('roleplay is explicit and does not leak into later technical intent', () => {
  assert.equal(classifyIntent(analyzeMessage('hãy nhập vai nhân vật lạnh lùng')), 'explicit_roleplay');
  const later = analyzeMessage('Ollama lỗi 404 là sao?', { history: [{ role: 'assistant', content: '*lạnh lùng nhìn*' }] });
  assert.equal(classifyIntent(later), 'technical_question');
  assert.equal(validateResponse({ response: '*lạnh lùng nhìn* Kiểm tra endpoint.', analysis: later, intent: 'technical_question' }).valid, false);
});

test('technical concepts do not become YouTube requests', () => {
  assert.equal(classifyIntent(analyzeMessage('Ollama là gì?')), 'technical_question');
  assert.equal(classifyIntent(analyzeMessage('RAG khác memory như nào?')), 'technical_question');
});

test('stable Ollama error taxonomy covers timeout and missing model', () => {
  assert.equal(classifyError(new Error('request timed out')).code, 'OLLAMA_TIMEOUT');
  assert.equal(classifyError(new Error('model qwen does not exist')).code, 'OLLAMA_MODEL_NOT_FOUND');
});

test('logger redacts keys and tokens', () => {
  const value = redact('https://x.test?a=1&key=secret-value token=abc eyJabc.abcdef.abcdefghijklmnopqrstuvwxyz');
  assert.doesNotMatch(value, /secret-value|eyJabc/);
});

test('validator rejects fabricated comment quotes and incomplete-sample claims', () => {
  const analysis = analyzeMessage('mọi người chê gì? https://youtu.be/dQw4w9WgXcQ');
  const toolContext = {
    operation: 'comments', video: { commentCount: 100 }, sample: { fetchedCount: 20 },
    selectedComments: [{ text: 'âm thanh hơi nhỏ' }], limitations: ['limited sample'],
  };
  assert.equal(validateResponse({ response: 'Có người nói “video quá tệ”.', analysis, intent: 'youtube_request', toolContext }).valid, false);
  assert.equal(validateResponse({ response: 'Mình đã đọc toàn bộ bình luận.', analysis, intent: 'youtube_request', toolContext }).valid, false);
});
