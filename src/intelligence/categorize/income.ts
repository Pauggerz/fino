// Lightweight income keyword → canonical category-name mapping. The shared
// expense taxonomy (aiCategoryMap) has no income masters, so this small dict
// is what powers auto-categorisation when the user is in Income mode.
// Keys are tokens we look for in the description; values are matched
// case-insensitively against the user's actual income category list — the
// suggestion is only applied when a real category by that name exists.
export const INCOME_KEYWORD_TO_CATEGORY: ReadonlyArray<
  readonly [RegExp, string]
> = [
  [/\b(salary|sweldo|paycheck|payroll|payday|wages?|pay)\b/i, 'Salary'],
  [/\b(allowance|baon|stipend|pocket\s*money)\b/i, 'Allowance'],
  [/\b(freelance|gig|client|commission|project)\b/i, 'Freelance'],
  [/\b(business|sales|revenue|sari[-\s]?sari|store)\b/i, 'Business'],
  [/\b(investment|dividend|interest|stocks?|crypto|yield)\b/i, 'Investment'],
  [/\b(gift|regalo|aguinaldo|bonus)\b/i, 'Gifts'],
];

export function matchIncomeKeyword(
  text: string,
  available: readonly { name: string }[]
): string | null {
  const lower = text.toLowerCase();
  for (const [pattern, canonical] of INCOME_KEYWORD_TO_CATEGORY) {
    if (pattern.test(lower)) {
      const hit = available.find(
        (c) => c.name.toLowerCase() === canonical.toLowerCase()
      );
      if (hit) return hit.name;
    }
  }
  return null;
}

// Phrases that indicate income even without a specific category keyword.
// Used by the chat parser to pick `type: 'income'` before resolving category.
const INCOME_PHRASE_PATTERN =
  /\b(received|got\s+paid|earned|kumita|bayad\s+sa\s+akin|na-?credit|ipinasa)\b/i;

// High-confidence income KEYWORDS for the TYPE decision. Deliberately stricter
// than INCOME_KEYWORD_TO_CATEGORY (which is still used for category NAMING):
// the ambiguous nouns 'pay' / 'store' / 'project' / 'gift' / 'regalo' are
// dropped here because they routinely appear in EXPENSE logs ("pay 500 for the
// bill", "gift 500", "project 1000") and were mis-typing those as income.
const INCOME_TYPE_PATTERN =
  /\b(salary|sweldo|sahod|paycheck|payroll|payday|wages?|allowance|baon|stipend|pocket\s*money|freelance|gig|client|commission|business|sales|revenue|sari[-\s]?sari|investment|dividend|interest|stocks?|crypto|yield|aguinaldo|bonus)\b/i;

/** Quick "does this look like income at all?" test (TYPE decision only). */
export function looksLikeIncome(text: string): boolean {
  if (INCOME_PHRASE_PATTERN.test(text)) return true;
  return INCOME_TYPE_PATTERN.test(text);
}
