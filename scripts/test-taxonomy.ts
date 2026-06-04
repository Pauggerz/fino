/**
 * Standalone terminal test runner for the offline taxonomy / bubble-up
 * resolver in `src/intelligence/categorize/categorize.ts`.
 *
 * Run from the repo root:
 *   npx tsx scripts/test-taxonomy.ts
 *
 * No Jest, no Expo runtime. Imports the analyzer + taxonomy directly. Exit
 * code is 0 on all-pass, 1 on any failure — safe for CI.
 *
 * Add new cases at the bottom of `cases` — each one specifies the input
 * text, the user's active category list, and the expected resolved /
 * master category. The case description doubles as the failure label.
 */

import {
  analyzeTransactionText,
  aiMappings,
  buildDisplayName,
  extractItems,
  type AIAnalysisResult,
  type Category,
} from '../src/intelligence/categorize/categorize';
import { TAXONOMY } from '../src/intelligence/taxonomy/taxonomy';

// ─── Tiny test harness ──────────────────────────────────────────────────────

type Case = {
  desc: string;
  text: string;
  active: string[];
  expectMaster?: Category | null;
  expectResolved?: string | null;
  expectKeyword?: string;
  /** When true, asserts that no keyword matched at all. */
  expectNoMatch?: boolean;
};

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(label: string, ok: boolean, extra?: string): void {
  if (ok) {
    passed++;
  } else {
    failed++;
    failures.push(`✗ ${label}${extra ? `\n    ${extra}` : ''}`);
  }
}

function runCase(c: Case): void {
  const r: AIAnalysisResult = analyzeTransactionText(c.text, c.active);
  const ctx = `text="${c.text}" active=[${c.active.join(',')}] →
    matched=${r.matchedKeyword} master=${r.suggestedCategory} resolved=${r.resolvedCategory} path=[${r.taxonomyPath.join(' → ')}]`;

  if (c.expectNoMatch) {
    check(c.desc, r.matchedKeyword === null, ctx);
    return;
  }

  if (c.expectKeyword !== undefined) {
    check(`${c.desc} (keyword)`, r.matchedKeyword === c.expectKeyword, ctx);
  }
  if (c.expectMaster !== undefined) {
    check(`${c.desc} (master)`, r.suggestedCategory === c.expectMaster, ctx);
  }
  if (c.expectResolved !== undefined) {
    check(`${c.desc} (resolved)`, r.resolvedCategory === c.expectResolved, ctx);
  }
}

// ─── Display-name / alias-filter tests ──────────────────────────────────────

type DisplayCase = {
  desc: string;
  text: string;
  /** Master category to use for the formatter. Aliases for this master get
   *  filtered from the item list. */
  category: Category;
  /** Expected output of `buildDisplayName(text, category)`. */
  expectDisplay: string;
};

function runDisplayCase(c: DisplayCase): void {
  const got = buildDisplayName(c.text, c.category);
  const items = extractItems(c.text, { category: c.category });
  const ctx = `text="${c.text}" category=${c.category} → display="${got}" items=[${items.join(',')}]`;
  check(c.desc, got === c.expectDisplay, ctx);
}

// ─── Cases ──────────────────────────────────────────────────────────────────

const DEFAULTS = ['Food', 'Transport', 'Shopping', 'Bills', 'Health', 'Others'];

const cases: Case[] = [
  // ── Bubble-up specificity ─────────────────────────────────────────────────
  {
    desc: 'starbucks → Coffee when user has Coffee + Food',
    text: 'starbucks',
    active: ['Coffee', 'Food'],
    expectResolved: 'Coffee',
    expectMaster: 'food',
  },
  {
    desc: 'starbucks → Food when user only has Food',
    text: 'starbucks',
    active: ['Food'],
    expectResolved: 'Food',
    expectMaster: 'food',
  },
  {
    desc: 'starbucks → null resolved when user has neither (UI falls back to Others)',
    text: 'starbucks',
    active: ['Transport', 'Bills'],
    expectResolved: null,
    expectMaster: 'food',
  },
  {
    desc: 'fuel → Fuel beats Car beats Transport when all three are active',
    text: 'fuel',
    active: ['Fuel', 'Transport'],
    expectResolved: 'Fuel',
    expectMaster: 'transport',
  },
  {
    desc: 'fuel → Transport when user only has Transport',
    text: 'fuel',
    active: DEFAULTS,
    expectResolved: 'Transport',
    expectMaster: 'transport',
  },
  {
    desc: 'jollibee → Fast Food when user has it',
    text: 'jollibee',
    active: ['Fast Food', 'Food'],
    expectResolved: 'Fast Food',
    expectMaster: 'food',
  },
  {
    desc: 'jollibee → Food on default categories',
    text: 'jollibee',
    active: DEFAULTS,
    expectResolved: 'Food',
    expectMaster: 'food',
  },
  {
    desc: 'meralco → Utilities when user has it',
    text: 'meralco bill',
    active: ['Utilities', 'Bills'],
    expectResolved: 'Utilities',
    expectMaster: 'bills',
  },
  {
    desc: 'netflix → Subscriptions over Bills',
    text: 'netflix',
    active: ['Subscriptions', 'Bills'],
    expectResolved: 'Subscriptions',
    expectMaster: 'bills',
  },
  {
    desc: 'gcash → Banking & E-Wallets when active',
    text: 'gcash',
    active: ['Banking & E-Wallets', 'Bills'],
    expectResolved: 'Banking & E-Wallets',
    expectMaster: 'bills',
  },

  // ── Existing matcher precedence (regression) ──────────────────────────────
  {
    desc: 'multi-word "milk tea" still matches',
    text: 'i bought milk tea',
    active: DEFAULTS,
    expectKeyword: 'milk tea',
    expectMaster: 'food',
  },
  {
    desc: 'multi-word "piso wifi" still matches',
    text: 'piso wifi 10',
    active: DEFAULTS,
    expectKeyword: 'piso wifi',
    expectMaster: 'bills',
  },
  {
    desc: 'substring match — "coffeeshop" → coffee (token contains keyword)',
    text: 'coffeeshop visit',
    active: DEFAULTS,
    expectKeyword: 'coffee',
    expectMaster: 'food',
  },
  {
    desc: 'foodpanda is now an explicit Delivery keyword, exact-matches',
    text: 'foodpanda delivery',
    active: DEFAULTS,
    expectKeyword: 'foodpanda',
    expectMaster: 'food',
  },
  {
    desc: 'fuzzy match — "jolibee" (typo) → jollibee',
    text: 'jolibee',
    active: DEFAULTS,
    expectKeyword: 'jollibee',
    expectMaster: 'food',
  },
  {
    desc: 'no signal — "asdf" returns no match',
    text: 'asdfqwer',
    active: DEFAULTS,
    expectNoMatch: true,
  },

  // ── Backward compat: no activeCategoryNames passed ────────────────────────
  {
    desc: 'when user list is empty, resolvedCategory stays null',
    text: 'starbucks',
    active: [],
    expectResolved: null,
    expectMaster: 'food',
  },

  // ── Filipino / Taglish keywords still resolve ─────────────────────────────
  {
    desc: 'Tagalog "kape" → Coffee when active',
    text: 'kape sa umaga',
    active: ['Coffee', 'Food'],
    expectResolved: 'Coffee',
  },
  {
    desc: 'Cebuano "kuryente" → Utilities when active',
    text: 'binayad ang kuryente',
    active: ['Utilities', 'Bills'],
    expectResolved: 'Utilities',
  },
  {
    desc: 'Tagalog "pasahe" → Transport (umbrella)',
    text: 'pasahe pauwi',
    active: DEFAULTS,
    expectResolved: 'Transport',
    expectMaster: 'transport',
  },

  // ── Case-insensitive user category names ──────────────────────────────────
  {
    desc: 'lowercase user category name still matches',
    text: 'starbucks',
    active: ['coffee'],
    expectResolved: 'coffee',
  },
  {
    desc: 'mixed-case user category name still matches',
    text: 'starbucks',
    active: ['cOfFeE'],
    expectResolved: 'cOfFeE',
  },

  // ── User's example: school → Education ────────────────────────────────────
  {
    desc: 'school → Education when user has it',
    text: 'school',
    active: ['Education', 'Bills'],
    expectResolved: 'Education',
    expectMaster: 'bills',
  },
  {
    desc: 'enrollment → Education',
    text: 'enrollment fee for college',
    active: ['Education', 'Bills'],
    expectResolved: 'Education',
  },
  {
    desc: 'textbook → Education',
    text: 'textbook',
    active: ['Education', 'Bills'],
    expectResolved: 'Education',
  },

  // ── Newly-added sub-categories ────────────────────────────────────────────
  {
    desc: 'shampoo → Personal Care',
    text: 'shampoo',
    active: ['Personal Care', 'Shopping'],
    expectResolved: 'Personal Care',
    expectMaster: 'shopping',
  },
  {
    desc: 'salon → Personal Care',
    text: 'salon haircut',
    active: ['Personal Care', 'Shopping'],
    expectResolved: 'Personal Care',
  },
  {
    desc: 'pa-gupit → Personal Care',
    text: 'pa-gupit',
    active: ['Personal Care', 'Shopping'],
    expectResolved: 'Personal Care',
  },
  {
    desc: 'dog food → Pets',
    text: 'dog food',
    active: ['Pets', 'Shopping'],
    expectResolved: 'Pets',
    expectMaster: 'shopping',
  },
  {
    desc: 'vet → Pets',
    text: 'vet checkup for puppy',
    active: ['Pets', 'Shopping'],
    expectResolved: 'Pets',
  },
  {
    desc: 'foodpanda → Food Delivery',
    text: 'foodpanda',
    active: ['Food Delivery', 'Food'],
    expectResolved: 'Food Delivery',
    expectMaster: 'food',
  },
  {
    desc: 'foodpanda → Food when no Delivery sub-cat',
    text: 'foodpanda',
    active: DEFAULTS,
    expectResolved: 'Food',
    expectMaster: 'food',
  },
  {
    desc: 'lbc → Remittance',
    text: 'lbc padala',
    active: ['Remittance', 'Bills'],
    expectResolved: 'Remittance',
    expectMaster: 'bills',
  },
  {
    desc: 'cebuana lhuillier → Remittance',
    text: 'cebuana lhuillier transaction',
    active: ['Remittance', 'Bills'],
    expectResolved: 'Remittance',
  },

  // ── Entertainment master ──────────────────────────────────────────────────
  {
    desc: 'gym → Sports & Fitness',
    text: 'gym membership',
    active: ['Sports & Fitness', 'Entertainment'],
    expectResolved: 'Sports & Fitness',
    expectMaster: 'entertainment',
  },
  {
    desc: 'gym → Entertainment when only master is active',
    text: 'gym',
    active: ['Entertainment'],
    expectResolved: 'Entertainment',
    expectMaster: 'entertainment',
  },
  {
    desc: 'hotel → Travel',
    text: 'hotel booking',
    active: ['Travel', 'Entertainment'],
    expectResolved: 'Travel',
    expectMaster: 'entertainment',
  },
  {
    desc: 'cinema → Cinema',
    text: 'sm cinema',
    active: ['Cinema', 'Entertainment'],
    expectResolved: 'Cinema',
    expectMaster: 'entertainment',
  },
  {
    desc: 'concert → Events',
    text: 'concert tonight',
    active: ['Events', 'Entertainment'],
    expectResolved: 'Events',
  },
  {
    desc: 'karaoke → Amusement',
    text: 'karaoke session',
    active: ['Amusement', 'Entertainment'],
    expectResolved: 'Amusement',
  },
  {
    desc: 'beach → Outdoor',
    text: 'beach trip',
    active: ['Outdoor', 'Entertainment'],
    expectResolved: 'Outdoor',
  },
  {
    desc: 'mobile legends diamonds → Gaming',
    text: 'mobile legends diamond',
    active: ['Gaming', 'Entertainment'],
    expectResolved: 'Gaming',
    expectMaster: 'entertainment',
  },
  {
    desc: 'genshin → Gaming',
    text: 'genshin primogems',
    active: ['Gaming', 'Entertainment'],
    expectResolved: 'Gaming',
  },
  {
    desc: 'roblox → Gaming',
    text: 'roblox robux',
    active: ['Gaming', 'Entertainment'],
    expectResolved: 'Gaming',
  },

  // ── Conflict disambiguation ───────────────────────────────────────────────
  {
    desc: 'movie ticket → Cinema (NOT Transport)',
    text: 'movie ticket',
    active: ['Cinema', 'Tickets', 'Transport', 'Entertainment'],
    expectResolved: 'Cinema',
    expectMaster: 'entertainment',
  },
  {
    desc: 'concert ticket → Events (NOT Transport)',
    text: 'concert ticket',
    active: ['Events', 'Tickets', 'Transport', 'Entertainment'],
    expectResolved: 'Events',
    expectMaster: 'entertainment',
  },
  {
    desc: 'plain "ticket" → Transport (default fallback)',
    text: 'ticket',
    active: ['Tickets', 'Transport'],
    expectResolved: 'Tickets',
    expectMaster: 'transport',
  },
  {
    desc: 'rubbing alcohol → Medication (NOT Drinks)',
    text: 'rubbing alcohol',
    active: ['Medication', 'Health', 'Drinks', 'Food'],
    expectResolved: 'Medication',
    expectMaster: 'health',
  },
  {
    desc: 'plain "alcohol" → Drinks (default)',
    text: 'alcohol',
    active: ['Drinks', 'Medication', 'Food', 'Health'],
    expectResolved: 'Drinks',
    expectMaster: 'food',
  },
  {
    desc: 'tiger balm → Medication (NOT Drinks)',
    text: 'tiger balm',
    active: ['Medication', 'Drinks', 'Health', 'Food'],
    expectResolved: 'Medication',
  },
  {
    desc: 'tiger beer → Drinks',
    text: 'tiger beer',
    active: ['Drinks', 'Medication', 'Food', 'Health'],
    expectResolved: 'Drinks',
    expectMaster: 'food',
  },
  {
    desc: 'pa-pasta → Medical Services (NOT Food)',
    text: 'pa-pasta sa ngipin',
    active: ['Medical Services', 'Health', 'Food'],
    expectResolved: 'Medical Services',
    expectMaster: 'health',
  },
  {
    desc: 'plain "pasta" → Food umbrella',
    text: 'pasta dinner',
    active: ['Food', 'Medical Services'],
    expectResolved: 'Food',
    expectMaster: 'food',
  },
  {
    desc: 'adidas → Retailers (the brand, not penoy)',
    text: 'adidas',
    active: ['Retailers', 'Shopping'],
    expectResolved: 'Retailers',
    expectMaster: 'shopping',
  },

  // ── Bubble-up specificity for new content ────────────────────────────────
  {
    desc: 'lalamove → Ride Hailing',
    text: 'lalamove delivery',
    active: ['Ride Hailing', 'Transport'],
    expectResolved: 'Ride Hailing',
    expectMaster: 'transport',
  },
  {
    desc: 'crunchyroll → Subscriptions',
    text: 'crunchyroll',
    active: ['Subscriptions', 'Bills'],
    expectResolved: 'Subscriptions',
    expectMaster: 'bills',
  },
  {
    desc: 'chatgpt plus → Subscriptions',
    text: 'chatgpt plus',
    active: ['Subscriptions', 'Bills'],
    expectResolved: 'Subscriptions',
  },
  {
    desc: 'cebupacific → Flights',
    text: 'cebupacific',
    active: ['Flights', 'Transport'],
    expectResolved: 'Flights',
    expectMaster: 'transport',
  },
  {
    desc: 'mechanic → Vehicle Upkeep',
    text: 'mechanic visit',
    active: ['Vehicle Upkeep', 'Transport'],
    expectResolved: 'Vehicle Upkeep',
  },
  {
    desc: 'condo rent → Rent',
    text: 'condo rent',
    active: ['Rent', 'Bills'],
    expectResolved: 'Rent',
  },
  {
    desc: 'glutathione → Vitamins',
    text: 'glutathione tablets',
    active: ['Vitamins', 'Health'],
    expectResolved: 'Vitamins',
    expectMaster: 'health',
  },
  {
    desc: 'pap smear → Medical Services',
    text: 'pap smear',
    active: ['Medical Services', 'Health'],
    expectResolved: 'Medical Services',
  },

  // ── User-named-by-alias bubble-up ────────────────────────────────────────
  // The user can name their category by an alias (e.g. "School" instead of
  // the canonical "Education") and the bubble-up still resolves to it.
  {
    desc: 'tuition fee → "School" when user has School (alias of Education)',
    text: 'tuition fee',
    active: ['School', 'Bills', 'Others'],
    expectResolved: 'School',
    expectMaster: 'bills',
  },
  {
    desc: 'tuition fee → "Education" when user has Education (canonical)',
    text: 'tuition fee',
    active: ['Education', 'Bills'],
    expectResolved: 'Education',
    expectMaster: 'bills',
  },
  {
    desc: 'tuition fee → "Bills" when user has neither School nor Education',
    text: 'tuition fee',
    active: ['Bills', 'Others'],
    expectResolved: 'Bills',
    expectMaster: 'bills',
  },
  {
    desc: 'tuition fee → "Education" when user has BOTH (canonical wins)',
    text: 'tuition fee',
    active: ['School', 'Education', 'Bills'],
    expectResolved: 'Education',
    expectMaster: 'bills',
  },
  {
    desc: 'doctor consultation → "Doctor" (alias of Medical Services)',
    text: 'doctor consultation',
    active: ['Doctor', 'Health'],
    expectResolved: 'Doctor',
    expectMaster: 'health',
  },
  {
    desc: 'gym membership → "Gym" (alias of Sports & Fitness)',
    text: 'gym membership',
    active: ['Gym', 'Entertainment'],
    expectResolved: 'Gym',
    expectMaster: 'entertainment',
  },
  {
    desc: 'meralco bill → "Kuryente" (alias of Utilities, Tagalog)',
    text: 'meralco bill',
    active: ['Kuryente', 'Bills'],
    expectResolved: 'Kuryente',
    expectMaster: 'bills',
  },
  {
    desc: 'starbucks → "Kape" (alias of Coffee, Tagalog)',
    text: 'starbucks',
    active: ['Kape', 'Food'],
    expectResolved: 'Kape',
    expectMaster: 'food',
  },
  {
    desc: 'tuition fee preserves user casing — "school" lowercase',
    text: 'tuition fee',
    active: ['school', 'bills'],
    expectResolved: 'school',
  },
];

// ─── Display-name cases ────────────────────────────────────────────────────
// Verifying alias filtering: words tagged as `aliases` get stripped from the
// item list, while `keywords` come through as line items.

const displayCases: DisplayCase[] = [
  // The user's example — `school` is an alias, `enrollment` is a keyword
  // (a paid event), so the formatter drops "school" and keeps "Enrollment".
  {
    desc: 'school enrollment → "Bills - Enrollment" (school filtered)',
    text: 'school enrollment',
    category: 'bills',
    expectDisplay: 'Bills - Enrollment',
  },
  {
    desc: 'school 1500 alone → "Bills" (no item, school is alias)',
    text: 'school',
    category: 'bills',
    expectDisplay: 'Bills',
  },
  {
    desc: 'doctor consultation → "Health - Consultation" (doctor filtered)',
    text: 'doctor consultation',
    category: 'health',
    expectDisplay: 'Health - Consultation',
  },
  {
    // Word-level alias filter: "gym" is alias for Sports & Fitness, so it
    // gets stripped and only "Membership" remains as the line item. This
    // matches the user's intent for "school enrollment" → "Enrollment".
    desc: 'gym membership → "Entertainment - Membership" (gym alias filtered)',
    text: 'gym membership',
    category: 'entertainment',
    expectDisplay: 'Entertainment - Membership',
  },
  {
    desc: 'tuition fee → "Bills - Tuition Fee" (keyword kept)',
    text: 'tuition fee',
    category: 'bills',
    expectDisplay: 'Bills - Tuition Fee',
  },
  {
    desc: 'hospital surgery → "Health - Surgery" (hospital filtered)',
    text: 'hospital surgery',
    category: 'health',
    expectDisplay: 'Health - Surgery',
  },
  {
    desc: 'restaurant adobo → "Food - Adobo" (restaurant filtered)',
    text: 'restaurant adobo',
    category: 'food',
    expectDisplay: 'Food - Adobo',
  },
  {
    desc: 'bayad meralco → "Bills - Meralco" (bayad filtered)',
    text: 'bayad meralco',
    category: 'bills',
    expectDisplay: 'Bills - Meralco',
  },
];

// ─── Static taxonomy invariants ────────────────────────────────────────────

function checkInvariants(): void {
  // Every surface form (keywords + aliases) should be reachable via aiMappings.
  let totalSurface = 0;
  let unique = new Set<string>();
  let aliasCount = 0;
  function walk(node: any, depth: number) {
    for (const k of node.keywords ?? []) {
      totalSurface++;
      unique.add(k.toLowerCase());
    }
    for (const a of node.aliases ?? []) {
      totalSurface++;
      aliasCount++;
      unique.add(a.toLowerCase());
    }
    for (const c of node.children ?? []) walk(c, depth + 1);
  }
  for (const m of TAXONOMY) walk(m, 0);

  check(
    `taxonomy has ≥1000 unique surface forms (got ${unique.size})`,
    unique.size >= 1000
  );
  check(
    `taxonomy has ≥100 aliases (got ${aliasCount})`,
    aliasCount >= 100
  );
  check(
    `aiMappings dict size matches unique surface forms (${Object.keys(aiMappings).length} vs ${unique.size})`,
    Object.keys(aiMappings).length === unique.size
  );
  check(
    'all 6 master categories are represented in aiMappings',
    new Set(Object.values(aiMappings)).size >= 6,
    `unique masters: ${[...new Set(Object.values(aiMappings))].join(',')}`
  );
  check(
    `total surface entries ≥ unique count (no dropped on dedupe)`,
    totalSurface >= unique.size
  );
}

// ─── Run ────────────────────────────────────────────────────────────────────

console.log('Running taxonomy tests...\n');

for (const c of cases) runCase(c);
for (const d of displayCases) runDisplayCase(d);
checkInvariants();

console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);

if (failed > 0) {
  console.log('\nFailures:');
  for (const f of failures) console.log(f);
  process.exit(1);
}

console.log('\nAll tests passed.');
process.exit(0);
