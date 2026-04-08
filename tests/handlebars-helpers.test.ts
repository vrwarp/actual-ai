import handlebars from '../src/handlebars-helpers';

describe('handlebars-helpers', () => {
  describe('eq helper', () => {
    it('should return true when arguments are strictly equal', () => {
      const template = handlebars.compile('{{#if (eq arg1 arg2)}}Equal{{else}}Not Equal{{/if}}');

      expect(template({ arg1: 1, arg2: 1 })).toBe('Equal');
      expect(template({ arg1: 'test', arg2: 'test' })).toBe('Equal');
      expect(template({ arg1: true, arg2: true })).toBe('Equal');
    });

    it('should return false when arguments are not strictly equal', () => {
      const template = handlebars.compile('{{#if (eq arg1 arg2)}}Equal{{else}}Not Equal{{/if}}');

      expect(template({ arg1: 1, arg2: 2 })).toBe('Not Equal');
      expect(template({ arg1: 1, arg2: '1' })).toBe('Not Equal');
      expect(template({ arg1: true, arg2: false })).toBe('Not Equal');
      expect(template({ arg1: null, arg2: undefined })).toBe('Not Equal');
    });
  });

  describe('incIndex helper', () => {
    it('should increment the numerical index by one', () => {
      const template = handlebars.compile('{{incIndex index}}');

      expect(template({ index: 0 })).toBe('1');
      expect(template({ index: 1 })).toBe('2');
      expect(template({ index: 99 })).toBe('100');
      expect(template({ index: -1 })).toBe('0');
    });

    it('should handle non-integer numbers', () => {
      const template = handlebars.compile('{{incIndex index}}');

      expect(template({ index: 1.5 })).toBe('2.5');
    });
  });
});
