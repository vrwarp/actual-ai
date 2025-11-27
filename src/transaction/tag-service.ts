const LEGACY_NOTES_NOT_GUESSED = 'actual-ai could not guess this category';
const LEGACY_NOTES_GUESSED = 'actual-ai guessed this category';

/**
 * Service to manage tags within transaction notes.
 *
 * This service handles appending, removing, and checking for specific tags
 * that indicate the state of AI classification (e.g., guessed, missed, overridden).
 * It also handles the cleanup of legacy note markers.
 */
class TagService {
  private readonly notGuessedTag: string;

  private readonly guessedTag: string;

  private readonly manualOverrideTag: string;

  /**
   * Constructs the TagService with configured tag strings.
   *
   * @param notGuessedTag - Tag to indicate the AI could not categorize the transaction.
   * @param guessedTag - Tag to indicate the transaction was categorized by AI.
   * @param manualOverrideTag - Tag to indicate a user manually corrected the category.
   */
  constructor(
    notGuessedTag: string,
    guessedTag: string,
    manualOverrideTag: string,
  ) {
    this.notGuessedTag = notGuessedTag;
    this.guessedTag = guessedTag;
    this.manualOverrideTag = manualOverrideTag;
  }

  /**
   * Appends the "not guessed" tag to the notes.
   * Clears any existing AI tags first.
   *
   * @param notes - The original notes content.
   * @returns The notes with the "not guessed" tag appended.
   */
  public addNotGuessedTag(notes: string): string {
    return this.appendTag(notes, this.notGuessedTag);
  }

  /**
   * Appends the "guessed" tag to the notes.
   * Clears any existing AI tags first.
   *
   * @param notes - The original notes content.
   * @returns The notes with the "guessed" tag appended.
   */
  public addGuessedTag(notes: string): string {
    return this.appendTag(notes, this.guessedTag);
  }

  /**
   * Helper method to append a specific tag after clearing previous ones.
   *
   * @param notes - The original notes.
   * @param tag - The tag to append.
   * @returns The updated notes string.
   */
  private appendTag(notes: string, tag: string): string {
    const clearedNotes = this.clearPreviousTags(notes);
    return `${clearedNotes} ${tag}`.trim();
  }

  private escapeRegExp(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Removes all AI-related tags and legacy markers from the notes.
   *
   * It handles specific ordering to ensure that substring tags (like #actual-ai)
   * do not corrupt longer tags (like #actual-ai-miss) during replacement.
   *
   * @param notes - The notes content to clean.
   * @returns The cleaned notes string.
   */
  public clearPreviousTags(notes: string): string {
    // Collect all tag patterns to remove.
    // Order doesn't matter initially, because we sort them by length.
    const tags = [
      this.manualOverrideTag,
      this.notGuessedTag,
      this.guessedTag,
      LEGACY_NOTES_NOT_GUESSED,
      LEGACY_NOTES_GUESSED,
    ];

    const patterns = tags.map((tag) => this.escapeRegExp(tag));

    // Add legacy pipe patterns (e.g. " | actual-ai...")
    // These are constructed from the legacy strings
    patterns.push(`\\|\\s*${this.escapeRegExp(LEGACY_NOTES_NOT_GUESSED)}`);
    patterns.push(`\\|\\s*${this.escapeRegExp(LEGACY_NOTES_GUESSED)}`);

    // Sort patterns by length descending. This ensures that longer matches (e.g. #actual-ai-miss)
    // are attempted before shorter matches (e.g. #actual-ai), preventing partial removals.
    patterns.sort((a, b) => b.length - a.length);

    // Create a single regex that matches any of the tags, optionally preceded by whitespace.
    // The alternation (A|B|C) checks in order, so longer tags must come first.
    const combinedPattern = new RegExp(`\\s*(${patterns.join('|')})`, 'g');

    return notes.replace(combinedPattern, '').trim();
  }

  /**
   * Checks if the notes contain the "not guessed" tag.
   *
   * @param notes - The notes to check.
   * @returns True if the tag is present.
   */
  public isNotGuessed(notes: string): boolean {
    return notes.includes(this.notGuessedTag);
  }

  /**
   * Checks if the notes contain the "manual override" tag.
   *
   * @param notes - The notes to check.
   * @returns True if the tag is present.
   */
  public isManualOverride(notes: string): boolean {
    return notes.includes(this.manualOverrideTag);
  }
}

export default TagService;
