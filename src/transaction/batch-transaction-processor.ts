import {
  RuleEntity,
  TransactionEntity,
} from '@actual-app/api/@types/loot-core/src/types/models';
import { APIPayeeEntity } from '@actual-app/api/@types/loot-core/src/server/api-models';
import {
  APICategoryEntity, APICategoryGroupEntity,
} from '../types';
import TransactionProcessor from './transaction-processor';

/**
 * Service to process a list of transactions in batches.
 *
 * This class handles the iteration over a large list of transactions, breaking them down
 * into smaller batches to manage load and rate limits. It delegates the processing of individual
 * transactions to the `TransactionProcessor`.
 */
class BatchTransactionProcessor {
  private readonly transactionProcessor: TransactionProcessor;

  private readonly batchSize: number;

  private readonly batchDelayMs: number;

  /**
   * Constructs the BatchTransactionProcessor.
   *
   * @param transactionProcessor - The service used to process individual transactions.
   * @param batchSize - The number of transactions to process in a single batch.
   * @param batchDelayMs - The delay in milliseconds between batches.
   */
  constructor(
    transactionProcessor: TransactionProcessor,
    batchSize: number,
    batchDelayMs: number,
  ) {
    this.transactionProcessor = transactionProcessor;
    this.batchSize = batchSize;
    this.batchDelayMs = batchDelayMs;
  }

  /**
   * Processes a list of uncategorized transactions in batches.
   *
   * It iterates through the transactions, processing them sequentially within each batch.
   * It also introduces a delay between batches to respect rate limits.
   *
   * @param uncategorizedTransactions - The list of transactions to process.
   * @param categoryGroups - Available category groups.
   * @param payees - Available payees.
   * @param rules - Relevant categorization rules.
   * @param examples - Manual override examples for few-shot learning.
   * @param categories - All available categories.
   * @param suggestedCategories - A map to collect suggested categories during processing.
   * @returns A promise that resolves when all batches have been processed.
   */
  public async process(
    uncategorizedTransactions: TransactionEntity[],
    categoryGroups: APICategoryGroupEntity[],
    payees: APIPayeeEntity[],
    rules: RuleEntity[],
    examples: TransactionEntity[],
    categories: (APICategoryEntity | APICategoryGroupEntity)[],
    suggestedCategories: Map<string, {
        name: string;
        groupName: string;
        groupIsNew: boolean;
        groupId?: string;
        transactions: TransactionEntity[];
      }>,
  ): Promise<void> {
    for (
      let batchStart = 0;
      batchStart < uncategorizedTransactions.length;
      batchStart += this.batchSize
    ) {
      const batchEnd = Math.min(batchStart + this.batchSize, uncategorizedTransactions.length);
      console.log(`Processing batch ${batchStart / this.batchSize + 1} (transactions ${batchStart + 1}-${batchEnd})`);

      const batch = uncategorizedTransactions.slice(batchStart, batchEnd);

      await batch.reduce(async (previousPromise, transaction, batchIndex) => {
        await previousPromise;
        const globalIndex = batchStart + batchIndex;
        console.log(
          `${globalIndex + 1}/${uncategorizedTransactions.length} Processing transaction '${transaction.imported_payee}'`,
        );

        await this.transactionProcessor.process(
          transaction,
          categoryGroups,
          payees,
          rules,
          examples,
          categories,
          suggestedCategories,
        );
      }, Promise.resolve());

      // Add a small delay between batches to avoid overwhelming the API
      if (batchEnd < uncategorizedTransactions.length) {
        console.log(`Pausing for ${this.batchDelayMs / 1000} seconds before next batch...`);
        await new Promise((resolve) => {
          setTimeout(resolve, this.batchDelayMs);
        });
      }
    }
  }
}

export default BatchTransactionProcessor;
