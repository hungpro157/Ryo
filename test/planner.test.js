import test from 'node:test';
import assert from 'node:assert/strict';
import { ToolRegistry, createYouTubeToolRegistry } from '../src/planner/tools/toolRegistry.js';
import { createDeterministicPlan } from '../src/planner/deterministicPlanner.js';
import { validatePlan } from '../src/planner/planValidator.js';
import { executePlan } from '../src/planner/planExecutor.js';
import { combinePlanResult } from '../src/planner/resultCombiner.js';
import { selectPlan } from '../src/planner/planner.js';

const limits = { enabled: true, llmEnabled: false, maxSteps: 6, maxExpensiveSteps: 2, maxDepth: 3, totalToolTimeoutMs: 1_000, maxEvidenceChars: 1_000 };
const url = 'https://youtu.be/dQw4w9WgXcQ';
const registry = () => createYouTubeToolRegistry({
  youtubeService: { getVideoInfo: async () => ({ title: 'Video' }) },
  commentsTool: { analyzeYoutubeComments: async () => ({ sample: { processedCount: 1 }, quotes: ['exact'] }) },
  transcriptTool: { execute: async ({ action }) => ({ action, segments: [{ timestamp: '01:20', text: 'Ollama' }] }) },
});
const plan = (steps) => ({ version: 1, requestType: 'test', requiresClarification: false, clarificationQuestion: null, steps, responseMode: 'direct_answer', limitations: [] });
const step = (id, tool = 'youtube.metadata', dependsOn = [], input = { videoUrl: url }) => ({ id, tool, action: tool === 'youtube.metadata' ? 'get_video_info' : 'analyze', dependsOn, canRunInParallel: true, input, expectedOutput: 'evidence', required: true });

test('simple and technical chat skip planner tools', () => {
  assert.equal(createDeterministicPlan({ message: 'ê', intent: 'ping', registry: registry() }).steps.length, 0);
  assert.equal(createDeterministicPlan({ message: 'Ollama là gì?', intent: 'technical_question', registry: registry() }).steps.length, 0);
});

test('deterministic YouTube plans select only necessary evidence', () => {
  const summary = createDeterministicPlan({ message: `video này nói gì? ${url}`, intent: 'youtube_request', registry: registry() });
  assert.deepEqual(summary.steps.map((item) => item.tool), ['youtube.transcript']);
  const comments = createDeterministicPlan({ message: `mọi người chê gì? ${url}`, intent: 'youtube_request', registry: registry() });
  assert.equal(comments.steps[0].input.mode, 'criticism');
  assert.deepEqual(comments.steps.map((item) => item.tool), ['youtube.comments']);
  const topic = createDeterministicPlan({ message: `phút mấy nhắc đến Ollama? ${url}`, intent: 'youtube_request', registry: registry() });
  assert.equal(topic.steps[0].action, 'search');
});

test('creator versus viewers uses metadata then parallel transcript and comments', () => {
  const result = createDeterministicPlan({ message: `tác giả nói gì và người xem phản ứng sao? ${url}`, intent: 'youtube_request', registry: registry() });
  assert.deepEqual(result.steps.map((item) => item.tool), ['youtube.metadata', 'youtube.transcript', 'youtube.comments']);
  assert.deepEqual(result.steps[1].dependsOn, ['metadata']);
  assert.deepEqual(result.steps[2].dependsOn, ['metadata']);
});

test('missing URL clarifies and scoped history resolves a recent video', () => {
  const missing = createDeterministicPlan({ message: 'video này nói gì?', intent: 'youtube_request', history: [], registry: registry() });
  assert.equal(missing.requiresClarification, true);
  const recent = createDeterministicPlan({ message: 'video lúc nãy bị chê gì?', intent: 'youtube_request', history: [{ content: url }], registry: registry() });
  assert.equal(recent.steps[0].input.videoUrl, url);
});

test('validator rejects unknown tools, duplicate ids and cycles', () => {
  assert.throws(() => validatePlan(plan([step('x', 'unknown')]), registry(), limits), { code: 'UNKNOWN_TOOL' });
  assert.throws(() => validatePlan(plan([step('x'), step('x')]), registry(), limits), { code: 'DUPLICATE_STEP_ID' });
  assert.throws(() => validatePlan(plan([step('a', 'youtube.metadata', ['b']), step('b', 'youtube.metadata', ['a'], { videoUrl: `${url}?x=1` })]), registry(), limits), { code: 'CIRCULAR_DEPENDENCY' });
});

test('validator enforces duplicate-call, step and expensive limits', () => {
  assert.throws(() => validatePlan(plan([step('a'), step('b')]), registry(), limits), { code: 'DUPLICATE_CALL' });
  const many = Array.from({ length: 7 }, (_, index) => step(`s${index}`, 'youtube.metadata', [], { videoUrl: `${url}?v=${index}` }));
  assert.throws(() => validatePlan(plan(many), registry(), limits), { code: 'MAX_STEPS' });
  const expensive = [0, 1, 2].map((index) => ({ ...step(`e${index}`, 'youtube.comments', [], { videoUrl: `${url}?v=${index}` }), action: 'analyze' }));
  assert.throws(() => validatePlan(plan(expensive), registry(), limits), { code: 'EXPENSIVE_LIMIT' });
});

test('executor runs independent work in parallel and respects dependencies', async () => {
  const events = [];
  const tools = new ToolRegistry().registerTool({ name: 't', actions: ['run'], validateInput: () => true, execute: async ({ input }) => { events.push(`start:${input.name}`); await new Promise((resolve) => setTimeout(resolve, 20)); events.push(`end:${input.name}`); return input; } });
  const make = (id, dependsOn = []) => ({ id, tool: 't', action: 'run', dependsOn, canRunInParallel: true, input: { name: id }, expectedOutput: 'x', required: true });
  const result = await executePlan(plan([make('a'), make('b'), make('c', ['a'])]), tools, { limits });
  assert.ok(events.indexOf('start:b') < events.indexOf('end:a'));
  assert.ok(events.indexOf('start:c') > events.indexOf('end:a'));
  assert.equal(result.steps.filter((item) => item.status === 'completed').length, 3);
});

test('timeout preserves successful evidence and skips dependents of failure', async () => {
  const tools = new ToolRegistry()
    .registerTool({ name: 'ok', actions: ['run'], validateInput: () => true, execute: async () => ({ ok: true }) })
    .registerTool({ name: 'slow', actions: ['run'], timeoutMs: 5, validateInput: () => true, execute: async () => new Promise((resolve) => setTimeout(resolve, 30)) });
  const make = (id, tool, dependsOn = []) => ({ id, tool, action: 'run', dependsOn, canRunInParallel: true, input: {}, expectedOutput: 'x', required: tool === 'slow' });
  const result = await executePlan(plan([make('good', 'ok'), make('bad', 'slow'), make('blocked', 'ok', ['bad'])]), tools, { limits });
  assert.equal(result.partialFailure, true);
  assert.equal(result.steps.find((item) => item.id === 'blocked').status, 'skipped');
  assert.ok(result.evidence.memory.good);
});

test('combiner preserves transcript/comment separation and prompt limit', () => {
  const combined = combinePlanResult({ plan: { responseMode: 'compare_creator_and_viewers', steps: [{}, {}] }, evidence: { metadata: {}, transcript: { t: { data: { text: 'x'.repeat(2_000) } } }, comments: { c: { data: { quotes: ['exact'] } } }, memory: {} }, limitations: [], partialFailure: false }, { maxChars: 600 });
  assert.ok(combined.transcript.truncated);
  assert.deepEqual(combined.comments.c.data.quotes, ['exact']);
});

test('invalid LLM JSON falls back to deterministic planning', async () => {
  const selected = await selectPlan({ message: `xem YouTube ${url}`, intent: 'youtube_request', history: [] }, { config: { ...limits, llmEnabled: true }, registry: new ToolRegistry(), llmGenerate: async () => 'not json' });
  assert.equal(selected.strategy, 'deterministic_fallback');
  assert.equal(selected.plan.steps.length, 0);
});
