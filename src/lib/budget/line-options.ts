/**
 * Shared shapes + helpers for rendering budget-line pickers grouped by
 * category (so the "007 Project-specific lines" group reads as visually
 * distinct from the general 001-006 budget when classifying an expense).
 */

export type BudgetLineOption = {
  id: string;
  label: string;
  categoryCode: string;
  categoryName: string;
};

export type BudgetLineOptionGroup = {
  categoryCode: string;
  categoryName: string;
  options: BudgetLineOption[];
};

export function groupBudgetLineOptions(
  options: BudgetLineOption[],
): BudgetLineOptionGroup[] {
  const groups = new Map<string, BudgetLineOptionGroup>();
  for (const o of options) {
    const existing = groups.get(o.categoryCode);
    if (existing) existing.options.push(o);
    else
      groups.set(o.categoryCode, {
        categoryCode: o.categoryCode,
        categoryName: o.categoryName,
        options: [o],
      });
  }
  return Array.from(groups.values());
}
