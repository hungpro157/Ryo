import { validateConfig } from '../src/config/validate.js';

const result = validateConfig({ requireDiscord: false });
for (const warning of result.warnings) console.warn(`WARN: ${warning}`);
for (const error of result.fatal) console.error(`ERROR: ${error}`);
process.exit(result.ok ? 0 : 1);
