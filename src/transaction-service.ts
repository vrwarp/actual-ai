import type {
  TransactionEntity,
} from '@actual-app/api/@types/loot-core/src/types/models';
import type {
  ActualApiServiceI,
  TransactionServiceI,
} from './types';
import { isFeatureEnabled } from './config';
import CategorySuggester from './transaction/category-suggester';
import BatchTransactionProcessor from './transaction/batch-transaction-processor';
import TransactionFilterer from './transaction/transaction-filterer';
import { Logger } from './utils/log-utils';

/**
 * Service responsible for the high-level orchestration of transaction processing.
 * It retrieves data, filters transactions, delegates processing, and handles new category suggestions.
 */
class TransactionService implements TransactionServiceI {
  private readonly actualApiService: ActualApiServiceI;

  private readonly categorySuggester: CategorySuggester;

  private readonly transactionProcessor: BatchTransactionProcessor;

  private readonly transactionFilterer: TransactionFilterer;

  private readonly isDryRun: boolean;

  /**
   * Constructs the TransactionService.
   *
   * @param actualApiClient - Service to interact with the Actual Budget API.
   * @param categorySuggester - Service to handle suggestion and creation of new categories.
   * @param transactionProcessor - Service to process transactions in batches.
   * @param transactionFilterer - Service to filter transactions (e.g., finding uncategorized ones).
   * @param isDryRun - If true, no side effects (like updating transactions) will occur.
   */
  constructor(
    actualApiClient: ActualApiServiceI,
    categorySuggester: CategorySuggester,
    transactionProcessor: BatchTransactionProcessor,
    transactionFilterer: TransactionFilterer,
    isDryRun: boolean,
  ) {
    this.actualApiService = actualApiClient;
    this.categorySuggester = categorySuggester;
    this.transactionProcessor = transactionProcessor;
    this.transactionFilterer = transactionFilterer;
    this.isDryRun = isDryRun;
  }

  /**
   * Main method to process all eligible transactions.
   *
   * 1. Fetches necessary data (categories, transactions, rules, etc.).
   * 2. Filters for uncategorized transactions.
   * 3. Retrieves manual override examples for few-shot learning.
   * 4. Delegates processing to the batch processor.
   * 5. Optionally handles suggestions for new categories if enabled.
   *
   * @returns A promise that resolves when all processing is complete.
   */
  async processTransactions(): Promise<void> {
    if (this.isDryRun) {
      Logger.info('=== DRY RUN MODE ===');
      Logger.info('No changes will be made to transactions or categories');
      Logger.info('=====================');
    }

    const [categoryGroups, categories, payees, transactions, accounts, rules] = await Promise.all([
      this.actualApiService.getCategoryGroups(),
      this.actualApiService.getCategories(),
      this.actualApiService.getPayees(),
      this.actualApiService.getTransactions(),
      this.actualApiService.getAccounts(),
      this.actualApiService.getRules(),
    ]);
    Logger.info(`Found ${rules.length} transaction categorization rules`);
    Logger.info('rerunMissedTransactions', isFeatureEnabled('rerunMissedTransactions'));

    const uncategorizedTransactions = this.transactionFilterer.filterUncategorized(
      transactions,
      accounts,
    );

    if (uncategorizedTransactions.length === 0) {
      Logger.info('No uncategorized transactions to process');
      return;
    }

    const examples = this.transactionFilterer.getManualOverrideTransactions(transactions);
    Logger.info(`Found ${examples.length} manual override examples`);

    // Track suggested new categories
    const suggestedCategories = new Map<string, {
      name: string;
      groupName: string;
      groupIsNew: boolean;
      groupId?: string;
      transactions: TransactionEntity[];
    }>();

    await this.transactionProcessor.process(
      uncategorizedTransactions,
      categoryGroups,
      payees,
      rules,
      examples,
      categories,
      suggestedCategories,
    );

    // Create new categories if not in dry run mode
    if (isFeatureEnabled('suggestNewCategories') && suggestedCategories.size > 0) {
      await this.categorySuggester.suggest(
        suggestedCategories,
        uncategorizedTransactions,
        categoryGroups,
      );
    }
  }
}

export default TransactionService;
