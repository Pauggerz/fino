# Fino Intelligence Upgrade — robustness + confidence + LLM assist

> Living tracker for the offline-first intelligence hardening plan (2026-07-07).
> Check items off as they land. Gates at the bottom must be green before merge.

## Why

The offline brain misroutes on basic typos. Reproduced end-to-end:

| Input                  | Today                                                                  | Root cause                                                                                                                                   |
| ---------------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `I bought ice crwam20` | NB force-labels `transactions` at softmax **1.0** → bogus query answer | Glued amount invisible to `AMOUNT_REGEX` lookbehind → parse null → statement treated as a question; NB open-set gate passes (matched 15 ≥ 9) |
| `i bouhgt chicken 200` | Logs, but as **"Food - Bouhgt Chicken"**                               | Typos leak into display names                                                                                                                |
| `how mcuh did i spnd`  | Works, but only via NB char-grams (rules fire zero)                    | Rules/canonicalize/slots/route cues are exact-match only                                                                                     |

There is **no unified confidence**: rule margin, NB margin/matched, taxonomy
high/medium/low, and account high/medium all exist but are never combined, and
NB softmax saturates (unusable). Nothing downstream can act on "how sure are we."

## Direction (revises the 2026-06-06 "strictly offline" stance)

Offline-first stays the default and only answerer of numbers. New: every turn
gets a calibrated **confidence**; on LOW confidence the app may consult a very
cheap LLM that acts as a **router, never an answerer** — it maps the message to
an existing intent/tool (as a canonical query + intent id, strict JSON), the
device re-runs the offline pipeline, and the existing typed cards render. The
user's balances/transactions never leave the device; tokens stay tiny; every
LLM-resolved miss feeds the corpus so the offline brain learns and the LLM call
rate decays (LLM = teacher, on-device model = student).

---

## Phase A — kill the typo/misroute bug class (offline)

- [x] **A1. Glued-amount recovery** — pre-split `word+digits` ("crwam20" → "crwam 20")
      in the chat-log path (`parseChatTransaction`), alpha ≥ 3 letters, unit
      suffixes preserved ("5kg" still rejected, "5k" still ₱5,000).
      Files: `core/amounts.ts`, `categorize/parseTransaction.ts`.
- [x] **A2. Statement gate** — `looksLikeLogStatement` in `convo/route.ts`; a
      statement-shaped message that failed to parse gets a **log-clarify** reply
      ("sounds like a purchase — what was the amount?", + prefilled Add
      Transaction action) instead of ever being force-answered as a query.
      Files: `convo/route.ts`, `convo/brain.ts`, `convo/intelligenceBridge.ts`.
- [x] **A3. Shared typo-normalization** — new `convo/spell.ts`: conservative
      OOV-only, unique-best, bounded-Levenshtein correction against vocab the
      system already owns (NB model vocab + taxonomy keywords + trigger words +
      user category/account names). Wired into `classifyMessage` (rules fire on
      "how mcuh" instead of falling to NB) and `route.ts` cues. An ambiguous
      typo ("spnd" → spend/send) is deliberately NOT corrected — the NB
      char-grams remain the net for those.
- [x] **A4. Display-name cleanup** — spell-corrected surface feeds
      categorization + display naming in `parseChatTransaction`
      ("Bouhgt Chicken" → "Chicken", "crwam" → "cream").

## Phase B — real, unified confidence

- [x] **B1. `meta.confidence` (0–1) + reasons** on every `BrainResponse`:
      decision-layer signal (rule margin / NB margin+matched-ratio), token
      **coverage** (share of informative tokens the winner actually consumed —
      the discriminator for force-answer failures). The statement-shape penalty
      became the hard A2 gate (a statement never reaches scoring); the
      "reasons" ride as the existing `meta` fields (`source` / `ruleMargin` /
      `mlMatched`).
- [x] **B2. Bands wired into `routeMessage`** — HIGH answers as today; MEDIUM
      (classifier-sourced, confidence < 0.6) answers with guaranteed clarify
      chips (`withMediumClarify`); LOW (classifier-sourced, < 0.45) returns an
      offline clarify (`answerLowConfidence`) instead of force-answering, and
      flags `meta.assistEligible` for the assist tier.
- [x] **B3. Telemetry** — record low-confidence _answered_ turns (not just
      `intent === null` fallbacks) in `brainTelemetry.ts`, with `confidence` +
      the assist resolution when one ran.
- [x] **B4 (follow-up). Train-time margin→accuracy calibration** emitted into
      `model.json` by `train-brain.ts` (replaces the heuristic mapping in B1).
      Landed 2026-07-10: stratified 5-fold CV over the corpus collects held-out
      gate-passing predictions, scored by the B1 composite
      (`rawClassifierScore` — now purely a ranking signal, moved next to the
      model type in `classifier/naiveBayes.ts`); quantile bins + PAV pooling
      emit an isotonic `calibration.bins` curve into `model.json`, and
      `computeConfidence` maps classifier wins through it
      (`calibratedConfidence`; the raw composite stays the fallback for an
      older model with no curve). Held-out `unknown` rows that sneak past the
      gate count as wrong, so weak scores now land honestly in the LOW/MEDIUM
      bands. Gated by four `[B4]` cases in `test:brain` (curve present,
      ascending, isotonic + clamped, live `routeMessage` reads it).

## Phase C — LLM assist tier (cheap, token-lean, router-only)

- [x] **C1. Assist catalog** — `convo/assistCatalog.ts` (pure): intent id
      whitelist + strict validator for `{intent, query}` | `{intent:"log"}` |
      `{intent:"none"}`. (Prompt + catalog text live server-side in the edge
      function so they can evolve without an app release.)
- [x] **C2. Server route** — built as the **`brain-assist` Supabase Edge
      Function** instead of the Express backend (matches the parse-receipt /
      delete-account precedent; key server-side via the `GEMINI_API_KEY`
      secret, Gemini 2.5 Flash-Lite, JSON output, 280-char input cap).
      ⚠️ Deploy follow-up: `supabase functions deploy brain-assist` + set the
      `GEMINI_API_KEY` secret.
- [x] **C3. Client** — `src/intelligence/assist/assistClient.ts`
      (`supabase.functions.invoke` + 4s timeout race; fail-quiet null; kept
      out of `convo/` so the tsx harnesses never load it).
- [x] **C4. ChatScreen wiring** — on `meta.assistEligible` + toggle on: one
      assist attempt → validated intent → re-run offline pipeline on the
      canonical query (adopted only when the reroute lands confident, ≥ 0.6).
      A rewrite that reads as a _transaction_ renders a one-tap confirm chip
      that re-enters the deterministic log path (no silent writes, ever).
      Reply marked "**used online help**" on the timestamp line (persisted in
      payload, survives reopen).
- [x] **C5. Settings toggle** — "Ask online when unsure" (`assistPrefs.ts`,
      AsyncStorage, default ON; surfaced in Settings → Privacy with i18n
      en/fil/es copy explaining numbers never leave the device).
- [x] **C6. Learning loop** — every assist-resolved miss recorded to the miss
      buffer with `resolvedIntent` + `resolvedQuery` (a labeled corpus pair),
      so triage → corpus → `train:brain`.

## Phase D — gates

- [x] **D1. `npm run test:typo`** — new harness (`scripts/test-typo.ts`):
      glued amounts, statement misroutes, typo'd questions, display-name
      cleanup, plus B1/B2 confidence anchors.
- [x] **D2. All existing gates green** — see gate log (baseline counts grew;
      nothing regressed).

## Gate log

| Date                        | taxonomy | route | brain | query | memory | typo | tsc |
| --------------------------- | -------- | ----- | ----- | ----- | ------ | ---- | --- |
| baseline (2026-07-07)       | 133      | 80    | 463   | 146   | 31     | —    | 0   |
| A+B+C+D landed (2026-07-07) | 133      | 84    | 470   | 158   | 31     | 31   | 0   |

## Decisions

- **LLM returns a canonical query, not free text.** The "tools" are the ~45
  existing intents; the LLM's whole job is picking one and phrasing it the way
  the offline brain parses best. Device executes; cards stay typed; no numbers
  in the prompt, no numbers in the reply.
- **Rules stay trusted at margin ≥ 1**; confidence gating only demotes
  classifier-sourced wins (rules are precise; NB is the recall layer).
- **No multi-turn pending-log state yet** (log-clarify asks the user to resend
  "item amount"); revisit after Phase C.
