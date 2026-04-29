// Picker library for the CategoryScreen — 15 selectable icons. Every key here
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
  { key: 'food', label: 'Food' },
  { key: 'transport', label: 'Transport' },
  { key: 'shopping', label: 'Shopping' },
  { key: 'bills', label: 'Bills' },
  { key: 'health', label: 'Health' },
  { key: 'others', label: 'Others' },
  { key: 'car', label: 'Car' },
  { key: 'home', label: 'Home' },
  { key: 'entertainment', label: 'Movies' },
  { key: 'education', label: 'School' },
  { key: 'fitness', label: 'Fitness' },
  { key: 'travel', label: 'Travel' },
  { key: 'pet', label: 'Pet' },
  { key: 'subscription', label: 'Subs' },
  { key: 'gifts', label: 'Gifts' },
];

// Swatch palette for the colour picker. Eight options — matches the visual
// rhythm of ACCOUNT_COLORS in MoreScreen.tsx.
export const CATEGORY_SWATCHES: readonly string[] = [
  '#C97A20', // amber
  '#3A80C0', // blue
  '#C0503A', // coral
  '#7A4AB8', // violet
  '#2d6a4f', // green
  '#5C5550', // taupe
  '#B23A8E', // pink
  '#1a7a6e', // teal
];

// Tile-background palette aligned 1:1 with CATEGORY_SWATCHES (same index).
// Lighter, ~12% saturation versions used as the row's wrapper-circle bg.
export const CATEGORY_TILE_BGS: readonly string[] = [
  '#FDF6E3',
  '#EEF6FF',
  '#FFF0F3',
  '#F3EFFF',
  '#EFF8F2',
  '#F2EFEC',
  '#FCEFFA',
  '#E8F6F5',
];
