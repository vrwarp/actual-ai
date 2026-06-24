import * as actualApiClient from '@actual-app/api';
import fs from 'fs';
import ActualApiService from './actual-api-service';
import TransactionService from './transaction-service';
import LlmModelFactory from './llm-model-factory';
import {
  anthropicApiKey,
  anthropicBaseURL,
  anthropicModel,
  batchDelayMs,
  batchSize,
  budgetId,
  dataDir,
  e2ePassword,
  getEnabledTools,
  googleApiKey,
  googleBaseURL,
  googleModel,
  groqApiKey,
  groqBaseURL,
  groqModel,
  guessedTag,
  isFeatureEnabled,
  liveFlags,
  llmProvider,
  llmTimeoutMs,
  manualOverrideTag,
  notGuessedTag,
  ollamaBaseURL,
  ollamaModel,
  openaiApiKey,
  openaiBaseURL,
  openaiModel,
  openrouterApiKey,
  openrouterBaseURL,
  openrouterEnableToolCalling,
  openrouterModel,
  openrouterReferrer,
  openrouterTitle,
  password,
  promptTemplate,
  requestsPerMinuteOverride,
  serverURL,
  tokensPerMinuteOverride,
  valueSerpApiKey,
  ResolvedConfig,
} from './config';
import { ActualApiServiceI, LlmModelFactoryI, LlmServiceI } from './types';
import ActualAiService from './actual-ai';
import PromptGenerator from './prompt-generator';
import LlmService from './llm-service';
import ToolService from './utils/tool-service';
import SimilarityCalculator from './similarity-calculator';
import CategorySuggestionOptimizer from './category-suggestion-optimizer';
import NotesMigrator from './transaction/notes-migrator';
import TagService from './transaction/tag-service';
import RuleMatchStrategy from './transaction/processing-strategy/rule-match-strategy';
import ExistingCategoryStrategy from './transaction/processing-strategy/existing-category-strategy';
import NewCategoryStrategy from './transaction/processing-strategy/new-category-strategy';
import CategorySuggester from './transaction/category-suggester';
import BatchTransactionProcessor from './transaction/batch-transaction-processor';
import TransactionProcessor from './transaction/transaction-processor';
import TransactionFilterer from './transaction/transaction-filterer';
import RateLimiter from './utils/rate-limiter';

/**
 * Dependency injection container configuration.
 *
 * This file assembles the entire application by instantiating services with their dependencies
 * based on configuration settings. It serves as the composition root of the application.
 */

/**
 * Optional dependency overrides — used by the Web UI dry-run preview to inject a
 * read-only/mock Actual API service and a mock LLM factory without touching real
 * credentials or networks.
 */
export interface ContainerDeps {
  actualApiService?: ActualApiServiceI;
  llmModelFactory?: LlmModelFactoryI;
  /** Override the constructed LlmService entirely (used by the mock-agent preview). */
  llmService?: LlmServiceI;
}

// Create tool service if API key is available and tools are enabled.
// (Parameterless overload preserved for backwards compatibility / existing tests.)
export function createToolService(): ToolService | undefined {
  // freeWebSearch does not require ValueSerp; only the paid `webSearch` does.
  return getEnabledTools().length > 0 ? new ToolService(valueSerpApiKey) : undefined;
}

/**
 * Assemble the full service graph from a resolved configuration object.
 *
 * @param cfg - Fully resolved configuration (live config or a pending overlay).
 * @param deps - Optional service overrides (mock/read-only injection).
 */
export function buildContainer(
  cfg: ResolvedConfig,
  deps: ContainerDeps = {},
): { actualAi: ActualAiService; isDryRun: boolean } {
  const toolService = cfg.enabledTools.length > 0
    ? new ToolService(cfg.valueSerpApiKey)
    : undefined;

  const isDryRun = cfg.flags.dryRun;

  const builtFactory = deps.llmService ? undefined : new LlmModelFactory(
    cfg.llmProvider,
    cfg.openaiApiKey,
    cfg.openaiModel,
    cfg.openaiBaseURL,
    cfg.openrouterApiKey,
    cfg.openrouterModel,
    cfg.openrouterBaseURL,
    cfg.openrouterReferrer,
    cfg.openrouterTitle,
    cfg.anthropicBaseURL,
    cfg.anthropicApiKey,
    cfg.anthropicModel,
    cfg.googleModel,
    cfg.googleBaseURL,
    cfg.googleApiKey,
    cfg.ollamaModel,
    cfg.ollamaBaseURL,
    cfg.groqApiKey,
    cfg.groqModel,
    cfg.groqBaseURL,
  );
  const llmModelFactory = deps.llmModelFactory ?? builtFactory;

  const actualApiService = deps.actualApiService ?? new ActualApiService(
    actualApiClient,
    fs,
    cfg.dataDir,
    cfg.serverURL,
    cfg.password,
    cfg.budgetId,
    cfg.e2ePassword,
    isDryRun,
  );

  const tagService = new TagService(cfg.notGuessedTag, cfg.guessedTag, cfg.manualOverrideTag);

  const promptGenerator = new PromptGenerator(cfg.promptTemplate, tagService);

  const llmService = deps.llmService ?? new LlmService(
    llmModelFactory!,
    new RateLimiter(true),
    cfg.flags.disableRateLimiter,
    toolService,
    {
      timeoutMs: cfg.llmTimeoutMs,
      openrouterEnableToolCalling: cfg.openrouterEnableToolCalling,
      requestsPerMinuteOverride: cfg.requestsPerMinuteOverride,
      tokensPerMinuteOverride: cfg.tokensPerMinuteOverride,
    },
  );

  const ruleMatchStrategy = new RuleMatchStrategy(actualApiService, tagService);
  const existingCategoryStrategy = new ExistingCategoryStrategy(actualApiService, tagService);

  const categorySuggester = new CategorySuggester(
    actualApiService,
    new CategorySuggestionOptimizer(new SimilarityCalculator()),
    tagService,
  );

  const newCategoryStrategy = new NewCategoryStrategy();

  const transactionProcessor = new TransactionProcessor(
    actualApiService,
    llmService,
    promptGenerator,
    tagService,
    [ruleMatchStrategy, existingCategoryStrategy, newCategoryStrategy],
  );

  const batchTransactionProcessor = new BatchTransactionProcessor(
    transactionProcessor,
    cfg.batchSize,
    cfg.batchDelayMs,
  );

  const transactionFilterer = new TransactionFilterer(tagService);

  const transactionService = new TransactionService(
    actualApiService,
    categorySuggester,
    batchTransactionProcessor,
    transactionFilterer,
    isDryRun,
  );

  const notesMigrator = new NotesMigrator(actualApiService, tagService);

  const actualAi = new ActualAiService(transactionService, actualApiService, notesMigrator);

  return { actualAi, isDryRun };
}

// Eager default: build from the live named exports. Never calls `resolveConfig`,
// so the literal config mock in tests/container.test.ts constructs cleanly.
const liveConfig: ResolvedConfig = {
  llmProvider,
  openaiApiKey,
  openaiModel,
  openaiBaseURL,
  openrouterApiKey,
  openrouterModel,
  openrouterBaseURL,
  openrouterReferrer,
  openrouterTitle,
  openrouterEnableToolCalling,
  anthropicApiKey,
  anthropicModel,
  anthropicBaseURL,
  googleApiKey,
  googleModel,
  googleBaseURL,
  ollamaModel,
  ollamaBaseURL,
  groqApiKey,
  groqModel,
  groqBaseURL,
  serverURL,
  password,
  budgetId,
  e2ePassword,
  dataDir,
  notGuessedTag,
  guessedTag,
  manualOverrideTag,
  promptTemplate,
  batchSize,
  batchDelayMs,
  llmTimeoutMs,
  valueSerpApiKey,
  requestsPerMinuteOverride,
  tokensPerMinuteOverride,
  enabledTools: getEnabledTools(),
  flags: typeof liveFlags === 'function'
    ? liveFlags()
    : {
      dryRun: isFeatureEnabled('dryRun'),
      disableRateLimiter: isFeatureEnabled('disableRateLimiter'),
      suggestNewCategories: isFeatureEnabled('suggestNewCategories'),
      rerunMissedTransactions: isFeatureEnabled('rerunMissedTransactions'),
      syncAccountsBeforeClassify: isFeatureEnabled('syncAccountsBeforeClassify'),
    },
};

const { actualAi } = buildContainer(liveConfig);

export default actualAi;
