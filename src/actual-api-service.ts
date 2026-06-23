import {
  APIAccountEntity,
  APICategoryEntity,
  APICategoryGroupEntity,
  APIPayeeEntity,
} from '@actual-app/core/src/server/api-models';
import path from 'path';
import { TransactionEntity, RuleEntity } from '@actual-app/core/src/types/models';
import { ActualApiServiceI } from './types';
import { mask } from './utils/log-utils';

function isErrnoException(error: unknown): error is Error & { code?: string } {
  return error instanceof Error;
}

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

  private lockFd: number | null = null;

  private readonly lockPath: string;

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
    this.lockPath = path.join(this.dataDir, '.actual-ai.lock');
  }

  private acquireDataDirLock() {
    // Prevent multiple concurrent runs from sharing the same dataDir. The underlying
    // Actual sqlite DB is not safe for concurrent writers and can end up "out-of-sync".
    if (!this.fs.existsSync(this.dataDir)) {
      this.fs.mkdirSync(this.dataDir, { recursive: true });
    }

    if (this.fs.existsSync(this.lockPath)) {
      try {
        const raw = this.fs.readFileSync(this.lockPath, 'utf8');
        const parsed = JSON.parse(raw) as { pid?: number; startedAt?: string };
        const pid = parsed?.pid;
        if (typeof pid === 'number') {
          try {
            process.kill(pid, 0);
            throw new Error(
              `Another actual-ai run appears active (pid=${pid}). `
              + `Refusing to use shared dataDir: ${this.dataDir}`,
            );
          } catch (error: unknown) {
            if (isErrnoException(error) && error.code === 'ESRCH') {
              // Stale lock from a crashed process; remove it.
              this.fs.unlinkSync(this.lockPath);
            } else if (error instanceof Error) {
              // process.kill threw, but it's not ESRCH; rethrow.
              throw error;
            }
          }
        } else {
          // Unparseable/stale lock; remove it.
          this.fs.unlinkSync(this.lockPath);
        }
      } catch (e) {
        // If anything goes wrong reading the lock, fail safe.
        throw e instanceof Error ? e : new Error('Failed to read dataDir lock');
      }
    }

    // 'wx' creates exclusively; throws if exists.
    this.lockFd = this.fs.openSync(this.lockPath, 'wx');
    this.fs.writeFileSync(
      this.lockFd,
      JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }),
    );
  }

  private releaseDataDirLock() {
    try {
      if (this.lockFd !== null) {
        this.fs.closeSync(this.lockFd);
        this.lockFd = null;
      }
      if (this.fs.existsSync(this.lockPath)) {
        this.fs.unlinkSync(this.lockPath);
      }
    } catch {
      // Best-effort cleanup.
    }
  }

  /**
   * Initializes the connection to the Actual Budget API.
   * Ensures the data directory exists and downloads the specified budget.
   *
   * @returns A promise that resolves when the API is initialized and the budget is downloaded.
   * @throws Error if the budget download fails or connection parameters are incorrect.
   */
  public async initializeApi() {
    this.acquireDataDirLock();

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

      await this.actualApiClient.shutdown();
      this.releaseDataDirLock();

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
    this.releaseDataDirLock();
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
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
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
    if (this.isDryRun) {
      console.log('DRY RUN: Would run bank sync');
      return;
    }
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
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const result = await this.actualApiClient.createCategory({
      name,
      group_id: groupId,
    });

    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
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
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
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
