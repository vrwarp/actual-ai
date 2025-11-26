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

## Design and Rationale

The primary motivation for the changes in this repository was to simplify the codebase and focus on a more robust and accurate method of transaction categorization. The original implementation, while feature-rich, had a complex architecture that made it difficult to maintain and extend. The new design prioritizes a streamlined workflow, improved prompt engineering, and a more reliable categorization process.

### Core Architectural Changes

The original architecture was based on a complex system of feature flags, multiple processing strategies, and a variety of services for tasks like category suggestion, rule matching, and web search. This has been replaced with a more straightforward approach centered around the `TransactionService`. The new service is responsible for the entire end-to-end process of fetching, classifying, and updating transactions. This consolidation of responsibility makes the code easier to follow and debug.

### Prompt Engineering and Contextual Learning

A key feature of the new design is the introduction of a more sophisticated prompt generation strategy. The original implementation relied on a single prompt and a set of rules to guide the LLM. The new approach uses two distinct prompts: a primary prompt for initial classification and a "manual" prompt for cases where the initial attempt fails.

Furthermore, the new system introduces the concept of "contextual learning" through the use of `manualTransactions` and `overrideTransactions`. These are transactions that have been manually corrected by the user and are fed back into the prompt to provide the LLM with examples of correct classifications. This allows the model to learn from its mistakes and improve its accuracy over time.

### Simplification and Removal of Features

Several features from the original implementation have been removed to simplify the codebase and focus on the core functionality of transaction categorization. These include:

- **Web Search:** While potentially useful, the web search functionality added significant complexity and external dependencies. It was removed to streamline the application and reduce potential points of failure.
- **Category Suggestion:** The category suggestion feature was also removed to simplify the user experience and reduce the cognitive load of managing new categories.
- **Rules Engine:** The rules engine was removed in favor of the more flexible and powerful contextual learning approach.

By removing these features, the new design achieves a more focused and maintainable codebase that is easier to understand and extend.
