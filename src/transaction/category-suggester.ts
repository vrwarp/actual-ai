import type { TransactionEntity } from '@actual-app/api/@types/loot-core/src/types/models';
import type { ActualApiServiceI } from '../types';
import { APICategoryGroupEntity } from '../types';
import CategorySuggestionOptimizer from '../category-suggestion-optimizer';
import TagService from './tag-service';
import { Logger } from '../utils/log-utils';

/**
 * Service responsible for creating new categories suggested by the AI.
 *
 * This class handles the optimization of suggested categories (merging duplicates),
 * creation of new category groups and categories via the API, and updating transactions
 * to assign them to these newly created categories.
 */
class CategorySuggester {
  private readonly actualApiService: ActualApiServiceI;

  private readonly categorySuggestionOptimizer: CategorySuggestionOptimizer;

  private readonly tagService: TagService;

  /**
   * Constructs the CategorySuggester.
   *
   * @param actualApiService - Service to interact with the Actual Budget API.
   * @param categorySuggestionOptimizer - Service to optimize and deduplicate category suggestions.
   * @param tagService - Service to manage tags on transaction notes.
   */
  constructor(
    actualApiService: ActualApiServiceI,
    categorySuggestionOptimizer: CategorySuggestionOptimizer,
    tagService: TagService,
  ) {
    this.actualApiService = actualApiService;
    this.categorySuggestionOptimizer = categorySuggestionOptimizer;
    this.tagService = tagService;
  }

  /**
   * Processes suggested categories, creates them in the system, and assigns transactions.
   *
   * 1. Optimizes the raw suggestions to merge similar ones.
   * 2. Iterates through optimized suggestions.
   * 3. Creates new category groups if necessary, or finds existing ones.
   * 4. Creates the new category within the group.
   * 5. Updates all associated transactions to belong to the new category and tags them.
   *
   * @param suggestedCategories - A map of suggested categories and their associated transactions.
   * @param uncategorizedTransactions - (Unused param in current logic) List of uncategorized transactions.
   * @param categoryGroups - List of existing category groups to check against.
   * @returns A promise that resolves when all creation and assignment operations are complete.
   */
  public async suggest(
    suggestedCategories: Map<string, {
            name: string;
            groupName: string;
            groupIsNew: boolean;
            groupId?: string;
            transactions: TransactionEntity[];
        }>,
    uncategorizedTransactions: TransactionEntity[],
    categoryGroups: APICategoryGroupEntity[],
  ): Promise<void> {
    // Optimize categories before applying/reporting
    const optimizedCategories = this.categorySuggestionOptimizer
      .optimizeCategorySuggestions(suggestedCategories);

    Logger.info(`Creating ${optimizedCategories.size} optimized categories`);

    // Use optimized categories instead of original suggestions
    await Promise.all(
      Array.from(optimizedCategories.entries()).map(async ([_key, suggestion]) => {
        try {
          // First, ensure we have a group ID
          let groupId: string;
          if (suggestion.groupIsNew) {
            groupId = await this.actualApiService.createCategoryGroup(suggestion.groupName);
            Logger.info(`Created new category group "${suggestion.groupName}" with ID ${groupId}`);
          } else {
            // Find existing group with matching name
            const existingGroup = categoryGroups.find(
              (g) => g.name.toLowerCase() === suggestion.groupName.toLowerCase(),
            );
            groupId = existingGroup?.id
                              ?? await this.actualApiService.createCategoryGroup(
                                suggestion.groupName,
                              );
          }

          // Validate groupId exists before creating category
          if (!groupId) {
            throw new Error(`Missing groupId for category ${suggestion.name}`);
          }

          const newCategoryId = await this.actualApiService.createCategory(
            suggestion.name,
            groupId,
          );

          Logger.info(`Created new category "${suggestion.name}" with ID ${newCategoryId}`);

          // Use Promise.all with map for nested async operations
          await Promise.all(
            suggestion.transactions.map(async (transaction) => {
              await this.actualApiService.updateTransactionNotesAndCategory(
                transaction.id,
                this.tagService.addGuessedTag(transaction.notes ?? ''),
                newCategoryId,
              );
              Logger.info(`Assigned transaction ${transaction.id} to new category ${suggestion.name}`);
            }),
          );
        } catch (error) {
          Logger.error(`Error creating category ${suggestion.name}:`, error);
        }
      }),
    );
  }
}

export default CategorySuggester;
