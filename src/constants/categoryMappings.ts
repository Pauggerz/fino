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

// Starter expense categories — shown as opt-in chips on the onboarding
// `CategoriesSlide`. The user picks which (if any) to begin with; nothing
// is auto-seeded except "Others", which is mandatory and locked from
// rename/delete via each row's `is_default` flag (see seed_user_defaults
// in supabase/onboarding_category_picker.sql).
export interface StarterCategoryDef {
  key: string;
  name: string;
  sortOrder: number;
  /** Tile background colour used by CategoryIcon previews. Mirrors
   *  CATEGORY_TILE_BG above so onboarding chips look identical to the
   *  CategoryScreen tiles. */
  tileBg: string;
  /** Glyph / text colour. Mirrors CATEGORY_COLOR above. */
  textColor: string;
}

export const STARTER_EXPENSE_CATEGORIES: StarterCategoryDef[] = [
  { key: 'food',      name: 'Food',      sortOrder: 0, tileBg: '#FDF6E3', textColor: '#C97A20' },
  { key: 'transport', name: 'Transport', sortOrder: 1, tileBg: '#EEF6FF', textColor: '#3A80C0' },
  { key: 'shopping',  name: 'Shopping',  sortOrder: 2, tileBg: '#FFF0F3', textColor: '#C0503A' },
  { key: 'bills',     name: 'Bills',     sortOrder: 3, tileBg: '#F3EFFF', textColor: '#7A4AB8' },
  { key: 'health',    name: 'Health',    sortOrder: 4, tileBg: '#EFF8F2', textColor: '#2d6a4f' },
];

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
