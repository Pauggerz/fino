/**
 * Client wrapper for the `parse-receipt` edge function (FINO_INTELLIGENCE_V2.md
 * §3). Reads the image off disk, invokes the FROZEN function name, and returns
 * the raw contract. The Gemini vision call itself lives server-side and is not
 * touched here — this is purely the client boundary lifted out of
 * `ScreenshotScreen`.
 */

import * as FileSystem from 'expo-file-system/legacy';
import { supabase } from '../../services/supabase';
import type { RawReceiptResponse } from './types';

/**
 * Parse a single-transaction receipt image. Throws with the edge function's
 * error message on failure. The caller resolves the result into UI state via
 * {@link resolveReceipt}.
 */
export async function parseReceipt(uri: string): Promise<RawReceiptResponse> {
  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: 'base64',
  });
  const { data, error } = await supabase.functions.invoke('parse-receipt', {
    body: { imageBase64: base64, mimeType: 'image/jpeg' },
  });
  if (error) throw new Error(error.message);
  return data as RawReceiptResponse;
}
