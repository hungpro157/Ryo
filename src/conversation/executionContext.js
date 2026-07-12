import { randomUUID } from 'crypto';

export function createExecutionContext(input) {
  const startedAt = performance.now();
  const completedTools = new Map();
  const timings = {};
  return {
    requestId: randomUUID(),
    guildId: input.guildId,
    channelId: input.channelId,
    userId: input.userId,
    selectedTools: [],
    timings,
    retryCount: 0,
    measureSync(name, fn) {
      const start = performance.now();
      try { return fn(); } finally { const key = `${name}Ms`; timings[key] = Number(((timings[key] || 0) + performance.now() - start).toFixed(2)); }
    },
    async measure(name, fn) {
      const start = performance.now();
      try { return await fn(); } finally { const key = `${name}Ms`; timings[key] = Number(((timings[key] || 0) + performance.now() - start).toFixed(2)); }
    },
    async runTool(name, fn) {
      if (completedTools.has(name)) return completedTools.get(name);
      this.selectedTools.push(name);
      const promise = this.measure('tool', fn);
      completedTools.set(name, promise);
      try { return await promise; } catch (error) { completedTools.delete(name); throw error; }
    },
    diagnostics() {
      timings.totalMs = Number((performance.now() - startedAt).toFixed(2));
      return { requestId: this.requestId, selectedTools: [...this.selectedTools], timings: { ...timings }, retryCount: this.retryCount };
    },
  };
}
