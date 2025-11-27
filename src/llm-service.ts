import { generateText, LanguageModel } from 'ai';
import {
  LlmModelFactoryI, LlmServiceI, ToolServiceI, UnifiedResponse,
} from './types';
import RateLimiter from './utils/rate-limiter';
import { PROVIDER_LIMITS } from './utils/provider-limits';
import { parseLlmResponse } from './utils/json-utils';

/**
 * Service responsible for interacting with the Large Language Model (LLM).
 * It handles rate limiting, model invocation, and response parsing.
 */
export default class LlmService implements LlmServiceI {
  private readonly model: LanguageModel;

  private readonly rateLimiter: RateLimiter;

  private readonly provider: string;

  private readonly toolService?: ToolServiceI;

  private readonly isFallbackMode;

  /**
   * Constructs the LlmService.
   *
   * @param llmModelFactory - Factory to create the language model instance.
   * @param rateLimiter - Rate limiter to control request frequency.
   * @param isRateLimitDisabled - Flag to disable rate limiting logic.
   * @param toolService - Optional service for providing tools (e.g., web search) to the LLM.
   */
  constructor(
    llmModelFactory: LlmModelFactoryI,
    rateLimiter: RateLimiter,
    isRateLimitDisabled: boolean,
    toolService?: ToolServiceI,
  ) {
    const factory = llmModelFactory;
    this.model = factory.create();
    this.isFallbackMode = factory.isFallbackMode();
    this.provider = factory.getProvider();
    this.rateLimiter = rateLimiter;
    this.toolService = toolService;

    // Set rate limits for the provider
    const limits = PROVIDER_LIMITS[this.provider];
    if (!isRateLimitDisabled && limits) {
      this.rateLimiter.setProviderLimit(this.provider, limits.requestsPerMinute);
      console.log(`Set ${this.provider} rate limits: ${limits.requestsPerMinute} requests/minute, ${limits.tokensPerMinute} tokens/minute`);
    } else {
      console.warn(`No rate limits configured for provider: ${this.provider} or Rate Limiter is disabled`);
    }
  }

  /**
   * Performs a web search using the configured tool service.
   *
   * @param query - The search query string.
   * @returns A promise that resolves to the search result string.
   */
  public async searchWeb(query: string): Promise<string> {
    if (!this.toolService) {
      return 'Search functionality is not available.';
    }

    try {
      console.log(`Performing web search for: "${query}"`);
      if ('search' in this.toolService) {
        type SearchFunction = (q: string) => Promise<string>;
        const searchFn = this.toolService.search as SearchFunction;
        return await searchFn(query);
      }
      return 'Search tool is not available.';
    } catch (error) {
      console.error('Error during web search:', error);
      return `Error performing search: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  /**
   * Sends a prompt to the LLM and returns a structured response.
   *
   * This method handles fallback mode logic, rate limiting, and response parsing.
   *
   * @param prompt - The text prompt to send to the LLM.
   * @returns A promise that resolves to a UnifiedResponse object (categorization result).
   * @throws Error if the LLM response is invalid or request fails.
   */
  public async ask(prompt: string): Promise<UnifiedResponse> {
    try {
      console.log(`Making LLM request to ${this.provider}${this.isFallbackMode ? ' (fallback mode)' : ''}`);

      if (this.isFallbackMode) {
        const response = await this.askUsingFallbackModel(prompt);
        const uuidRegex = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
        if (!uuidRegex.test(response)) {
          console.warn('If you are using ollama and you see it all the time, check the ollama api logs.'
              + 'Maybe you need to use bigger context window');
          throw new Error(`Could not foud category in LLM response: ${response}`);
        }
        return {
          type: 'existing',
          categoryId: response,
        };
      }

      return this.rateLimiter.executeWithRateLimiting(this.provider, async () => {
        try {
          const { text } = await generateText({
            model: this.model,
            prompt,
            temperature: 0.2,
            tools: this.toolService?.getTools(),
            maxSteps: 3,
          });

          return parseLlmResponse(text);
        } catch (error) {
          console.error('LLM response validation failed:', error);
          throw new Error('Invalid response format from LLM');
        }
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`Error during LLM request to ${this.provider}: ${errorMsg}`);
      throw error;
    }
  }

  /**
   * Sends a prompt to the LLM using the fallback model (e.g., for local inference).
   * It returns the raw text response, cleaned of newlines.
   *
   * @param prompt - The text prompt to send.
   * @returns A promise that resolves to the raw text response from the model.
   */
  public async askUsingFallbackModel(prompt: string): Promise<string> {
    return this.rateLimiter.executeWithRateLimiting(
      this.provider,
      async () => {
        console.log(`Sending text generation request to ${this.provider}`);
        const { text } = await generateText({
          model: this.model,
          prompt,
          temperature: 0.1,
        });

        return text.replace(/(\r\n|\n|\r|"|')/gm, '');
      },
    );
  }
}
