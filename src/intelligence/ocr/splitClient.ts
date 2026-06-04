/**
 * Client wrapper for the `split-receipt` edge function (FINO_INTELLIGENCE_V2.md
 * §3). Same boundary as {@link parseReceipt}, but for the itemized bill-split
 * flow and with the richer error unwrapping `BillSplitterScreen` relied on
 * (the edge function returns a JSON `{ error, details }` body on failure).
 *
 * The function name and response shape are FROZEN; the Gemini vision call is
 * server-side and untouched.
 */

import * as FileSystem from 'expo-file-system/legacy';
import { supabase } from '../../services/supabase';
import type { RawSplitResponse } from './types';

/**
 * Pull the best human-readable message out of a Supabase FunctionsError: prefer
 * the edge function's `{ error, details }` JSON body, then its raw text, then
 * the generic message.
 */
async function describeError(error: { message: string }): Promise<string> {
  let detail = error.message;
  try {
    const ctx = (error as { context?: unknown }).context as
      | { json?: () => Promise<{ error?: string; details?: string }>; text?: () => Promise<string> }
      | undefined;
    if (ctx?.json) {
      const body = await ctx.json();
      if (body?.error) {
        detail = body.error + (body.details ? `: ${body.details}` : '');
      }
    } else if (typeof ctx?.text === 'function') {
      detail = await ctx.text();
    }
  } catch {
    /* fall back to error.message */
  }
  return detail;
}

/**
 * Parse an itemized receipt for the bill splitter. Throws with the unwrapped
 * edge-function error. The caller normalizes the items via
 * {@link normalizeSplitItems}.
 */
export async function parseSplitReceipt(uri: string): Promise<RawSplitResponse> {
  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: 'base64',
  });
  const { data, error } = await supabase.functions.invoke('split-receipt', {
    body: { imageBase64: base64, mimeType: 'image/jpeg' },
  });
  if (error) throw new Error(await describeError(error));
  return data as RawSplitResponse;
}
