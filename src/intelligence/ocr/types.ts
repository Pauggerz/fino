/**
 * Fino OCR — the FROZEN client/server contract (FINO_INTELLIGENCE_V2.md §3,
 * "The OCR boundary").
 *
 * The actual receipt parsing (Gemini vision) lives in the Supabase edge
 * functions `parse-receipt` / `split-receipt` and the Express backend. Those are
 * SEPARATE DEPLOYMENTS — they do not move here and are NOT edited. This module
 * owns only the *client* half: the `functions.invoke(...)` call, the JSON shape
 * it returns, and the merchant/category post-processing. The function names and
 * these response shapes are frozen; changing them means editing the server.
 */

/** Request body sent to both edge functions. */
export type OcrImageInput = { imageBase64: string; mimeType: string };

/**
 * A single OCR field. The edge functions return `{ value, confidence }`, but
 * the client has always tolerated a flat primitive + a sibling `*_confidence`
 * for back-compat — both shapes are preserved here exactly.
 */
export type RawField = { value?: string | number | null; confidence?: number };

/** Raw `parse-receipt` response (single-transaction receipt). */
export type RawReceiptResponse = {
  merchant?: RawField | string | null;
  amount?: RawField | string | number | null;
  date?: RawField | string | null;
  /** Text-detected wallet name (preferred over `account`). */
  wallet?: RawField | null;
  /** UI-detected account name (fallback when `wallet` is absent). */
  account?: RawField | null;
  category?: RawField | null;
  // Legacy flat confidence siblings.
  merchant_confidence?: number;
  amount_confidence?: number;
  date_confidence?: number;
};

/** One line item from `split-receipt`. */
export type RawSplitItem = {
  name: string;
  price: number;
  unit_price?: number;
  quantity?: number;
};

/** Raw `split-receipt` response (itemized bill split). */
export type RawSplitResponse = {
  merchant?: string | null;
  items?: RawSplitItem[];
  total?: number | null;
};

// ─── Normalized output (the UI-facing result of post-processing) ─────────────

export type FieldStatus = 'confirmed' | 'check' | 'fixed';

export type ParsedField = {
  value: string | number | null;
  confidence: number;
  status: FieldStatus;
};

export type ParsedReceipt = {
  account: ParsedField; // value = account UUID
  merchant: ParsedField;
  amount: ParsedField;
  date: ParsedField;
  wallet?: ParsedField; // value = raw OCR wallet name e.g. 'GCash'
};
