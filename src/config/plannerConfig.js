function integer(value, fallback) {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const plannerConfig = Object.freeze({
  enabled: (process.env.PLANNER_ENABLED || 'true').toLowerCase() === 'true',
  llmEnabled: (process.env.PLANNER_LLM_ENABLED || 'false').toLowerCase() === 'true',
  maxSteps: integer(process.env.PLANNER_MAX_STEPS, 6),
  maxExpensiveSteps: integer(process.env.PLANNER_MAX_EXPENSIVE_STEPS, 2),
  plannerTimeoutMs: integer(process.env.PLANNER_TIMEOUT_MS, 10_000),
  totalToolTimeoutMs: integer(process.env.PLANNER_TOTAL_TOOL_TIMEOUT_MS, 120_000),
  maxDepth: 3,
  maxPlannerRetries: 1,
  maxEvidenceChars: 12_000,
});
