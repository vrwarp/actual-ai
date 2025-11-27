import {
  jest, describe, it, expect, beforeEach,
} from '@jest/globals';
import { generateText } from 'ai';
import LlmService from '../src/llm-service';
import { LlmModelFactoryI, ToolServiceI } from '../src/types';
import RateLimiter from '../src/utils/rate-limiter';
import { PROVIDER_LIMITS } from '../src/utils/provider-limits';

// Mock `ai` module
jest.mock('ai', () => ({
  generateText: jest.fn(),
}));

const mockGenerateText = generateText as jest.MockedFunction<typeof generateText>;

// Mock dependencies
const mockLlmModelFactory = {
  create: jest.fn(),
  isFallbackMode: jest.fn(),
  getProvider: jest.fn(),
};

const mockRateLimiter = {
  setProviderLimit: jest.fn(),
  executeWithRateLimiting: jest.fn(),
};

const mockToolService = {
  getTools: jest.fn(),
  search: jest.fn<() => Promise<string>>(),
};

describe('LlmService', () => {
  let service: LlmService;
  const provider = 'openai';
  const limits = PROVIDER_LIMITS[provider];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  const createService = (isRateLimitDisabled = false, toolService?: ToolServiceI, customProvider?: string) => {
    mockLlmModelFactory.getProvider.mockReturnValue(customProvider || provider);
    mockLlmModelFactory.create.mockReturnValue({});
    mockLlmModelFactory.isFallbackMode.mockReturnValue(false);

    return new LlmService(
      mockLlmModelFactory as unknown as LlmModelFactoryI,
      mockRateLimiter as unknown as RateLimiter,
      isRateLimitDisabled,
      toolService,
    );
  };

  describe('constructor', () => {
    it('should set rate limits if not disabled and limits exist', () => {
      createService();
      expect(mockRateLimiter.setProviderLimit).toHaveBeenCalledWith(provider, limits.requestsPerMinute);
    });

    it('should not set rate limits if disabled', () => {
      createService(true);
      expect(mockRateLimiter.setProviderLimit).not.toHaveBeenCalled();
    });

    it('should not set rate limits if provider has no limits', () => {
      createService(false, undefined, 'unknown-provider');
      expect(mockRateLimiter.setProviderLimit).not.toHaveBeenCalled();
    });
  });

  describe('searchWeb', () => {
    it('should return error message if tool service is not available', async () => {
      service = createService(false, undefined);
      const result = await service.searchWeb('query');
      expect(result).toBe('Search functionality is not available.');
    });

    it('should return error message if search tool is not available', async () => {
      service = createService(false, { getTools: jest.fn() } as unknown as ToolServiceI);
      const result = await service.searchWeb('query');
      expect(result).toBe('Search tool is not available.');
    });

    it('should perform search if tool service has search method', async () => {
      const searchResult = 'search result';
      mockToolService.search.mockResolvedValue(searchResult);
      service = createService(false, mockToolService as unknown as ToolServiceI);

      const result = await service.searchWeb('query');
      expect(result).toBe(searchResult);
      expect(mockToolService.search).toHaveBeenCalledWith('query');
    });

    it('should return error message if search throws error', async () => {
      mockToolService.search.mockRejectedValue(new Error('Search failed'));
      service = createService(false, mockToolService as unknown as ToolServiceI);

      const result = await service.searchWeb('query');
      expect(result).toBe('Error performing search: Search failed');
    });
  });

  describe('ask', () => {
    it('should call generateText through rate limiter', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockRateLimiter.executeWithRateLimiting.mockImplementation((_p, fn: any) => fn());
      mockGenerateText.mockResolvedValue({ text: '{"categoryId": "cat-1", "type": "existing"}' } as any);
      service = createService();

      const result = await service.ask('prompt');

      expect(mockRateLimiter.executeWithRateLimiting).toHaveBeenCalledWith(provider, expect.any(Function));
      expect(mockGenerateText).toHaveBeenCalledWith(expect.objectContaining({
        prompt: 'prompt',
        temperature: 0.2,
      }));
      expect(result).toEqual({ categoryId: 'cat-1', type: 'existing' });
    });

    it('should handle invalid JSON response', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockRateLimiter.executeWithRateLimiting.mockImplementation((_p, fn: any) => fn());
      mockGenerateText.mockResolvedValue({ text: 'invalid json' } as any);
      service = createService();

      await expect(service.ask('prompt')).rejects.toThrow('Invalid response format from LLM');
    });

    it('should handle LLM error', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockRateLimiter.executeWithRateLimiting.mockImplementation((_p, fn: any) => fn());
      mockGenerateText.mockRejectedValue(new Error('LLM error'));
      service = createService();

      await expect(service.ask('prompt')).rejects.toThrow('Invalid response format from LLM');
    });
  });

  describe('ask fallback mode', () => {
    beforeEach(() => {
      mockLlmModelFactory.isFallbackMode.mockReturnValue(true);
      mockLlmModelFactory.create.mockReturnValue({});
      mockLlmModelFactory.getProvider.mockReturnValue(provider);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockRateLimiter.executeWithRateLimiting.mockImplementation((_p, fn: any) => fn());
    });

    it('should call generateText directly and return uuid', async () => {
      service = new LlmService(
        mockLlmModelFactory as unknown as LlmModelFactoryI,
        mockRateLimiter as unknown as RateLimiter,
        false,
        undefined,
      );
      const uuid = '12345678-1234-1234-1234-1234567890ab';
      mockGenerateText.mockResolvedValue({ text: uuid } as any);

      const result = await service.ask('prompt');

      expect(result).toEqual({ type: 'existing', categoryId: uuid });
    });

    it('should throw error if response is not a UUID', async () => {
      service = new LlmService(
        mockLlmModelFactory as unknown as LlmModelFactoryI,
        mockRateLimiter as unknown as RateLimiter,
        false,
        undefined,
      );
      mockGenerateText.mockResolvedValue({ text: 'not a uuid' } as any);

      await expect(service.ask('prompt')).rejects.toThrow('Could not foud category in LLM response');
    });
  });
});
