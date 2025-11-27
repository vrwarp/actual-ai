/**
 * Interface defining the rate limits for an LLM provider.
 */
export interface ProviderLimits {
  /** The maximum number of tokens allowed per minute. */
  tokensPerMinute: number;
  /** The maximum number of requests allowed per minute. */
  requestsPerMinute: number;
}

/**
 * A dictionary of default rate limits for supported LLM providers.
 *
 * These values serve as conservative defaults to prevent hitting API rate limits
 * immediately. Users may need to adjust these based on their specific plan tiers.
 */
export const PROVIDER_LIMITS: Record<string, ProviderLimits> = {
  openai: {
    tokensPerMinute: 60000,
    requestsPerMinute: 500,
  },
  anthropic: {
    tokensPerMinute: 100000,
    requestsPerMinute: 400,
  },
  'google-generative-ai': {
    tokensPerMinute: 60000,
    requestsPerMinute: 300,
  },
  groq: {
    tokensPerMinute: 6000,
    requestsPerMinute: 100,
  },
  ollama: {
    tokensPerMinute: 10000, // This is a local model, so limits depend on your hardware
    requestsPerMinute: 50,
  },
};

export default PROVIDER_LIMITS;
