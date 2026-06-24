import {
  APIAccountEntity,
  APIPayeeEntity,
} from '@actual-app/core/src/server/api-models';
import { TransactionEntity, RuleEntity } from '@actual-app/core/src/types/models';
import { ActualApiServiceI, APICategoryEntity, APICategoryGroupEntity } from '../types';

/**
 * A write-capturing, never-writing wrapper around an {@link ActualApiServiceI}.
 *
 * All read methods forward to the inner service. All mutating methods record the
 * intended change and return a safe placeholder WITHOUT ever forwarding — so a
 * dry-run preview can show "what would happen" while being structurally incapable
 * of modifying the user's budget, regardless of the dryRun flag.
 */
export interface RecordedWrite {
  kind: 'updateNotes' | 'updateNotesAndCategory' | 'createCategory' | 'createCategoryGroup' | 'updateCategoryGroup' | 'bankSync';
  id?: string;
  notes?: string;
  categoryId?: string;
  name?: string;
  groupId?: string;
}

export class RecordingActualApiService implements ActualApiServiceI {
  private readonly inner: ActualApiServiceI;

  public readonly writes: RecordedWrite[] = [];

  constructor(inner: ActualApiServiceI) {
    this.inner = inner;
  }

  initializeApi(): Promise<void> { return this.inner.initializeApi(); }

  shutdownApi(): Promise<void> { return this.inner.shutdownApi(); }

  getCategoryGroups(): Promise<APICategoryGroupEntity[]> { return this.inner.getCategoryGroups(); }

  getCategories(): Promise<(APICategoryEntity | APICategoryGroupEntity)[]> {
    return this.inner.getCategories();
  }

  getAccounts(): Promise<APIAccountEntity[]> { return this.inner.getAccounts(); }

  getPayees(): Promise<APIPayeeEntity[]> { return this.inner.getPayees(); }

  getTransactions(): Promise<TransactionEntity[]> { return this.inner.getTransactions(); }

  getRules(): Promise<RuleEntity[]> { return this.inner.getRules(); }

  getPayeeRules(payeeId: string): Promise<RuleEntity[]> { return this.inner.getPayeeRules(payeeId); }

  async updateTransactionNotes(id: string, notes: string): Promise<void> {
    this.writes.push({ kind: 'updateNotes', id, notes });
  }

  async updateTransactionNotesAndCategory(
    id: string,
    notes: string,
    categoryId: string,
  ): Promise<void> {
    this.writes.push({
      kind: 'updateNotesAndCategory', id, notes, categoryId,
    });
  }

  async runBankSync(): Promise<void> {
    this.writes.push({ kind: 'bankSync' });
  }

  async createCategory(name: string, groupId: string): Promise<string> {
    this.writes.push({ kind: 'createCategory', name, groupId });
    return 'preview-category';
  }

  async createCategoryGroup(name: string): Promise<string> {
    this.writes.push({ kind: 'createCategoryGroup', name });
    return 'preview-group';
  }

  async updateCategoryGroup(id: string, name: string): Promise<void> {
    this.writes.push({ kind: 'updateCategoryGroup', id, name });
  }
}

export default RecordingActualApiService;
