const SECTION = { 'youtube.metadata': 'metadata', 'youtube.transcript': 'transcript', 'youtube.comments': 'comments' };

export function createEvidenceStore() {
  const evidence = { metadata: {}, transcript: {}, comments: {}, memory: {} };
  return {
    add(step, output) {
      const section = SECTION[step.tool] || 'memory';
      evidence[section][step.id] = {
        sourceTool: step.tool, action: step.action, timestamp: new Date().toISOString(),
        scope: { videoUrl: step.input.videoUrl || null }, processingStatus: 'completed',
        confidence: output?.confidence ?? null, limitations: output?.limitations || [], data: output,
      };
      return `${section}.${step.id}`;
    },
    snapshot() { return structuredClone(evidence); },
  };
}
