import type {
  ActualApiServiceI, NotesMigratorI,
} from '../types';
import { mask, Logger } from '../utils/log-utils';
import TagService from './tag-service';

const LEGACY_NOTES_NOT_GUESSED = 'actual-ai could not guess this category';
const LEGACY_NOTES_GUESSED = 'actual-ai guessed this category';

/**
 * Service to migrate legacy text-based markers in notes to the new hashtag-based system.
 *
 * Previous versions of the AI tool used verbose sentences in notes to mark status.
 * This service converts those sentences into tags like #actual-ai-miss or #actual-ai.
 */
class NotesMigrator implements NotesMigratorI {
  private readonly actualApiService: ActualApiServiceI;

  private readonly tagService: TagService;

  /**
   * Constructs the NotesMigrator.
   *
   * @param actualApiService - Service to interact with the Actual Budget API.
   * @param tagService - Service to handle tag generation and clearing.
   */
  constructor(
    actualApiService: ActualApiServiceI,
    tagService: TagService,
  ) {
    this.actualApiService = actualApiService;
    this.tagService = tagService;
  }

  /**
   * Scans all transactions for legacy markers and updates them to use tags.
   *
   * It iterates through transactions containing specific legacy phrases, replaces them
   * with the appropriate tags, and updates the transaction notes via the API.
   *
   * @returns A promise that resolves when the migration is complete.
   */
  async migrateToTags(): Promise<void> {
    const transactions = await this.actualApiService.getTransactions();
    const transactionsToMigrate = transactions.filter(
      (transaction) => transaction.notes
            && (
              transaction.notes?.includes(LEGACY_NOTES_NOT_GUESSED)
                || transaction.notes?.includes(LEGACY_NOTES_GUESSED)
            ),
    );

    for (let i = 0; i < transactionsToMigrate.length; i++) {
      const transaction = transactionsToMigrate[i];
      Logger.info(`${i + 1}/${transactionsToMigrate.length} Migrating transaction ${mask(transaction.imported_payee)} / ${mask(transaction.notes)} / ${mask(transaction.amount)}`);

      const baseNotes = this.tagService.clearPreviousTags(transaction.notes ?? '');
      let newNotes = baseNotes;

      if (transaction.notes?.includes(LEGACY_NOTES_NOT_GUESSED)) {
        newNotes = this.tagService.addNotGuessedTag(baseNotes);
      } else if (transaction.notes?.includes(LEGACY_NOTES_GUESSED)) {
        newNotes = this.tagService.addGuessedTag(baseNotes);
      }

      if (newNotes !== transaction.notes) {
        await this.actualApiService.updateTransactionNotes(transaction.id, newNotes);
      }
    }
  }
}

export default NotesMigrator;
