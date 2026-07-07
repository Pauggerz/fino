/**
 * Bounded edit-distance primitives — shared by Auto-Category (typo-tolerant
 * keyword/account matching) and, going forward, the Convo slot extractor.
 *
 * Moved out of `categorize.ts` during the Fino Intelligence consolidation
 * (see FINO_INTELLIGENCE_V2.md §3). Behaviour is unchanged — this is a pure
 * relocation so both capabilities can share one implementation.
 */

/**
 * Bounded Levenshtein distance — returns early once `max` is exceeded.
 * Used to allow typo-tolerant keyword matching (max 2 edits) without ever
 * letting unrelated short words masquerade as matches.
 */
export function levenshtein(a: string, b: string, max: number): number {
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
export function maxEditsFor(keyword: string): number {
  if (keyword.length <= 3) return 0; // "sm", "tm", "tnt" — exact only
  if (keyword.length <= 5) return 1;
  return 2;
}

/**
 * Bounded Optimal String Alignment distance — Levenshtein plus adjacent
 * transposition as a single edit. Real-world typos are dominated by swapped
 * neighbours ("mcuh" → "much", "spned" → "spend"), which plain Levenshtein
 * charges 2 for; OSA charges 1, letting the spell corrector accept them at the
 * same tight tolerance that keeps unrelated words out. Early-exits past `max`.
 *
 * Used by the Convo spell pass (`convo/spell.ts`); the frozen categorize/
 * account fuzzy paths stay on {@link levenshtein} so `test:taxonomy` behavior
 * is untouched.
 */
export function osaDistance(a: string, b: string, max: number): number {
  if (a === b) return 0;
  const al = a.length;
  const bl = b.length;
  if (Math.abs(al - bl) > max) return max + 1;
  if (al === 0) return bl;
  if (bl === 0) return al;

  let prev2 = new Array<number>(bl + 1); // row i-2
  let prev = new Array<number>(bl + 1); // row i-1
  let curr = new Array<number>(bl + 1); // row i
  for (let j = 0; j <= bl; j++) prev[j] = j;

  for (let i = 1; i <= al; i++) {
    curr[0] = i;
    let rowMin = curr[0];
    for (let j = 1; j <= bl; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      let v = Math.min(
        prev[j] + 1, // deletion
        curr[j - 1] + 1, // insertion
        prev[j - 1] + cost // substitution
      );
      if (
        i > 1 &&
        j > 1 &&
        a.charCodeAt(i - 1) === b.charCodeAt(j - 2) &&
        a.charCodeAt(i - 2) === b.charCodeAt(j - 1)
      ) {
        v = Math.min(v, prev2[j - 2] + 1); // adjacent transposition
      }
      curr[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    [prev2, prev, curr] = [prev, curr, prev2];
  }
  return prev[bl];
}
