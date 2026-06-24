import { LlmServiceI, UnifiedResponse } from '../../types';

/**
 * Deterministic mock "agent" implementing {@link LlmServiceI}.
 *
 * It inspects the rendered prompt for known merchant keywords and returns a stable
 * categorization, so the dry-run preview produces a realistic distribution with no
 * network calls and no spend. One merchant deliberately falls through to a "new
 * category" suggestion to exercise that path.
 */
const KEYWORD_TO_CATEGORY: { match: string[]; categoryId: string }[] = [
  { match: ['whole foods', 'grocer', 'aldi', 'trader joe'], categoryId: 'cat-groceries' },
  { match: ['starbucks', 'coffee', 'restaurant', 'dining', 'cafe'], categoryId: 'cat-dining' },
  { match: ['shell', 'gas', 'fuel', 'chevron', 'exxon'], categoryId: 'cat-fuel' },
  { match: ['uber', 'lyft', 'transit', 'metro', 'train'], categoryId: 'cat-transit' },
  { match: ['netflix', 'spotify', 'subscription', 'hulu'], categoryId: 'cat-subscriptions' },
  { match: ['electric', 'utility', 'water', 'gas company'], categoryId: 'cat-utilities' },
  { match: ['amazon', 'amzn', 'store', 'walmart', 'target'], categoryId: 'cat-general' },
];

export class MockLlmService implements LlmServiceI {
  // eslint-disable-next-line class-methods-use-this
  async ask(prompt: string): Promise<UnifiedResponse> {
    // Only inspect the transaction-detail portion of the prompt, NOT the category
    // catalogue that follows it (otherwise category names like "Groceries" would
    // match every transaction). The default template emits the catalogue under an
    // "Existing categories" heading.
    const head = prompt.toLowerCase().split('existing categories')[0];
    const lower = head;
    for (const rule of KEYWORD_TO_CATEGORY) {
      if (rule.match.some((m) => lower.includes(m))) {
        return { type: 'existing', categoryId: rule.categoryId };
      }
    }
    // Unfamiliar merchant (e.g. pet grooming) → suggest a brand-new category.
    if (lower.includes('paw') || lower.includes('groom') || lower.includes('pet')) {
      return {
        type: 'new',
        newCategory: { name: 'Pet Care', groupName: 'Shopping', groupIsNew: false },
      };
    }
    // Genuine fallback: leave it for the user (mock never invents an invalid id).
    return { type: 'existing', categoryId: 'cat-general' };
  }
}

export default MockLlmService;
