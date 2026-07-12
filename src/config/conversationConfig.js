function envInt(name, fallback) {
  const value = Number.parseInt(process.env[name] || String(fallback), 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function envFloat(name, fallback) {
  const value = Number.parseFloat(process.env[name] || String(fallback));
  return Number.isFinite(value) ? value : fallback;
}

export const conversationConfig = {
  fewShots: {
    min: envInt('CONVERSATION_FEW_SHOT_MIN', 2),
    max: envInt('CONVERSATION_FEW_SHOT_MAX', 4),
  },
  validationRetries: Math.min(envInt('CONVERSATION_VALIDATION_RETRIES', 1), 2),
  generation: {
    veryShort: {
      maxTokens: envInt('CONVERSATION_SHORT_MAX_TOKENS', 24),
      temperature: envFloat('CONVERSATION_SHORT_TEMPERATURE', 0.55),
    },
    normal: {
      maxTokens: envInt('CONVERSATION_NORMAL_MAX_TOKENS', 140),
      temperature: envFloat('CONVERSATION_NORMAL_TEMPERATURE', 0.65),
    },
    technical: {
      maxTokens: envInt('CONVERSATION_TECHNICAL_MAX_TOKENS', 400),
      temperature: envFloat('CONVERSATION_TECHNICAL_TEMPERATURE', 0.45),
    },
  },
};
