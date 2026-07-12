export async function llamaCppEmbed(inputs, providerConfig) {
  const response = await fetch(`${providerConfig.baseUrl}/v1/embeddings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(providerConfig.apiKey ? { Authorization: `Bearer ${providerConfig.apiKey}` } : {}),
    },
    body: JSON.stringify({ model: providerConfig.model || 'local-embedding', input: inputs }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`llama.cpp embedding HTTP ${response.status}: ${body || response.statusText}`);
  }

  const data = await response.json();
  if (!Array.isArray(data.data)) {
    throw new Error('llama.cpp returned an invalid embedding response');
  }

  return [...data.data]
    .sort((a, b) => a.index - b.index)
    .map((item) => item.embedding);
}
