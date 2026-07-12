import { PlannerError } from './plannerErrors.js';
import { PLAN_VERSION, RESPONSE_MODES } from './plannerTypes.js';

export function validatePlan(plan, registry, limits) {
  const fail = (code, message) => { throw new PlannerError(code, message); };
  if (!plan || plan.version !== PLAN_VERSION || !Array.isArray(plan.steps)) fail('INVALID_PLAN', 'Unsupported plan shape or version');
  if (!RESPONSE_MODES.has(plan.responseMode)) fail('INVALID_RESPONSE_MODE', 'Unsupported response mode');
  if (plan.steps.length > limits.maxSteps) fail('MAX_STEPS', 'Plan exceeds maximum step count');
  const ids = new Set();
  const signatures = new Set();
  let expensive = 0;
  for (const step of plan.steps) {
    if (!step?.id || ids.has(step.id)) fail('DUPLICATE_STEP_ID', `Duplicate step id: ${step?.id}`);
    ids.add(step.id);
    const tool = registry.get(step.tool);
    if (!tool) fail('UNKNOWN_TOOL', `Unknown tool: ${step.tool}`);
    if (!tool.actions.includes(step.action)) fail('UNKNOWN_ACTION', `Unknown action for ${step.tool}: ${step.action}`);
    if (!Array.isArray(step.dependsOn) || !tool.validateInput(step.input)) fail('INVALID_INPUT', `Invalid input for step: ${step.id}`);
    const signature = JSON.stringify([step.tool, step.action, step.input]);
    if (signatures.has(signature)) fail('DUPLICATE_CALL', `Duplicate tool call: ${step.id}`);
    signatures.add(signature);
    if (tool.expensive) expensive += 1;
  }
  if (expensive > limits.maxExpensiveSteps) fail('EXPENSIVE_LIMIT', 'Plan exceeds expensive-tool limit');
  for (const step of plan.steps) for (const dependency of step.dependsOn) if (!ids.has(dependency) || dependency === step.id) fail('INVALID_DEPENDENCY', `Invalid dependency: ${dependency}`);
  const visiting = new Set();
  const visited = new Set();
  const byId = new Map(plan.steps.map((step) => [step.id, step]));
  const depth = (id) => {
    if (visiting.has(id)) fail('CIRCULAR_DEPENDENCY', 'Circular dependencies are not allowed');
    if (visited.has(id)) return 1;
    visiting.add(id);
    const value = 1 + Math.max(0, ...byId.get(id).dependsOn.map(depth));
    visiting.delete(id); visited.add(id);
    if (value > limits.maxDepth) fail('MAX_DEPTH', 'Plan exceeds maximum dependency depth');
    return value;
  };
  for (const id of ids) depth(id);
  return { valid: true, stepCount: plan.steps.length, expensiveSteps: expensive };
}
