export interface MerchantEntry {
  displayName: string;
  category: 'food' | 'transport' | 'shopping' | 'bills' | 'health';
  /** Normalized uppercase strings that resolve to this merchant */
  aliases: string[];
}

export interface MerchantResolution {
  /** Raw OCR string — always preserved as-is */
  merchant_name: string;
  /** Human-readable name shown in the transaction feed */
  display_name: string;
  /** Auto-mapped category, or null if unresolved */
  category: MerchantEntry['category'] | null;
  /** Which signal produced the display_name */
  signal_source: 'description' | 'merchant' | 'unknown';
}

export const UNKNOWN_MERCHANT_COPY = 'Unknown merchant — what did you buy?';

// ---------------------------------------------------------------------------
// Seed list — minimum 30 PH merchants
// ---------------------------------------------------------------------------

export const MERCHANT_LIST: MerchantEntry[] = [
  // Food & beverage
  { displayName: 'Jollibee', category: 'food', aliases: ['JOLLIBEE'] },
  {
    displayName: "McDonald's",
    category: 'food',
    aliases: ['MCDONALDS', "MCDONALD'S", 'MCDONALD'],
  },
  {
    displayName: 'KFC',
    category: 'food',
    aliases: ['KFC', 'KENTUCKY FRIED CHICKEN'],
  },
  { displayName: 'Chowking', category: 'food', aliases: ['CHOWKING'] },
  {
    displayName: 'Mang Inasal',
    category: 'food',
    aliases: ['MANG INASAL', 'MANGINASAL'],
  },
  { displayName: 'Greenwich', category: 'food', aliases: ['GREENWICH'] },
  {
    displayName: '7-Eleven',
    category: 'food',
    aliases: ['7-ELEVEN', '7 ELEVEN', '7ELEVEN'],
  },
  {
    displayName: 'Ministop',
    category: 'food',
    aliases: ['MINISTOP', 'UNCLE JOHN'],
  },
  {
    displayName: 'FamilyMart',
    category: 'food',
    aliases: ['FAMILYMART', 'FAMILY MART'],
  },

  // Groceries & retail
  {
    displayName: 'SM',
    category: 'shopping',
    aliases: ['SM SUPERMARKET', 'SM HYPERMARKET', 'SM SAVEMORE', 'SM STORE'],
  },
  {
    displayName: 'Robinsons',
    category: 'shopping',
    aliases: ['ROBINSONS', 'ROBINSON'],
  },
  {
    displayName: 'Ayala Malls',
    category: 'shopping',
    aliases: ['AYALA', 'AYALA MALL', 'AYALA MALLS'],
  },
  { displayName: 'Puregold', category: 'shopping', aliases: ['PUREGOLD'] },
  {
    displayName: 'S&R',
    category: 'shopping',
    aliases: ['S&R', 'S AND R', 'SNR'],
  },
  { displayName: 'Shopwise', category: 'shopping', aliases: ['SHOPWISE'] },
  {
    displayName: 'Savemore',
    category: 'shopping',
    aliases: ['SAVEMORE', 'SAVE MORE'],
  },
  {
    displayName: 'National Bookstore',
    category: 'shopping',
    aliases: ['NATIONAL BOOKSTORE', 'NATIONAL BOOK STORE', 'NBS'],
  },

  // Health & pharmacy
  {
    displayName: 'Mercury Drug',
    category: 'health',
    aliases: ['MERCURY DRUG', 'MERCURY'],
  },
  {
    displayName: 'Watsons',
    category: 'health',
    aliases: ['WATSONS', 'WATSON'],
  },
  {
    displayName: 'Rose Pharmacy',
    category: 'health',
    aliases: ['ROSE PHARMACY', 'ROSE PHARMA'],
  },

  // Transport
  {
    displayName: 'Grab',
    category: 'transport',
    aliases: ['GRAB', 'GRAB FOOD', 'GRAB TAXI', 'GRABCAR'],
  },
  { displayName: 'Angkas', category: 'transport', aliases: ['ANGKAS'] },

  // Bills & utilities
  { displayName: 'Meralco', category: 'bills', aliases: ['MERALCO'] },
  { displayName: 'Maynilad', category: 'bills', aliases: ['MAYNILAD'] },
  {
    displayName: 'Manila Water',
    category: 'bills',
    aliases: ['MANILA WATER', 'MANILAWATER'],
  },
  { displayName: 'PLDT', category: 'bills', aliases: ['PLDT'] },
  {
    displayName: 'Globe',
    category: 'bills',
    aliases: ['GLOBE', 'GLOBE TELECOM', 'GLOBE AT HOME'],
  },
  {
    displayName: 'Smart',
    category: 'bills',
    aliases: ['SMART', 'SMART COMMUNICATIONS'],
  },
  {
    displayName: 'DITO',
    category: 'bills',
    aliases: ['DITO', 'DITO TELECOMMUNITY'],
  },
  { displayName: 'Petron', category: 'bills', aliases: ['PETRON'] },
];

// ---------------------------------------------------------------------------
// Internal lookup map: UPPERCASE alias → MerchantEntry
// ---------------------------------------------------------------------------

const aliasMap = new Map<string, MerchantEntry>();
for (const entry of MERCHANT_LIST) {
  for (const alias of entry.aliases) {
    aliasMap.set(alias.toUpperCase(), entry);
  }
}

/**
 * Find a MerchantEntry whose alias appears anywhere in `text`.
 * Longer aliases are tested first to prevent partial matches
 * (e.g. "SM SUPERMARKET" before "SM").
 */
function matchMerchant(text: string): MerchantEntry | null {
  const normalized = text.toUpperCase();
  const aliases = [...aliasMap.keys()].sort((a, b) => b.length - a.length);
  for (const alias of aliases) {
    if (normalized.includes(alias)) {
      return aliasMap.get(alias)!;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Resolve display_name and category for a transaction.
 *
 * Resolution priority:
 * 1. Description text  — if the user's note names a known merchant
 * 2. Raw OCR string    — matched against the merchant seed list
 * 3. Raw OCR string    — used verbatim when no match found (triggers unknown nudge via signal_source)
 * 4. Unknown fallback  — when rawOcr is empty / whitespace only
 *
 * `merchant_name` is always the raw OCR string, per the data model.
 */
export function resolveMerchant(
  rawOcr: string,
  description?: string
): MerchantResolution {
  const trimmedOcr = rawOcr.trim();

  // Step 1 — description text takes highest priority
  if (description) {
    const match = matchMerchant(description);
    if (match) {
      return {
        merchant_name: trimmedOcr,
        display_name: match.displayName,
        category: match.category,
        signal_source: 'description',
      };
    }
  }

  // Step 2 — match raw OCR against known merchants
  if (trimmedOcr) {
    const match = matchMerchant(trimmedOcr);
    if (match) {
      return {
        merchant_name: trimmedOcr,
        display_name: match.displayName,
        category: match.category,
        signal_source: 'merchant',
      };
    }
  }

  // Step 3 — raw OCR verbatim (unrecognised merchant)
  // Example: "MERCH ID 4827" will fall here. It retains the OCR text as the display name,
  // but flags `signal_source: 'unknown'` so the UI can render the nudge.
  if (trimmedOcr) {
    return {
      merchant_name: trimmedOcr,
      display_name: trimmedOcr,
      category: null,
      signal_source: 'unknown',
    };
  }

  // Step 4 — nothing usable (empty OCR)
  return {
    merchant_name: '',
    display_name: UNKNOWN_MERCHANT_COPY,
    category: null,
    signal_source: 'unknown',
  };
}
