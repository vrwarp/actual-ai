import TagService from '../src/transaction/tag-service';

describe('TagService', () => {
  describe('clearPreviousTags', () => {
    it('should correctly clear tags when one tag is a substring of another', () => {
      // Setup tags where one is a substring of another
      // e.g. #tag is a substring of #tag-miss
      const service = new TagService(
        '#tag-miss', // notGuessedTag
        '#tag',      // guessedTag
        '#override'  // manualOverrideTag
      );

      // Verify that the longer tag is removed completely, not leaving "-miss"
      expect(service.clearPreviousTags('Transaction #tag-miss')).toBe('Transaction');

      // Verify that the shorter tag is also removed
      expect(service.clearPreviousTags('Transaction #tag')).toBe('Transaction');

      // Verify manual override
      expect(service.clearPreviousTags('Transaction #override')).toBe('Transaction');
    });

    it('should correctly clear tags when notGuessedTag is a substring of guessedTag', () => {
      // Setup tags where notGuessedTag is a substring of guessedTag
      const service = new TagService(
        '#ai',       // notGuessedTag
        '#ai-guessed', // guessedTag
        '#manual'    // manualOverrideTag
      );

      expect(service.clearPreviousTags('Transaction #ai-guessed')).toBe('Transaction');
      expect(service.clearPreviousTags('Transaction #ai')).toBe('Transaction');
    });

    it('should handle standard default tags correctly', () => {
      const service = new TagService(
        '#actual-ai-miss',
        '#actual-ai',
        '#actual-ai-override'
      );

      expect(service.clearPreviousTags('Foo #actual-ai-miss')).toBe('Foo');
      expect(service.clearPreviousTags('Foo #actual-ai')).toBe('Foo');
      expect(service.clearPreviousTags('Foo #actual-ai-override')).toBe('Foo');
    });

    it('should remove legacy note markers', () => {
      const service = new TagService('#miss', '#guess', '#over');

      const legacyMiss = 'actual-ai could not guess this category';
      const legacyGuess = 'actual-ai guessed this category';

      expect(service.clearPreviousTags(`Foo ${legacyMiss}`)).toBe('Foo');
      expect(service.clearPreviousTags(`Foo | ${legacyMiss}`)).toBe('Foo');
      expect(service.clearPreviousTags(`Foo ${legacyGuess}`)).toBe('Foo');
      expect(service.clearPreviousTags(`Foo | ${legacyGuess}`)).toBe('Foo');
    });

    it('should handle special regex characters in tags', () => {
        const service = new TagService(
            '#miss+',
            '#guessed?',
            '#override*'
        );

        expect(service.clearPreviousTags('Transaction #guessed?')).toBe('Transaction');
        expect(service.clearPreviousTags('Transaction #miss+')).toBe('Transaction');
    });
  });
});
