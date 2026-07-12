import fs from 'fs';
import path from 'path';
import * as lancedb from '@lancedb/lancedb';
import { config } from '../../config/index.js';
import { log } from '../../utils/logger.js';

const TABLE_NAME = 'memory';
let connection;
let nativeTable;
let adapter;

class QueryAdapter {
  constructor(kind, value = null) {
    this.kind = kind;
    this.value = value;
    this.whereExpr = '';
    this.limitValue = 10;
  }

  where(expr) {
    this.whereExpr = expr || '';
    return this;
  }

  limit(value) {
    this.limitValue = Math.max(1, Number(value) || 10);
    return this;
  }

  async execute() {
    if (!nativeTable) throw new Error('LanceDB table is not initialized');

    let query;
    if (this.kind === 'vector') {
      query = nativeTable.vectorSearch(this.value).column('vector');
    } else {
      query = nativeTable.query();
    }
    if (this.whereExpr) query = query.where(this.whereExpr);
    return query.limit(this.limitValue).toArray();
  }
}

function createAdapter() {
  return {
    async add(items) {
      if (!Array.isArray(items) || items.length === 0) return;
      await nativeTable.add(items);
    },
    filter(expr) {
      const query = new QueryAdapter('filter');
      return query.where(expr);
    },
    search(vector) {
      return new QueryAdapter('vector', vector);
    },
    countRows(expr = '') {
      return nativeTable.countRows(expr || undefined);
    },
    delete(expr) {
      return nativeTable.delete(expr);
    },
    get schema() {
      return nativeTable.schema();
    },
  };
}

export async function initDB() {
  const dbPath = path.resolve(config.paths.db);
  fs.mkdirSync(dbPath, { recursive: true });
  connection = await lancedb.connect(dbPath);

  const names = await connection.tableNames();
  if (names.includes(TABLE_NAME)) {
    nativeTable = await connection.openTable(TABLE_NAME);
  } else {
    const dummy = {
      id: 'schema-row',
      text: 'schema initialization row',
      vector: new Array(config.embedding.dimensions).fill(0),
      guildId: 'system',
      channelId: 'system',
      userId: 'system',
      timestamp: Date.now(),
      source: 'system',
      type: 'schema',
      metadata: '{}',
    };
    nativeTable = await connection.createTable(TABLE_NAME, [dummy]);
    await nativeTable.delete("id = 'schema-row'");
  }

  const schema = await nativeTable.schema();
  const fields = schema.fields.map((field) => field.name);
  for (const required of ['id', 'text', 'vector', 'guildId', 'channelId', 'userId', 'timestamp', 'source', 'type', 'metadata']) {
    if (!fields.includes(required)) {
      throw new Error(`LanceDB schema is missing field ${required}. Reset the DB with: npm run db:reset -- --force`);
    }
  }

  adapter = createAdapter();
  log.info('DB', `LanceDB ready at ${dbPath}`);
}

export function getMemoryTable() {
  if (!adapter) throw new Error('LanceDB is not initialized');
  return adapter;
}

export async function getDatabaseStats() {
  if (!nativeTable) return { totalChunks: 0, knowledgeChunks: 0 };
  return {
    totalChunks: await nativeTable.countRows(),
    knowledgeChunks: await nativeTable.countRows("type = 'knowledge'"),
  };
}

export function closeDB() {
  try { nativeTable?.close(); } catch {}
  try { connection?.close(); } catch {}
  nativeTable = null;
  connection = null;
  adapter = null;
}
