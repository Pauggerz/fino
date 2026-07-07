import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Local-only miss telemetry for the offline chatbot brain (the Phase-1
 * "flywheel" from the scaling roadmap).
 *
 * When `routeMessage` falls all the way through — rules silent, the Naive-Bayes
 * classifier abstained, and nothing was inherited from memory (`meta.intent ===
 * null`) — the user asked something the brain couldn't answer. Those phrasings
 * are exactly what should grow `scripts/brain-corpus.ts`, but they're invisible
 * unless we capture them. This is a tiny, capped, **device-local** ring buffer:
 * nothing here is ever synced to Supabase (it's not in SYNCED_TABLES; it doesn't
 * even touch WatermelonDB), and only the phrasing is stored — no ids, amounts,
 * or balances.
 *
 * Best-effort by design: every call swallows its own errors so a storage hiccup
 * can never disturb the chat path.
 */

const KEY = 'fino.brain.misses.v1';
/** Keep only the most recent misses — enough to spot patterns, bounded so the
 *  buffer can't grow without limit on a chatty device. */
const CAP = 200;

export type BrainMiss = {
  /** The user's message (the phrasing to learn from). */
  text: string;
  /** How the brain bailed — 'none' (a true fallback) or 'classifier' (it
   *  answered/clarified at LOW confidence — the force-answer failure class). */
  source: string;
  /** In-vocabulary classifier feature count (0 = the text shared no vocab at
   *  all → likely gibberish/out-of-scope rather than a real miss). */
  mlMatched: number;
  /** Unified turn confidence when available (Phase B) — lets triage rank the
   *  buffer: 0 = hard fallback, 0.3–0.45 = answered-but-shaky. */
  confidence?: number;
  /** Intent the ONLINE assist resolved this miss to (Phase C6), when it ran
   *  and succeeded — a labeled training pair for the corpus, for free. */
  resolvedIntent?: string;
  /** The assist's canonical rewrite (the corpus-ready phrasing pair). */
  resolvedQuery?: string;
  /** ISO timestamp of the miss. */
  at: string;
};

/**
 * Append one brain miss to the capped local buffer. Fire-and-forget — callers
 * should not await it on the render path; it never throws.
 */
export async function recordBrainMiss(
  miss: Omit<BrainMiss, 'at'>
): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const list: BrainMiss[] = raw ? (JSON.parse(raw) as BrainMiss[]) : [];
    list.push({ ...miss, at: new Date().toISOString() });
    // Trim oldest-first so the buffer stays at most CAP entries.
    await AsyncStorage.setItem(KEY, JSON.stringify(list.slice(-CAP)));
  } catch {
    // Telemetry is best-effort; storage errors are intentionally ignored.
  }
}

/** Read back the recorded misses (newest last). Empty on any error. */
export async function getBrainMisses(): Promise<BrainMiss[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as BrainMiss[]) : [];
  } catch {
    return [];
  }
}

/** Clear the local miss buffer (e.g. after exporting them into the corpus). */
export async function clearBrainMisses(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
