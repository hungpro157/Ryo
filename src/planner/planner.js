import { log } from '../utils/logger.js';
import { createDeterministicPlan } from './deterministicPlanner.js';
import { createLlmPlan } from './llmPlanner.js';
import { validatePlan } from './planValidator.js';

export async function selectPlan(context, { config, registry, llmGenerate } = {}) {
  if (!config.enabled) { log.info('PLANNER', 'Planner skipped', { reason: 'disabled' }); return { skipped: true, plan: null }; }
  let plan = createDeterministicPlan({ ...context, registry });
  let strategy = 'deterministic';
  if (config.llmEnabled && llmGenerate && !plan.steps.length && !plan.requiresClarification && context.intent === 'youtube_request') {
    try {
      plan = await createLlmPlan({ normalizedRequest: context.message, currentIntent: context.intent, availableTools: registry.describe(), limits: { maxSteps: config.maxSteps, maxExpensiveSteps: config.maxExpensiveSteps } }, llmGenerate);
      strategy = 'llm';
    } catch (error) {
      log.warn('PLANNER', 'LLM plan fallback', { errorCode: error?.name || 'INVALID_OUTPUT' });
      plan = createDeterministicPlan({ ...context, registry }); strategy = 'deterministic_fallback';
    }
  }
  const validation = validatePlan(plan, registry, config);
  log.info('PLANNER', 'Plan selected', { strategy, requestType: plan.requestType, steps: plan.steps.length, tools: plan.steps.map((step) => step.tool), valid: validation.valid, clarification: plan.requiresClarification });
  return { skipped: false, strategy, plan, validation };
}
