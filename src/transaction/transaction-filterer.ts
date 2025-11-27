import { TransactionEntity } from '@actual-app/api/@types/loot-core/src/types/models';
import { APIAccountEntity } from '@actual-app/api/@types/loot-core/src/server/api-models';
import { isFeatureEnabled } from '../config';
import TagService from './tag-service';

/**
 * Service to filter transactions based on various criteria.
 *
 * It is primarily used to identify uncategorized transactions that require processing
 * and to find transactions tagged as manual overrides for use as examples.
 */
class TransactionFilterer {
  private readonly tagService: TagService;

  /**
   * Constructs the TransactionFilterer.
   *
   * @param tagService - Service used to check for specific tags in transaction notes.
   */
  constructor(tagService: TagService) {
    this.tagService = tagService;
  }

  /**
   * Helper method to apply a filter condition and log the number of excluded items.
   *
   * @param transactions - List of transactions to filter.
   * @param filterFn - Predicate function that returns true for transactions to keep.
   * @param logMessage - Message to describe the exclusion reason for logging.
   * @returns The filtered list of transactions.
   */
  private applyFilter(
    transactions: TransactionEntity[],
    filterFn: (transaction: TransactionEntity) => boolean,
    logMessage: string,
  ): TransactionEntity[] {
    const excludedTransactions = transactions.filter((transaction) => !filterFn(transaction));

    if (excludedTransactions.length > 0) {
      console.log(`${logMessage} - Excluded ${excludedTransactions.length} transactions`);
    }

    return transactions.filter((transaction) => filterFn(transaction));
  }

  /**
   * Filters a list of transactions to find those that are uncategorized and eligible for AI classification.
   *
   * It excludes:
   * - Already categorized transactions.
   * - Transfers between accounts.
   * - Starting balance transactions.
   * - Transactions with no payee information.
   * - Transactions previously missed (unless 'rerunMissedTransactions' is enabled).
   * - Parent transactions (splits).
   * - Transactions from off-budget accounts.
   *
   * @param transactions - All transactions to consider.
   * @param accounts - List of accounts to check for off-budget status.
   * @returns A list of eligible uncategorized transactions.
   */
  public filterUncategorized(
    transactions: TransactionEntity[],
    accounts: APIAccountEntity[],
  ): TransactionEntity[] {
    console.log(`All transactions count: ${transactions.length}`);
    console.log(`All accounts: ${accounts.length}`);

    const accountsToSkip = accounts?.filter((account) => account.offbudget)
      .map((account) => account.id) ?? [];
    console.log(`Accounts off budget: ${accountsToSkip.length}`);

    let filteredTransactions = transactions;

    // Apply filters one by one
    filteredTransactions = this.applyFilter(
      filteredTransactions,
      (transaction) => !transaction.category,
      'Already has a category',
    );

    filteredTransactions = this.applyFilter(
      filteredTransactions,
      (transaction) => transaction.transfer_id === null || transaction.transfer_id === undefined,
      'Is a transfer',
    );

    filteredTransactions = this.applyFilter(
      filteredTransactions,
      (transaction) => transaction.starting_balance_flag !== true,
      'Is starting balance',
    );

    filteredTransactions = this.applyFilter(
      filteredTransactions,
      (transaction) => (transaction.imported_payee !== null && transaction.imported_payee !== '')
          || (transaction.payee !== null && transaction.payee !== ''),
      'Has no payee / imported_payee',
    );

    filteredTransactions = this.applyFilter(
      filteredTransactions,
      (transaction) => isFeatureEnabled('rerunMissedTransactions') || !this.tagService.isNotGuessed(transaction.notes ?? ''),
      'It was not guessed before',
    );

    filteredTransactions = this.applyFilter(
      filteredTransactions,
      (transaction) => !transaction.is_parent,
      'Transaction is a parent',
    );

    filteredTransactions = this.applyFilter(
      filteredTransactions,
      (transaction) => !accountsToSkip.includes(transaction.account),
      'Account is not budget',
    );

    console.log(`Found ${filteredTransactions.length} uncategorized transactions`);

    return filteredTransactions;
  }

  /**
   * Retrieves transactions that have been manually overridden by the user.
   *
   * These transactions serve as "gold standard" examples for the AI to learn from.
   *
   * @param transactions - List of transactions to check.
   * @returns List of transactions containing the manual override tag.
   */
  public getManualOverrideTransactions(
    transactions: TransactionEntity[],
  ): TransactionEntity[] {
    return transactions.filter((transaction) => this.tagService.isManualOverride(transaction.notes ?? ''));
  }
}

export default TransactionFilterer;
