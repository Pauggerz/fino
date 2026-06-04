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
