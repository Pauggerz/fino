/**
 * Natural-language generation helpers for the Convo brain.
 *
 * Pure formatting + deterministic phrasing variation. "Deterministic" matters:
 * the same message always yields the same reply (so `test:brain` is stable and
 * the typewriter never re-rolls), but different messages get different openers
 * so the bot doesn't sound robotic. Variation is keyed on a cheap hash of the
 * user's text (FINO_INTELLIGENCE_V2.md §4 step 9).
 */

/** ₱ formatter — whole pesos, PH grouping. Matches the rest of the app. */
export function peso(n: number): string {
  return `₱${Math.round(n).toLocaleString('en-PH')}`;
}

/** Capitalize the first letter (single source for the brain's many `cap`/
 *  `capWord` helpers — they were byte-identical copies across modules). */
export function cap(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}
/** Alias kept so call sites reading "capWord" stay literal. */
export const capWord = cap;

/** Short month labels, shared by the date formatters below. */
export const MONTHS_ABBR = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/** "Jun 15" — empty string for an unparseable ISO date. */
export function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${MONTHS_ABBR[d.getMonth()]} ${d.getDate()}`;
}

/** Percent of `part` relative to `whole`, rounded, guarded against /0. */
export function pctOf(part: number, whole: number): number {
  if (!whole) return 0;
  return Math.round((part / whole) * 100);
}

/** Cheap, stable 32-bit string hash (FNV-1a-ish) for phrasing variation. */
export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Pick one variant deterministically from `seed`. Same seed → same choice, so
 * replies are reproducible per message but vary across messages.
 */
export function pick<T>(variants: readonly T[], seed: string): T {
  if (variants.length === 1) return variants[0];
  return variants[hashString(seed) % variants.length];
}
