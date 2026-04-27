import categoryMappings from '../constants/categoryMappings';
import { transitions } from '../constants/transitions';

export type Category =
  | 'food'
  | 'transport'
  | 'shopping'
  | 'bills'
  | 'health'
  | 'other';

/** Expose the mapping dict for external use (e.g. tests). */
export const aiMappings = categoryMappings;

export interface AIAnalysisResult {
  suggestedCategory: Category | null;
  confidence: 'high' | 'medium' | 'low';
  matchedKeyword: string | null;
  /** Where the category signal came from — stored with every saved transaction. */
  signal_source: 'ai_description' | 'none';
  /** Sum of any amounts extracted from the text (e.g. "apple 10 mango 20" → 30). */
  suggestedAmount: number | null;
  /** Individual amounts pulled out of the text, in the order they appeared. */
  extractedAmounts: number[];
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Bounded Levenshtein distance — returns early once `max` is exceeded.
 * Used to allow typo-tolerant keyword matching (max 2 edits) without ever
 * letting unrelated short words masquerade as matches.
 */
function levenshtein(a: string, b: string, max: number): number {
  if (a === b) return 0;
  const al = a.length;
  const bl = b.length;
  if (Math.abs(al - bl) > max) return max + 1;
  if (al === 0) return bl;
  if (bl === 0) return al;

  let prev = new Array<number>(bl + 1);
  let curr = new Array<number>(bl + 1);
  for (let j = 0; j <= bl; j++) prev[j] = j;

  for (let i = 1; i <= al; i++) {
    curr[0] = i;
    let rowMin = curr[0];
    for (let j = 1; j <= bl; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1, // deletion
        curr[j - 1] + 1, // insertion
        prev[j - 1] + cost // substitution
      );
      if (curr[j] < rowMin) rowMin = curr[j];
    }
    if (rowMin > max) return max + 1;
    [prev, curr] = [curr, prev];
  }
  return prev[bl];
}

/** Acceptable typo tolerance scales with keyword length to avoid false positives. */
function maxEditsFor(keyword: string): number {
  if (keyword.length <= 3) return 0; // "sm", "tm", "tnt" — exact only
  if (keyword.length <= 5) return 1;
  return 2;
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

const AMOUNT_REGEX =
  /(?<![A-Za-z\d])(?:₱|php|p)?\s*(\d+(?:,\d{3})*(?:\.\d+)?)\s*(?:pesos?|piso|php)?(?![A-Za-z\d])/gi;

/**
 * Extract numeric amounts from free-form text.
 *
 * The pattern is anchored on both sides so multi-digit numbers are kept
 * whole — e.g. "1234" extracts as [1234], not [123, 4].
 *
 * Examples:
 *   "I eat at Jollibee and spent 100 pesos" → [100]
 *   "apple 10 mango 20"                     → [10, 20]
 *   "₱1,250.50 for groceries"               → [1250.5]
 *   "rent 12500"                            → [12500]
 */
export function extractAmounts(text: string): number[] {
  if (!text) return [];
  const out: number[] = [];
  AMOUNT_REGEX.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = AMOUNT_REGEX.exec(text)) !== null) {
    const raw = m[1].replace(/,/g, '');
    const n = parseFloat(raw);
    if (Number.isFinite(n) && n > 0) out.push(n);
  }
  return out;
}

// ─── Calculator-state population ────────────────────────────────────────────

export type CalculatorState = {
  /** First operand for the pending operation (empty string if none). */
  firstOperand: string;
  /** Pending operator, currently always '+' for AI-extracted multi-amount text. */
  operator: '+' | null;
  /** Active input — what the user would see in the main amount slot. */
  amount: string;
};

function fmtAmount(n: number): string {
  return String(Math.round(n * 100) / 100);
}

/**
 * Translates a list of extracted amounts into calculator-state suitable for
 * the Add Transaction sheet. Two or more amounts produce a pending "+" so
 * the user sees `firstOperand + activeAmount` (e.g. `20 + 10`) and can hit
 * `=` to total — matching how the keypad behaves manually.
 */
export function buildAmountState(amounts: number[]): CalculatorState | null {
  if (!amounts || amounts.length === 0) return null;
  if (amounts.length === 1) {
    return { firstOperand: '', operator: null, amount: fmtAmount(amounts[0]) };
  }
  // Collapse all-but-last as the pending first operand. The user sees
  // "(running sum) + (latest)" which mirrors a manual chain like 20 + 10.
  const last = amounts[amounts.length - 1];
  const rest = amounts.slice(0, -1);
  const sum = rest.reduce((s, n) => s + n, 0);
  return {
    firstOperand: fmtAmount(sum),
    operator: '+',
    amount: fmtAmount(last),
  };
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
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
 * Also extracts numeric amounts from the text via {@link extractAmounts} so
 * the UI can auto-fill the amount field.
 */
export function analyzeTransactionText(text: string): AIAnalysisResult {
  const empty: AIAnalysisResult = {
    suggestedCategory: null,
    confidence: 'low',
    matchedKeyword: null,
    signal_source: 'none',
    suggestedAmount: null,
    extractedAmounts: [],
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
    partial: Omit<
      AIAnalysisResult,
      'suggestedAmount' | 'extractedAmounts' | 'signal_source'
    > & { signal_source?: AIAnalysisResult['signal_source'] }
  ): AIAnalysisResult => ({
    ...partial,
    signal_source: partial.signal_source ?? 'ai_description',
    suggestedAmount,
    extractedAmounts,
  });

  // 1) Multi-word phrase match (e.g. "milk tea", "piso wifi")
  const multiWordMatch = Object.keys(aiMappings).find(
    (key) => key.includes(' ') && normalizedText.includes(key)
  );
  if (multiWordMatch) {
    return finalize({
      suggestedCategory: aiMappings[multiWordMatch],
      confidence: 'high',
      matchedKeyword: multiWordMatch,
    });
  }

  // 2) Exact single-word match
  const wordMatch = words.find((w) => aiMappings[w]);
  if (wordMatch) {
    return finalize({
      suggestedCategory: aiMappings[wordMatch],
      confidence: 'high',
      matchedKeyword: wordMatch,
    });
  }

  // 3) Substring match — handles compounds like "grabcar", "foodpanda"
  for (const key of Object.keys(aiMappings)) {
    if (key.length < 4 || key.includes(' ') || key.includes('-')) continue;
    if (words.some((w) => w !== key && w.includes(key))) {
      return finalize({
        suggestedCategory: aiMappings[key],
        confidence: 'high',
        matchedKeyword: key,
      });
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
    return finalize({
      suggestedCategory: aiMappings[bestFuzzy.keyword],
      confidence: bestFuzzy.distance === 0 ? 'high' : 'medium',
      matchedKeyword: bestFuzzy.keyword,
    });
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
 *   analyzer.analyze(text, (result) => { ... });
 *   // call analyzer.cancel() on unmount
 */
export function createDebouncedAnalyzer(): {
  analyze: (text: string, cb: AIAnalysisCallback) => void;
  cancel: () => void;
} {
  let timer: ReturnType<typeof setTimeout> | null = null;

  return {
    analyze(text: string, cb: AIAnalysisCallback) {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        cb(analyzeTransactionText(text));
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
  // Tagalog / Filipino
  'na', 'ng', 'mga', 'ang', 'ako', 'ko', 'sa', 'kay', 'din', 'rin',
  'lang', 'po', 'opo', 'ay', 'ito', 'iyon', 'siya', 'kami', 'kayo', 'sila',
  'ni', 'nila', 'naming', 'natin', 'niya',
  // Cebuano / Bisaya
  'ako', 'ikaw', 'kita', 'sila', 'nako', 'nimo', 'niya', 'namo', 'nato',
  'ni', 'ug', 'ang', 'sa', 'ra', 'lang', 'gani', 'pud', 'pod', 'baya',
  // Cebuano linkers / contractions / quantifiers (the bits that glue a
  // sentence together but never describe an item)
  'nga', 'kug', "ko'g", 'tag', 'usa', 'duha', 'tulo', 'upat', 'lima',
  'gamay', 'dako', 'gamit', 'unya', 'taas', 'naa', 'nia', 'aron',
  // Verbs / actions (English + Tagalog + Cebuano)
  'spent', 'spend', 'bought', 'buy', 'paid', 'pay', 'paying',
  'ate', 'eat', 'eats', 'eating', 'got', 'gets', 'getting', 'have',
  'had', 'has', 'order', 'ordered', 'ordering', 'order', 'used',
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
 */
const CATEGORY_PARENT_TERMS: Record<Category, Set<string>> = {
  food: new Set([
    'food', 'pagkain', 'pagkaon', 'kainan', 'kain', 'kaon', 'eat', 'ate',
    'eating', 'eats', 'drink', 'drinks', 'meal', 'meals', 'ulam', 'baon',
    'snack', 'snacks', 'breakfast', 'lunch', 'dinner', 'brunch',
    'agahan', 'tanghalian', 'hapunan', 'merienda', 'meryenda',
    'pamahaw', 'paniudto', 'panihapon', 'painit', 'pangaon', 'bahog',
    'restaurant', 'resto', 'cafe', 'cafeteria', 'bakery', 'bakeshop',
    'panaderia', 'carinderia', 'fastfood', 'fast', 'food court',
  ]),
  transport: new Set([
    // For Transport the umbrella verbs/nouns are stripped *only* from items;
    // the formatter picks vehicle keywords directly.
    'transport', 'transpo', 'pasahe', 'pamasahe', 'plete', 'sakay',
    'sakyanan', 'ride', 'commute',
  ]),
  bills: new Set([
    'bill', 'bills', 'bayad', 'subscription', 'prepaid', 'postpaid',
    'load', 'eload', 'paload',
  ]),
  health: new Set([
    'medicine', 'medisina', 'gamot', 'meds', 'tambal', 'consult',
    'consultation', 'checkup', 'check-up', 'prescription',
  ]),
  shopping: new Set(['shop', 'shopping']),
  other: new Set(),
};

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
  other: 'Other',
};

/**
 * Strip currency tokens, account-trigger phrases, and the account surface
 * itself so they don't bleed into the extracted item list.
 */
function scrubAuxText(text: string, accountSurface?: string | null): string {
  let cleaned = ` ${text.toLowerCase()} `;
  if (accountSurface) {
    const acctEsc = escapeRegex(accountSurface.toLowerCase());
    const triggers = ACCOUNT_TRIGGER_WORDS.map(escapeRegex).join('|');
    cleaned = cleaned.replace(
      new RegExp(`\\b(?:${triggers})\\s+${acctEsc}\\b`, 'gi'),
      ' '
    );
    cleaned = cleaned.replace(new RegExp(`\\b${acctEsc}\\b`, 'gi'), ' ');
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
  options: { accountSurface?: string | null } = {}
): string {
  const label = category ? CATEGORY_LABELS[category] : 'Other';
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
  return `${label} - ${items.map(capWords).join(' + ')}`;
}
