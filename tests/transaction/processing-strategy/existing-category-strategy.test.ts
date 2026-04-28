import ExistingCategoryStrategy from '../../../src/transaction/processing-strategy/existing-category-strategy';
import TagService from '../../../src/transaction/tag-service';
import type { ActualApiServiceI, UnifiedResponse } from '../../../src/types';
import GivenActualData from '../../test-doubles/given/given-actual-data';

describe('ExistingCategoryStrategy', () => {
  let strategy: ExistingCategoryStrategy;
  let mockActualApiService: jest.Mocked<ActualApiServiceI>;
  let tagService: TagService;

  beforeEach(() => {
    mockActualApiService = {
      updateTransactionNotes: jest.fn(),
      updateTransactionNotesAndCategory: jest.fn(),
    } as unknown as jest.Mocked<ActualApiServiceI>;

    tagService = new TagService('#miss', '#guess', '#over');
    strategy = new ExistingCategoryStrategy(mockActualApiService, tagService);
  });

  describe('isSatisfiedBy', () => {
    it('should return true if type is "existing" and categoryId is present', () => {
      const response: UnifiedResponse = {
        type: 'existing',
        categoryId: 'cat1',
      };
      expect(strategy.isSatisfiedBy(response)).toBe(true);
    });

    it('should return false if categoryId is missing', () => {
      const response: UnifiedResponse = {
        type: 'existing',
      };
      expect(strategy.isSatisfiedBy(response)).toBe(false);
    });

    it('should return false if type is not "existing"', () => {
      const response: UnifiedResponse = {
        type: 'new',
        categoryId: 'cat1',
      };
      expect(strategy.isSatisfiedBy(response)).toBe(false);
    });
  });

  describe('process', () => {
    const transaction = GivenActualData.createTransaction('t1', 100, 'payee1');
    const categories = GivenActualData.createSampleCategories();

    it('should throw error if categoryId is missing in response', async () => {
      const response: UnifiedResponse = {
        type: 'existing',
      };
      await expect(strategy.process(transaction, response, categories)).rejects.toThrow('No categoryId in response');
    });

    it('should update notes and category if category exists', async () => {
      const categoryId = GivenActualData.CATEGORY_GROCERIES;
      const response: UnifiedResponse = {
        type: 'existing',
        categoryId,
      };

      await strategy.process(transaction, response, categories);

      expect(mockActualApiService.updateTransactionNotesAndCategory).toHaveBeenCalledWith(
        transaction.id,
        '#guess',
        categoryId,
      );
    });

    it('should update notes with "not guessed" tag if category does not exist', async () => {
      const response: UnifiedResponse = {
        type: 'existing',
        categoryId: 'non-existent',
      };

      await strategy.process(transaction, response, categories);

      expect(mockActualApiService.updateTransactionNotes).toHaveBeenCalledWith(
        transaction.id,
        '#miss',
      );
      expect(mockActualApiService.updateTransactionNotesAndCategory).not.toHaveBeenCalled();
    });

    it('should preserve existing notes when tagging', async () => {
      const transactionWithNotes = GivenActualData.createTransaction('t1', 100, 'payee1', 'Original notes');
      const categoryId = GivenActualData.CATEGORY_GROCERIES;
      const response: UnifiedResponse = {
        type: 'existing',
        categoryId,
      };

      await strategy.process(transactionWithNotes, response, categories);

      expect(mockActualApiService.updateTransactionNotesAndCategory).toHaveBeenCalledWith(
        transactionWithNotes.id,
        'Original notes #guess',
        categoryId,
      );
    });
  });
});
