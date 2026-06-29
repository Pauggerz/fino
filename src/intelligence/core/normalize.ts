/**
 * Shared text-normalization primitives.
 *
 * `tokenize` is the exact tokenizer Auto-Category has always used (moved here
 * verbatim from `categorize.ts` so Convo can share it — no behaviour change).
 * The richer helpers (`foldDiacritics`, `normalize`, `expandNumberWords`) are
 * NEW and used by the Convo brain's canonicalization / slot extraction; they
 * are deliberately NOT wired into the categorize path so the frozen
 * `npm run test:taxonomy` behaviour is untouched.
 *
 * See FINO_INTELLIGENCE_V2.md §2 (the "Preprocessing / normalization" and
 * "Tokenize / stopwords" rows) and §3.
 */

/**
 * The canonical tokenizer for keyword matching: lowercase, replace anything
 * that isn't a word char / whitespace / hyphen with a space, split on
 * whitespace, drop empties. `\w` is ASCII-only by design — diacritics are
 * folded separately via {@link foldDiacritics} when needed.
 */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * Fold common Latin diacritics to their ASCII base so "café" ≡ "cafe" and
 * Spanish-influenced PH spellings ("piñakurat", "señorita") match plain ASCII
 * keywords. Uses NFD decomposition + combining-mark stripping, with an ñ→n
 * shortcut for engines where NFD is unavailable.
 */
export function foldDiacritics(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ñ/gi, (m) => (m === 'Ñ' ? 'N' : 'n'));
}

/**
 * English word-numbers the Convo brain accepts in count/amount slots. Kept to
 * the unambiguous low integers; Tagalog/Bisaya number words are intentionally
 * excluded because they collide with everyday words ("usa", "lima", "isa") and
 * would mis-expand in a question. Used only by the count/amount slot extractor,
 * never inside {@link normalize} (which feeds intent scoring).
 */
const WORD_NUMBERS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
};

/**
 * Expand only the "k"-suffix shorthand into plain digits ("spent 5k" →
 * "spent 5000"). Kept separate from {@link expandNumberWords} so the amount
 * extractor can get the numeric shorthand WITHOUT the English word-number
 * expansion — otherwise a bare count ("show me five transactions", "two
 * coffees") would be read as a peso amount (₱5 / ₱2). Conservative: only a
 * digit token immediately followed by "k" is rewritten.
 */
export function expandKSuffix(text: string): string {
  return text.replace(
    /(?<![A-Za-z\d])(\d+(?:\.\d+)?)\s*k\b/gi,
    (_, n: string) => String(Math.round(parseFloat(n) * 1000))
  );
}

/**
 * Expand "k"-suffixed and English word numbers into plain digits so downstream
 * count extraction sees a uniform numeric surface. "spent 5k" → "spent 5000",
 * "two coffees" → "2 coffees". Conservative: only standalone tokens are
 * rewritten, never substrings inside larger words.
 *
 * NOTE: the word-number half ("five" → "5") is for COUNT/limit slots only; the
 * amount slot uses {@link expandKSuffix} instead so spelled-out counts aren't
 * mistaken for pesos.
 */
export function expandNumberWords(text: string): string {
  return expandKSuffix(text).replace(/\b[a-z]+\b/gi, (w) => {
    const v = WORD_NUMBERS[w.toLowerCase()];
    return v === undefined ? w : String(v);
  });
}

/**
 * The Convo brain's preprocessing step: lowercase, fold diacritics, collapse
 * whitespace, strip trailing punctuation runs. Returns a clean string that
 * canonicalization and intent scoring operate on. Distinct from {@link tokenize}
 * so callers can keep the whole phrase (needed for multi-word triggers).
 */
export function normalize(text: string): string {
  return foldDiacritics((text ?? '').toLowerCase())
    .replace(/[^\w\s₱.,-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
