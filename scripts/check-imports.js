import fs from 'fs';
import path from 'path';

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : full.endsWith('.js') ? [full] : [];
  });
}

let failed = false;
for (const file of walk(path.resolve('src')).filter((file) => !file.endsWith(`${path.sep}index.js`) || !file.endsWith(`src${path.sep}index.js`))) {
  if (file === path.resolve('src/index.js')) continue;
  try { await import(`file:///${file.replace(/\\/g, '/')}`); }
  catch (error) { failed = true; console.error(`${path.relative(process.cwd(), file)}: ${error.message}`); }
}
process.exit(failed ? 1 : 0);
