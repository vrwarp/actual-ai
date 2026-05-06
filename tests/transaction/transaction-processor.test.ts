import { TransactionEntity } from '@actual-app/api/@types/loot-core/src/types/models';
import TransactionProcessor from '../../src/transaction/transaction-processor';
import TagService from '../../src/transaction/tag-service';
import {
  ActualApiServiceI,
  LlmServiceI,
  PromptGeneratorI,
  ProcessingStrategyI,
  UnifiedResponse,
} from '../../src/types';

describe('TransactionProcessor', () => {
  let actualApiService: jest.Mocked<ActualApiServiceI>;
  let llmService: jest.Mocked<LlmServiceI>;
  let promptGenerator: jest.Mocked<PromptGeneratorI>;
  let tagService: TagService;
  let transactionProcessor: TransactionProcessor;
  let mockStrategy: jest.Mocked<ProcessingStrategyI>;

  const mockTransaction: TransactionEntity = {
    id: 'tx1',
    amount: -1000,
    notes: 'Test transaction',
    date: '2023-01-01',
    account: 'acc1',
  } as TransactionEntity;

  beforeEach(() => {
    actualApiService = {
      updateTransactionNotes: jest.fn(),
    } as unknown as jest.Mocked<ActualApiServiceI>;

    llmService = {
      ask: jest.fn(),
    } as unknown as jest.Mocked<LlmServiceI>;

    promptGenerator = {
      generate: jest.fn().mockReturnValue('mocked prompt'),
    } as unknown as jest.Mocked<PromptGeneratorI>;

    tagService = new TagService('#miss', '#guess', '#override');

    mockStrategy = {
      isSatisfiedBy: jest.fn(),
      process: jest.fn(),
    } as unknown as jest.Mocked<ProcessingStrategyI>;

    transactionProcessor = new TransactionProcessor(
      actualApiService,
      llmService,
      promptGenerator,
      tagService,
      [mockStrategy],
    );
  });

  it('should process a transaction successfully when a strategy matches', async () => {
    // Arrange
    const mockResponse: UnifiedResponse = { type: 'existing', categoryId: 'cat1' };
    llmService.ask.mockResolvedValue(mockResponse);
    mockStrategy.isSatisfiedBy.mockReturnValue(true);
    mockStrategy.process.mockResolvedValue(undefined);

    const suggestedCategories = new Map();

    // Act
    await transactionProcessor.process(
      mockTransaction,
      [],
      [],
      [],
      [],
      [],
      suggestedCategories,
    );

    // Assert
    expect(promptGenerator.generate).toHaveBeenCalled();
    expect(llmService.ask).toHaveBeenCalledWith('mocked prompt');
    expect(mockStrategy.isSatisfiedBy).toHaveBeenCalledWith(mockResponse);
    expect(mockStrategy.process).toHaveBeenCalledWith(
      mockTransaction,
      mockResponse,
      [],
      suggestedCategories,
    );
    expect(actualApiService.updateTransactionNotes).not.toHaveBeenCalled();
  });

  it('should tag transaction as not guessed when no strategy matches', async () => {
    // Arrange
    const mockResponse: UnifiedResponse = { type: 'existing' }; // No categoryId
    llmService.ask.mockResolvedValue(mockResponse);
    mockStrategy.isSatisfiedBy.mockReturnValue(false);

    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    // Act
    await transactionProcessor.process(
      mockTransaction,
      [],
      [],
      [],
      [],
      [],
      new Map(),
    );

    // Assert
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Unexpected response format'));
    expect(actualApiService.updateTransactionNotes).toHaveBeenCalledWith(
      'tx1',
      'Test transaction #miss',
    );

    warnSpy.mockRestore();
  });

  it('should tag transaction as not guessed when LLM service throws an error', async () => {
    // Arrange
    llmService.ask.mockRejectedValue(new Error('LLM failure'));
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    // Act
    await transactionProcessor.process(
      mockTransaction,
      [],
      [],
      [],
      [],
      [],
      new Map(),
    );

    // Assert
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Error processing transaction tx1:'),
      expect.any(Error),
    );
    expect(actualApiService.updateTransactionNotes).toHaveBeenCalledWith(
      'tx1',
      'Test transaction #miss',
    );

    errorSpy.mockRestore();
  });

  it('should tag transaction as not guessed when strategy processing throws an error', async () => {
    // Arrange
    const mockResponse: UnifiedResponse = { type: 'existing', categoryId: 'cat1' };
    llmService.ask.mockResolvedValue(mockResponse);
    mockStrategy.isSatisfiedBy.mockReturnValue(true);
    mockStrategy.process.mockRejectedValue(new Error('Strategy failure'));
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    // Act
    await transactionProcessor.process(
      mockTransaction,
      [],
      [],
      [],
      [],
      [],
      new Map(),
    );

    // Assert
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Error processing transaction tx1:'),
      expect.any(Error),
    );
    expect(actualApiService.updateTransactionNotes).toHaveBeenCalledWith(
      'tx1',
      'Test transaction #miss',
    );

    errorSpy.mockRestore();
  });
});
