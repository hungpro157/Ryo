export async function llamaCppChat(messages, options, providerConfig) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs);

  try {
    const payload = {
      messages,
      temperature: options.temperature,
      max_tokens: options.maxTokens,
      stream: false,
    };
    if (options.model) payload.model = options.model;

    const response = await fetch(`${providerConfig.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(providerConfig.apiKey ? { Authorization: `Bearer ${providerConfig.apiKey}` } : {}),
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`llama.cpp HTTP ${response.status}: ${body || response.statusText}`);
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== 'string') {
      throw new Error('llama.cpp returned an invalid OpenAI-compatible response');
    }
    return content;
  } finally {
    clearTimeout(timeout);
  }
}

export async function checkLlamaCppChat(providerConfig) {
  const response = await fetch(`${providerConfig.baseUrl}/health`).catch(() => null);
  if (response?.ok) return { ok: true };

  const models = await fetch(`${providerConfig.baseUrl}/v1/models`, {
    headers: providerConfig.apiKey ? { Authorization: `Bearer ${providerConfig.apiKey}` } : {},
  });
  if (!models.ok) throw new Error(`llama.cpp server is unavailable: HTTP ${models.status}`);
  return { ok: true };
}
