import { LanguageModel } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOllama } from 'ollama-ai-provider';
import { createGroq } from '@ai-sdk/groq';
import { LlmModelFactoryI } from './types';

/**
 * Factory class responsible for creating Language Model instances based on the configuration.
 * Supports various providers like OpenAI, Anthropic, Google, Ollama, and Groq.
 */
class LlmModelFactory implements LlmModelFactoryI {
  private readonly llmProvider: string;

  private readonly openaiApiKey: string;

  private readonly openaiModel: string;

  private readonly openaiBaseURL: string;

  private readonly anthropicBaseURL: string;

  private readonly anthropicApiKey: string;

  private readonly anthropicModel: string;

  private readonly googleModel: string;

  private readonly googleBaseURL: string;

  private readonly googleApiKey: string;

  private readonly ollamaModel: string;

  private readonly ollamaBaseURL: string;

  private readonly groqApiKey: string;

  private readonly groqModel: string;

  private readonly groqBaseURL: string;

  /**
   * Constructs the LlmModelFactory with configuration for all supported providers.
   *
   * @param llmProvider - The identifier of the selected LLM provider (e.g., 'openai', 'anthropic').
   * @param openaiApiKey - API key for OpenAI.
   * @param openaiModel - Model identifier for OpenAI.
   * @param openaiBaseURL - Base URL for OpenAI API.
   * @param anthropicBaseURL - Base URL for Anthropic API.
   * @param anthropicApiKey - API key for Anthropic.
   * @param anthropicModel - Model identifier for Anthropic.
   * @param googleModel - Model identifier for Google Generative AI.
   * @param googleBaseURL - Base URL for Google Generative AI.
   * @param googleApiKey - API key for Google Generative AI.
   * @param ollamaModel - Model identifier for Ollama.
   * @param ollamaBaseURL - Base URL for Ollama.
   * @param groqApiKey - API key for Groq.
   * @param groqModel - Model identifier for Groq.
   * @param groqBaseURL - Base URL for Groq.
   */
  constructor(
    llmProvider: string,
    openaiApiKey: string,
    openaiModel: string,
    openaiBaseURL: string,
    anthropicBaseURL: string,
    anthropicApiKey: string,
    anthropicModel: string,
    googleModel: string,
    googleBaseURL: string,
    googleApiKey: string,
    ollamaModel: string,
    ollamaBaseURL: string,
    groqApiKey: string,
    groqModel: string,
    groqBaseURL: string,
  ) {
    this.llmProvider = llmProvider;
    this.openaiApiKey = openaiApiKey;
    this.openaiModel = openaiModel;
    this.openaiBaseURL = openaiBaseURL;
    this.anthropicBaseURL = anthropicBaseURL;
    this.anthropicApiKey = anthropicApiKey;
    this.anthropicModel = anthropicModel;
    this.googleModel = googleModel;
    this.googleBaseURL = googleBaseURL;
    this.googleApiKey = googleApiKey;
    this.ollamaModel = ollamaModel;
    this.ollamaBaseURL = ollamaBaseURL;
    this.groqApiKey = groqApiKey;
    this.groqModel = groqModel;
    this.groqBaseURL = groqBaseURL;
  }

  /**
   * Creates and returns a configured LanguageModel instance based on the selected provider.
   *
   * @returns A configured LanguageModel instance ready for use.
   * @throws Error if the configured provider is unknown.
   */
  public create(): LanguageModel {
    console.debug(`Creating model for provider: ${this.llmProvider}`);
    switch (this.llmProvider) {
      case 'openai': {
        const openai = createOpenAI({
          baseURL: this.openaiBaseURL,
          apiKey: this.openaiApiKey,
        });
        return openai(this.openaiModel);
      }
      case 'anthropic': {
        const anthropic = createAnthropic({
          apiKey: this.anthropicApiKey,
          baseURL: this.anthropicBaseURL,
        });
        return anthropic(this.anthropicModel);
      }
      case 'google-generative-ai': {
        const google = createGoogleGenerativeAI({
          baseURL: this.googleBaseURL,
          apiKey: this.googleApiKey,
        });
        return google(this.googleModel);
      }
      case 'ollama': {
        const ollama = createOllama({
          baseURL: this.ollamaBaseURL,
        });
        return ollama(this.ollamaModel);
      }
      case 'groq': {
        const groq = createGroq({
          baseURL: this.groqBaseURL,
          apiKey: this.groqApiKey,
        });
        return groq(this.groqModel) as unknown as LanguageModel;
      }
      default:
        throw new Error(`Unknown provider: ${this.llmProvider}`);
    }
  }

  /**
   * Checks if the current configuration implies a fallback mode (e.g., local model).
   *
   * @returns True if running in fallback mode (Ollama), false otherwise.
   */
  public isFallbackMode(): boolean {
    return this.llmProvider === 'ollama';
  }

  /**
   * Retrieves the identifier of the currently configured provider.
   *
   * @returns The provider string (e.g., 'openai', 'ollama').
   */
  public getProvider(): string {
    return this.llmProvider;
  }

  /**
   * Retrieves the model provider name.
   *
   * @returns The provider string.
   */
  public getModelProvider(): string {
    return this.llmProvider;
  }
}

export default LlmModelFactory;
