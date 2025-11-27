import {
  describe, it, expect,
} from '@jest/globals';
import { parseLlmResponse, cleanJsonResponse } from '../../src/utils/json-utils';

describe('json-utils', () => {
  describe('cleanJsonResponse', () => {
    it('should return simple ID as is', () => {
      const id = 'simple-id-123';
      expect(cleanJsonResponse(id)).toBe(id);
    });

    it('should remove markdown code fences', () => {
      const json = '{"key": "value"}';
      const input = `\`\`\`json\n${json}\n\`\`\``;
      expect(cleanJsonResponse(input)).toBe(json);
    });

    it('should remove surrounding text', () => {
      const json = '{"key": "value"}';
      const input = `Here is the json:\n${json}\nHope it helps.`;
      expect(cleanJsonResponse(input)).toBe(json);
    });

    it('should return trimmed text if no JSON structure found', () => {
      const text = 'Just some text';
      expect(cleanJsonResponse(text)).toBe(text);
    });
  });

  describe('parseLlmResponse', () => {
    it('should parse valid existing category response', () => {
      const response = { type: 'existing', categoryId: 'cat-1' };
      const input = JSON.stringify(response);
      expect(parseLlmResponse(input)).toEqual(response);
    });

    it('should parse valid rule response', () => {
      const response = { type: 'rule', categoryId: 'cat-1', ruleName: 'Rule 1' };
      const input = JSON.stringify(response);
      expect(parseLlmResponse(input)).toEqual(response);
    });

    it('should parse valid new category response', () => {
      const response = { type: 'new', newCategory: 'Category' };
      const input = JSON.stringify(response);
      expect(parseLlmResponse(input)).toEqual(response);
    });

    it('should handle simple ID string as existing category', () => {
      const id = 'cat-123';
      expect(parseLlmResponse(id)).toEqual({ type: 'existing', categoryId: id });
    });

    it('should handle quoted simple ID string as existing category', () => {
        const id = '"cat-123"';
        expect(parseLlmResponse(id)).toEqual({ type: 'existing', categoryId: 'cat-123' });
    });

    it('should treat missing type but present categoryId as existing category', () => {
      const response = { categoryId: 'cat-1' };
      const input = JSON.stringify(response);
      expect(parseLlmResponse(input)).toEqual({ type: 'existing', categoryId: 'cat-1' });
    });

    it('should throw error for invalid JSON that is not a simple ID', () => {
      const input = '{ invalid json }';
      expect(() => parseLlmResponse(input)).toThrow('Invalid response format from LLM');
    });

    it('should throw error for valid JSON with invalid structure', () => {
      const response = { invalidKey: 'value' };
      const input = JSON.stringify(response);
      expect(() => parseLlmResponse(input)).toThrow('Invalid response format from LLM');
    });

    it('should parse response wrapped in markdown', () => {
        const response = { type: 'existing', categoryId: 'cat-1' };
        const input = `\`\`\`json\n${JSON.stringify(response)}\n\`\`\``;
        expect(parseLlmResponse(input)).toEqual(response);
    });
  });
});
