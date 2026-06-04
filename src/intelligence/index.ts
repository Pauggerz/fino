/**
 * Fino Intelligence — single public import surface.
 *
 * Three capabilities live under `src/intelligence/`:
 *   • categorize/ — Auto-Category (taxonomy parsing, account/amount/display-name)
 *   • convo/      — the offline chatbot brain
 *   • ocr/        — client wrappers for the server-side receipt OCR
 * backed by shared NLP primitives in core/ and the taxonomy tree in taxonomy/.
 *
 * See FINO_INTELLIGENCE_V2.md for the architecture and migration plan.
 */

// ─── Shared NLP primitives (core/) ───────────────────────────────────────────
// amounts.ts is re-exported through categorize.ts, so it's intentionally absent
// here to avoid an ambiguous double `export *`.
export * from './core/normalize';
export * from './core/editDistance';
export * from './core/time';

// ─── Auto-Category ───────────────────────────────────────────────────────────
// (account/amount/display-name helpers currently live inside categorize.ts;
//  they'll split into account.ts / displayName.ts in a later pass.)
export * from './categorize/categorize';
export * from './categorize/income';
export * from './categorize/merchant';
export * from './categorize/parseTransaction';

// ─── Taxonomy ────────────────────────────────────────────────────────────────
export * from './taxonomy/taxonomy';

// ─── Convo (the offline chatbot brain) ───────────────────────────────────────
export * from './convo/brain';

// ─── OCR (client wrappers for the server-side receipt parsing) ───────────────
// The Gemini vision call stays server-side (edge functions + Express); this is
// only the client boundary. `postprocess` re-exports AccountLite, which already
// comes from categorize.ts, so its exports are listed explicitly rather than
// star-exported to avoid an ambiguous double `export *`.
export * from './ocr/types';
export * from './ocr/receiptClient';
export * from './ocr/splitClient';
export { resolveReceipt, normalizeSplitItems } from './ocr/postprocess';
export type {
  CategoryLite,
  ReceiptResolution,
  SplitLineItem,
  SplitResolution,
} from './ocr/postprocess';
