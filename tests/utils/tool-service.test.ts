import {
  jest, describe, it, expect, beforeEach, afterEach,
} from '@jest/globals';
import * as https from 'https';
import { EventEmitter } from 'events';
import ToolService from '../../src/utils/tool-service';
import FreeWebSearchService from '../../src/utils/free-web-search-service';
import { getEnabledTools } from '../../src/config';

// Mock dependencies
jest.mock('../../src/config');
jest.mock('../../src/utils/free-web-search-service');
jest.mock('https');

const mockGetEnabledTools = getEnabledTools as jest.MockedFunction<typeof getEnabledTools>;
const mockFreeWebSearchService = FreeWebSearchService as jest.MockedClass<typeof FreeWebSearchService>;

describe('ToolService', () => {
  let toolService: ToolService;
  const apiKey = 'test-api-key';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('getTools', () => {
    it('should return empty tools if no tools enabled', () => {
      mockGetEnabledTools.mockReturnValue([]);
      toolService = new ToolService(apiKey);
      const tools = toolService.getTools();
      expect(tools).toEqual({});
    });

    it('should include webSearch if enabled', () => {
      mockGetEnabledTools.mockReturnValue(['webSearch']);
      toolService = new ToolService(apiKey);
      const tools = toolService.getTools();
      expect(tools).toHaveProperty('webSearch');
    });

    it('should include freeWebSearch if enabled', () => {
      mockGetEnabledTools.mockReturnValue(['freeWebSearch']);
      toolService = new ToolService(apiKey);
      const tools = toolService.getTools();
      expect(tools).toHaveProperty('freeWebSearch');
    });
  });

  describe('webSearch tool', () => {
    let executeWebSearch: (args: { query: string }) => Promise<string>;

    beforeEach(() => {
      mockGetEnabledTools.mockReturnValue(['webSearch']);
      toolService = new ToolService(apiKey);
      const tools = toolService.getTools();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      executeWebSearch = (tools.webSearch as any).execute;
    });

    it('should return unavailable if no api key', async () => {
      toolService = new ToolService('');
      const tools = toolService.getTools();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const execute = (tools.webSearch as any).execute;
      const result = await execute({ query: 'test' });
      expect(result).toBe('Search unavailable');
    });

    it('should perform search and format results', async () => {
      const mockResponse = {
        organic_results: [
          { title: 'Unique Result One', snippet: 'Snippet 1', link: 'http://example.com/1' },
          { title: 'Different Result Two', snippet: 'Snippet 2', link: 'http://example.com/2' },
        ],
      };

      const mockRequest = new EventEmitter();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (https.request as unknown as jest.Mock).mockImplementation((_options, callback: any) => {
        const res = new EventEmitter();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (res as any).statusCode = 200;
        callback(res);
        res.emit('data', JSON.stringify(mockResponse));
        res.emit('end');
        return mockRequest;
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (mockRequest as any).end = jest.fn();

      const result = await executeWebSearch({ query: 'test' });
      expect(result).toContain('SEARCH RESULTS:');
      expect(result).toContain('Unique Result One');
      expect(result).toContain('Different Result Two');
    });

    it('should handle search failure', async () => {
      const mockRequest = new EventEmitter();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (https.request as unknown as jest.Mock).mockImplementation((_options, callback: any) => {
          const res = new EventEmitter();
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (res as any).statusCode = 500;
          callback(res);
          res.emit('end');
          return mockRequest;
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (mockRequest as any).end = jest.fn();

      await expect(executeWebSearch({ query: 'test' })).rejects.toThrow('Search request failed with status code: 500');
    });

    it('should handle request error', async () => {
        const mockRequest = new EventEmitter();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (mockRequest as any).end = jest.fn();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (https.request as unknown as jest.Mock).mockImplementation(() => {
            return mockRequest;
        });

        const promise = executeWebSearch({ query: 'test' });
        mockRequest.emit('error', new Error('Network error'));

        await expect(promise).rejects.toThrow('Network error');
    });

    it('should handle empty results', async () => {
        const mockResponse = {
          organic_results: [],
        };

        const mockRequest = new EventEmitter();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (https.request as unknown as jest.Mock).mockImplementation((_options, callback: any) => {
          const res = new EventEmitter();
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (res as any).statusCode = 200;
          callback(res);
          res.emit('data', JSON.stringify(mockResponse));
          res.emit('end');
          return mockRequest;
        });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (mockRequest as any).end = jest.fn();

        const result = await executeWebSearch({ query: 'test' });
        expect(result).toBe('No clear business information found in search results.');
    });

    it('should handle malformed json', async () => {
        const mockRequest = new EventEmitter();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (https.request as unknown as jest.Mock).mockImplementation((_options, callback: any) => {
          const res = new EventEmitter();
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (res as any).statusCode = 200;
          callback(res);
          res.emit('data', 'invalid json');
          res.emit('end');
          return mockRequest;
        });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (mockRequest as any).end = jest.fn();

        await expect(executeWebSearch({ query: 'test' })).rejects.toThrow('Failed to parse search results');
    });
  });

  describe('freeWebSearch tool', () => {
    let executeFreeWebSearch: (args: { query: string }) => Promise<string>;

    beforeEach(() => {
      mockGetEnabledTools.mockReturnValue(['freeWebSearch']);
      toolService = new ToolService(apiKey);
      const tools = toolService.getTools();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      executeFreeWebSearch = (tools.freeWebSearch as any).execute;

      // Mock the instance method
      const mockInstance = mockFreeWebSearchService.mock.instances[0];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (mockInstance as any).search = jest.fn();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (mockInstance as any).formatSearchResults = jest.fn();
    });

    it('should execute free web search', async () => {
        const mockInstance = mockFreeWebSearchService.mock.instances[0];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (mockInstance.search as jest.Mock<any>).mockResolvedValue(['result']);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (mockInstance.formatSearchResults as jest.Mock).mockReturnValue('formatted result');

        const result = await executeFreeWebSearch({ query: 'test' });
        expect(result).toBe('formatted result');
        expect(mockInstance.search).toHaveBeenCalledWith('test');
    });

    it('should handle error in free web search', async () => {
        const mockInstance = mockFreeWebSearchService.mock.instances[0];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (mockInstance.search as jest.Mock<any>).mockRejectedValue(new Error('Search failed'));

        const result = await executeFreeWebSearch({ query: 'test' });
        expect(result).toBe('Web search failed. Please try again later.');
    });
  });
});
