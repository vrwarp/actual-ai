# Changelog

This file documents the changes made to the `actual-ai` repository since it was originally cloned from `https://github.com/sakowicz/actual-ai`.

## File System Changes

- **Removed:** `.nvmrc`

## Root Directory

- **`.dockerignore`**: No significant changes.
- **`.env.example`**:
    - Removed `FEATURES` and `ENABLED_TOOLS` variables.
    - Simplified `PROMPT_TEMPLATE`.
    - Added `CLASSIFY_ON_STARTUP` and `SYNC_ACCOUNTS_BEFORE_CLASSIFY` variables.
- **`.eslintrc.json`**:
    - Minor change in the `@typescript-eslint/no-unused-vars` rule.
- **`.gitignore`**:
    - Removed `*.log` entry.
- **`Dockerfile`**:
    - Changed base image from `node:22.21-alpine3.22` to `node:18.20-alpine3.20`.
    - Removed installation of build dependencies.
    - Changed working directory from `/opt/node_app` to `/home/node/opt/node_app`.
- **`docker-compose.yml`**:
    - Updated volume paths to reflect the new working directory in the `Dockerfile`.
- **`jest.config.js`**: No changes.
- **`modules.d.ts`**: No changes.
- **`package.json`**:
    - **Version:** Updated from `1.7.8` to `1.8.0`
    - **Dependencies:**
        - `@actual-app/api`: `^25.11.0` -> `^25.3.1`
        - `@ai-sdk/anthropic`: `^1.2.9` -> `^1.1.6`
        - `@ai-sdk/google`: `^1.2.12` -> `^1.1.11`
        - `@ai-sdk/groq`: `^1.2.7` -> `^1.1.6`
        - `@ai-sdk/openai`: `^1.3.10` -> `^1.1.9`
        - `ai`: `^4.3.5` -> `^4.1.28`
        - `dotenv`: `^16.5.0` -> `^16.4.7`
        - `@types/node`: `^22.14.1` -> `^22.13.1`
        - `@typescript-eslint/eslint-plugin`: `^8.29.1` -> `^8.24.1`
        - `@typescript-eslint/parser`: `^8.29.1` -> `^8.25.0`
        - `ts-jest`: `^29.3.2` -> `^29.2.5`
    - **Removed Dependencies:**
        - `axios`
        - `zod`
- **`README.md`**:
    - The `README.md` file has been significantly updated to reflect the changes in the application's functionality. The following sections and features have been removed from the documentation:
        - Web search
        - New category suggestions
        - Dry run mode
    - The `docker-compose.yml` example has been updated to remove the environment variables associated with these features.
- **`tsconfig.json`**: No changes.

## `src` Directory

- **`actual-ai.ts`**:
    - Removed `NotesMigratorI`.
    - Replaced `isFeatureEnabled` with a `syncAccountsBeforeClassify` boolean.
    - Removed `formatError` utility.
    - Removed rate limit handling logic.
    - `migrateToTags` is now called on `transactionService`.
- **`actual-api-service.ts`**:
    - Renamed `isDryRun` to `dryRun`.
    - Removed `getRules`, `getPayeeRules`, `createCategory`, `createCategoryGroup`, and `updateCategoryGroup` methods.
    - Updated dry run log messages.
- **`config.ts`**:
    - Removed the feature flag system.
    - `classifyOnStartup` and `syncAccountsBeforeClassify` are now simple boolean flags.
    - Added `manualPromptTemplate` and `overrideTag` variables.
    - `dryRun` is now a simple boolean flag.
- **`container.ts`**:
    - Significantly simplified the container.
    - Removed many services, including `ToolService`, `SimilarityCalculator`, `CategorySuggestionOptimizer`, `NotesMigrator`, `TagService`, `RuleMatchStrategy`, `ExistingCategoryStrategy`, `NewCategoryStrategy`, `CategorySuggester`, `BatchTransactionProcessor`, `TransactionProcessor`, `TransactionFilterer`, and `RateLimiter`.
    - `LlmService` is now instantiated with only the `LlmModelFactory`.
    - Added `manualPromptGenerator`.
    - `TransactionService` is now instantiated with `ActualApiService`, `LlmService`, `promptGenerator`, `manualPromptGenerator`, `notGuessedTag`, `guessedTag`, and `overrideTag`.
    - `ActualAiService` is now instantiated with `TransactionService`, `ActualApiService`, and `syncAccountsBeforeClassify`.
- **`llm-model-factory.ts`**:
    - Removed `getProvider` and `getModelProvider` methods.
    - Corrected the return type of the groq model.
- **`llm-service.ts`**:
    - Removed `RateLimiter` and `ToolService`.
    - `ask` method now takes a `categoryIds` parameter and uses `generateObject` with an `enum` output.
    - Removed `searchWeb` method.
    - `askUsingFallbackModel` no longer uses the rate limiter.
- **`prompt-generator.ts`**:
    - `generate` method now accepts `manualTransactions` and `overrideTransactions` instead of `rules`.
    - Changed handlebars import from a custom helper to the official library.
    - Added `convertToPromptTransaction` method.
    - Template data has been changed to pass the transaction object directly, along with `manualTransactions` and `overrideTransactions`.
    - Removed logic for handling rules and web search.
- **`transaction-service.ts`**:
    - Completely rewritten.
    - Removed `CategorySuggester`, `BatchTransactionProcessor`, and `TransactionFilterer`.
    - `LlmService`, `PromptGenerator`, `notGuessedTag`, `guessedTag`, and `overrideTag` are now injected.
    - Added `migrateToTags` method.
    - `processTransactions` now handles the entire classification process.
    - Added `classifyTransaction` method.
    - Added `appendTag` and `clearPreviousTags` methods.
- **`types.ts`**:
    - Removed `LlmModelI`, `NotesMigratorI`, `RuleDescription`, `CategorySuggestion`, `UnifiedResponse`, `ToolServiceI`, `SearchResult`, and `ProcessingStrategyI` interfaces.
    - Simplified `LlmModelFactoryI`.
    - Simplified `ActualApiServiceI`.
    - Updated `TransactionServiceI`.
    - Updated `LlmServiceI`.
    - Updated `PromptGeneratorI`.
- **`utils.ts`**:
    - Added `clearPreviousTags` function.

## `tests` Directory

- **`actual-ai.test.ts`**:
    - Significantly simplified to reflect changes in the application.
    - Setup now uses a simplified `TransactionService` and a `MockedLlmService`.
    - Removed tests for feature flags, category suggestions, and rules.
    - Updated tests to use the new tag system.
- **`llm-model-factory.test.ts`**: No changes.
- **`prompt-generator.test.ts`**:
    - Rewritten to test the new prompt generation logic.
    - Removed tests for legacy and modern formats, rules, and web search.
