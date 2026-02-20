// Multi-provider AI model rotation
// Supports Anthropic, OpenAI, Google Gemini, and OpenRouter (free models)
// The proxy layer (dev-server.js / api/ai.js) holds all API keys server-side

export type AIProvider = 'anthropic' | 'openai' | 'google' | 'openrouter';

export interface ModelConfig {
  id: string;             // e.g. "claude-sonnet-4-5-20250929"
  provider: AIProvider;
  displayName: string;    // e.g. "Sonnet 4.5"
  maxTokens: number;
  proxyEndpoint: string;  // e.g. "/api/ai"
}

// --- MODEL ROSTER ---
// Order matters: first model is the primary, rest are fallbacks.
// Add/remove models here to change the rotation pool.
// OpenRouter free models have ":free" suffix — no cost, rate-limited.

export const MODEL_ROSTER: ModelConfig[] = [
  {
    id: 'claude-sonnet-4-5-20250929',
    provider: 'anthropic',
    displayName: 'Sonnet 4.5',
    maxTokens: 8192,
    proxyEndpoint: '/api/ai',
  },
  {
    id: 'gpt-4o',
    provider: 'openai',
    displayName: 'GPT-4o',
    maxTokens: 4096,
    proxyEndpoint: '/api/ai',
  },
  {
    id: 'gemini-2.0-flash',
    provider: 'google',
    displayName: 'Gemini 2.0 Flash',
    maxTokens: 8192,
    proxyEndpoint: '/api/ai',
  },
  // --- OpenRouter free models (no cost, 50 req/day or 1k/day with credits) ---
  {
    id: 'deepseek/deepseek-r1-0528:free',
    provider: 'openrouter',
    displayName: 'DeepSeek R1',
    maxTokens: 8192,
    proxyEndpoint: '/api/ai',
  },
  {
    id: 'meta-llama/llama-4-maverick:free',
    provider: 'openrouter',
    displayName: 'Llama 4 Maverick',
    maxTokens: 4096,
    proxyEndpoint: '/api/ai',
  },
  {
    id: 'qwen/qwen3-235b-a22b:free',
    provider: 'openrouter',
    displayName: 'Qwen3 235B',
    maxTokens: 4096,
    proxyEndpoint: '/api/ai',
  },
];

// --- ROTATION STATE ---

let currentIndex = 0;
let consecutiveFailures = 0;

/** Get the model currently in use */
export const getCurrentModel = (): ModelConfig => {
  return MODEL_ROSTER[currentIndex];
};

/** Get a human-readable label for the header bar */
export const getCurrentModelLabel = (): string => {
  const m = getCurrentModel();
  return `${m.displayName} (${m.provider})`;
};

/**
 * Rotate to the next model in the roster.
 * Called automatically on provider-level failures (429, 500, 503, network error).
 * Returns the new active model.
 */
export const rotateModel = (): ModelConfig => {
  const prev = MODEL_ROSTER[currentIndex];
  currentIndex = (currentIndex + 1) % MODEL_ROSTER.length;
  consecutiveFailures++;
  const next = MODEL_ROSTER[currentIndex];
  console.warn(`[aiModels] Rotated from ${prev.displayName} → ${next.displayName} (failure #${consecutiveFailures})`);
  return next;
};

/** Reset failure counter (call after a successful response) */
export const resetFailures = (): void => {
  consecutiveFailures = 0;
};

/** True when every model in the roster has been tried in this failure streak */
export const allModelsExhausted = (): boolean => {
  return consecutiveFailures >= MODEL_ROSTER.length;
};

/**
 * Build the provider-specific request body that the proxy expects.
 * The proxy uses the `provider` field to route to the right upstream API.
 */
export const buildRequestBody = (
  model: ModelConfig,
  prompt: string,
  systemPrompt?: string,
  temperature: number = 0.7
): Record<string, unknown> => {
  const base = {
    provider: model.provider,
    model: model.id,
    temperature,
  };

  switch (model.provider) {
    case 'anthropic':
      return {
        ...base,
        max_tokens: Math.min(model.maxTokens, 8192),
        messages: [{ role: 'user', content: prompt }],
        ...(systemPrompt ? { system: systemPrompt } : {}),
      };

    case 'openai':
    case 'openrouter':
      // OpenRouter is OpenAI-compatible — same request format
      return {
        ...base,
        max_tokens: Math.min(model.maxTokens, 8192),
        messages: [
          ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
          { role: 'user', content: prompt },
        ],
      };

    case 'google':
      return {
        ...base,
        max_tokens: Math.min(model.maxTokens, 8192),
        // Gemini uses "contents" with parts
        contents: [
          ...(systemPrompt
            ? [{ role: 'user', parts: [{ text: systemPrompt }] }, { role: 'model', parts: [{ text: 'Understood.' }] }]
            : []),
          { role: 'user', parts: [{ text: prompt }] },
        ],
        // Also send as messages for the proxy to choose format
        messages: [
          ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
          { role: 'user', content: prompt },
        ],
      };

    default:
      return base;
  }
};

/**
 * Extract the text result from a provider-specific response body.
 * The proxy normalises most of this, but we handle edge-cases here.
 */
export const extractResponseText = (
  provider: AIProvider,
  data: any
): string => {
  // Our proxy normalises all responses to { content: [{type:'text', text:'...'}] }
  // but handle raw provider formats as fallback

  // Normalised format (from our proxy)
  if (data.content && Array.isArray(data.content)) {
    const textBlocks = data.content.filter((b: any) => b.type === 'text');
    if (textBlocks.length > 0) {
      return textBlocks.map((b: any) => b.text || '').join('\n');
    }
  }

  // Raw OpenAI / OpenRouter format
  if ((provider === 'openai' || provider === 'openrouter') && data.choices?.[0]?.message?.content) {
    return data.choices[0].message.content;
  }

  // Raw Gemini format
  if (provider === 'google' && data.candidates?.[0]?.content?.parts) {
    return data.candidates[0].content.parts
      .map((p: any) => p.text || '')
      .join('\n');
  }

  // Raw Anthropic format (already handled above, but just in case)
  if (provider === 'anthropic' && data.content) {
    if (typeof data.content === 'string') return data.content;
  }

  return '';
};
