import {
  jest, describe, it, expect,
} from '@jest/globals';

// Mock config module
jest.mock('../src/config', () => ({
  anthropicApiKey: 'key',
  anthropicBaseURL: 'url',
  anthropicModel: 'model',
  budgetId: 'budget-id',
  dataDir: 'data-dir',
  e2ePassword: 'pass',
  getEnabledTools: jest.fn(() => []),
  googleApiKey: 'key',
  googleBaseURL: 'url',
  googleModel: 'model',
  groqApiKey: 'key',
  groqBaseURL: 'url',
  groqModel: 'model',
  guessedTag: 'guessed',
  isFeatureEnabled: jest.fn(() => false),
  llmProvider: 'openai',
  manualOverrideTag: 'override',
  notGuessedTag: 'not-guessed',
  ollamaBaseURL: 'url',
  ollamaModel: 'model',
  openaiApiKey: 'key',
  openaiBaseURL: 'url',
  openaiModel: 'model',
  password: 'pass',
  promptTemplate: 'template',
  serverURL: 'url',
  valueSerpApiKey: 'key',
}));

// Mock other dependencies that have side effects or external connections
jest.mock('@actual-app/api', () => ({}));
jest.mock('fs', () => ({}));
jest.mock('../src/actual-api-service');
jest.mock('../src/transaction-service');
jest.mock('../src/llm-model-factory');
jest.mock('../src/actual-ai');
jest.mock('../src/prompt-generator');
jest.mock('../src/llm-service');
jest.mock('../src/utils/tool-service');
jest.mock('../src/similarity-calculator');
jest.mock('../src/category-suggestion-optimizer');
jest.mock('../src/transaction/notes-migrator');
jest.mock('../src/transaction/tag-service');
jest.mock('../src/transaction/processing-strategy/rule-match-strategy');
jest.mock('../src/transaction/processing-strategy/existing-category-strategy');
jest.mock('../src/transaction/processing-strategy/new-category-strategy');
jest.mock('../src/transaction/category-suggester');
jest.mock('../src/transaction/batch-transaction-processor');
jest.mock('../src/transaction/transaction-processor');
jest.mock('../src/transaction/transaction-filterer');
jest.mock('../src/utils/rate-limiter');

describe('Container', () => {
  it('should resolve ActualAiService', async () => {
    // We just need to import the file to trigger the code
    // effectively testing that all dependency injections work without errors
    const actualAi = (await import('../src/container')).default;
    expect(actualAi).toBeDefined();
  });
});
