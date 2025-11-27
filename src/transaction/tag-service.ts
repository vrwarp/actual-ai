const LEGACY_NOTES_NOT_GUESSED = 'actual-ai could not guess this category';
const LEGACY_NOTES_GUESSED = 'actual-ai guessed this category';

class TagService {
  private readonly notGuessedTag: string;

  private readonly guessedTag: string;

  private readonly manualOverrideTag: string;

  constructor(
    notGuessedTag: string,
    guessedTag: string,
    manualOverrideTag: string,
  ) {
    this.notGuessedTag = notGuessedTag;
    this.guessedTag = guessedTag;
    this.manualOverrideTag = manualOverrideTag;
  }

  public addNotGuessedTag(notes: string): string {
    return this.appendTag(notes, this.notGuessedTag);
  }

  public addGuessedTag(notes: string): string {
    return this.appendTag(notes, this.guessedTag);
  }

  private appendTag(notes: string, tag: string): string {
    const clearedNotes = this.clearPreviousTags(notes);
    return `${clearedNotes} ${tag}`.trim();
  }

  private escapeRegExp(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  public clearPreviousTags(notes: string): string {
    // Order matters here because guessedTag (#actual-ai) is a substring of
    // notGuessedTag (#actual-ai-miss) and manualOverrideTag (#actual-ai-override).
    // If we replace guessedTag first, we might leave partial tags behind.
    return notes
      .replace(new RegExp(`\\s*${this.escapeRegExp(this.manualOverrideTag)}`, 'g'), '')
      .replace(new RegExp(`\\s*${this.escapeRegExp(this.notGuessedTag)}`, 'g'), '')
      .replace(new RegExp(`\\s*${this.escapeRegExp(this.guessedTag)}`, 'g'), '')
      .replace(new RegExp(`\\s*\\|\\s*${this.escapeRegExp(LEGACY_NOTES_NOT_GUESSED)}`, 'g'), '')
      .replace(new RegExp(`\\s*\\|\\s*${this.escapeRegExp(LEGACY_NOTES_GUESSED)}`, 'g'), '')
      .replace(new RegExp(`\\s*${this.escapeRegExp(LEGACY_NOTES_GUESSED)}`, 'g'), '')
      .replace(new RegExp(`\\s*${this.escapeRegExp(LEGACY_NOTES_NOT_GUESSED)}`, 'g'), '')
      .replace(/-miss(?= #actual-ai)/g, '')
      .trim();
  }

  public isNotGuessed(notes: string): boolean {
    return notes.includes(this.notGuessedTag);
  }

  public isManualOverride(notes: string): boolean {
    return notes.includes(this.manualOverrideTag);
  }
}

export default TagService;
