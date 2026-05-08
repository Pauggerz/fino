/**
 * Category metadata constants — emoji, colors, default category lists.
 *
 * The flat keyword → category dictionary that used to live here moved to the
 * hierarchical taxonomy at `src/constants/taxonomy.ts`. The backward-compatible
 * flat shape is re-exported as `aiMappings` from `services/aiCategoryMap.ts`,
 * derived from the taxonomy at module load. To add or change keywords, edit
 * the relevant TaxonomyNode in `taxonomy.ts` — not this file.
 */

// Maps DB emoji key → display emoji (for use in feed rows, pills, etc.)
export const CATEGORY_EMOJI: Record<string, string> = {
  food: '🍔',
  transport: '🚌',
  shopping: '🛍',
  bills: '⚡',
  health: '❤️',
  others: '📦',
};

// Maps DB category key → tile background colour (matches theme.ts catXxxBg)
export const CATEGORY_TILE_BG: Record<string, string> = {
  // Expense categories
  food: '#FDF6E3',
  transport: '#EEF6FF',
  shopping: '#FFF0F3',
  bills: '#F3EFFF',
  health: '#EFF8F2',
  others: '#F2EFEC',
  // Income categories
  salary: '#EFF8F2',
  allowance: '#EEF6FF',
  freelance: '#F3EFFF',
  business: '#FDF6E3',
  gifts: '#FFF0F3',
  investment: '#E8F6F5',
  default: '#F7F5F2',
};

// Maps DB emoji key → category text color (matches theme.ts)
export const CATEGORY_COLOR: Record<string, string> = {
  // Expense categories
  food: '#C97A20',
  transport: '#3A80C0',
  shopping: '#C0503A',
  bills: '#7A4AB8',
  health: '#2d6a4f',
  others: '#5C5550',
  // Income categories
  salary: '#2d6a4f',
  allowance: '#3A80C0',
  freelance: '#7A4AB8',
  business: '#C97A20',
  gifts: '#C0503A',
  investment: '#1a7a6e',
  // System categories — reserved for auto-generated transfer & reconciliation
  // rows. Distinct from real spending colors so they read as neutral movement.
  transfer: '#0F766E',
  adjustment: '#5C5550',
  default: '#888780',
};

// Default expense categories — DB key + display name. New signups receive
// these via the seed trigger; existing users get them backfilled by migration.
// CategoryScreen uses this list to mark rows non-deletable (only customs
// can be deleted) and to validate uniqueness against new-category names.
export interface DefaultExpenseCategoryDef {
  key: string;
  name: string;
  sortOrder: number;
}

export const DEFAULT_EXPENSE_CATEGORIES: DefaultExpenseCategoryDef[] = [
  { key: 'food', name: 'Food', sortOrder: 0 },
  { key: 'transport', name: 'Transport', sortOrder: 1 },
  { key: 'shopping', name: 'Shopping', sortOrder: 2 },
  { key: 'bills', name: 'Bills', sortOrder: 3 },
  { key: 'health', name: 'Health', sortOrder: 4 },
  { key: 'others', name: 'Others', sortOrder: 5 },
];

/** Set of default expense keys — used to gate the Delete action in CategoryScreen. */
export const DEFAULT_EXPENSE_KEYS: ReadonlySet<string> = new Set(
  DEFAULT_EXPENSE_CATEGORIES.map((c) => c.key),
);

// Income category definitions (used in AddTransactionSheet + FeedScreen)
export interface IncomeCategoryDef {
  key: string;
  name: string;
}

export const INCOME_CATEGORIES: IncomeCategoryDef[] = [
  { key: 'salary', name: 'Salary' },
  { key: 'allowance', name: 'Allowance' },
  { key: 'freelance', name: 'Freelance' },
  { key: 'business', name: 'Business' },
  { key: 'gifts', name: 'Gifts' },
  { key: 'investment', name: 'Investment' },
  { key: 'default', name: 'Others' },
];

/** Set of income keys — used to filter income out of expense-only screens. */
export const INCOME_KEYS: ReadonlySet<string> = new Set(
  INCOME_CATEGORIES.map((c) => c.key),
);
