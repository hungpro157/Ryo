import fs from 'fs';
import path from 'path';

const force = process.argv.includes('--force');
if (!force) {
  console.error('Refusing to delete the database without --force. Run: npm run db:reset -- --force');
  process.exit(1);
}
const target = path.resolve('data/lancedb');
const allowedRoot = path.resolve('data');
if (!target.startsWith(`${allowedRoot}${path.sep}`)) {
  throw new Error(`Unsafe database path: ${target}`);
}
fs.rmSync(target, { recursive: true, force: true });
fs.mkdirSync(target, { recursive: true });
console.log(`Reset database: ${target}`);
