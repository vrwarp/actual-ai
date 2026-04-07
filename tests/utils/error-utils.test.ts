import {
  describe, it, expect, jest,
} from '@jest/globals';
import { isRateLimitError, extractRetryAfterMs, formatError } from '../../src/utils/error-utils';

describe('error-utils', () => {
  describe('isRateLimitError', () => {
    it('should return false for null/undefined', () => {
      expect(isRateLimitError(null)).toBe(false);
      expect(isRateLimitError(undefined)).toBe(false);
    });

    it('should return true if error message contains "rate limit"', () => {
      expect(isRateLimitError(new Error('Hit rate limit'))).toBe(true);
      expect(isRateLimitError(new Error('rate_limit exceeded'))).toBe(true);
    });

    it('should return true if error message contains "too many requests"', () => {
      expect(isRateLimitError(new Error('Too Many Requests'))).toBe(true);
    });

    it('should return true if error has statusCode 429', () => {
      const error: any = new Error('Some error');
      error.statusCode = 429;
      expect(isRateLimitError(error)).toBe(true);
    });

    it('should return false for other errors', () => {
      expect(isRateLimitError(new Error('Network error'))).toBe(false);
    });

    it('should check string representation if not Error object', () => {
        expect(isRateLimitError({ message: 'rate limit' })).toBe(true);
    });
  });

  describe('extractRetryAfterMs', () => {
    it('should return undefined if not a rate limit error', () => {
      expect(extractRetryAfterMs(new Error('Other error'))).toBeUndefined();
    });

    it('should extract time from "try again in Xs"', () => {
      const error = new Error('Rate limit exceeded, try again in 5.5s');
      expect(extractRetryAfterMs(error)).toBe(5500);
    });

    it('should extract time from retry-after header', () => {
      const error: any = new Error('Rate limit');
      error.responseHeaders = { 'retry-after': '10' };
      expect(extractRetryAfterMs(error)).toBe(10000);
    });

    it('should extract time from Retry-After header', () => {
      const error: any = new Error('Rate limit');
      error.responseHeaders = { 'Retry-After': '20' };
      expect(extractRetryAfterMs(error)).toBe(20000);
    });

    it('should extract time from responseBody reset_time', () => {
      const error: any = new Error('Rate limit');
      error.responseBody = JSON.stringify({ error: { reset_time: 30 } });
      expect(extractRetryAfterMs(error)).toBe(30000);
    });

    it('should return undefined if no retry info found', () => {
      const error = new Error('Rate limit exceeded');
      expect(extractRetryAfterMs(error)).toBeUndefined();
    });

    it('should handle JSON parse error in responseBody gracefully', () => {
        const error: any = new Error('Rate limit');
        error.responseBody = 'invalid json';
        expect(extractRetryAfterMs(error)).toBeUndefined();
    });

    it('should handle errors during extraction', () => {
        const error: any = new Error('Rate limit');
        // Cause an error by making responseHeaders exist but throw on access or something weird?
        // Or just mock regex exec to throw?
        // Hard to force error in the try-catch block without messing with globals or prototypes.
        // However, we can test that it catches unexpected errors.
        // Let's try to pass an object that throws on property access.
        const throwingObj = {
            message: 'rate limit',
            get responseHeaders() { throw new Error('Access denied'); }
        };
        // isRateLimitError checks message property so we need that.
        // But isRateLimitError uses instanceof Error check for statusCode.
        // Let's use an Error object with a throwing property.
        Object.defineProperty(error, 'responseHeaders', {
            get: () => { throw new Error('Access denied'); }
        });

        const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
        expect(extractRetryAfterMs(error)).toBeUndefined();
        expect(consoleSpy).toHaveBeenCalledWith('Error extracting retry-after information:', expect.any(Error));
        consoleSpy.mockRestore();
    });
  });

  describe('formatError', () => {
    it('should format Error object', () => {
      expect(formatError(new Error('test error'))).toBe('test error');
    });

    it('should format object', () => {
      expect(formatError({ code: 500 })).toBe('{"code":500}');
    });

    it('should handle circular object', () => {
        const obj: any = {};
        obj.self = obj;
        expect(formatError(obj)).toBe('[object Object]');
    });

    it('should format string', () => {
      expect(formatError('string error')).toBe('string error');
    });

    it('should format null', () => {
        expect(formatError(null)).toBe('null');
    });

    it('should NOT leak sensitive fields in unknown objects', () => {
      const errorWithSecret = {
        message: 'Something went wrong',
        secret: 'api-key-123',
        config: {
          headers: {
            Authorization: 'Bearer token',
          },
        },
      };
      const formatted = formatError(errorWithSecret);
      expect(formatted).not.toContain('api-key-123');
      expect(formatted).not.toContain('Bearer token');
      expect(formatted).toContain('Something went wrong');
    });
  });
});
