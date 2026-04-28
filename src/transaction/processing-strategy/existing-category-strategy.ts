import type { CategoryEntity, TransactionEntity } from '@actual-app/api/@types/loot-core/src/types/models';
import type {
  ActualApiServiceI, ProcessingStrategyI, UnifiedResponse,
} from '../../types';
import TagService from '../tag-service';
import { mask } from '../../utils/log-utils';

/**
 * Strategy to handle LLM responses that match an existing category in the system.
 */
class ExistingCategoryStrategy implements ProcessingStrategyI {
  private readonly actualApiService: ActualApiServiceI;

  private readonly tagService: TagService;

  /**
   * Constructs the ExistingCategoryStrategy.
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
   * @returns True if the response type is 'existing' and a categoryId is present.
   */
  public isSatisfiedBy(response: UnifiedResponse): boolean {
    if (response.categoryId === undefined) {
      return false;
    }

    return response.type === 'existing';
  }

  /**
   * Processes the transaction by assigning it to the existing category identified in the response.
   *
   * If the category ID is invalid or not found, the transaction is tagged as "not guessed".
   *
   * @param transaction - The transaction to update.
   * @param response - The LLM response containing the category ID.
   * @param categories - List of available categories to validate against.
   * @returns A promise that resolves when the update is complete.
   */
  public async process(
    transaction: TransactionEntity,
    response: UnifiedResponse,
    categories: CategoryEntity[],
  ) {
    if (response.categoryId === undefined) {
      throw new Error('No categoryId in response');
    }
    const category = categories.find((c) => c.id === response.categoryId);
    if (!category) {
      // Add not guessed tag when category not found
      await this.actualApiService.updateTransactionNotes(
        transaction.id,
        this.tagService.addNotGuessedTag(transaction.notes ?? ''),
      );
      return;
    }

    console.log(`Using existing category: ${mask(category.name)}`);
    await this.actualApiService.updateTransactionNotesAndCategory(
      transaction.id,
      this.tagService.addGuessedTag(transaction.notes ?? ''),
      response.categoryId,
    );
  }
}

export default ExistingCategoryStrategy;
