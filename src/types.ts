import { LanguageModel, Tool } from 'ai';
import {
  APIAccountEntity,
  APICategoryEntity as ImportedAPICategoryEntity,
  APICategoryGroupEntity as ImportedAPICategoryGroupEntity,
  APIPayeeEntity,
} from '@actual-app/api/@types/loot-core/src/server/api-models';
import {
  TransactionEntity, RuleEntity, CategoryEntity, CategoryGroupEntity,
} from '@actual-app/api/@types/loot-core/src/types/models';

/**
 * Union type for Category Entities, combining API and core model types.
 */
export type APICategoryEntity = ImportedAPICategoryEntity | CategoryEntity;

/**
 * Union type for Category Group Entities, combining API and core model types.
 */
export type APICategoryGroupEntity = ImportedAPICategoryGroupEntity | CategoryGroupEntity;

/**
 * Interface representing a generic LLM model wrapper.
 */
export interface LlmModelI {
  /**
   * Sends a prompt to the model and expects a response from a list of possible answers.
   *
   * @param prompt - The prompt to send.
   * @param possibleAnswers - A list of valid response strings.
   * @returns The model's response.
   */
  ask(prompt: string, possibleAnswers: string[]): Promise<string>;
}

/**
 * Interface for a factory that creates LanguageModel instances.
 */
export interface LlmModelFactoryI {
  /** Creates and returns a new LanguageModel instance. */
  create(): LanguageModel;
  /** Returns the name of the configured provider. */
  getProvider(): string;
  /** Returns true if the factory is in fallback mode. */
  isFallbackMode(): boolean;
  /** Returns the name of the model provider. */
  getModelProvider(): string;
}

/**
 * Interface for the service interacting with the Actual Budget API.
 */
export interface ActualApiServiceI {
  /** Initializes the API connection and loads data. */
  initializeApi(): Promise<void>;

  /** Shuts down the API connection. */
  shutdownApi(): Promise<void>;

  /** Retrieves all category groups. */
  getCategoryGroups(): Promise<APICategoryGroupEntity[]>

  /** Retrieves all categories. */
  getCategories(): Promise<(APICategoryEntity | APICategoryGroupEntity)[]>

  /** Retrieves all accounts. */
  getAccounts(): Promise<APIAccountEntity[]>

  /** Retrieves all payees. */
  getPayees(): Promise<APIPayeeEntity[]>

  /** Retrieves all transactions. */
  getTransactions(): Promise<TransactionEntity[]>

  /** Retrieves all rules. */
  getRules(): Promise<RuleEntity[]>

  /** Retrieves rules for a specific payee. */
  getPayeeRules(payeeId: string): Promise<RuleEntity[]>

  /** Updates the notes of a transaction. */
  updateTransactionNotes(id: string, notes: string): Promise<void>

  /** Updates the notes and category of a transaction. */
  updateTransactionNotesAndCategory(
    id: string,
    notes: string,
    categoryId: string,
  ): Promise<void>

  /** Triggers a bank synchronization. */
  runBankSync(): Promise<void>

  /** Creates a new category. */
  createCategory(name: string, groupId: string): Promise<string>

  /** Creates a new category group. */
  createCategoryGroup(name: string): Promise<string>

  /** Updates a category group. */
  updateCategoryGroup(id: string, name: string): Promise<void>
}

/**
 * Interface for the service handling transaction processing logic.
 */
export interface TransactionServiceI {
  /** Processes transactions to classify them. */
  processTransactions(): Promise<void>;
}

/**
 * Interface for the service migrating notes to tags.
 */
export interface NotesMigratorI {
  /** performing the migration of notes to tags. */
  migrateToTags(): Promise<void>;
}

/**
 * Interface for the main Actual AI service.
 */
export interface ActualAiServiceI {
  /** Starts the classification process. */
  classify(): Promise<void>;

  /** Syncs bank accounts. */
  syncAccounts(): Promise<void>
}

/**
 * Description of a rule for prompt generation.
 */
export interface RuleDescription {
  /** The name or description of the rule. */
  ruleName: string;
  /** The conditions that trigger the rule. */
  conditions: {
    field: string;
    op: string;
    type?: string;
    value: string | string[];
  }[];
  /** The name of the category the rule applies. */
  categoryName: string;
  /** The ID of the category the rule applies. */
  categoryId: string;
  /** Optional index for ordering. */
  index?: number;
}

/**
 * A unified response structure from the LLM.
 * Can represent an existing category match, a new category suggestion, or a rule match.
 */
export interface UnifiedResponse {
  /** The type of the response. */
  type: 'existing' | 'new' | 'rule';
  /** The ID of the category (if existing). */
  categoryId?: string;
  /** The name of the matched rule (if rule). */
  ruleName?: string;
  /** Details of the new category (if new). */
  newCategory?: {
    /** The name of the suggested category. */
    name: string;
    /** The name of the group it belongs to. */
    groupName: string;
    /** Whether the group is new or existing. */
    groupIsNew: boolean;
  };
}

/**
 * Interface for the LLM service.
 */
export interface LlmServiceI {
  /** Sends a prompt to the LLM and returns a unified response. */
  ask(prompt: string): Promise<UnifiedResponse>;
}

/**
 * Interface for the tool service (e.g., for web search).
 */
export interface ToolServiceI {
  /** Returns a map of available tools. */
  getTools(): Record<string, Tool>;
}

/**
 * Interface for the prompt generator service.
 */
export interface PromptGeneratorI {
  /** Generates a prompt string for a transaction. */
  generate(
    categoryGroups: APICategoryGroupEntity[],
    transaction: TransactionEntity,
    payees: APIPayeeEntity[],
    rules: RuleEntity[],
    examples: TransactionEntity[],
  ): string;
}

/**
 * Structure for a search result item.
 */
export interface SearchResult {
  /** The title of the search result. */
  title: string;
  /** A snippet or summary of the content. */
  snippet: string;
  /** The URL link. */
  link: string;
}

/**
 * Interface for transaction processing strategies.
 */
export interface ProcessingStrategyI {
  /**
   * Processes a transaction based on the LLM response.
   *
   * @param transaction - The transaction being processed.
   * @param response - The response from the LLM.
   * @param categories - Available categories.
   * @param suggestedCategories - Map to accumulate suggested categories.
   */
  process(
      transaction: TransactionEntity,
      response: UnifiedResponse,
      categories: (APICategoryEntity | APICategoryGroupEntity)[],
      suggestedCategories: Map<string, {
        name: string;
        groupName: string;
        groupIsNew: boolean;
        groupId?: string;
        transactions: TransactionEntity[];
      }>
  ): Promise<void>;

  /**
   * Determines if this strategy can handle the given response.
   *
   * @param response - The LLM response to check.
   * @returns True if the strategy can handle the response.
   */
  isSatisfiedBy(response: UnifiedResponse): boolean;
}
