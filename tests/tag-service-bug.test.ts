import TagService from '../src/transaction/tag-service';

describe('TagService Bug Reproduction', () => {
  it('should clear tags correctly regardless of regex special characters in tag configuration', () => {
      // If the user configures tags with special regex characters like '+', '.', '?', etc.
      // The current implementation uses new RegExp(tag), which will treat them as regex tokens.

      const weirdTagService = new TagService(
          '#miss+',
          '#guessed?',
          '#override*'
      );

      const notes = 'Transaction #guessed?';

      const result = weirdTagService.clearPreviousTags(notes);

      expect(result).toBe('Transaction');
  });

  it('should not throw error when tag contains invalid regex characters', () => {
    const weirdTagService = new TagService(
        '#miss[', // Invalid regex if not escaped
        '#guessed',
        '#override'
    );

    const notes = 'Transaction #miss[';

    expect(() => {
        weirdTagService.clearPreviousTags(notes);
    }).not.toThrow();

    expect(weirdTagService.clearPreviousTags(notes)).toBe('Transaction');
  });
});
