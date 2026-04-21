import { mask } from '../../src/utils/log-utils';

describe('log-utils', () => {
  describe('mask', () => {
    it('should return [REDACTED] for strings', () => {
      expect(mask('sensitive string')).toBe('[REDACTED]');
      expect(mask('')).toBe('[REDACTED]');
    });

    it('should return [REDACTED] for numbers', () => {
      expect(mask(123.45)).toBe('[REDACTED]');
      expect(mask(0)).toBe('[REDACTED]');
    });

    it('should return [NULL/UNDEFINED] for null or undefined', () => {
      expect(mask(undefined)).toBe('[NULL/UNDEFINED]');
      expect(mask(null)).toBe('[NULL/UNDEFINED]');
    });
  });
});
