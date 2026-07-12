function truncate(value, maxChars) {
  const json = JSON.stringify(value);
  if (json.length <= maxChars) return value;
  return { truncated: true, preview: json.slice(0, Math.max(0, maxChars - 80)), limitation: 'Evidence was truncated to fit the prompt limit.' };
}

export function combinePlanResult(result, { maxChars = 12_000 } = {}) {
  const commentItems = Object.values(result.evidence.comments);
  const metadataItems = Object.values(result.evidence.metadata);
  if (result.plan.steps.length === 1 && commentItems.length === 1) {
    return { operation: 'comments', ...commentItems[0].data, evidence: { transcript: {}, comments: result.evidence.comments }, limitations: result.limitations };
  }
  if (result.plan.steps.length === 1 && metadataItems.length === 1) {
    return { operation: 'video_info', video: metadataItems[0].data, evidence: { metadata: result.evidence.metadata }, limitations: result.limitations };
  }
  const budget = Math.max(500, Math.floor(maxChars / 3));
  return {
    operation: 'planner', responseMode: result.plan.responseMode,
    metadata: truncate(result.evidence.metadata, budget),
    transcript: truncate(result.evidence.transcript, budget),
    comments: truncate(result.evidence.comments, budget),
    limitations: result.limitations,
    partialFailure: result.partialFailure,
  };
}
