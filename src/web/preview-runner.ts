import { APICategoryGroupEntity as ShimGroup } from '@actual-app/core/src/server/api-models';
import PromptGenerator from '../prompt-generator';
import TagService from '../transaction/tag-service';
import TransactionFilterer from '../transaction/transaction-filterer';
import { resolveConfig } from '../config';
import { ActualApiServiceI, LlmServiceI } from '../types';
import { pendingEnvMap } from './config-store';
import { MockActualApiService } from './mocks/mock-actual-api';
import { MockLlmService } from './mocks/mock-llm';
import { RecordingActualApiService } from './readonly-actual-api';

export interface PreviewSampleRow {
  payee: string;
  amount: number;
  proposedCategory: string;
  isNew: boolean;
}

export interface PreviewResult {
  at: string;
  considered: number;
  wouldCategorize: number;
  skipped: number;
  distribution: { category: string; count: number }[];
  sample: PreviewSampleRow[];
  mock: boolean;
  error?: string;
}

function categoryNameById(
  groups: { name: string; categories?: { id: string; name: string }[] }[],
  id: string | undefined,
): string | undefined {
  if (!id) return undefined;
  for (const g of groups) {
    const found = (g.categories ?? []).find((c) => c.id === id);
    if (found) return found.name;
  }
  return undefined;
}

/**
 * Run a read-only dry-run preview against the MOCK dataset using the MOCK agent.
 *
 * Uses the real {@link PromptGenerator}, {@link TagService} and
 * {@link TransactionFilterer} so prompt rendering, tagging and filtering are
 * genuinely exercised — but never touches a real Actual server or LLM and never
 * writes anything (the {@link RecordingActualApiService} captures intended writes).
 *
 * @param now - ISO timestamp (injected so the function stays deterministic/testable).
 */
export async function dryRunPreview(now: string): Promise<PreviewResult> {
  const cfg = resolveConfig(pendingEnvMap());

  const inner: ActualApiServiceI = new MockActualApiService();
  const recording = new RecordingActualApiService(inner);
  const agent: LlmServiceI = new MockLlmService();

  const tagService = new TagService(cfg.notGuessedTag, cfg.guessedTag, cfg.manualOverrideTag);
  const promptGenerator = new PromptGenerator(cfg.promptTemplate, tagService);
  const filterer = new TransactionFilterer(tagService);

  await recording.initializeApi();
  try {
    const [groups, payees, transactions, accounts, rules] = await Promise.all([
      recording.getCategoryGroups(),
      recording.getPayees(),
      recording.getTransactions(),
      recording.getAccounts(),
      recording.getRules(),
    ]);

    const uncategorized = filterer.filterUncategorized(transactions, accounts);
    const examples = filterer.getManualOverrideTransactions(transactions);

    const distribution = new Map<string, number>();
    const sample: PreviewSampleRow[] = [];
    let wouldCategorize = 0;

    for (const transaction of uncategorized) {
      const prompt = promptGenerator.generate(groups as unknown as ShimGroup[], transaction, payees, rules, examples);
      // eslint-disable-next-line no-await-in-loop
      const response = await agent.ask(prompt);
      const payeeName = payees.find((p) => p.id === transaction.payee)?.name
        ?? transaction.imported_payee ?? 'Unknown';

      let proposed = 'Uncategorized';
      let isNew = false;
      if (response.type === 'new' && response.newCategory) {
        proposed = `${response.newCategory.name} (new)`;
        isNew = true;
        wouldCategorize += 1;
      } else if (response.categoryId) {
        proposed = categoryNameById(groups, response.categoryId) ?? 'Uncategorized';
        if (proposed !== 'Uncategorized') wouldCategorize += 1;
      }
      distribution.set(proposed, (distribution.get(proposed) ?? 0) + 1);
      sample.push({
        payee: payeeName, amount: transaction.amount, proposedCategory: proposed, isNew,
      });
    }

    // New-category suggestions first, then everything else (most scrutiny-worthy on top).
    sample.sort((a, b) => Number(b.isNew) - Number(a.isNew));

    return {
      at: now,
      considered: uncategorized.length,
      wouldCategorize,
      skipped: transactions.length - uncategorized.length,
      distribution: Array.from(distribution.entries())
        .map(([category, count]) => ({ category, count }))
        .sort((a, b) => b.count - a.count),
      sample,
      mock: true,
    };
  } finally {
    await recording.shutdownApi();
  }
}

export default dryRunPreview;
