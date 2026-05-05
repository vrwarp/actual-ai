import {
  jest, describe, it, expect, beforeEach,
} from '@jest/globals';
import ActualApiService from '../src/actual-api-service';

// Mock dependencies
const mockActualApiClient = {
  init: jest.fn<() => Promise<void>>(),
  downloadBudget: jest.fn<() => Promise<void>>(),
  shutdown: jest.fn<() => Promise<void>>(),
  getCategoryGroups: jest.fn<() => Promise<unknown[]>>(),
  getCategories: jest.fn<() => Promise<unknown[]>>(),
  getPayees: jest.fn<() => Promise<unknown[]>>(),
  getAccounts: jest.fn<() => Promise<unknown[]>>(),
  getTransactions: jest.fn<() => Promise<unknown[]>>(),
  getRules: jest.fn<() => Promise<unknown[]>>(),
  getPayeeRules: jest.fn<() => Promise<unknown[]>>(),
  updateTransaction: jest.fn<() => Promise<void>>(),
  runBankSync: jest.fn<() => Promise<void>>(),
  createCategory: jest.fn<() => Promise<string>>(),
  createCategoryGroup: jest.fn<() => Promise<string>>(),
  updateCategoryGroup: jest.fn<() => Promise<void>>(),
};

const mockFs = {
  existsSync: jest.fn<() => boolean>(),
  mkdirSync: jest.fn<() => void>(),
};

describe('ActualApiService', () => {
  let service: ActualApiService;
  const dataDir = '/tmp/actual-data';
  const serverURL = 'http://localhost:5006';
  const password = 'password';
  const budgetId = 'test-budget';
  const e2ePassword = 'e2e-password';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  const createService = (isDryRun = false) => new ActualApiService(
      mockActualApiClient as unknown as typeof import('@actual-app/api'),
      mockFs as unknown as typeof import('fs'),
      dataDir,
      serverURL,
      password,
      budgetId,
      e2ePassword,
      isDryRun,
  );

  describe('initializeApi', () => {
    it('should initialize api and download budget', async () => {
      mockFs.existsSync.mockReturnValue(false);
      mockActualApiClient.init.mockResolvedValue(undefined);
      mockActualApiClient.downloadBudget.mockResolvedValue(undefined);

      service = createService();
      await service.initializeApi();

      expect(mockFs.existsSync).toHaveBeenCalledWith(dataDir);
      expect(mockFs.mkdirSync).toHaveBeenCalledWith(dataDir);
      expect(mockActualApiClient.init).toHaveBeenCalledWith({
        dataDir,
        serverURL,
        password,
      });
      expect(mockActualApiClient.downloadBudget).toHaveBeenCalledWith(budgetId, {
        password: e2ePassword,
      });
    });

    it('should download budget without e2e password if not provided', async () => {
      mockFs.existsSync.mockReturnValue(true);
      service = new ActualApiService(
        mockActualApiClient as unknown as typeof import('@actual-app/api'),
        mockFs as unknown as typeof import('fs'),
        dataDir,
        serverURL,
        password,
        budgetId,
        '',
        false,
      );

      await service.initializeApi();

      expect(mockActualApiClient.downloadBudget).toHaveBeenCalledWith(budgetId);
    });

    it('should throw error if download fails', async () => {
      mockActualApiClient.downloadBudget.mockRejectedValue(new Error('Connection failed'));
      service = createService();

      await expect(service.initializeApi()).rejects.toThrow('Budget download failed');
    });
  });

  describe('shutdownApi', () => {
    it('should shutdown api', async () => {
      service = createService();
      await service.shutdownApi();
      expect(mockActualApiClient.shutdown).toHaveBeenCalled();
    });
  });

  describe('Getters', () => {
    beforeEach(() => {
      service = createService();
    });

    it('should get category groups', async () => {
      const mockGroups = [{ id: '1', name: 'Group' }];
      mockActualApiClient.getCategoryGroups.mockResolvedValue(mockGroups);
      const result = await service.getCategoryGroups();
      expect(result).toEqual(mockGroups);
      expect(mockActualApiClient.getCategoryGroups).toHaveBeenCalled();
    });

    it('should get categories', async () => {
      const mockCategories = [{ id: '1', name: 'Category' }];
      mockActualApiClient.getCategories.mockResolvedValue(mockCategories);
      const result = await service.getCategories();
      expect(result).toEqual(mockCategories);
      expect(mockActualApiClient.getCategories).toHaveBeenCalled();
    });

    it('should get payees', async () => {
      const mockPayees = [{ id: '1', name: 'Payee' }];
      mockActualApiClient.getPayees.mockResolvedValue(mockPayees);
      const result = await service.getPayees();
      expect(result).toEqual(mockPayees);
      expect(mockActualApiClient.getPayees).toHaveBeenCalled();
    });

    it('should get accounts', async () => {
      const mockAccounts = [{ id: '1', name: 'Account' }];
      mockActualApiClient.getAccounts.mockResolvedValue(mockAccounts);
      const result = await service.getAccounts();
      expect(result).toEqual(mockAccounts);
      expect(mockActualApiClient.getAccounts).toHaveBeenCalled();
    });

    it('should get transactions', async () => {
      const mockAccounts = [{ id: '1', name: 'Account' }];
      mockActualApiClient.getAccounts.mockResolvedValue(mockAccounts);
      const mockTransactions = [{ id: '1', amount: 100 }];
      mockActualApiClient.getTransactions.mockResolvedValue(mockTransactions);
      const result = await service.getTransactions();
      expect(result).toEqual(mockTransactions);
      expect(mockActualApiClient.getTransactions).toHaveBeenCalledWith('1', '1990-01-01', '2030-01-01');
    });

    it('should get rules', async () => {
      const mockRules = [{ id: '1' }];
      mockActualApiClient.getRules.mockResolvedValue(mockRules);
      const result = await service.getRules();
      expect(result).toEqual(mockRules);
      expect(mockActualApiClient.getRules).toHaveBeenCalled();
    });

    it('should get payee rules', async () => {
      const mockRules = [{ id: '1' }];
      const payeeId = 'payee-1';
      mockActualApiClient.getPayeeRules.mockResolvedValue(mockRules);
      const result = await service.getPayeeRules(payeeId);
      expect(result).toEqual(mockRules);
      expect(mockActualApiClient.getPayeeRules).toHaveBeenCalledWith(payeeId);
    });
  });

  describe('Updates and Creations', () => {
    const id = 'test-id';
    const notes = 'test notes';
    const categoryId = 'cat-id';
    const name = 'New Category';
    const groupId = 'group-id';

    describe('Normal Mode', () => {
      beforeEach(() => {
        service = createService(false);
      });

      it('should update transaction notes', async () => {
        await service.updateTransactionNotes(id, notes);
        expect(mockActualApiClient.updateTransaction).toHaveBeenCalledWith(id, { notes });
      });

      it('should update transaction notes and category', async () => {
        await service.updateTransactionNotesAndCategory(id, notes, categoryId);
        expect(mockActualApiClient.updateTransaction).toHaveBeenCalledWith(id, { notes, category: categoryId });
      });

      it('should run bank sync', async () => {
        await service.runBankSync();
        expect(mockActualApiClient.runBankSync).toHaveBeenCalled();
      });

      it('should create category', async () => {
        mockActualApiClient.createCategory.mockResolvedValue(categoryId);
        const result = await service.createCategory(name, groupId);
        expect(result).toBe(categoryId);
        expect(mockActualApiClient.createCategory).toHaveBeenCalledWith({ name, group_id: groupId });
      });

      it('should create category group', async () => {
        mockActualApiClient.createCategoryGroup.mockResolvedValue(groupId);
        const result = await service.createCategoryGroup(name);
        expect(result).toBe(groupId);
        expect(mockActualApiClient.createCategoryGroup).toHaveBeenCalledWith({ name });
      });

      it('should update category group', async () => {
        await service.updateCategoryGroup(id, name);
        expect(mockActualApiClient.updateCategoryGroup).toHaveBeenCalledWith(id, { name });
      });
    });

    describe('Dry Run Mode', () => {
      beforeEach(() => {
        service = createService(true);
        jest.clearAllMocks();
      });

      it('should not update transaction notes in dry run', async () => {
        await service.updateTransactionNotes(id, notes);
        expect(mockActualApiClient.updateTransaction).not.toHaveBeenCalled();
      });

      it('should not update transaction notes and category in dry run', async () => {
        await service.updateTransactionNotesAndCategory(id, notes, categoryId);
        expect(mockActualApiClient.updateTransaction).not.toHaveBeenCalled();
      });

      it('should not create category in dry run', async () => {
        const result = await service.createCategory(name, groupId);
        expect(result).toBe('dry run');
        expect(mockActualApiClient.createCategory).not.toHaveBeenCalled();
      });

      it('should not create category group in dry run', async () => {
        const result = await service.createCategoryGroup(name);
        expect(result).toBe('dry run');
        expect(mockActualApiClient.createCategoryGroup).not.toHaveBeenCalled();
      });

      it('should not update category group in dry run', async () => {
        await service.updateCategoryGroup(id, name);
        expect(mockActualApiClient.updateCategoryGroup).not.toHaveBeenCalled();
      });
    });
  });
});
