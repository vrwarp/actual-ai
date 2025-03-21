import {
  APIAccountEntity,
  APICategoryEntity,
  APICategoryGroupEntity,
  APIPayeeEntity,
} from '@actual-app/api/@types/loot-core/server/api-models';
import { TransactionEntity } from '@actual-app/api/@types/loot-core/types/models';
import { ActualApiServiceI } from './types';

class ActualApiService implements ActualApiServiceI {
  private actualApiClient: typeof import('@actual-app/api');

  private fs: typeof import('fs');

  private readonly dataDir: string;

  private readonly serverURL: string;

  private readonly password: string;

  private readonly budgetId: string;

  private readonly e2ePassword: string;

  private readonly dryRun: boolean;

  constructor(
    actualApiClient: typeof import('@actual-app/api'),
    fs: typeof import('fs'),
    dataDir: string,
    serverURL: string,
    password: string,
    budgetId: string,
    e2ePassword: string,
    dryRun: boolean,
  ) {
    this.actualApiClient = actualApiClient;
    this.fs = fs;
    this.dataDir = dataDir;
    this.serverURL = serverURL;
    this.password = password;
    this.budgetId = budgetId;
    this.e2ePassword = e2ePassword;
    this.dryRun = dryRun;
  }

  public async initializeApi() {
    if (this.dryRun) {
      console.log('ActualApiService is initialized in dry run mode. No write operations will be performed.');
    }

    if (!this.fs.existsSync(this.dataDir)) {
      this.fs.mkdirSync(this.dataDir);
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

  public async shutdownApi() {
    await this.actualApiClient.shutdown();
  }

  public async getCategoryGroups(): Promise<APICategoryGroupEntity[]> {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return this.actualApiClient.getCategoryGroups();
  }

  public async getCategories(): Promise<(APICategoryEntity | APICategoryGroupEntity)[]> {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return this.actualApiClient.getCategories();
  }

  public async getPayees(): Promise<APIPayeeEntity[]> {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return this.actualApiClient.getPayees();
  }

  public async getAccounts(): Promise<APIAccountEntity[]> {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return this.actualApiClient.getAccounts();
  }

  public async getTransactions(): Promise<TransactionEntity[]> {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return this.actualApiClient.getTransactions(undefined, undefined, undefined);
  }

  public async updateTransactionNotes(id: string, notes: string): Promise<void> {
    if (this.dryRun) {
      console.log(`Dry run: updateTransactionNotes(id:${id}, notes: ${notes})`);
      return;
    }
    await this.actualApiClient.updateTransaction(id, { notes });
  }

  public async updateTransactionNotesAndCategory(
    id: string,
    notes: string,
    categoryId: string,
  ): Promise<void> {
    if (this.dryRun) {
      console.log(`Dry run: updateTransactionNotesAndCategory(id:${id}, notes: ${notes}, categoryId: ${categoryId})`);
      return;
    }
    await this.actualApiClient.updateTransaction(id, { notes, category: categoryId });
  }

  public async runBankSync(): Promise<void> {
    if (this.dryRun) {
      console.log('Dry run: runBankSync');
      return;
    }
    await this.actualApiClient.runBankSync();
  }
}

export default ActualApiService;
