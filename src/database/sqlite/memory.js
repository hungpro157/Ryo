import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import { config } from '../../config/index.js';
import { log } from '../../utils/logger.js';

let db;

function requireDb() {
  if (!db) throw new Error('SQLite memory database is not initialized');
  return db;
}

function normalizeScope(guildId, channelId, userId) {
  return {
    guildId: String(guildId || 'DM'),
    channelId: String(channelId || 'global'),
    userId: String(userId || 'unknown'),
  };
}

function databaseSizeBytes() {
  if (!db) return 0;
  return [config.memory.databasePath, `${config.memory.databasePath}-wal`, `${config.memory.databasePath}-shm`]
    .map((file) => path.resolve(file))
    .reduce((total, file) => total + (fs.existsSync(file) ? fs.statSync(file).size : 0), 0);
}

export function enforceMemoryDatabaseLimit() {
  const database = requireDb();
  const maxBytes = Math.max(1, config.memory.databaseMaxMb) * 1024 * 1024;
  if (databaseSizeBytes() <= maxBytes) return;

  const prune = database.transaction(() => {
    database.prepare(`DELETE FROM messages WHERE id IN (
      SELECT id FROM messages WHERE summarized = 1 ORDER BY createdAt ASC LIMIT 500
    )`).run();
    if (databaseSizeBytes() > maxBytes) {
      database.prepare(`DELETE FROM messages WHERE id IN (
        SELECT id FROM messages ORDER BY createdAt ASC LIMIT 250
      )`).run();
    }
  });

  let rounds = 0;
  while (databaseSizeBytes() > maxBytes && rounds < 20) {
    const before = database.prepare('SELECT COUNT(*) AS count FROM messages').get().count;
    prune();
    const after = database.prepare('SELECT COUNT(*) AS count FROM messages').get().count;
    if (after === before) break;
    rounds += 1;
  }

  database.pragma('wal_checkpoint(TRUNCATE)');
  database.exec('VACUUM');
  log.warn('MEMORY', `SQLite memory database pruned to stay under ${config.memory.databaseMaxMb} MB`);
}

export function initMemoryDB() {
  const dbPath = path.resolve(config.memory.databasePath);
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guildId TEXT NOT NULL,
      channelId TEXT NOT NULL,
      userId TEXT NOT NULL,
      username TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
      content TEXT NOT NULL,
      summarized INTEGER NOT NULL DEFAULT 0,
      createdAt INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_messages_scope
      ON messages(guildId, channelId, userId, id DESC);
    CREATE INDEX IF NOT EXISTS idx_messages_summary
      ON messages(guildId, channelId, userId, summarized, id);

    CREATE TABLE IF NOT EXISTS summaries (
      guildId TEXT NOT NULL,
      channelId TEXT NOT NULL,
      userId TEXT NOT NULL,
      content TEXT NOT NULL,
      updatedAt INTEGER NOT NULL,
      PRIMARY KEY(guildId, channelId, userId)
    );
  `);
  enforceMemoryDatabaseLimit();
  log.info('MEMORY', `SQLite memory ready at ${dbPath}`);
}

export function closeMemoryDB() {
  if (!db) return;
  try { db.pragma('wal_checkpoint(TRUNCATE)'); } catch {}
  db.close();
  db = null;
}

export function addMessage(guildId, channelId, userId, message) {
  const scope = normalizeScope(guildId, channelId, userId);
  requireDb().prepare(`
    INSERT INTO messages (guildId, channelId, userId, username, role, content, createdAt)
    VALUES (@guildId, @channelId, @userId, @username, @role, @content, @createdAt)
  `).run({
    ...scope,
    username: String(message.username || (message.role === 'assistant' ? 'Ryo' : 'unknown')),
    role: message.role,
    content: String(message.content || ''),
    createdAt: Date.now(),
  });
  enforceMemoryDatabaseLimit();
}

export function getRecentMessages(guildId, channelId, userId, limit = config.memory.conversationHistoryLimit) {
  const scope = normalizeScope(guildId, channelId, userId);
  return requireDb().prepare(`
    SELECT id, username, role, content, createdAt
    FROM messages
    WHERE guildId = @guildId AND channelId = @channelId AND userId = @userId
    ORDER BY id DESC LIMIT @limit
  `).all({ ...scope, limit: Math.max(1, limit) }).reverse();
}

export function getMessagesToSummarize(guildId, channelId, userId) {
  const scope = normalizeScope(guildId, channelId, userId);
  return requireDb().prepare(`
    SELECT id, username, role, content
    FROM messages
    WHERE guildId = @guildId AND channelId = @channelId AND userId = @userId
      AND summarized = 0
      AND id NOT IN (
        SELECT id FROM messages
        WHERE guildId = @guildId AND channelId = @channelId AND userId = @userId
        ORDER BY id DESC LIMIT @keep
      )
    ORDER BY id ASC
  `).all({ ...scope, keep: Math.max(1, config.memory.conversationHistoryLimit) });
}

export function getUnsummarizedCount(guildId, channelId, userId) {
  const scope = normalizeScope(guildId, channelId, userId);
  return requireDb().prepare(`
    SELECT COUNT(*) AS count FROM messages
    WHERE guildId = @guildId AND channelId = @channelId AND userId = @userId AND summarized = 0
  `).get(scope).count;
}

export function getSummary(guildId, channelId, userId) {
  const scope = normalizeScope(guildId, channelId, userId);
  return requireDb().prepare(`
    SELECT content FROM summaries
    WHERE guildId = @guildId AND channelId = @channelId AND userId = @userId
  `).get(scope)?.content || '';
}

export function saveSummary(guildId, channelId, userId, content, messageIds) {
  const database = requireDb();
  const scope = normalizeScope(guildId, channelId, userId);
  const save = database.transaction(() => {
    database.prepare(`
      INSERT INTO summaries (guildId, channelId, userId, content, updatedAt)
      VALUES (@guildId, @channelId, @userId, @content, @updatedAt)
      ON CONFLICT(guildId, channelId, userId)
      DO UPDATE SET content = excluded.content, updatedAt = excluded.updatedAt
    `).run({ ...scope, content, updatedAt: Date.now() });
    const mark = database.prepare('UPDATE messages SET summarized = 1 WHERE id = ?');
    for (const id of messageIds) mark.run(id);
    database.prepare(`
      DELETE FROM messages WHERE summarized = 1
        AND guildId = @guildId AND channelId = @channelId AND userId = @userId
    `).run(scope);
  });
  save();
  enforceMemoryDatabaseLimit();
}

export function clearUserMemory(guildId, userId) {
  const database = requireDb();
  const scope = { guildId: String(guildId || 'DM'), userId: String(userId) };
  database.transaction(() => {
    database.prepare('DELETE FROM messages WHERE guildId = @guildId AND userId = @userId').run(scope);
    database.prepare('DELETE FROM summaries WHERE guildId = @guildId AND userId = @userId').run(scope);
  })();
}

export function clearChannelMemory(guildId, channelId) {
  const database = requireDb();
  const scope = { guildId: String(guildId || 'DM'), channelId: String(channelId) };
  database.transaction(() => {
    database.prepare('DELETE FROM messages WHERE guildId = @guildId AND channelId = @channelId').run(scope);
    database.prepare('DELETE FROM summaries WHERE guildId = @guildId AND channelId = @channelId').run(scope);
  })();
}

export function clearGuildMemory(guildId) {
  const database = requireDb();
  const scope = { guildId: String(guildId || 'DM') };
  database.transaction(() => {
    database.prepare('DELETE FROM messages WHERE guildId = @guildId').run(scope);
    database.prepare('DELETE FROM summaries WHERE guildId = @guildId').run(scope);
  })();
}

export function getMemoryStats(guildId = null) {
  const database = requireDb();
  const where = guildId ? ' WHERE guildId = ?' : '';
  const params = guildId ? [String(guildId)] : [];
  return {
    messages: database.prepare(`SELECT COUNT(*) AS count FROM messages${where}`).get(...params).count,
    summaries: database.prepare(`SELECT COUNT(*) AS count FROM summaries${where}`).get(...params).count,
    users: database.prepare(`SELECT COUNT(DISTINCT userId) AS count FROM messages${where}`).get(...params).count,
    channels: database.prepare(`SELECT COUNT(DISTINCT channelId) AS count FROM messages${where}`).get(...params).count,
    sizeBytes: databaseSizeBytes(),
    maxBytes: config.memory.databaseMaxMb * 1024 * 1024,
  };
}
