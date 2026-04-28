import {
  ActualAiServiceI, ActualApiServiceI, NotesMigratorI, TransactionServiceI,
} from './types';
import suppressConsoleLogsAsync from './utils';
import { formatError } from './utils/error-utils';
import { isFeatureEnabled } from './config';
import { Logger } from './utils/log-utils';

/**
 * Service responsible for orchestrating the AI classification process.
 * It coordinates initialization, bank syncing, note migration, and transaction processing.
 */
class ActualAiService implements ActualAiServiceI {
  private readonly transactionService: TransactionServiceI;

  private readonly actualApiService: ActualApiServiceI;

  private readonly notesMigrator: NotesMigratorI;

  /**
   * Initializes the Actual AI service with required dependencies.
   *
   * @param transactionService - The service responsible for processing transactions.
   * @param actualApiService - The service for interacting with the Actual Budget API.
   * @param notesMigrator - The service for migrating notes to tags.
   */
  constructor(
    transactionService: TransactionServiceI,
    actualApiService: ActualApiServiceI,
    notesMigrator: NotesMigratorI,
  ) {
    this.transactionService = transactionService;
    this.actualApiService = actualApiService;
    this.notesMigrator = notesMigrator;
  }

  /**
   * Main entry point for the classification process.
   *
   * This method initializes the API, optionally syncs bank accounts, migrates notes to tags,
   * and processes transactions. It handles errors and ensures proper API shutdown.
   *
   * @returns A promise that resolves when the classification process is complete.
   */
  public async classify() {
    Logger.info('Starting classification process');
    let isBudgetOpen = false;
    try {
      await this.actualApiService.initializeApi();
      isBudgetOpen = true;

      try {
        if (isFeatureEnabled('syncAccountsBeforeClassify')) {
          await this.syncAccounts();
        }
      } catch (error) {
        Logger.error(
          'Bank sync failed, continuing with existing transactions:',
          formatError(error),
        );
      }

      await this.notesMigrator.migrateToTags();

      try {
        await this.transactionService.processTransactions();
      } catch (error) {
        if (this.isRateLimitError(error)) {
          Logger.error('Rate limit reached during transaction processing. Consider:');
          Logger.error('1. Adjusting rate limits in provider-limits.ts');
          Logger.error('2. Switching to a provider with higher limits');
          Logger.error('3. Breaking your processing into smaller batches');
        } else {
          Logger.error(
            'An error occurred during transaction processing:',
            formatError(error),
          );
        }
      }
    } catch (error) {
      Logger.error(
        'An error occurred:',
        formatError(error),
      );
    } finally {
      try {
        if (isBudgetOpen) {
          await this.actualApiService.shutdownApi();
        }
      } catch (shutdownError) {
        Logger.error('Error during API shutdown:', formatError(shutdownError));
      }
    }
  }

  /**
   * Syncs bank accounts using the Actual API service.
   *
   * It suppresses console logs during the sync process and logs success or failure.
   *
   * @returns A promise that resolves when the sync is complete.
   */
  async syncAccounts(): Promise<void> {
    Logger.info('Syncing bank accounts');
    try {
      await suppressConsoleLogsAsync(async () => this.actualApiService.runBankSync());
      Logger.info('Bank accounts synced');
    } catch (error) {
      Logger.error(
        'Error syncing bank accounts:',
        formatError(error),
      );
    }
  }

  /**
   * Checks if an error is related to rate limiting.
   *
   * @param error - The error object to check.
   * @returns True if the error indicates a rate limit was exceeded, false otherwise.
   */
  private isRateLimitError(error: unknown): boolean {
    if (!error) return false;

    const errorStr = formatError(error);
    return errorStr.includes('Rate limit')
           || errorStr.includes('rate limited')
           || errorStr.includes('rate_limit_exceeded')
           || (error instanceof Error
            && 'statusCode' in error
            && (error as unknown as { statusCode: number }).statusCode === 429);
  }
}

export default ActualAiService;
