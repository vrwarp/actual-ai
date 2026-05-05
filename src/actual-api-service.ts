import {
  APIAccountEntity,
  APICategoryEntity,
  APICategoryGroupEntity,
  APIPayeeEntity,
} from '@actual-app/api/@types/loot-core/src/server/api-models';
import { TransactionEntity, RuleEntity } from '@actual-app/api/@types/loot-core/src/types/models';
import { ActualApiServiceI } from './types';
import { mask } from './utils/log-utils';

/**
 * Service that acts as a wrapper around the Actual Budget API.
 * It provides methods to fetch data (categories, payees, accounts, transactions)
 * and perform actions (updates, syncing) on the Actual Budget instance.
 */
class ActualApiService implements ActualApiServiceI {
  private actualApiClient: typeof import('@actual-app/api');

  private fs: typeof import('fs');

  private readonly dataDir: string;

  private readonly serverURL: string;

  private readonly password: string;

  private readonly budgetId: string;

  private readonly e2ePassword: string;

  private readonly isDryRun: boolean;

  /**
   * Constructs the ActualApiService.
   *
   * @param actualApiClient - The Actual Budget API client library.
   * @param fs - The file system module for handling data directory operations.
   * @param dataDir - Directory path where budget data will be stored locally.
   * @param serverURL - The URL of the Actual Budget server.
   * @param password - The password for the Actual Budget server.
   * @param budgetId - The ID of the budget to interact with.
   * @param e2ePassword - The end-to-end encryption password (if applicable).
   * @param isDryRun - If true, write operations will be simulated/logged but not executed.
   */
  constructor(
    actualApiClient: typeof import('@actual-app/api'),
    fs: typeof import('fs'),
    dataDir: string,
    serverURL: string,
    password: string,
    budgetId: string,
    e2ePassword: string,
    isDryRun: boolean,
  ) {
    this.actualApiClient = actualApiClient;
    this.fs = fs;
    this.dataDir = dataDir;
    this.serverURL = serverURL;
    this.password = password;
    this.budgetId = budgetId;
    this.e2ePassword = e2ePassword;
    this.isDryRun = isDryRun;
  }

  /**
   * Initializes the connection to the Actual Budget API.
   * Ensures the data directory exists and downloads the specified budget.
   *
   * @returns A promise that resolves when the API is initialized and the budget is downloaded.
   * @throws Error if the budget download fails or connection parameters are incorrect.
   */
  public async initializeApi() {
    if (!this.fs.existsSync(this.dataDir)) {
      this.fs.mkdirSync(this.dataDir, { recursive: true, mode: 0o700 });
    }

    await this.actualApiClient.init({
      dataDir: this.dataDir,
      serverURL: this.serverURL,
      password: this.password,
    });

    try {
      if (this.e2ePassword) {
        await this.actualApiClient.downloadBudget(this.budgetId, {
          password: this.e2ePassword,
        });
      } else {
        await this.actualApiClient.downloadBudget(this.budgetId);
      }
      console.log('Budget downloaded');
    } catch (error: unknown) {
      let errorMessage = 'Failed to download budget';
      if (error instanceof Error) {
        errorMessage += `: ${error.message}`;
        if ('status' in error && typeof error.status === 'number') {
          errorMessage += ` (HTTP ${error.status})`;
        }
      }
      console.error(errorMessage);
      console.error('Full error details:', error);

      throw new Error(`Budget download failed. Verify that:
1. Budget ID "${this.budgetId}" is correct
2. Server URL "${this.serverURL}" is reachable
3. Password is correct
4. E2E password (if used) is valid`);
    }
  }

  /**
   * Shuts down the API connection.
   *
   * @returns A promise that resolves when the API has shut down.
   */
  public async shutdownApi() {
    await this.actualApiClient.shutdown();
  }

  /**
   * Retrieves all category groups from the budget.
   *
   * @returns A promise that resolves to an array of category groups.
   */
  public async getCategoryGroups(): Promise<APICategoryGroupEntity[]> {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return this.actualApiClient.getCategoryGroups();
  }

  /**
   * Retrieves all categories and category groups from the budget.
   *
   * @returns A promise that resolves to an array of categories and category groups.
   */
  public async getCategories(): Promise<(APICategoryEntity | APICategoryGroupEntity)[]> {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return this.actualApiClient.getCategories();
  }

  /**
   * Retrieves all payees from the budget.
   *
   * @returns A promise that resolves to an array of payees.
   */
  public async getPayees(): Promise<APIPayeeEntity[]> {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return this.actualApiClient.getPayees();
  }

  /**
   * Retrieves all accounts from the budget.
   *
   * @returns A promise that resolves to an array of accounts.
   */
  public async getAccounts(): Promise<APIAccountEntity[]> {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return this.actualApiClient.getAccounts();
  }

  /**
   * Retrieves all transactions from the budget.
   *
   * @returns A promise that resolves to an array of transactions.
   */
  public async getTransactions(): Promise<TransactionEntity[]> {
    let transactions: TransactionEntity[] = [];
    const accounts = await this.getAccounts();
    // eslint-disable-next-line no-restricted-syntax
    for (const account of accounts) {
      transactions = transactions.concat(
        await this.actualApiClient.getTransactions(account.id, '1990-01-01', '2030-01-01'),
      );
    }
    return transactions;
  }

  /**
   * Retrieves all rules from the budget.
   *
   * @returns A promise that resolves to an array of rules.
   */
  public async getRules(): Promise<RuleEntity[]> {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return this.actualApiClient.getRules();
  }

  /**
   * Retrieves rules associated with a specific payee.
   *
   * @param payeeId - The ID of the payee to fetch rules for.
   * @returns A promise that resolves to an array of rules for the given payee.
   */
  public async getPayeeRules(payeeId: string): Promise<RuleEntity[]> {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return this.actualApiClient.getPayeeRules(payeeId);
  }

  /**
   * Updates the notes of a transaction.
   *
   * @param id - The ID of the transaction to update.
   * @param notes - The new notes content.
   * @returns A promise that resolves when the update is complete.
   */
  public async updateTransactionNotes(id: string, notes: string): Promise<void> {
    if (this.isDryRun) {
      console.log(`DRY RUN: Would update transaction notes of ${id} to: ${mask(notes)}`);
      return;
    }
    await this.actualApiClient.updateTransaction(id, { notes });
  }

  /**
   * Updates both the notes and the category of a transaction.
   *
   * @param id - The ID of the transaction to update.
   * @param notes - The new notes content.
   * @param categoryId - The ID of the new category.
   * @returns A promise that resolves when the update is complete.
   */
  public async updateTransactionNotesAndCategory(
    id: string,
    notes: string,
    categoryId: string,
  ): Promise<void> {
    if (this.isDryRun) {
      console.log(`DRY RUN: Would update transaction notes ${id} to: ${mask(notes)} and category to ${mask(categoryId)}`);
      return;
    }
    await this.actualApiClient.updateTransaction(id, { notes, category: categoryId });
  }

  /**
   * Triggers a bank synchronization.
   *
   * @returns A promise that resolves when the sync is complete.
   */
  public async runBankSync(): Promise<void> {
    await this.actualApiClient.runBankSync();
  }

  /**
   * Creates a new category within a specific group.
   *
   * @param name - The name of the new category.
   * @param groupId - The ID of the group the category belongs to.
   * @returns A promise that resolves to the ID of the created category (or 'dry run').
   */
  public async createCategory(name: string, groupId: string): Promise<string> {
    if (this.isDryRun) {
      console.log(`DRY RUN: Would create category name: ${mask(name)} groupId: ${mask(groupId)}`);
      return 'dry run';
    }
    const result = await this.actualApiClient.createCategory({
      name,
      group_id: groupId,
    });

    return result;
  }

  /**
   * Creates a new category group.
   *
   * @param name - The name of the new category group.
   * @returns A promise that resolves to the ID of the created category group (or 'dry run').
   */
  public async createCategoryGroup(name: string): Promise<string> {
    if (this.isDryRun) {
      console.log(`DRY RUN: Would create category group: ${mask(name)}`);
      return 'dry run';
    }
    return this.actualApiClient.createCategoryGroup({
      name,
    });
  }

  /**
   * Updates the name of an existing category group.
   *
   * @param id - The ID of the category group to update.
   * @param name - The new name for the category group.
   * @returns A promise that resolves when the update is complete.
   */
  public async updateCategoryGroup(id: string, name: string): Promise<void> {
    if (this.isDryRun) {
      console.log(`DRY RUN: Would update category group name: ${mask(name)} groupId: ${mask(id)}`);
      return;
    }
    await this.actualApiClient.updateCategoryGroup(id, { name });
  }
}

export default ActualApiService;
