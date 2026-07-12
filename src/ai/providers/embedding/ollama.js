export async function ollamaEmbed(inputs, providerConfig) {
  const response = await fetch(`${providerConfig.baseUrl}/api/embed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: providerConfig.model,
      input: inputs,
      keep_alive: process.env.EMBEDDING_KEEP_ALIVE || '2m',
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Ollama embedding HTTP ${response.status}: ${body || response.statusText}`);
  }

  const data = await response.json();
  if (!Array.isArray(data.embeddings)) {
    throw new Error('Ollama returned an invalid embedding response');
  }
  return data.embeddings;
}
