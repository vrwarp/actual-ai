import { APIPayeeEntity, APICategoryGroupEntity } from '@actual-app/api/@types/loot-core/src/server/api-models';
import { RuleEntity, TransactionEntity } from '@actual-app/api/@types/loot-core/src/types/models';
import handlebars from './handlebars-helpers';
import {
  PromptGeneratorI,
} from './types';
import { Logger } from './utils/log-utils';
import PromptTemplateException from './exceptions/prompt-template-exception';
import { isToolEnabled } from './config';
import { transformRulesToDescriptions } from './utils/rule-utils';
import TagService from './transaction/tag-service';

/**
 * Service responsible for generating the prompt string sent to the LLM.
 * It uses a Handlebars template to format the transaction data and context.
 */
class PromptGenerator implements PromptGeneratorI {
  private readonly promptTemplate: string;

  private readonly tagService: TagService;

  /**
   * Constructs a PromptGenerator.
   *
   * @param promptTemplate - The raw Handlebars template string to use for generation.
   * @param tagService - Service to clean tags from notes.
   */
  constructor(
    promptTemplate: string,
    tagService: TagService,
  ) {
    this.promptTemplate = promptTemplate;
    this.tagService = tagService;
  }

  /**
   * Generates a fully populated prompt string for a specific transaction.
   *
   * This method combines the transaction details, available categories, relevant rules,
   * and example transactions into a single text prompt using the configured template.
   *
   * @param categoryGroups - List of all category groups and their categories.
   * @param transaction - The transaction to be classified.
   * @param payees - List of all payees in the system.
   * @param rules - List of rules relevant to the transaction context.
   * @param examples - List of similar past transactions to serve as few-shot examples.
   * @returns The generated prompt string.
   * @throws PromptTemplateException if there is an error compiling or executing the template.
   */
  generate(
    categoryGroups: APICategoryGroupEntity[],
    transaction: TransactionEntity,
    payees: APIPayeeEntity[],
    rules: RuleEntity[],
    examples: TransactionEntity[],
  ): string {
    let template;
    try {
      template = handlebars.compile(this.promptTemplate);
    } catch {
      Logger.error('Error generating prompt. Check syntax of your template.');
      throw new PromptTemplateException('Error generating prompt. Check syntax of your template.');
    }
    const payeeName = payees.find((payee) => payee.id === transaction.payee)?.name;

    // Ensure each category group has its categories property
    const groupsWithCategories = categoryGroups.map((group) => ({
      ...group,
      groupName: group.name,
      categories: group.categories ?? [],
    }));

    const rulesDescription = transformRulesToDescriptions(
      rules,
      groupsWithCategories,
      payees,
    );

    const examplesDescription = examples.map((example) => {
      const examplePayee = payees.find((payee) => payee.id === example.payee)?.name;
      const exampleCategory = groupsWithCategories
        .flatMap((group) => group.categories)
        .find((cat) => cat.id === example.category);

      return {
        amount: Math.abs(example.amount),
        type: example.amount > 0 ? 'Income' : 'Outcome',
        description: this.tagService.clearPreviousTags(example.notes ?? ''),
        payee: examplePayee ?? '',
        importedPayee: example.imported_payee ?? '',
        category: exampleCategory?.name ?? 'Unknown Category',
      };
    });

    try {
      const webSearchEnabled = (typeof isToolEnabled('webSearch') === 'boolean' && isToolEnabled('webSearch'))
        || (typeof isToolEnabled('freeWebSearch') === 'boolean' && isToolEnabled('freeWebSearch'));
      return template({
        categoryGroups: groupsWithCategories,
        rules: rulesDescription,
        examples: examplesDescription,
        amount: Math.abs(transaction.amount),
        type: transaction.amount > 0 ? 'Income' : 'Outcome',
        description: this.tagService.clearPreviousTags(transaction.notes ?? ''),
        payee: payeeName ?? '',
        importedPayee: transaction.imported_payee ?? '',
        date: transaction.date ?? '',
        cleared: transaction.cleared,
        reconciled: transaction.reconciled,
        hasWebSearchTool: webSearchEnabled,
      });
    } catch {
      Logger.error('Error generating prompt. Check syntax of your template.');
      throw new PromptTemplateException('Error generating prompt. Check syntax of your template.');
    }
  }
}

export default PromptGenerator;
