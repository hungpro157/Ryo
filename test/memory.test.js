import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ryo-memory-'));
process.env.MEMORY_DB_PATH = path.join(tempDir, 'memory.sqlite');
process.env.MEMORY_DB_MAX_MB = '8';
process.env.CONVERSATION_HISTORY_LIMIT = '2';
const memory = await import('../src/database/sqlite/memory.js');

test.before(() => memory.initMemoryDB());
test.after(() => {
  memory.closeMemoryDB();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

test('isolates recent messages by guild, channel and user', () => {
  memory.addMessage('guild-a', 'channel-a', 'user-a', { role: 'user', username: 'A', content: 'one' });
  memory.addMessage('guild-a', 'channel-a', 'user-a', { role: 'assistant', username: 'Ryo', content: 'two' });
  memory.addMessage('guild-a', 'channel-a', 'user-a', { role: 'user', username: 'A', content: 'three' });
  memory.addMessage('guild-a', 'channel-a', 'user-b', { role: 'user', username: 'B', content: 'private' });
  assert.deepEqual(memory.getRecentMessages('guild-a', 'channel-a', 'user-a').map((row) => row.content), ['two', 'three']);
  assert.deepEqual(memory.getRecentMessages('guild-a', 'channel-a', 'user-b').map((row) => row.content), ['private']);
  assert.equal(memory.getRecentMessages('guild-b', 'channel-a', 'user-a').length, 0);
});

test('stores a summary and removes summarized raw messages', () => {
  const oldMessages = memory.getMessagesToSummarize('guild-a', 'channel-a', 'user-a');
  assert.equal(oldMessages.length, 1);
  memory.saveSummary('guild-a', 'channel-a', 'user-a', 'Summary text', oldMessages.map((row) => row.id));
  assert.equal(memory.getSummary('guild-a', 'channel-a', 'user-a'), 'Summary text');
  assert.equal(memory.getRecentMessages('guild-a', 'channel-a', 'user-a').length, 2);
});

test('clear user does not clear another user', () => {
  memory.clearUserMemory('guild-a', 'user-a');
  assert.equal(memory.getRecentMessages('guild-a', 'channel-a', 'user-a').length, 0);
  assert.equal(memory.getRecentMessages('guild-a', 'channel-a', 'user-b').length, 1);
});
