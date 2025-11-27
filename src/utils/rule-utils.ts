import { APICategoryEntity, APICategoryGroupEntity, APIPayeeEntity } from '@actual-app/api/@types/loot-core/src/server/api-models';
import { RuleEntity } from '@actual-app/api/@types/loot-core/src/types/models';
import { RuleDescription } from '../types';

/**
 * Transforms complex rule entities into a simplified, human-readable description format.
 * This is primarily used to provide context to the LLM about existing categorization rules.
 *
 * @param rules - The list of rule entities to transform.
 * @param categories - The list of available categories (to resolve category names).
 * @param payees - The list of available payees (to resolve payee names from IDs).
 * @returns An array of simplified RuleDescription objects.
 */
export function transformRulesToDescriptions(
  rules: RuleEntity[],
  categories: (APICategoryEntity | APICategoryGroupEntity)[],
  payees: APIPayeeEntity[] = [],
): RuleDescription[] {
  return rules.map((rule) => {
    const categoryAction = rule.actions.find(
      (action) => 'field' in action && action.field === 'category' && action.op === 'set',
    );
    const categoryId = categoryAction?.value as string | undefined;
    const category = categories.find((c) => 'id' in c && c.id === categoryId);

    // Improved payee resolution with clean JSON structure
    const resolvePayeeValue = (value: string | string[]) => {
      const resolveSingle = (id: string) => payees.find((p) => p.id === id)?.name ?? id;

      return Array.isArray(value)
        ? value.map(resolveSingle)
        : resolveSingle(value);
    };

    return {
      conditions: rule.conditions.map((c) => {
        // Structure condition as properly typed object
        const condition: {
          field: string;
          op: string;
          type?: string;
          value: string | string[];
        } = {
          field: c.field,
          op: c.op,
          type: c.type,
          value: '', // Default value, will be updated below
        };

        if (c.field === 'payee' && c.type === 'id') {
          condition.value = resolvePayeeValue(c.value);
        } else {
          condition.value = typeof c.value === 'object' ? (c.value as string[]) : String(c.value);
        }

        return condition;
      }),
      categoryName: category && 'name' in category ? category.name : 'unknown',
      categoryId: categoryId ?? '',
      ruleName: 'name' in rule ? rule.name as string : 'Unnamed rule',
    };
  }).filter((r) => r.categoryId);
}

export default { transformRulesToDescriptions };
