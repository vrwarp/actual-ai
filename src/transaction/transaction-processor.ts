import {
  RuleEntity,
  TransactionEntity,
} from '@actual-app/api/@types/loot-core/src/types/models';
import { APIPayeeEntity } from '@actual-app/api/@types/loot-core/src/server/api-models';
import {
  ActualApiServiceI, APICategoryEntity, APICategoryGroupEntity,
  LlmServiceI, ProcessingStrategyI,
  PromptGeneratorI,
} from '../types';
import TagService from './tag-service';

/**
 * Service to process a single transaction for classification.
 *
 * This class coordinates the generation of the prompt, the query to the LLM,
 * and the delegation of the response to the appropriate processing strategy.
 */
class TransactionProcessor {
  private readonly actualApiService: ActualApiServiceI;

  private readonly llmService: LlmServiceI;

  private readonly promptGenerator: PromptGeneratorI;

  private readonly tagService: TagService;

  private readonly processingStrategies: ProcessingStrategyI[];

  /**
   * Constructs the TransactionProcessor.
   *
   * @param actualApiClient - Service to interact with the Actual Budget API.
   * @param llmService - Service to interact with the LLM.
   * @param promptGenerator - Service to generate the prompt for the LLM.
   * @param tagService - Service to manage transaction note tags.
   * @param processingStrategies - List of strategies to handle different LLM response types.
   */
  constructor(
    actualApiClient: ActualApiServiceI,
    llmService: LlmServiceI,
    promptGenerator: PromptGeneratorI,
    tagService: TagService,
    processingStrategies: ProcessingStrategyI[],
  ) {
    this.actualApiService = actualApiClient;
    this.llmService = llmService;
    this.promptGenerator = promptGenerator;
    this.tagService = tagService;
    this.processingStrategies = processingStrategies;
  }

  /**
   * Processes a single transaction.
   *
   * 1. Generates a prompt based on the transaction and context (rules, examples).
   * 2. Sends the prompt to the LLM.
   * 3. Selects a matching strategy based on the LLM's response.
   * 4. Executes the strategy to apply the changes (e.g., updating category, suggesting new category).
   * 5. Handles errors by tagging the transaction as "not guessed".
   *
   * @param transaction - The transaction to process.
   * @param categoryGroups - Available category groups.
   * @param payees - Available payees.
   * @param rules - Relevant categorization rules.
   * @param examples - Manual override examples.
   * @param categories - All available categories.
   * @param suggestedCategories - Map to collect new category suggestions.
   * @returns A promise that resolves when processing is complete.
   */
  public async process(
    transaction: TransactionEntity,
    categoryGroups: APICategoryGroupEntity[],
    payees: APIPayeeEntity[],
    rules: RuleEntity[],
    examples: TransactionEntity[],
    categories: (APICategoryEntity | APICategoryGroupEntity)[],
    suggestedCategories: Map<string, {
        name: string;
        groupName: string;
        groupIsNew: boolean;
        groupId?: string;
        transactions: TransactionEntity[];
      }>,
  ): Promise<void> {
    try {
      const prompt = this.promptGenerator.generate(
        categoryGroups,
        transaction,
        payees,
        rules,
        examples,
      );

      const response = await this.llmService.ask(prompt);

      const strategy = this.processingStrategies.find((s) => s.isSatisfiedBy(response));
      if (strategy) {
        await strategy.process(transaction, response, categories, suggestedCategories);
        return;
      }

      console.warn(`Unexpected response format: ${JSON.stringify(response)}`);
      await this.actualApiService.updateTransactionNotes(
        transaction.id,
        this.tagService.addNotGuessedTag(transaction.notes ?? ''),
      );
    } catch (error) {
      console.error(`Error processing transaction ${transaction.id}:`, error);
      await this.actualApiService.updateTransactionNotes(
        transaction.id,
        this.tagService.addNotGuessedTag(transaction.notes ?? ''),
      );
    }
  }
}

export default TransactionProcessor;
