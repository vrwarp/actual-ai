import * as actualApiClient from '@actual-app/api';
import fs from 'fs';
import ActualApiService from './actual-api-service';
import TransactionService from './transaction-service';
import LlmModelFactory from './llm-model-factory';
import {
  anthropicApiKey,
  anthropicBaseURL,
  anthropicModel,
  budgetId,
  dataDir,
  dryRun,
  e2ePassword,
  googleApiKey,
  googleBaseURL,
  googleModel,
  groqApiKey,
  groqBaseURL,
  groqModel,
  guessedTag,
  llmProvider,
  manualPromptTemplate,
  notGuessedTag,
  ollamaBaseURL,
  ollamaModel,
  overrideTag,
  openaiApiKey,
  openaiBaseURL,
  openaiModel,
  password,
  promptTemplate,
  serverURL,
  syncAccountsBeforeClassify,
} from './config';
import ActualAiService from './actual-ai';
import PromptGenerator from './prompt-generator';
import LlmService from './llm-service';

const llmModelFactory = new LlmModelFactory(
  llmProvider,
  openaiApiKey,
  openaiModel,
  openaiBaseURL,
  anthropicBaseURL,
  anthropicApiKey,
  anthropicModel,
  googleModel,
  googleBaseURL,
  googleApiKey,
  ollamaModel,
  ollamaBaseURL,
  groqApiKey,
  groqModel,
  groqBaseURL,
);

const actualApiService = new ActualApiService(
  actualApiClient,
  fs,
  dataDir,
  serverURL,
  password,
  budgetId,
  e2ePassword,
  dryRun,
);

const llmService = new LlmService(
  llmModelFactory,
);

const promptGenerator = new PromptGenerator(promptTemplate);
const manualPromptGenerator = new PromptGenerator(manualPromptTemplate);

const transactionService = new TransactionService(
  actualApiService,
  llmService,
  promptGenerator,
  manualPromptGenerator,
  notGuessedTag,
  guessedTag,
  overrideTag,
);

const actualAi = new ActualAiService(
  transactionService,
  actualApiService,
  syncAccountsBeforeClassify,
);

export default actualAi;
