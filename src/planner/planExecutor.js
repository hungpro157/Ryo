import { PlannerError } from './plannerErrors.js';
import { createEvidenceStore } from './evidenceStore.js';

function timeoutPromise(promise, timeoutMs, signal) {
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(new PlannerError('CANCELLED', 'Tool execution cancelled'));
    const timer = setTimeout(() => reject(new PlannerError('TOOL_TIMEOUT', 'Tool step timed out')), timeoutMs);
    signal?.addEventListener('abort', onAbort, { once: true });
    promise.then(resolve, reject).finally(() => { clearTimeout(timer); signal?.removeEventListener('abort', onAbort); });
  });
}

export async function executePlan(plan, registry, { executionContext, limits, signal } = {}) {
  const store = createEvidenceStore();
  const status = new Map(plan.steps.map((step) => [step.id, 'pending']));
  const records = [];
  const successfulCalls = new Map();
  const started = performance.now();
  const run = async (step) => {
    const definition = registry.get(step.tool);
    const signature = JSON.stringify([step.tool, step.action, step.input]);
    const start = performance.now();
    const record = { id: step.id, tool: step.tool, action: step.action, status: 'running', startedAt: new Date().toISOString(), completedAt: null, durationMs: 0, cacheHit: false, errorCode: null, outputReference: null };
    records.push(record); status.set(step.id, 'running');
    try {
      let output;
      if (successfulCalls.has(signature)) { output = successfulCalls.get(signature); record.cacheHit = true; record.status = 'cached'; }
      else {
        let attempt = 0;
        while (true) {
          try {
            const invoke = () => definition.execute({ action: step.action, input: step.input, signal, executionContext });
            output = await timeoutPromise(Promise.resolve().then(invoke), definition.timeoutMs, signal);
            break;
          } catch (error) {
            if (attempt >= definition.maxRetries) throw error;
            attempt += 1;
          }
        }
        successfulCalls.set(signature, output);
        record.status = output?.cacheHit ? 'cached' : 'completed'; record.cacheHit = Boolean(output?.cacheHit);
      }
      record.outputReference = store.add(step, output); status.set(step.id, 'completed');
    } catch (error) {
      record.status = 'failed'; record.errorCode = error?.code || 'TOOL_ERROR'; status.set(step.id, 'failed');
    } finally {
      record.completedAt = new Date().toISOString(); record.durationMs = Number((performance.now() - start).toFixed(2));
    }
  };
  while ([...status.values()].includes('pending')) {
    if (performance.now() - started > limits.totalToolTimeoutMs) {
      for (const step of plan.steps.filter((item) => status.get(item.id) === 'pending')) status.set(step.id, 'skipped');
      break;
    }
    let progress = false;
    for (const step of plan.steps.filter((item) => status.get(item.id) === 'pending')) {
      if (step.dependsOn.some((id) => ['failed', 'skipped'].includes(status.get(id)))) {
        status.set(step.id, 'skipped'); records.push({ id: step.id, tool: step.tool, action: step.action, status: 'skipped', errorCode: 'DEPENDENCY_FAILED' }); progress = true;
      }
    }
    const ready = plan.steps.filter((step) => status.get(step.id) === 'pending' && step.dependsOn.every((id) => status.get(id) === 'completed'));
    if (ready.length) { await Promise.all(ready.map(run)); progress = true; }
    if (!progress) throw new PlannerError('EXECUTION_DEADLOCK', 'No executable plan steps remain');
  }
  const failures = records.filter((record) => record.status === 'failed');
  return { plan, steps: records, evidence: store.snapshot(), limitations: [...plan.limitations, ...failures.map((item) => `${item.tool} failed (${item.errorCode})`)], partialFailure: failures.length > 0 && records.some((item) => ['completed', 'cached'].includes(item.status)) };
}
