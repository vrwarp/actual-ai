import {
  APIAccountEntity,
  APICategoryEntity,
  APICategoryGroupEntity,
  APIPayeeEntity,
} from '@actual-app/core/src/server/api-models';
import { TransactionEntity, RuleEntity } from '@actual-app/core/src/types/models';
import { ActualApiServiceI } from '../../types';

/**
 * Deterministic in-memory Actual Budget dataset for the Web UI dry-run preview and
 * for visual validation. No network, no sqlite, no real credentials.
 */

export const MOCK_GROUPS: APICategoryGroupEntity[] = [
  {
    id: 'grp-food',
    name: 'Food',
    categories: [
      { id: 'cat-groceries', name: 'Groceries', group_id: 'grp-food' },
      { id: 'cat-dining', name: 'Dining Out', group_id: 'grp-food' },
    ],
  },
  {
    id: 'grp-transport',
    name: 'Transport',
    categories: [
      { id: 'cat-fuel', name: 'Fuel', group_id: 'grp-transport' },
      { id: 'cat-transit', name: 'Public Transit', group_id: 'grp-transport' },
    ],
  },
  {
    id: 'grp-bills',
    name: 'Bills & Utilities',
    categories: [
      { id: 'cat-utilities', name: 'Utilities', group_id: 'grp-bills' },
      { id: 'cat-subscriptions', name: 'Subscriptions', group_id: 'grp-bills' },
    ],
  },
  {
    id: 'grp-shopping',
    name: 'Shopping',
    categories: [
      { id: 'cat-general', name: 'General Merchandise', group_id: 'grp-shopping' },
    ],
  },
];

const FLAT_CATEGORIES: APICategoryEntity[] = MOCK_GROUPS.flatMap((g) => g.categories ?? []);

export const MOCK_ACCOUNTS: APIAccountEntity[] = [
  { id: 'acc-checking', name: 'Checking', offbudget: false },
  { id: 'acc-credit', name: 'Credit Card', offbudget: false },
  { id: 'acc-savings', name: 'Savings (off budget)', offbudget: true },
];

export const MOCK_PAYEES: APIPayeeEntity[] = [
  { id: 'pay-wholefoods', name: 'Whole Foods Market' },
  { id: 'pay-starbucks', name: 'Starbucks' },
  { id: 'pay-shell', name: 'Shell Gas Station' },
  { id: 'pay-uber', name: 'Uber Trip' },
  { id: 'pay-netflix', name: 'Netflix' },
  { id: 'pay-amazon', name: 'Amazon' },
  { id: 'pay-electric', name: 'City Electric Utility' },
  { id: 'pay-paws', name: 'Pawsome Pet Grooming' },
  { id: 'pay-salary', name: 'ACME Payroll' },
];

function tx(partial: Partial<TransactionEntity> & { id: string; account: string; amount: number; date: string }): TransactionEntity {
  return { cleared: true, ...partial } as TransactionEntity;
}

export const MOCK_TRANSACTIONS: TransactionEntity[] = [
  // Uncategorized — should be classified by the mock agent
  tx({
    id: 't1', account: 'acc-checking', amount: -5421, date: '2026-06-01', payee: 'pay-wholefoods', imported_payee: 'WHOLEFDS #123',
  }),
  tx({
    id: 't2', account: 'acc-credit', amount: -612, date: '2026-06-02', payee: 'pay-starbucks', imported_payee: 'STARBUCKS',
  }),
  tx({
    id: 't3', account: 'acc-credit', amount: -4810, date: '2026-06-03', payee: 'pay-shell', imported_payee: 'SHELL OIL',
  }),
  tx({
    id: 't4', account: 'acc-checking', amount: -1899, date: '2026-06-04', payee: 'pay-uber', imported_payee: 'UBER *TRIP',
  }),
  tx({
    id: 't5', account: 'acc-credit', amount: -1599, date: '2026-06-05', payee: 'pay-netflix', imported_payee: 'NETFLIX.COM',
  }),
  tx({
    id: 't6', account: 'acc-credit', amount: -8732, date: '2026-06-06', payee: 'pay-amazon', imported_payee: 'AMZN MKTP',
  }),
  tx({
    id: 't7', account: 'acc-checking', amount: -11200, date: '2026-06-07', payee: 'pay-electric', imported_payee: 'CITY ELECTRIC',
  }),
  // Unfamiliar merchant — exercises the "suggest new category" path
  tx({
    id: 't8', account: 'acc-credit', amount: -6500, date: '2026-06-08', payee: 'pay-paws', imported_payee: 'PAWSOME GROOM',
  }),
  // Already categorized — should be filtered out
  tx({
    id: 't9', account: 'acc-checking', amount: -3000, date: '2026-06-09', payee: 'pay-wholefoods', category: 'cat-groceries',
  }),
  // Income, off-budget account — should be filtered out
  tx({
    id: 't10', account: 'acc-savings', amount: 250000, date: '2026-06-10', payee: 'pay-salary', imported_payee: 'ACME PAYROLL',
  }),
  // Previously missed (tagged) — filtered unless rerunMissedTransactions
  tx({
    id: 't11', account: 'acc-credit', amount: -999, date: '2026-06-11', payee: 'pay-amazon', notes: '#actual-ai-miss',
  }),
  // Transfer — filtered out
  tx({
    id: 't12', account: 'acc-checking', amount: -50000, date: '2026-06-12', transfer_id: 'xfer-1',
  }),
];

export class MockActualApiService implements ActualApiServiceI {
  // eslint-disable-next-line class-methods-use-this
  async initializeApi(): Promise<void> { /* no-op */ }

  // eslint-disable-next-line class-methods-use-this
  async shutdownApi(): Promise<void> { /* no-op */ }

  // eslint-disable-next-line class-methods-use-this
  async getCategoryGroups(): Promise<APICategoryGroupEntity[]> { return MOCK_GROUPS; }

  // eslint-disable-next-line class-methods-use-this
  async getCategories(): Promise<(APICategoryEntity | APICategoryGroupEntity)[]> {
    return FLAT_CATEGORIES;
  }

  // eslint-disable-next-line class-methods-use-this
  async getAccounts(): Promise<APIAccountEntity[]> { return MOCK_ACCOUNTS; }

  // eslint-disable-next-line class-methods-use-this
  async getPayees(): Promise<APIPayeeEntity[]> { return MOCK_PAYEES; }

  // eslint-disable-next-line class-methods-use-this
  async getTransactions(): Promise<TransactionEntity[]> { return MOCK_TRANSACTIONS; }

  // eslint-disable-next-line class-methods-use-this
  async getRules(): Promise<RuleEntity[]> { return []; }

  // eslint-disable-next-line class-methods-use-this
  async getPayeeRules(): Promise<RuleEntity[]> { return []; }

  // eslint-disable-next-line class-methods-use-this
  async updateTransactionNotes(): Promise<void> { /* no-op */ }

  // eslint-disable-next-line class-methods-use-this
  async updateTransactionNotesAndCategory(): Promise<void> { /* no-op */ }

  // eslint-disable-next-line class-methods-use-this
  async runBankSync(): Promise<void> { /* no-op */ }

  // eslint-disable-next-line class-methods-use-this
  async createCategory(): Promise<string> { return 'mock-cat'; }

  // eslint-disable-next-line class-methods-use-this
  async createCategoryGroup(): Promise<string> { return 'mock-grp'; }

  // eslint-disable-next-line class-methods-use-this
  async updateCategoryGroup(): Promise<void> { /* no-op */ }
}

export default MockActualApiService;
