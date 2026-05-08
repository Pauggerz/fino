/**
 * Standalone terminal test runner for the offline taxonomy / bubble-up
 * resolver in `src/services/aiCategoryMap.ts`.
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
  type AIAnalysisResult,
  type Category,
} from '../src/services/aiCategoryMap';
import { TAXONOMY } from '../src/constants/taxonomy';

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
    desc: 'substring match — "foodpanda" → food (token contains keyword)',
    text: 'foodpanda delivery',
    active: DEFAULTS,
    expectKeyword: 'food',
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
];

// ─── Static taxonomy invariants ────────────────────────────────────────────

function checkInvariants(): void {
  // Every leaf keyword should be reachable via aiMappings.
  let totalKw = 0;
  let unique = new Set<string>();
  function walk(node: any, depth: number) {
    for (const k of node.keywords ?? []) {
      totalKw++;
      unique.add(k.toLowerCase());
    }
    for (const c of node.children ?? []) walk(c, depth + 1);
  }
  for (const m of TAXONOMY) walk(m, 0);

  check(
    `taxonomy has ≥200 unique keywords (got ${unique.size})`,
    unique.size >= 200
  );
  check(
    `aiMappings dict size matches unique keywords (${Object.keys(aiMappings).length} vs ${unique.size})`,
    Object.keys(aiMappings).length === unique.size
  );
  check(
    'every master category is represented in aiMappings',
    new Set(Object.values(aiMappings)).size >= 5,
    `unique masters: ${[...new Set(Object.values(aiMappings))].join(',')}`
  );
}

// ─── Run ────────────────────────────────────────────────────────────────────

console.log('Running taxonomy tests...\n');

for (const c of cases) runCase(c);
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
