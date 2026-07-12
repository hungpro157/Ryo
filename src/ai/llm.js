import { config } from '../config/index.js';
import { log } from '../utils/logger.js';
import { sleep } from '../utils/helpers.js';
import { ollamaChat, checkOllamaChat } from './providers/chat/ollama.js';
import { llamaCppChat, checkLlamaCppChat } from './providers/chat/llamacpp.js';

const chatProviders = {
  ollama: ollamaChat,
  llamacpp: llamaCppChat,
};

function getProviderConfig(provider) {
  if (provider === 'ollama') return config.providers.ollama;
  if (provider === 'llamacpp') return config.providers.llamacpp;
  throw new Error(`Unsupported AI_PROVIDER: ${provider}`);
}

export async function chatCompletion(messages, options = {}) {
  const provider = options.provider || config.llm.provider;
  const handler = chatProviders[provider];
  if (!handler) throw new Error(`Unsupported chat provider: ${provider}`);

  const requestOptions = {
    model: options.model || config.llm.model,
    temperature: options.temperature ?? config.llm.temperature,
    maxTokens: options.maxTokens ?? config.llm.maxTokens,
    timeoutMs: options.timeout ?? config.llm.timeout,
    contextLimit: options.contextLimit ?? config.llm.contextLimit,
  };
  const retries = options.retries ?? Number.parseInt(process.env.LLM_RETRIES || '1', 10);

  for (let attempt = 1; attempt <= retries; attempt++) {
    const startedAt = Date.now();
    try {
      const content = await handler(messages, requestOptions, getProviderConfig(provider));
      log.perf('LLM', Date.now() - startedAt, `Provider: ${provider}, Attempt: ${attempt}`);
      return content;
    } catch (error) {
      log.warn('LLM', `${provider} attempt ${attempt} failed: ${error.message}`);
      if (attempt === retries) {
        log.error('LLM', `${provider} failed after ${retries} attempts`);
        throw error;
      }
      await sleep(1000 * attempt);
    }
  }

  throw new Error('Chat request failed unexpectedly');
}

export async function checkChatProvider() {
  if (config.llm.provider === 'ollama') {
    return checkOllamaChat(config.providers.ollama, config.llm.model);
  }
  if (config.llm.provider === 'llamacpp') {
    return checkLlamaCppChat(config.providers.llamacpp);
  }
  throw new Error(`Unsupported AI_PROVIDER: ${config.llm.provider}`);
}
