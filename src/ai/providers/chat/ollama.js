import { log } from '../../../utils/logger.js';

export async function ollamaChat(messages, options, providerConfig) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs);

  try {
    const response = await fetch(`${providerConfig.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: options.model,
        messages,
        stream: false,
        keep_alive: process.env.OLLAMA_KEEP_ALIVE || '30m',
        options: {
          temperature: options.temperature,
          num_predict: options.maxTokens,
          num_ctx: options.contextLimit,
        },
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`Ollama HTTP ${response.status}: ${body || response.statusText}`);
    }

    const data = await response.json();
    const content = data?.message?.content;
    if (typeof content !== 'string') {
      throw new Error('Ollama returned an invalid chat response');
    }
    return content;
  } finally {
    clearTimeout(timeout);
  }
}

export async function checkOllamaChat(providerConfig, model) {
  const response = await fetch(`${providerConfig.baseUrl}/api/tags`);
  if (!response.ok) throw new Error(`Ollama is unavailable: HTTP ${response.status}`);
  const data = await response.json();
  const names = (data.models || []).map((item) => item.name);
  const found = names.some((name) => name === model || name.startsWith(`${model}:`));
  if (!found) {
    log.warn('LLM', `Model ${model} was not found in Ollama. Run: ollama pull ${model}`);
  }
  return { ok: true, modelFound: found, models: names };
}
