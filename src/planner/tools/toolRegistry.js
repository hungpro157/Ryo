import { PlannerError } from '../plannerErrors.js';

const SAFE_VALUE = /^[^\0]*$/u;

export class ToolRegistry {
  #tools = new Map();

  registerTool(definition) {
    if (!definition?.name || this.#tools.has(definition.name)) throw new PlannerError('DUPLICATE_TOOL', `Duplicate tool: ${definition?.name}`);
    if (!Array.isArray(definition.actions) || typeof definition.execute !== 'function') throw new PlannerError('INVALID_TOOL', `Invalid tool: ${definition.name}`);
    this.#tools.set(definition.name, Object.freeze({
      timeoutMs: 15_000, maxRetries: 0, cacheable: false, expensive: false,
      parallel: true, validateInput: () => true, ...definition,
    }));
    return this;
  }

  get(name) { return this.#tools.get(name); }
  has(name) { return this.#tools.has(name); }
  list() { return [...this.#tools.values()]; }
  describe() { return this.list().map(({ name, description, actions, expensive }) => ({ name, description, actions, expensive })); }
}

export function safeObjectInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return false;
  const inspect = (value) => {
    if (value === null || ['boolean', 'number'].includes(typeof value)) return true;
    if (typeof value === 'string') return value.length <= 2_000 && SAFE_VALUE.test(value) && !/^(?:file:|javascript:)/iu.test(value);
    if (Array.isArray(value)) return value.length <= 20 && value.every(inspect);
    return typeof value === 'object' && Object.keys(value).length <= 20 && Object.entries(value).every(([key, child]) => /^[A-Za-z][A-Za-z0-9]*$/u.test(key) && inspect(child));
  };
  return inspect(input);
}

export function createYouTubeToolRegistry({ youtubeService, commentsTool, transcriptTool } = {}) {
  const registry = new ToolRegistry();
  if (youtubeService?.getVideoInfo) registry.registerTool({
    name: 'youtube.metadata', description: 'Fetch normalized YouTube video metadata', actions: ['get_video_info'],
    expensive: false, cacheable: true, validateInput: (input) => safeObjectInput(input) && typeof input.videoUrl === 'string',
    execute: ({ input }) => youtubeService.getVideoInfo(input.videoUrl, { language: input.language }),
  });
  if (commentsTool?.analyzeYoutubeComments) registry.registerTool({
    name: 'youtube.comments', description: 'Retrieve and analyze a bounded sample of YouTube comments', actions: ['analyze'],
    expensive: true, cacheable: true, timeoutMs: 30_000,
    validateInput: (input) => safeObjectInput(input) && typeof input.videoUrl === 'string',
    execute: ({ input }) => commentsTool.analyzeYoutubeComments(input),
  });
  if (transcriptTool) registry.registerTool({
    name: 'youtube.transcript', description: 'Retrieve, summarize, or search a timestamped transcript', actions: ['summarize', 'search', 'summarize_range'],
    expensive: true, cacheable: true, timeoutMs: 45_000,
    validateInput: (input) => safeObjectInput(input) && typeof input.videoUrl === 'string',
    execute: ({ action, input, signal }) => transcriptTool.execute({ action, input, signal }),
  });
  return registry;
}
