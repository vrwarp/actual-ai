import type { TransactionEntity } from '@actual-app/core/src/types/models';
import type {
  ActualApiServiceI, ProcessingStrategyI, UnifiedResponse,
} from '../../types';
import TagService from '../tag-service';

/**
 * Strategy to handle LLM responses that match an existing classification rule.
 */
class RuleMatchStrategy implements ProcessingStrategyI {
  private readonly actualApiService: ActualApiServiceI;

  private readonly tagService: TagService;

  /**
   * Constructs the RuleMatchStrategy.
   *
   * @param actualApiService - Service to interact with the Actual Budget API.
   * @param tagService - Service to manage transaction note tags.
   */
  constructor(
    actualApiService: ActualApiServiceI,
    tagService: TagService,
  ) {
    this.actualApiService = actualApiService;
    this.tagService = tagService;
  }

  /**
   * Checks if this strategy can handle the given response.
   *
   * @param response - The LLM response.
   * @returns True if the response type is 'rule', and both categoryId and ruleName are present.
   */
  isSatisfiedBy(response: UnifiedResponse): boolean {
    if (response.ruleName === undefined) {
      return false;
    }

    return response.type === 'rule';
  }

  /**
   * Processes the transaction by applying the matched rule.
   *
   * It updates the transaction's category and notes, appending the rule name to the notes
   * for transparency.
   *
   * @param transaction - The transaction to update.
   * @param response - The LLM response containing the rule match details.
   * @returns A promise that resolves when the update is complete.
   */
  async process(
    transaction: TransactionEntity,
    response: UnifiedResponse,
  ) {
    let updatedNotes = this.tagService.addGuessedTag(transaction.notes ?? '');
    updatedNotes = `${updatedNotes} (rule: ${response.ruleName})`;

    if (response.categoryId) {
      await this.actualApiService.updateTransactionNotesAndCategory(
        transaction.id,
        updatedNotes,
        response.categoryId,
      );
      return;
    }

    // Rule explicitly leaves the transaction uncategorized — tag the
    // notes so the rule attribution is visible, but don't assign a category.
    await this.actualApiService.updateTransactionNotes(
      transaction.id,
      updatedNotes,
    );
  }
}

export default RuleMatchStrategy;
