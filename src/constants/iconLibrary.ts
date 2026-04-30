// Picker library for the CategoryScreen — selectable icons. Every key here
// must also exist in CATEGORY_ICON_PATHS so CategoryIcon can render it.
//
// Order matters: icons are rendered top-to-bottom, left-to-right in the picker
// grid. The first six match the six default expense categories so users see a
// familiar set first, followed by the most commonly-requested custom themes.

export interface IconLibraryEntry {
  /** Stored on the category row as `emoji`; used as the key in CATEGORY_ICON_PATHS. */
  key: string;
  /** Short label shown under the icon in the picker grid. */
  label: string;
}

export const ICON_LIBRARY: readonly IconLibraryEntry[] = [
  // Defaults — first row mirrors the six built-in expense categories.
  { key: 'food', label: 'Food' },
  { key: 'transport', label: 'Transport' },
  { key: 'shopping', label: 'Shopping' },
  { key: 'bills', label: 'Bills' },
  { key: 'health', label: 'Health' },
  { key: 'others', label: 'Others' },
  // Daily life
  { key: 'coffee', label: 'Coffee' },
  { key: 'groceries', label: 'Groceries' },
  { key: 'drinks', label: 'Drinks' },
  // Living
  { key: 'home', label: 'Home' },
  { key: 'phone', label: 'Phone' },
  { key: 'subscription', label: 'Subs' },
  // Transport & travel
  { key: 'car', label: 'Car' },
  { key: 'fuel', label: 'Fuel' },
  { key: 'travel', label: 'Travel' },
  // Lifestyle
  { key: 'clothing', label: 'Clothes' },
  { key: 'beauty', label: 'Beauty' },
  { key: 'fitness', label: 'Fitness' },
  // Leisure
  { key: 'entertainment', label: 'Movies' },
  { key: 'gaming', label: 'Gaming' },
  { key: 'books', label: 'Books' },
  // Personal
  { key: 'education', label: 'School' },
  { key: 'pet', label: 'Pet' },
  { key: 'gifts', label: 'Gifts' },
  // Money
  { key: 'charity', label: 'Charity' },
];

// Swatch palette for the colour picker. Sixteen options for breadth without
// overwhelming the picker — covers the warm/cool/neutral spectrum so users
// can colour-code categories meaningfully.
export const CATEGORY_SWATCHES: readonly string[] = [
  '#C97A20', // amber
  '#E07A2C', // orange
  '#D04545', // red
  '#C0503A', // coral
  '#B23A8E', // pink
  '#A04090', // magenta
  '#7A4AB8', // violet
  '#4A52A0', // indigo
  '#3A80C0', // blue
  '#2A8FB0', // cyan
  '#1a7a6e', // teal
  '#2d6a4f', // green
  '#4F8A2C', // lime
  '#B8941F', // gold
  '#7A5530', // brown
  '#5C5550', // taupe
];

// Tile-background palette aligned 1:1 with CATEGORY_SWATCHES (same index).
// Lighter, ~12% saturation versions used as the row's wrapper-circle bg.
export const CATEGORY_TILE_BGS: readonly string[] = [
  '#FDF6E3', // amber
  '#FFF1E3', // orange
  '#FFEDED', // red
  '#FFF0F3', // coral
  '#FCEFFA', // pink
  '#F7EAF3', // magenta
  '#F3EFFF', // violet
  '#EBEDF7', // indigo
  '#EEF6FF', // blue
  '#E5F4F8', // cyan
  '#E8F6F5', // teal
  '#EFF8F2', // green
  '#EEF7E5', // lime
  '#FCF6DB', // gold
  '#F4EEE5', // brown
  '#F2EFEC', // taupe
];
