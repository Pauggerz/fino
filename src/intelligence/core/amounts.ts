/**
 * Amount extraction + calculator-state population.
 *
 * Moved out of `categorize.ts` during the Fino Intelligence consolidation
 * (see FINO_INTELLIGENCE_V2.md §3). Behaviour is unchanged — the Add
 * Transaction sheet, the chat logger, and (soon) the Convo amount slot all
 * share this one extractor.
 */

// Capture group 1: the numeric part. Group 2: an optional magnitude suffix
// ("k"/"m") that immediately follows the digits — "5k" → 5,000, "2.5m" →
// 2,500,000. The suffix is part of the token (no boundary forbids it), but
// the closing `(?![A-Za-z\d])` still rejects longer words like "5kg" / "5km"
// so units of measure aren't mistaken for money.
const AMOUNT_REGEX =
  /(?<![A-Za-z\d])(?:₱|php|p)?\s*(\d+(?:,\d{3})*(?:\.\d+)?)\s*([km])?\s*(?:pesos?|piso|php)?(?![A-Za-z\d])/gi;

const MAGNITUDE: Record<string, number> = { k: 1_000, m: 1_000_000 };

/**
 * Extract numeric amounts from free-form text.
 *
 * The pattern is anchored on both sides so multi-digit numbers are kept
 * whole — e.g. "1234" extracts as [1234], not [123, 4]. A trailing "k"/"m"
 * scales the number ("5k" → 5000, "2.5m" → 2,500,000).
 *
 * Examples:
 *   "I eat at Jollibee and spent 100 pesos" → [100]
 *   "apple 10 mango 20"                     → [10, 20]
 *   "₱1,250.50 for groceries"               → [1250.5]
 *   "rent 12500"                            → [12500]
 *   "received 5k salary"                    → [5000]
 *   "2.5m investment"                       → [2500000]
 */
export function extractAmounts(text: string): number[] {
  if (!text) return [];
  const out: number[] = [];
  AMOUNT_REGEX.lastIndex = 0;
  for (
    let m = AMOUNT_REGEX.exec(text);
    m !== null;
    m = AMOUNT_REGEX.exec(text)
  ) {
    const raw = m[1].replace(/,/g, '');
    let n = parseFloat(raw);
    const suffix = m[2]?.toLowerCase();
    if (suffix && MAGNITUDE[suffix]) n *= MAGNITUDE[suffix];
    if (Number.isFinite(n) && n > 0) out.push(n);
  }
  return out;
}

// ─── Glued-amount recovery ──────────────────────────────────────────────────

// A fast-typed log often glues the amount to the item ("ice crwam20",
// "chicken200", "grab5k"). The main AMOUNT_REGEX rejects those on purpose (its
// lookbehind is what keeps "5kg"/"5km" from reading as money), so the glued
// form extracts NOTHING and the whole message misroutes to the brain as a
// "question". This splitter recovers the amount by inserting a space at the
// letter→digit boundary — conservatively:
//   · the alpha run must be ≥ 3 letters (protects "mp3", "ps5", "a4"),
//   · the digit run must be ≥ 2 digits, a decimal, or carry a k/m magnitude
//     suffix (protects model numbers like "usb3" from becoming ₱3),
//   · the token must end there (no "abc123def"),
//   · the alpha run must not be a known product/model stem glued to a short
//     model number ("iphone15" ≠ ₱15) — see PRODUCT_STEMS below.
const GLUED_AMOUNT_RE =
  /(?<![A-Za-z0-9])([A-Za-z]{3,})(\d{2,7}(?:\.\d+)?|\d\.\d+|\d{1,4}(?:\.\d+)?[km])(?![A-Za-z0-9])/gi;

// Product/brand lines that are routinely written glued to a short MODEL number
// ("iphone15", "covid19", "galaxy24"). These are structurally identical to a
// real glued price ("crwam20" → ₱20) — the only thing that separates them is
// that the alpha run names a known product, so a denylist is the right tool
// (REVIEW_2026-07-08 P0.2). Kept to unambiguous stems (no everyday English
// words) so a genuine glued log is never wrongly withheld.
const PRODUCT_STEMS = new Set([
  'iphone', 'ipad', 'ipod', 'imac', 'macbook', 'airpods', 'airpod', 'ios',
  'ipados', 'macos', 'galaxy', 'pixel', 'redmi', 'poco', 'realme', 'infinix',
  'tecno', 'oppo', 'vivo', 'huawei', 'honor', 'oneplus', 'motorola', 'nokia',
  'xbox', 'playstation', 'nintendo', 'covid', 'sars', 'gtx', 'rtx', 'ryzen',
  'snapdragon',
]);

// A short bare integer (no decimal, no k/m magnitude): a model number, not a
// peso price. "iphone15" hits this; "iphone1500" / "grab5k" / "case12.50" do
// not, so a genuinely glued price still splits even on a product stem.
const MODEL_NUMBER_RE = /^\d{1,3}$/;

/** Insert a space at glued letter→digit boundaries ("crwam20" → "crwam 20"). */
export function splitGluedAmounts(text: string): string {
  if (!text) return text;
  return text.replace(GLUED_AMOUNT_RE, (match, alpha: string, digits: string) =>
    PRODUCT_STEMS.has(alpha.toLowerCase()) && MODEL_NUMBER_RE.test(digits)
      ? match
      : `${alpha} ${digits}`
  );
}

/**
 * Amount extraction with glued-token recovery. Behaves exactly like
 * {@link extractAmounts} whenever the text already yields amounts; ONLY when it
 * yields none does it try the glue-split surface. Callers that also need the
 * recovered surface for categorization/display get it back alongside.
 */
export function extractAmountsRecovered(text: string): {
  amounts: number[];
  /** The surface amounts were read from — `text`, or the glue-split rewrite. */
  surface: string;
} {
  const direct = extractAmounts(text);
  if (direct.length > 0) return { amounts: direct, surface: text };
  const split = splitGluedAmounts(text);
  if (split !== text) {
    const recovered = extractAmounts(split);
    if (recovered.length > 0) return { amounts: recovered, surface: split };
  }
  return { amounts: [], surface: text };
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
