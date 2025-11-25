# Changelog

This file documents the changes made to the `actual-ai` repository since it was originally cloned from `https://github.com/sakowicz/actual-ai`.

## File System Changes

- **Removed:** `.nvmrc`

## `package.json`

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

## `app.ts`

- The `isFeatureEnabled` function has been removed and replaced with a direct boolean check for the `classifyOnStartup` feature. This simplifies the logic for determining whether to run the classification process on startup.

## `README.md`

- The `README.md` file has been significantly updated to reflect the changes in the application's functionality. The following sections and features have been removed from the documentation:
    - Web search
    - New category suggestions
    - Dry run mode
- The `docker-compose.yml` example has been updated to remove the environment variables associated with these features.

## `tests/prompt-generator.test.ts`

- The test cases have been updated to reflect the new prompt format, which includes a section for "Pay attention to these examples which are corrections to the automatic categorization" and updated transaction types (`Withdrawal` and `Deposit`).
