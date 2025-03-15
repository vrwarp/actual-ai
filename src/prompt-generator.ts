import { APICategoryGroupEntity, APICategoryEntity, APIPayeeEntity } from '@actual-app/api/@types/loot-core/server/api-models';
import { TransactionEntity } from '@actual-app/api/@types/loot-core/types/models';
import * as handlebars from 'handlebars';
import { PromptGeneratorI } from './types';
import PromptTemplateException from './exceptions/prompt-template-exception';
import { clearPreviousTags } from './utils';

type PromptGeneratorTransactionEntity = {
  amount: number;
  type: string;
  description: string | undefined;
  payee: string | undefined;
  date: string;
  cleared: boolean | undefined;
  reconciled: boolean | undefined;
  category: string | undefined;
  categoryId: string | undefined;
}

class PromptGenerator implements PromptGeneratorI {
  private readonly promptTemplate: string;

  constructor(promptTemplate: string) {
    this.promptTemplate = promptTemplate;
  }

  convertToPromptTransaction(transaction: TransactionEntity, payees: APIPayeeEntity[], categoryIdToName : Record<string, string>): PromptGeneratorTransactionEntity {
    const payeeName = payees.find((payee) => payee.id === transaction.payee)?.name ?? transaction.imported_payee;
    const categoryName : string | undefined = (transaction.category !== undefined ? categoryIdToName[transaction.category] : undefined)
    return {
      amount: Math.abs(transaction.amount),
      type: transaction.amount > 0 ? 'Deposit' : 'Withdrawal',
      description: clearPreviousTags(transaction.notes),
      payee: payeeName,
      date: transaction.date,
      cleared: transaction.cleared,
      reconciled: transaction.reconciled,
      category: categoryName,
      categoryId: transaction.category,
    };
  }

  generate(
    categoryGroups: APICategoryGroupEntity[],
    transaction: TransactionEntity,
    payees: APIPayeeEntity[],
    manualTransactions: TransactionEntity[],
    overrideTransactions: TransactionEntity[],
  ): string {
    let template;
    try {
      template = handlebars.compile(this.promptTemplate);
    } catch (error) {
      console.error('Error generating prompt. Check syntax of your template.', error);
      throw new PromptTemplateException('Error generating prompt. Check syntax of your template.');
    }
    const payeeName = payees.find((payee) => payee.id === transaction.payee)?.name;
    const categoryIdToName = categoryGroups.reduce((acc : Record<string, string>, categoryGroup) => {
      categoryGroup.categories.forEach((category) => {
        acc[category.id] = category.name;
      });
      return acc;
    }, {});

    let promptTransaction = this.convertToPromptTransaction(transaction, payees, categoryIdToName);
    let promptManualTransactions: PromptGeneratorTransactionEntity[] = 
      manualTransactions.map((manualTransaction) => {
        return this.convertToPromptTransaction(manualTransaction, payees, categoryIdToName);
      });
    let promptOverrideTransactions: PromptGeneratorTransactionEntity[] =
      overrideTransactions.map((overrideTransaction) => {
        return this.convertToPromptTransaction(overrideTransaction, payees, categoryIdToName);
      });
    console.log(promptOverrideTransactions)

    try {
      return template({
        categoryGroups,
        transaction: promptTransaction,
        manualTransactions: promptManualTransactions,
        overrideTransactions: promptOverrideTransactions,
      });
    } catch (error) {
      console.error('Error generating prompt. Check syntax of your template.', error);
      throw new PromptTemplateException('Error generating prompt. Check syntax of your template.');
    }
  }
}

export default PromptGenerator;
