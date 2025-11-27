import { CategoryEntity, TransactionEntity } from '@actual-app/api/@types/loot-core/src/types/models';
import type {
  ProcessingStrategyI, UnifiedResponse,
} from '../../types';

/**
 * Strategy to handle LLM responses that suggest creating a new category.
 */
class NewCategoryStrategy implements ProcessingStrategyI {
  /**
   * Checks if this strategy can handle the given response.
   *
   * @param response - The LLM response.
   * @returns True if the response type is 'new' and a newCategory object is present.
   */
  public isSatisfiedBy(response: UnifiedResponse): boolean {
    if (response.newCategory === undefined) {
      return false;
    }
    return response.type === 'new';
  }

  /**
   * Processes the transaction by accumulating it into a list of suggested new categories.
   *
   * Instead of creating the category immediately, it adds the suggestion to a map.
   * This allows for batch processing and optimization (e.g., merging duplicates) later.
   *
   * @param transaction - The transaction to categorize.
   * @param response - The LLM response containing details of the new category.
   * @param categories - (Unused) List of existing categories.
   * @param suggestedCategories - A map to store and aggregate suggested categories.
   * @returns A promise that resolves immediately (synchronous update of the map).
   */
  public async process(
    transaction: TransactionEntity,
    response: UnifiedResponse,
    categories: CategoryEntity[],
    suggestedCategories: Map<string, {
        name: string;
        groupName: string;
        groupIsNew: boolean;
        groupId?: string;
        transactions: TransactionEntity[];
      }>,
  ) {
    if (response.newCategory === undefined) {
      throw new Error('No newCategory in response');
    }
    const categoryKey = `${response.newCategory.groupName}:${response.newCategory.name}`;

    const existing = suggestedCategories.get(categoryKey);
    if (existing) {
      existing.transactions.push(transaction);
    } else {
      suggestedCategories.set(categoryKey, {
        ...response.newCategory,
        transactions: [transaction],
      });
    }
    return Promise.resolve();
  }
}

export default NewCategoryStrategy;
