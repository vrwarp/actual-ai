import {
  APICategoryEntity,
  APICategoryGroupEntity,
} from '@actual-app/api/@types/loot-core/server/api-models';
import {
  ActualApiServiceI, LlmServiceI, PromptGeneratorI, TransactionServiceI,
} from './types';

const LEGACY_NOTES_NOT_GUESSED = 'actual-ai could not guess this category';
const LEGACY_NOTES_GUESSED = 'actual-ai guessed this category';

class TransactionService implements TransactionServiceI {
  private readonly actualApiService: ActualApiServiceI;

  private readonly llmService: LlmServiceI;

  private readonly promptGenerator: PromptGeneratorI;

  private readonly manualPromptGenerator: PromptGeneratorI;

  private readonly notGuessedTag: string;

  private readonly guessedTag: string;

  private readonly overrideTag: string;

  constructor(
    actualApiClient: ActualApiServiceI,
    llmService: LlmServiceI,
    promptGenerator: PromptGeneratorI,
    manualPromptGenerator: PromptGeneratorI,
    notGuessedTag: string,
    guessedTag: string,
    overrideTag: string,
  ) {
    this.actualApiService = actualApiClient;
    this.llmService = llmService;
    this.promptGenerator = promptGenerator;
    this.manualPromptGenerator = manualPromptGenerator;
    this.notGuessedTag = notGuessedTag;
    this.guessedTag = guessedTag;
    this.overrideTag = overrideTag;
  }

  appendTag(notes: string, tag: string): string {
    const clearedNotes = this.clearPreviousTags(notes);
    return `${clearedNotes} ${tag}`.trim();
  }

  clearPreviousTags(notes: string): string {
    return notes.replace(new RegExp(` ${this.guessedTag}`, 'g'), '')
      .replace(new RegExp(` ${this.notGuessedTag}`, 'g'), '')
      .replace(new RegExp(` ${this.overrideTag}`, 'g'), '')
      .replace(new RegExp(` \\| ${LEGACY_NOTES_NOT_GUESSED}`, 'g'), '')
      .replace(new RegExp(` \\| ${LEGACY_NOTES_GUESSED}`, 'g'), '')
      .trim();
  }

  async migrateToTags(): Promise<void> {
    const transactions = await this.actualApiService.getTransactions();
    const transactionsToMigrate = transactions.filter(
      (transaction) => transaction.notes
        && (
          transaction.notes?.includes(LEGACY_NOTES_NOT_GUESSED)
          || transaction.notes?.includes(LEGACY_NOTES_GUESSED)
        ),
    );

    for (let i = 0; i < transactionsToMigrate.length; i++) {
      const transaction = transactionsToMigrate[i];
      console.log(`${i + 1}/${transactionsToMigrate.length} Migrating transaction ${transaction.imported_payee} / ${transaction.notes} / ${transaction.amount}`);

      let newNotes = null;
      if (transaction.notes?.includes(LEGACY_NOTES_NOT_GUESSED)) {
        newNotes = this.appendTag(transaction.notes, this.notGuessedTag);
      }
      if (transaction.notes?.includes(LEGACY_NOTES_GUESSED)) {
        newNotes = this.appendTag(transaction.notes, this.guessedTag);
      }

      if (newNotes) {
        await this.actualApiService.updateTransactionNotes(transaction.id, newNotes);
      }
    }
  }

  private async classifyTransaction(
    prompt: string,
    categories: (APICategoryEntity | APICategoryGroupEntity)[],
    debugPrefix: string,
  ): Promise<APICategoryEntity | APICategoryGroupEntity | undefined> {
    const categoryIds = categories.map((category) => category.id);
    categoryIds.push('uncategorized');
    const guess = await this.llmService.ask(prompt, categoryIds);
    let guessCategory = categories.find((category) => category.id === guess);

    if (!guessCategory) {
      guessCategory = categories.find((category) => category.name === guess);
      if (guessCategory) {
        console.warn(`${debugPrefix} LLM guessed category name instead of ID. LLM guess: ${guess}`);
      }
    }
    if (!guessCategory) {
      guessCategory = categories.find((category) => guess.includes(category.id));
      if (guessCategory) {
        console.warn(`${debugPrefix} Found category ID in LLM guess, but it wasn't 1:1. LLM guess: ${guess}`);
      }
    }
    if (!guessCategory) {
      console.warn(`${debugPrefix} LLM could not classify the transaction. LLM guess: ${guess}`);
    }
    return guessCategory;
  }

  async processTransactions(): Promise<void> {
    const categoryGroups = await this.actualApiService.getCategoryGroups();
    const categories = await this.actualApiService.getCategories();
    const payees = await this.actualApiService.getPayees();
    const transactions = await this.actualApiService.getTransactions();
    const accounts = await this.actualApiService.getAccounts();
    const accountsToSkip = accounts.filter((account) => account.offbudget)
      .map((account) => account.id);

    const uncategorizedTransactions = transactions.filter(
      (transaction) => !transaction.category
        && (transaction.transfer_id === null || transaction.transfer_id === undefined)
        && transaction.starting_balance_flag !== true
        && transaction.imported_payee !== null
        && transaction.imported_payee !== ''
        && (transaction.notes === null || (!transaction.notes?.includes(this.notGuessedTag)))
        && !transaction.is_parent
        && !accountsToSkip.includes(transaction.account), this
    );

    // Missed Manual Transactions are transactions that have been categorized despite
    // having the notGuessTag in the notes. These can be used as additional context
    // for the AI to make a better guess when existing context is insufficient.
    let missedManualTransactions = transactions.filter(
      (transaction) => transaction.category
        && (transaction.transfer_id === null || transaction.transfer_id === undefined)
        && transaction.starting_balance_flag !== true
        && transaction.imported_payee !== null
        && transaction.imported_payee !== ''
        && transaction.notes?.includes(this.notGuessedTag)
        && !transaction.is_parent
        && !accountsToSkip.includes(transaction.account), this
    );

    // Override Transactions are transactions that have been categorized with the AI
    // which is annotated by the guessedTag in teh notes. However, the user has added
    // the additional overrideTag to the notes to indicate that the AI was incorrect
    // and manually recategorized. These transactions are added to the initial
    // categorization context to help the AI learn from its mistakes.
    let overrideTransactions = transactions.filter(
      (transaction) => transaction.category
        && (transaction.transfer_id === null || transaction.transfer_id === undefined)
        && transaction.starting_balance_flag !== true
        && transaction.imported_payee !== null
        && transaction.imported_payee !== ''
        && transaction.notes?.includes(this.overrideTag)
        && !transaction.is_parent
        && !accountsToSkip.includes(transaction.account), this
    );

    for (let i = 0; i < uncategorizedTransactions.length; i++) {
      const transaction = uncategorizedTransactions[i];
      const debugPrefix = `${i + 1}/${uncategorizedTransactions.length}`;
      console.log(`${debugPrefix} Processing transaction ${transaction.imported_payee} / ${transaction.notes} / ${transaction.amount}`);
      const prompt = this.promptGenerator.generate(categoryGroups, transaction, payees, missedManualTransactions, overrideTransactions);
      let guessCategory = await this.classifyTransaction(prompt, categories, debugPrefix);
      if (!guessCategory) {
        console.log(`${debugPrefix} Trying again with the manual prompt`);
        const manualPrompt = this.manualPromptGenerator.generate(categoryGroups, transaction, payees, missedManualTransactions, overrideTransactions);
        guessCategory = await this.classifyTransaction(manualPrompt, categories, debugPrefix);
      }
      if (!guessCategory) {
        await this.actualApiService.updateTransactionNotes(transaction.id, this.appendTag(transaction.notes ?? '', this.notGuessedTag));
        continue;
      }

      console.log(`${debugPrefix} Guess: ${guessCategory.name}`);
      await this.actualApiService.updateTransactionNotesAndCategory(
        transaction.id,
        this.appendTag(transaction.notes ?? '', this.guessedTag),
        guessCategory.id,
      );
      break;
    }
  }
}

export default TransactionService;
