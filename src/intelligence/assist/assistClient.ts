/**
 * Client boundary for the `brain-assist` edge function (INTELLIGENCE_UPGRADE.md,
 * Phase C3). Network + RN dependencies live HERE, not in `convo/` — the brain
 * stays pure/synchronous and the tsx harnesses never load this file (same rule
 * as `ocr/`: import via sub-path, never through code the harness evals).
 *
 * Fire-once, fail-quiet: any error, timeout, offline state, or invalid payload
 * resolves to `null` and the caller keeps the offline clarify it already has.
 * The request body is ONLY the message text — no balances, ids, or history.
 */

import { supabase } from '../../services/supabase';
import {
  validateAssistDecision,
  type AssistDecision,
} from '../convo/assistCatalog';

const DEFAULT_TIMEOUT_MS = 4000;

/**
 * Ask the online router to place one message. Resolves to a validated
 * decision, or null (caller degrades to the offline clarify). Never throws.
 */
export async function requestBrainAssist(
  message: string,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<AssistDecision | null> {
  try {
    const invoke = supabase.functions.invoke('brain-assist', {
      body: { message },
    });
    const timeout = new Promise<null>((resolve) => {
      setTimeout(() => resolve(null), timeoutMs);
    });
    const res = await Promise.race([invoke, timeout]);
    if (!res || res.error || !res.data) return null;
    return validateAssistDecision(res.data);
  } catch {
    return null;
  }
}
