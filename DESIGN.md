# Actual AI Design Document

## Overview

**Actual AI** is an intelligent companion for [Actual Budget](https://actualbudget.com/). Its primary purpose is to automatically categorize financial transactions using Large Language Models (LLMs). By analyzing transaction details (payee, amount, notes) and learning from existing user data (rules, past transactions), it aims to reduce the manual effort of budgeting.

## High-Level Architecture

The system operates as a standalone service that interacts with the Actual Budget API. It follows a clean architecture pattern, separating concerns into specific services and layers.

### Core Components

1.  **ActualAiService** (`src/actual-ai.ts`): The main orchestrator. It manages the high-level workflow: connecting to the API, syncing accounts, running migrations, and triggering the classification process.
2.  **ActualApiService** (`src/actual-api-service.ts`): A wrapper around the `@actual-app/api`. It abstracts the complexity of API calls, handles data retrieval (transactions, categories, rules), and performs updates.
3.  **TransactionService** (`src/transaction-service.ts`): The heart of the business logic. It coordinates the fetching of data, filtering of transactions, and the classification loop.
4.  **LlmService** (`src/llm-service.ts`): Handles all interactions with AI providers (OpenAI, Anthropic, etc.). It manages model instantiation, rate limiting, and response parsing.
5.  **Container** (`src/container.ts`): Implements Dependency Injection (DI) to wire up all services and configurations.

## Data Flow

The classification process generally follows these steps:

1.  **Initialization**: The app starts (via `app.ts`), initializes the API connection, and optionally syncs bank data.
2.  **Data Retrieval**: `TransactionService` fetches all necessary context: categories, payees, rules, accounts, and transactions.
3.  **Filtering**: `TransactionFilterer` identifies "uncategorized" transactions that need attention. It filters out transfers, already categorized items, and off-budget accounts.
4.  **Example Selection**: The system looks for "manual override" transactions (tagged by the user) to use as few-shot examples for the AI.
5.  **Processing (Batch Loop)**:
    *   Transactions are processed in batches (`BatchTransactionProcessor`).
    *   For each transaction, `PromptGenerator` creates a prompt containing the transaction details and relevant context (rules, category list, examples).
    *   `LlmService` sends the prompt to the configured LLM.
6.  **Decision & Strategy**:
    *   The LLM returns a `UnifiedResponse` (JSON).
    *   `TransactionProcessor` selects a `ProcessingStrategy` based on the response type:
        *   **ExistingCategoryStrategy**: The AI matched an existing category. The transaction is updated.
        *   **RuleMatchStrategy**: The AI identified a rule that applies.
        *   **NewCategoryStrategy**: The AI suggested a new category. This is collected for later batch creation.
7.  **Finalization**: If new categories were suggested, `CategorySuggester` optimizes them (merging duplicates) and creates them in Actual Budget.

## Key Design Patterns

*   **Dependency Injection**: Services are injected via constructor injection (see `src/container.ts`), making the system testable and modular.
*   **Strategy Pattern**: Used in `TransactionProcessor` to handle different types of AI responses (Existing vs. New vs. Rule) without complex `if/else` chains.
*   **Factory Pattern**: `LlmModelFactory` creates the appropriate LLM instance based on configuration.
*   **Adapter/Wrapper**: `ActualApiService` adapts the external library interface to the specific needs of this application.

## Configuration & Feature Flags

Configuration is managed via `src/config.ts` using environment variables. The system employs a robust Feature Flag system to toggle capabilities like:
*   `dryRun`: Simulate changes without writing to the DB.
*   `suggestNewCategories`: Allow the AI to invent categories.
*   `webSearch`: Enable external tools for better context.

## Error Handling & Reliability

*   **Rate Limiting**: `RateLimiter` ensures the system respects API limits of LLM providers, implementing exponential backoff.
*   **Tags**: The system uses specific tags (`#actual-ai`, `#actual-ai-miss`) in transaction notes to track state and avoid re-processing failed items indefinitely.
*   **Fallback**: Local models (Ollama) are supported as a fallback or privacy-focused alternative.

## Directory Structure

*   `src/`: Core source code.
    *   `exceptions/`: Custom error classes.
    *   `templates/`: Handlebars templates for prompts.
    *   `transaction/`: Logic specific to transaction processing, filtering, and strategies.
    *   `utils/`: General utilities (rate limiting, JSON parsing, web search).
*   `tests/`: Unit and integration tests.

## Future Extensibility

The design allows for easy addition of:
*   **New LLM Providers**: By updating `LlmModelFactory`.
*   **New Tools**: By extending `ToolService`.
*   **New Processing Logic**: By adding new `ProcessingStrategy` implementations.
