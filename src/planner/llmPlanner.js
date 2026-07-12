import { buildPlannerPrompt } from './plannerPrompt.js';

export async function createLlmPlan(context, generate) {
  const text = String(await generate(buildPlannerPrompt(context), { temperature: 0, maxTokens: 800 }) || '').trim();
  if (!text.startsWith('{') || !text.endsWith('}')) throw new SyntaxError('Planner output is not JSON');
  return JSON.parse(text);
}
