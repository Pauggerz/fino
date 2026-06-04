import { TAXONOMY, type TaxonomyNode, type MasterCategory } from '../taxonomy/taxonomy';
import { transitions } from '../../constants/transitions';
import { levenshtein, maxEditsFor } from '../core/editDistance';
import { tokenize } from '../core/normalize';
import {
  extractAmounts,
  buildAmountState,
  type CalculatorState,
} from '../core/amounts';

// Re-export the relocated primitives so the `@/intelligence` public surface
// stays unchanged after the core/ extraction (see FINO_INTELLIGENCE_V2.md §3).
export { extractAmounts, buildAmountState, type CalculatorState };

export type Category = MasterCategory;

// ─── Taxonomy index — built once at module load ─────────────────────────────
//
// We flatten the tree into two structures:
//   1. `aiMappings` — backward-compatible flat `{ keyword → master }` dict.
//      Used by `buildDisplayName` (which iterates transport keywords) and
//      external callers/tests that expect the old shape.
//   2. `KEYWORD_PATHS` — `{ keyword → leaf-to-root path[] }`, used by the
//      bubble-up resolver to find the most specific user-active category.
//
// When two nodes share a keyword (e.g. "tea" could in theory be in both
// food/drinks and bills), the deeper / first-registered node wins — but in
// practice the taxonomy avoids duplicates so this is purely defensive.

type KeywordPath = TaxonomyNode[]; // index 0 = leaf, last = master

const KEYWORD_PATHS: Record<string, KeywordPath> = {};
const _aiMappings: Record<string, Category> = {};

// Aliases per master — used by extractItems / buildDisplayName to strip
// category-naming words from item lists ("school enrollment" → "Enrollment",
// not "School Enrollment"). Auto-derived from each TaxonomyNode's `aliases`.
const _aliasesByMaster: Record<MasterCategory, Set<string>> = {
  food: new Set(),
  transport: new Set(),
  bills: new Set(),
  health: new Set(),
  shopping: new Set(),
  entertainment: new Set(),
  other: new Set(),
};

function indexNode(node: TaxonomyNode, ancestors: TaxonomyNode[]): void {
  // Index children FIRST so leaf surface forms claim their slot before the
  // master's umbrella terms. Combined with first-registration-wins below,
  // this guarantees that "more specific node wins" on accidental duplicates
  // — matching the bubble-up philosophy.
  if (node.children) {
    for (const child of node.children) {
      indexNode(child, [node, ...ancestors]);
    }
  }
  const path: KeywordPath = [node, ...ancestors];
  // Both aliases and keywords resolve to the same node for *matching*
  // purposes — the difference only matters for display-name formatting.
  const allTerms = [...node.keywords, ...(node.aliases ?? [])];
  for (const kw of allTerms) {
    const key = kw.toLowerCase();
    if (!KEYWORD_PATHS[key]) {
      KEYWORD_PATHS[key] = path;
      _aiMappings[key] = node.master;
    }
  }
  // Aliases also feed the master-level umbrella set used by extractItems.
  for (const alias of node.aliases ?? []) {
    _aliasesByMaster[node.master].add(alias.toLowerCase());
  }
}

for (const master of TAXONOMY) indexNode(master, []);

/** Backward-compatible flat keyword → master dictionary. Derived from the
 *  taxonomy at module load. Don't add to it directly — extend the taxonomy. */
export const aiMappings: Readonly<Record<string, Category>> = _aiMappings;

/**
 * Walk a keyword's path from leaf → master and return the first node that
 * matches an entry in `activeCategoryNames` (case-insensitive). A node
 * "matches" when EITHER:
 *   1. its canonical `name` matches a user category, OR
 *   2. one of its `aliases` matches a user category.
 *
 * Canonical-name matches win over alias matches at the same path step (the
 * user's literal naming choice is most explicit). Walking proceeds leaf →
 * master, so a more-specific node always wins over a less-specific one.
 *
 * Returns `userEntry` — the user's exact category name (preserving their
 * casing) — so callers can surface it in the UI without round-tripping
 * through the taxonomy's canonical names.
 *
 * Example: user has only `["School", "Bills", "Others"]` and types
 * "tuition fee" (taxonomy path = [Education, Bills]).
 *   - Education.name = "Education" — not in user list. Skip.
 *   - Education.aliases includes "school" — matches user's "School". Return.
 * → resolvedCategory = "School" (the user's casing). Without this alias
 *   fallback, the resolver would jump past Education and land on "Bills",
 *   which is wrong: the user clearly means their School category.
 */
function bubbleUp(
  path: KeywordPath,
  activeCategoryNames: string[] | undefined
): { node: TaxonomyNode; userEntry: string | null; pathNames: string[] } {
  const pathNames = path.map((n) => n.name);
  if (!activeCategoryNames || activeCategoryNames.length === 0) {
    return { node: path[0], userEntry: null, pathNames };
  }
  // Map lowercase form → user's exact casing, so we can return their
  // preferred capitalization regardless of how the taxonomy spells it.
  const userByLower = new Map<string, string>();
  for (const name of activeCategoryNames) {
    userByLower.set(name.toLowerCase(), name);
  }

  for (const node of path) {
    // 1) Canonical name first — user's literal naming choice wins.
    const canonHit = userByLower.get(node.name.toLowerCase());
    if (canonHit) {
      return { node, userEntry: canonHit, pathNames };
    }
    // 2) Then aliases — lets the user name their category by an alternative
    //    name (e.g. "School" instead of "Education") and still resolve.
    for (const alias of node.aliases ?? []) {
      const aliasHit = userByLower.get(alias.toLowerCase());
      if (aliasHit) {
        return { node, userEntry: aliasHit, pathNames };
      }
    }
  }
  // Nothing along the path matched — caller falls back to "Others" / blank.
  return { node: path[path.length - 1], userEntry: null, pathNames };
}

export interface AIAnalysisResult {
  /** Master expense category — used for display-name formatting and the legacy
   *  Pro Gemini suggestion path. Always set when `matchedKeyword` is set. */
  suggestedCategory: Category | null;
  confidence: 'high' | 'medium' | 'low';
  matchedKeyword: string | null;
  /** Where the category signal came from — stored with every saved transaction. */
  signal_source: 'ai_description' | 'none';
  /** Sum of any amounts extracted from the text (e.g. "apple 10 mango 20" → 30). */
  suggestedAmount: number | null;
  /** Individual amounts pulled out of the text, in the order they appeared. */
  extractedAmounts: number[];
  /** Bubble-up result — the most-specific user-active category name the
   *  matched keyword resolves to. `null` when nothing along the path
   *  matched the user's active categories (UI should fall back to "Others").
   *  Only populated when `analyzeTransactionText` is called with the user's
   *  active category list. */
  resolvedCategory: string | null;
  /** Full taxonomy path for the matched keyword, leaf → master. Useful for
   *  debugging and the optional "why this category?" tutorial. */
  taxonomyPath: string[];
}

// ─── Account detection ──────────────────────────────────────────────────────

/**
 * Common aliases users type for popular Philippine accounts. Keys are the
 * canonical account names (matched case-insensitively against the user's
 * actual account list). Values are surface forms that should map back to it.
 */
const ACCOUNT_ALIASES: Record<string, string[]> = {
  gcash: ['gcash', 'g-cash', 'g cash', 'gc'],
  maya: ['maya', 'paymaya', 'pay maya', 'pay-maya'],
  bpi: ['bpi', 'bank of the philippine islands'],
  bdo: ['bdo', 'banco de oro'],
  gotyme: ['gotyme', 'go tyme', 'tyme'],
  unionbank: ['unionbank', 'union bank', 'ub'],
  metrobank: ['metrobank', 'metro bank', 'mbtc'],
  pnb: ['pnb', 'philippine national bank'],
  landbank: ['landbank', 'land bank', 'lbp'],
  rcbc: ['rcbc'],
  chinabank: ['chinabank', 'china bank', 'cbc'],
  eastwest: ['eastwest', 'east west', 'ewb'],
  securitybank: ['security bank', 'securitybank', 'sb'],
  cash: ['cash', 'pera', 'cold cash', 'paper cash'],
  wallet: ['wallet', 'pitaka'],
  coins: ['coins', 'coins.ph'],
  grabpay: ['grabpay', 'grab pay'],
};

const ACCOUNT_TRIGGER_WORDS = [
  'via',
  'with',
  'using',
  'thru',
  'through',
  'from',
  'sa',
  'mula',
  'gamit',
  'paid',
  'pay',
  'bayad',
  'transferred',
  'sent',
];

export type AccountLite = { id: string; name: string };

export type AccountMatch = {
  accountId: string;
  accountName: string;
  matchedKeyword: string;
  confidence: 'high' | 'medium';
};

/**
 * Find the most likely account referenced inside a free-text description.
 *
 * Matching is layered (highest signal wins):
 *   1. Trigger phrase ("via gcash", "from BPI", "sa maya") — highest confidence.
 *   2. Direct alias / account-name token in the text.
 *   3. Levenshtein typo-tolerant alias match (≤1 edit, length ≥ 4).
 *
 * Returns `null` when no account name is mentioned. Word-boundaries are
 * enforced so short tokens like "bpi" never match inside other words.
 */
export function detectAccount(
  text: string,
  accounts: AccountLite[]
): AccountMatch | null {
  if (!text || accounts.length === 0) return null;

  const normalized = text.toLowerCase();
  // Pre-build a map of alias-form → account, biased to the user's actual accounts.
  type Alias = { surface: string; account: AccountLite };
  const aliases: Alias[] = [];
  for (const acc of accounts) {
    const lower = acc.name.toLowerCase();
    aliases.push({ surface: lower, account: acc });
    // Pull canonical aliases for known providers.
    const canonical = lower.replace(/[^\w]/g, '');
    const extras = ACCOUNT_ALIASES[canonical];
    if (extras) {
      for (const a of extras) aliases.push({ surface: a, account: acc });
    }
  }
  // Stable sort: longest surfaces first so "g cash" beats "g".
  aliases.sort((a, b) => b.surface.length - a.surface.length);

  const wordBoundary = (surface: string): RegExp => {
    const escaped = surface.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(?:^|[^a-z0-9])${escaped}(?:$|[^a-z0-9])`, 'i');
  };

  // 1) Trigger-phrase match: "<trigger> <surface>" — strongest signal.
  for (const trig of ACCOUNT_TRIGGER_WORDS) {
    const idx = normalized.indexOf(`${trig} `);
    if (idx === -1) continue;
    const tail = normalized.slice(idx + trig.length + 1);
    for (const a of aliases) {
      if (tail.startsWith(a.surface)) {
        const charAfter = tail[a.surface.length];
        if (!charAfter || /[^a-z0-9]/i.test(charAfter)) {
          return {
            accountId: a.account.id,
            accountName: a.account.name,
            matchedKeyword: a.surface,
            confidence: 'high',
          };
        }
      }
    }
  }

  // 2) Direct surface match anywhere in the text (with word boundary).
  for (const a of aliases) {
    if (wordBoundary(a.surface).test(normalized)) {
      return {
        accountId: a.account.id,
        accountName: a.account.name,
        matchedKeyword: a.surface,
        confidence: 'high',
      };
    }
  }

  // 3) Fuzzy alias match — typo tolerance, only on 4+ char surfaces.
  const tokens = tokenize(normalized);
  let best: { match: Alias; distance: number } | null = null;
  for (const a of aliases) {
    if (a.surface.includes(' ') || a.surface.length < 4) continue;
    const tolerance = Math.min(1, maxEditsFor(a.surface));
    if (tolerance === 0) continue;
    for (const tok of tokens) {
      if (Math.abs(tok.length - a.surface.length) > tolerance) continue;
      const d = levenshtein(tok, a.surface, tolerance);
      if (d <= tolerance && (!best || d < best.distance)) {
        best = { match: a, distance: d };
        if (d === 0) break;
      }
    }
  }
  if (best) {
    return {
      accountId: best.match.account.id,
      accountName: best.match.account.name,
      matchedKeyword: best.match.surface,
      confidence: 'medium',
    };
  }

  return null;
}

/**
 * Try to match a single token against the keyword dictionary using
 * Levenshtein distance. Returns the best-matching keyword and its edit
 * distance, or null if nothing within tolerance was found.
 */
function fuzzyKeywordFor(
  token: string
): { keyword: string; distance: number } | null {
  if (!token) return null;
  let best: { keyword: string; distance: number } | null = null;
  for (const key of Object.keys(aiMappings)) {
    if (key.includes(' ') || key.includes('-')) continue; // multi-word handled elsewhere
    const tolerance = Math.min(2, maxEditsFor(key));
    if (Math.abs(key.length - token.length) > tolerance) continue;
    const d = levenshtein(token, key, tolerance);
    if (d <= tolerance && (!best || d < best.distance)) {
      best = { keyword: key, distance: d };
      if (d === 0) break;
    }
  }
  return best;
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Pure text → category analysis (no side-effects).
 * Order of precedence:
 *   1. Multi-word phrase match (e.g. "milk tea")
 *   2. Exact single-word match
 *   3. Substring match — keyword found inside a token (e.g. "grabcar" → "grab")
 *   4. Fuzzy match — Levenshtein within 1–2 edits (handles typos)
 *
 * When `activeCategoryNames` is provided, the matched keyword's taxonomy
 * path is bubbled up: the most-specific node whose `name` matches an active
 * user category wins. e.g. typing "starbucks" with active categories
 * ["Coffee", "Food"] resolves to "Coffee"; with only ["Food"] it resolves to
 * "Food"; with neither, `resolvedCategory` is null and the UI falls back to
 * "Others". When `activeCategoryNames` is omitted, `resolvedCategory` stays
 * null and only `suggestedCategory` (master) is populated — preserving
 * back-compat for callers that don't track user categories.
 *
 * Also extracts numeric amounts from the text via {@link extractAmounts} so
 * the UI can auto-fill the amount field.
 */
export function analyzeTransactionText(
  text: string,
  activeCategoryNames?: string[]
): AIAnalysisResult {
  const empty: AIAnalysisResult = {
    suggestedCategory: null,
    confidence: 'low',
    matchedKeyword: null,
    signal_source: 'none',
    suggestedAmount: null,
    extractedAmounts: [],
    resolvedCategory: null,
    taxonomyPath: [],
  };

  if (!text || text.trim() === '') return empty;

  const normalizedText = text.toLowerCase().trim();
  const words = tokenize(normalizedText);

  const extractedAmounts = extractAmounts(text);
  const suggestedAmount =
    extractedAmounts.length > 0
      ? Math.round(
          extractedAmounts.reduce((s, n) => s + n, 0) * 100
        ) / 100
      : null;

  const finalize = (
    matchedKeyword: string,
    confidence: 'high' | 'medium' | 'low'
  ): AIAnalysisResult => {
    const path = KEYWORD_PATHS[matchedKeyword];
    const master = aiMappings[matchedKeyword] ?? null;
    let resolvedCategory: string | null = null;
    let taxonomyPath: string[] = [];
    if (path) {
      const bubble = bubbleUp(path, activeCategoryNames);
      taxonomyPath = bubble.pathNames;
      // bubbleUp matches user categories against both canonical names AND
      // aliases, then returns the user's exact casing as `userEntry`. So
      // typing "tuition fee" with active=["School", "Bills"] resolves to
      // "School" (alias of Education) rather than skipping past Education
      // and landing on Bills.
      if (bubble.userEntry) {
        resolvedCategory = bubble.userEntry;
      }
    }
    return {
      suggestedCategory: master,
      confidence,
      matchedKeyword,
      signal_source: 'ai_description',
      suggestedAmount,
      extractedAmounts,
      resolvedCategory,
      taxonomyPath,
    };
  };

  // 1) Multi-word phrase match (e.g. "milk tea", "piso wifi")
  const multiWordMatch = Object.keys(aiMappings).find(
    (key) => key.includes(' ') && normalizedText.includes(key)
  );
  if (multiWordMatch) {
    return finalize(multiWordMatch, 'high');
  }

  // 2) Exact single-word match
  const wordMatch = words.find((w) => aiMappings[w]);
  if (wordMatch) {
    return finalize(wordMatch, 'high');
  }

  // 3) Substring match — handles compounds like "grabcar", "foodpanda"
  for (const key of Object.keys(aiMappings)) {
    if (key.length < 4 || key.includes(' ') || key.includes('-')) continue;
    if (words.some((w) => w !== key && w.includes(key))) {
      return finalize(key, 'high');
    }
  }

  // 4) Fuzzy match — typo tolerant
  let bestFuzzy: { keyword: string; distance: number } | null = null;
  for (const w of words) {
    const hit = fuzzyKeywordFor(w);
    if (hit && (!bestFuzzy || hit.distance < bestFuzzy.distance)) {
      bestFuzzy = hit;
      if (hit.distance === 0) break;
    }
  }
  if (bestFuzzy) {
    return finalize(bestFuzzy.keyword, bestFuzzy.distance === 0 ? 'high' : 'medium');
  }

  // No category — but still return any extracted amount so the UI can
  // auto-fill even when the description is unrecognised.
  return {
    ...empty,
    suggestedAmount,
    extractedAmounts,
  };
}

export type AIAnalysisCallback = (result: AIAnalysisResult) => void;

/**
 * Returns a debounced analyzer that matches the prototype's
 * `clearTimeout(aiMapTimer)` pattern (300 ms debounce).
 *
 * Usage:
 *   const analyzer = useRef(createDebouncedAnalyzer()).current;
 *   analyzer.analyze(text, userCategoryNames, (result) => { ... });
 *   // call analyzer.cancel() on unmount
 *
 * `activeCategoryNames` is forwarded to {@link analyzeTransactionText} so
 * the bubble-up resolver can pick the most-specific user category. Pass
 * `[]` (or undefined) to skip bubble-up and only get the master category.
 */
export function createDebouncedAnalyzer(): {
  analyze: (
    text: string,
    activeCategoryNames: string[] | undefined,
    cb: AIAnalysisCallback
  ) => void;
  cancel: () => void;
} {
  let timer: ReturnType<typeof setTimeout> | null = null;

  return {
    analyze(text, activeCategoryNames, cb) {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        cb(analyzeTransactionText(text, activeCategoryNames));
        timer = null;
      }, transitions.AI_MAPPING_DEBOUNCE); // 300 ms
    },
    cancel() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    },
  };
}

// ─── Display-name builder ───────────────────────────────────────────────────

/**
 * Words that should be filtered out when extracting "what was bought".
 * Includes English/Tagalog/Cebuano stop words and verbs that describe the
 * act of spending rather than the item itself.
 */
const DISPLAY_STOP_WORDS = new Set<string>([
  // English fillers
  'i', 'me', 'my', 'mine', 'we', 'us', 'our', 'you', 'your',
  'a', 'an', 'the', 'and', 'or', 'plus', 'with', 'for', 'to', 'at',
  'in', 'on', 'of', 'from', 'into', 'onto', 'than', 'then', 'as',
  'this', 'that', 'these', 'those', 'so', 'just',
  // Pronouns / reflexives
  'myself', 'yourself', 'himself', 'herself', 'itself', 'ourselves',
  'themselves', 'him', 'her', 'them', 'it', 'his', 'hers', 'its', 'theirs',
  // Adjectives / descriptors (conversational filler)
  'very', 'really', 'quite', 'pretty', 'super', 'so', 'too', 'more',
  'most', 'much', 'many', 'some', 'few', 'any', 'all', 'both', 'each',
  'every', 'nice', 'good', 'great', 'cool', 'awesome', 'new', 'old',
  'big', 'small', 'cheap', 'expensive', 'free', 'extra', 'other', 'another',
  // Adverbs / filler
  'also', 'even', 'still', 'already', 'again', 'often', 'now', 'here',
  'there', 'back', 'out', 'up', 'down', 'away', 'off', 'along',
  // Common nouns that are never the item
  'friends', 'friend', 'family', 'kids', 'people', 'someone',
  // Auxiliary / linking verbs
  'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'do', 'does', 'did', 'will', 'would', 'could', 'should', 'shall',
  'may', 'might', 'must', 'can', 'let', 'make', 'made', 'get',
  // Prepositions
  'about', 'above', 'after', 'before', 'between', 'by', 'during',
  'inside', 'near', 'over', 'since', 'through', 'under', 'until', 'upon',
  'within', 'without', 'around', 'against',
  // Tagalog / Filipino
  'na', 'ng', 'mga', 'ang', 'ako', 'ko', 'sa', 'kay', 'din', 'rin',
  'lang', 'po', 'opo', 'ay', 'ito', 'iyon', 'siya', 'kami', 'kayo', 'sila',
  'ni', 'nila', 'naming', 'natin', 'niya',
  // Tagalog particles / markers
  'nag', 'mag', 'um', 'in', 'an', 'pa', 'naman', 'talaga', 'pala',
  'kasi', 'pero', 'dahil', 'kung', 'kapag', 'habang', 'bago', 'pagkatapos',
  'pwede', 'dapat', 'gusto', 'sana', 'kaya', 'dito', 'doon', 'rin',
  'went', 'go', 'went', 'came',
  // Cebuano / Bisaya
  'ikaw', 'kita', 'nako', 'nimo', 'namo', 'nato',
  'ug', 'ra', 'gani', 'pud', 'pod', 'baya',
  // Cebuano linkers / contractions / quantifiers
  'nga', 'kug', "ko'g", 'tag', 'usa', 'duha', 'tulo', 'upat', 'lima',
  'gamay', 'dako', 'gamit', 'unya', 'taas', 'naa', 'nia', 'aron',
  // Verbs / actions (English + Tagalog + Cebuano)
  'spent', 'spend', 'bought', 'buy', 'paid', 'pay', 'paying',
  'ate', 'eat', 'eats', 'eating', 'got', 'gets', 'getting', 'have',
  'had', 'has', 'order', 'ordered', 'ordering', 'used',
  'kain', 'kumain', 'kakain', 'mag-kain', 'magkain',
  'kaon', 'mikaon', 'mokaon', 'mukaon', 'nagkaon', 'kumakain',
  'bumili', 'bili', 'mipalit', 'palit', 'mopalit', 'pumalit',
  'binayad', 'bayad', 'magbayad', 'nibayad', 'mibayad',
  // Time refs
  'today', 'yesterday', 'tomorrow', 'tonight',
  'kahapon', 'bukas', 'ngayon', 'kanina', 'mamaya', 'gabi', 'umaga',
  'gabii', 'buntag', 'ugma', 'karon',
]);

const TRANSPORT_DESTINATION_WORDS = [
  'to',
  'papuntang',
  'patungo',
  'patungong',
  'paadto',
  'padulong',
  'paingon',
  'padto',
  'going',
];

/**
 * Connector phrases that split an item list. "+" / "," / "and" / "plus" /
 * "ug" (Cebuano: and) / "tsaka" (Tagalog colloquial: and). Replaced with the
 * pipe separator before splitting.
 */
const ITEM_CONNECTOR_PATTERN = /\b(?:and|plus|then|ug|tsaka)\b/gi;

/**
 * Per-category "parent" or umbrella terms — the user is naming the
 * category itself rather than a specific item. e.g. "pagkaon" inside a
 * Food entry just means "food", so we don't list it as an item alongside
 * "rice" and "dinuguan". Merchants/leaf items (Jollibee, Adobo, Meralco,
 * Watsons…) are kept on purpose; only the umbrella nouns/verbs sit here.
 *
 * Auto-derived from each TaxonomyNode's `aliases` field. To add an umbrella
 * term, add it to the relevant node's `aliases` in `taxonomy.ts` — not here.
 */
const CATEGORY_PARENT_TERMS: Record<Category, Set<string>> = _aliasesByMaster;

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Joins item strings with Oxford-style ", " and " & " (e.g. "A, B & C"). */
function formatItemList(items: string[]): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} & ${items[1]}`;
  return `${items.slice(0, -1).join(', ')} & ${items[items.length - 1]}`;
}

function capWords(s: string): string {
  return s
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

const CATEGORY_LABELS: Record<Category, string> = {
  food: 'Food',
  transport: 'Transport',
  shopping: 'Shopping',
  bills: 'Bills',
  health: 'Health',
  entertainment: 'Entertainment',
  other: 'Other',
};

/**
 * Strip currency tokens, account-trigger phrases, and the account surface
 * itself so they don't bleed into the extracted item list.
 */
// All known account alias surfaces (flat list, longest first for greedy matching).
const ALL_ACCOUNT_SURFACES: string[] = Object.values(ACCOUNT_ALIASES)
  .flat()
  .sort((a, b) => b.length - a.length);

function scrubAuxText(text: string, accountSurface?: string | null): string {
  let cleaned = ` ${text.toLowerCase()} `;
  // Strip the caller-supplied account surface (with and without trigger word).
  if (accountSurface) {
    const acctEsc = escapeRegex(accountSurface.toLowerCase());
    const triggers = ACCOUNT_TRIGGER_WORDS.map(escapeRegex).join('|');
    cleaned = cleaned.replace(
      new RegExp(`\\b(?:${triggers})\\s+${acctEsc}\\b`, 'gi'),
      ' '
    );
    cleaned = cleaned.replace(new RegExp(`\\b${acctEsc}\\b`, 'gi'), ' ');
  }
  // Also strip every known account alias so "gcash" / "bpi" / etc. never
  // bleed into the item name regardless of whether a trigger word preceded it.
  for (const surface of ALL_ACCOUNT_SURFACES) {
    const surfEsc = escapeRegex(surface);
    cleaned = cleaned.replace(new RegExp(`\\b${surfEsc}\\b`, 'gi'), ' ');
  }
  cleaned = cleaned.replace(/₱|\bpesos?\b|\bpiso\b|\bphp\b/gi, ' ');
  return cleaned;
}

/**
 * Pull the "items" the user described — for "20 for rice and 10 for chicken"
 * this returns ['rice', 'chicken']. Numbers, currency markers, account
 * triggers, and stop words are stripped. Connector words (and / plus / + /
 * ug / tsaka) split items into separate phrases.
 *
 * When `category` is provided, "parent" or umbrella terms for that category
 * are also dropped. e.g. "Palit kug pagkaon nga rice ug dinuguan" with
 * category=food → ['rice', 'dinuguan'] (no 'pagkaon', no 'palit', no 'nga').
 */
export function extractItems(
  text: string,
  options: {
    accountSurface?: string | null;
    category?: Category | null;
  } = {}
): string[] {
  if (!text || !text.trim()) return [];
  let cleaned = scrubAuxText(text, options.accountSurface ?? null);
  // Replace numeric runs with separator.
  cleaned = cleaned.replace(/\d+(?:[.,]\d+)*/g, '|');
  // Replace connectors with separator (covers "+", ",", "and", "plus", "ug").
  cleaned = cleaned.replace(/[+,]/g, '|');
  cleaned = cleaned.replace(ITEM_CONNECTOR_PATTERN, '|');

  const parentTerms = options.category
    ? CATEGORY_PARENT_TERMS[options.category]
    : null;

  const segments = cleaned.split('|');
  const seen = new Set<string>();
  const out: string[] = [];
  for (const seg of segments) {
    const words = seg
      .split(/\s+/)
      .map((w) => w.replace(/[^\w-]/g, ''))
      .filter((w) => {
        if (w.length === 0) return false;
        const lower = w.toLowerCase();
        if (DISPLAY_STOP_WORDS.has(lower)) return false;
        if (parentTerms && parentTerms.has(lower)) return false;
        return true;
      });
    if (words.length === 0) continue;
    const phrase = words.join(' ');
    const key = phrase.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(phrase);
  }

  // Fallback: if all words were filtered, surface any taxonomy keywords present
  // in the text (keywords are receipt-level items, not category umbrella aliases
  // and are never in parentTerms, so they survive this second pass cleanly).
  if (out.length === 0) {
    const rawWords = tokenize(text);
    const seen2 = new Set<string>();
    for (const w of rawWords) {
      if (!aiMappings[w]) continue;
      if (DISPLAY_STOP_WORDS.has(w)) continue;
      if (parentTerms && parentTerms.has(w)) continue;
      if (seen2.has(w)) continue;
      seen2.add(w);
      out.push(w);
    }
  }

  return out;
}

/**
 * Build a structured transaction display name from the user's free-text
 * description. Format depends on category:
 *
 *   Food / Shopping / Bills / Health
 *     "<Category> - <Item> + <Item>"   e.g. "Food - Adobo + Rice"
 *
 *   Transport
 *     "<Vehicle> to <Place>"            e.g. "Grab to Quezon City"
 *     "Transport to <Place>"            (vehicle unknown)
 *     "<Vehicle>"                       (no destination)
 *     "Transport"                       (nothing extractable)
 */
export function buildDisplayName(
  text: string,
  category: Category | null,
  options: { accountSurface?: string | null; label?: string } = {}
): string {
  const label = options.label ?? (category ? CATEGORY_LABELS[category] : 'Other');
  if (!text || !text.trim()) return label;

  if (category === 'transport') {
    // Split the text into segments first so "Ticket to Manila + tricycle"
    // becomes two separate trips rather than collapsing to a single one.
    const cleaned = scrubAuxText(text, options.accountSurface ?? null)
      .replace(/\d+(?:[.,]\d+)*/g, '|')
      .replace(/[+,]/g, '|')
      .replace(ITEM_CONNECTOR_PATTERN, '|');

    const transportKeys = Object.keys(aiMappings)
      .filter((k) => aiMappings[k] === 'transport')
      .sort((a, b) => b.length - a.length);

    const destPattern = new RegExp(
      `\\b(?:${TRANSPORT_DESTINATION_WORDS.map(escapeRegex).join('|')})\\b\\s+(.+)`,
      'i'
    );

    const segments = cleaned
      .split('|')
      .map((s) => s.trim())
      .filter(Boolean);

    const formatSegment = (seg: string): string | null => {
      // Destination via "to <place>" / "papuntang <place>" / etc.
      let place: string | null = null;
      const m = seg.match(destPattern);
      if (m) {
        const tail = m[1]
          .split(/\b(?:via|using|with|from|gamit)\b/i)[0]
          .trim();
        const placeWords = tail
          .split(/\s+/)
          .map((w) => w.replace(/[^\w-]/g, ''))
          .filter(
            (w) =>
              w.length > 0 &&
              !DISPLAY_STOP_WORDS.has(w.toLowerCase())
          );
        if (placeWords.length > 0) place = placeWords.join(' ');
      }

      let vehicle: string | null = null;
      for (const k of transportKeys) {
        const re = new RegExp(`\\b${escapeRegex(k)}\\b`, 'i');
        if (re.test(seg)) {
          vehicle = k;
          break;
        }
      }

      if (!vehicle && !place) return null;
      const v = vehicle ? capWords(vehicle) : 'Transport';
      return place ? `${v} to ${capWords(place)}` : v;
    };

    const formatted = segments
      .map(formatSegment)
      .filter((s): s is string => s !== null);

    if (formatted.length === 0) return 'Transport';
    const seen = new Set<string>();
    const unique = formatted.filter((s) => {
      const k = s.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    return unique.join(' + ');
  }

  const items = extractItems(text, { ...options, category });
  if (items.length === 0) return label;
  return `${label} - ${formatItemList(items.map(capWords))}`;
}
