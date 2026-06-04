/**
 * Amount extraction + calculator-state population.
 *
 * Moved out of `categorize.ts` during the Fino Intelligence consolidation
 * (see FINO_INTELLIGENCE_V2.md §3). Behaviour is unchanged — the Add
 * Transaction sheet, the chat logger, and (soon) the Convo amount slot all
 * share this one extractor.
 */

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
  for (
    let m = AMOUNT_REGEX.exec(text);
    m !== null;
    m = AMOUNT_REGEX.exec(text)
  ) {
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
