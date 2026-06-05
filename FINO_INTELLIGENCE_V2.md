# Fino Intelligence V2 — Consolidation & the Non-LLM Brain

> **Status:** ✅ **complete — P0–P5 are built and green** (`npm run test:taxonomy`
> 133/133, `npm run test:brain` 125/125, tsc clean). The target state below is now
> the **current** state: the whole layer lives in `src/intelligence/` behind the
> `@/intelligence` barrel, the shims are deleted, the dead `gemini.ts` is gone, and
> [CLAUDE.md](CLAUDE.md) / [FINO_INTELLIGENCE.md](FINO_INTELLIGENCE.md) /
> [FINO_CHATBOT.md](FINO_CHATBOT.md) describe it. The Naive-Bayes fallback (P3)
> ships as a reproducible `model.json` trained by `npm run train:brain`. The P4
> OCR client move was **verified working on-device** (receipt + split flows).
> The sections below double as the as-built map; see the build log in §7. Links in
> §0–§1 still point at the pre-migration file locations on purpose — they
> document the starting point of the move.

This plan does two things:

1. **Consolidates** every intelligence capability into a single
   `src/intelligence/` folder with three sub-capabilities — **Auto-Category**,
   **Convo** (chatbot), and **OCR** — sharing one set of NLP primitives.
2. **Rebuilds the Convo brain** from a 1-intent stub into a real, *pure-math,
   offline* natural-language engine, using the techniques in the research brief
   **"Building Chatbots Without LLMs"** — translated from their Python/server
   form into on-device TypeScript.

---

## 0. Hard constraints (the box we build inside)

| Constraint | Consequence for this plan |
|---|---|
| **Offline-first** is a Fino law ([FINO_INTELLIGENCE.md §11](FINO_INTELLIGENCE.md)) | The chatbot makes **zero** network calls. No Python services, no Rasa server, no cloud NLU. |
| **Runtime = React Native / Hermes JS** | No NLTK / spaCy / scikit-learn / sklearn-crfsuite at runtime. Anything "trained" must compile to plain JSON + pure-TS inference (dot products, counts). |
| **Determinism where money is involved** | Logging stays on the deterministic [parseChatTransaction](src/services/parseChatTransaction.ts) taxonomy path — never a probabilistic classifier. |
| **Do NOT break OCR** | The Gemini vision call lives in Deno edge functions + the Express backend. Those **do not move and are not edited**. We only wrap the *client* side. |
| **`npm run test:taxonomy` must stay green** | Categorization behavior is frozen during the move; only its location changes. |

> **Reframing "no LLM":** the chatbot is *already* LLM-free — [gemini.ts](src/services/gemini.ts)'s
> `sendMessage`/`detectTransaction` are imported nowhere. The task is not to
> remove an LLM; it's to make the existing offline brain **actually smart**.

---

## 1. Where we are (one paragraph)

Three capabilities at very different maturity, scattered across four locations:
**Auto-Category** is strong (1330-line taxonomy, 4-tier matcher, bubble-up,
account/amount/display-name) in `src/services` + `src/constants`. **Convo** is a
stub — [finoBrain.ts](src/services/finoBrain.ts) has exactly one real intent
(`greeting`) + four data intents + a "🚧 still in development" fallback, routed
by naive `regex.test()` on the raw string. **OCR** works server-side (edge
`parse-receipt`/`split-receipt` + Express), invoked from screens. On top of it,
[FINO_INTELLIGENCE.md](FINO_INTELLIGENCE.md) is **stale** — it still calls the
chatbot a Gemini ("Tier 2") feature.

---

## 2. The research brief → on-device Fino (the translation table)

Every technique in *Building Chatbots Without LLMs* maps to something we can run
on the phone. Where a technique can't (needs Python/transformers/GPU), the
**analog** column says what we use instead and why.

| Brief technique | What it is | On-device Fino analog | Lands in |
|---|---|---|---|
| **AIML `<pattern>`/`<template>`** | stimulus→response registry | Ordered intent registry (already the finoBrain shape) | `convo/intents.ts` |
| **AIML `<srai>`** (symbolic reduction) | collapse synonyms/phrasings to one canonical intent | Canonicalization map + synonym/affix lexicon | `core/lexicon.ts`, `convo/canonicalize.ts` |
| **AIML `<that>`** (context) | condition reply on the bot's last turn | Dialogue context stack (last frame + pending slot) | `convo/dialogue.ts` |
| **Wildcards / `$` priority** | flexible capture + precedence | Priority-ordered matchers, first-match-wins + slot capture | `convo/intents.ts` |
| **Preprocessing / normalization** | deperiodize, uppercase, reduction files | One shared normalizer (lowercase, fold diacritics, strip punctuation, expand "k"/number-words) | `core/normalize.ts` |
| **Tokenize / stopwords / lemmatize** | reduce to features | Tokenizer + shared stop words + **Tagalog/Bisaya affix-stripping** (lemmatize-lite) | `core/normalize.ts`, `core/lexicon.ts` |
| **Bag-of-Words / TF-IDF** | text → numeric vector | Pure-TS TF-IDF vectorizer over **word + char n-grams** (char-grams absorb Taglish spelling drift) | `convo/classifier/vectorize.ts` |
| **Intent classifier (NB / SVC / SGD)** | supervised multi-class | **Multinomial Naive Bayes** trained *offline* by a `tsx` script → shipped as `model.json` → pure-TS inference. (Linear/logreg is a drop-in later.) | `convo/classifier/` + `__harness__/train-brain.ts` |
| **NER: IOB + CRF / spaCy** | sequence labeling of entities | **Rule-based chunking + dictionaries** (reuse the taxonomy matcher) — *not* CRF. The brief itself notes rule chunking is "computationally cheap"; CRF/spaCy can't ship to Hermes. | `convo/slots.ts`, `categorize/` |
| **Finite State Machine** | dialogue as states/edges | Lightweight FSM for multi-turn (the Account Picker is already one state) | `convo/dialogue.ts` |
| **Slot-filling / forms** | collect required slots | Frame with required/optional slots; prompt for missing | `convo/queryFrame.ts`, `convo/dialogue.ts` |
| **Unhappy paths** (overinform / correct / switch / cancel) | uncooperative users | Explicit handlers: multi-slot capture, slot overwrite, context-switch + resume, cancel edge | `convo/dialogue.ts` |
| **Context actions / slot scope** | prevent slot spillover | Slots scoped to the active frame; cleared on completion/cancel | `convo/dialogue.ts` |
| **Rasa / DIET (joint transformer)** | SOTA non-LLM, on-prem | **Out of scope on-device** (Python + transformer + ~server). We adopt its *philosophy* — hybrid **rules-first, ML-fallback** — not its runtime. | (design north star) |
| **sklearn Pipeline / LangGraph** | compose stages | One composed `routeMessage` pipeline function | `convo/brain.ts` |

**Net recommendation (what the brief points to, for our box):** a **hybrid**:
deterministic **rules-first** (AIML-style canonicalization + weighted intents)
that ships with **no training data**, backed by a **classical-ML fallback**
(TF-IDF + Naive Bayes, trained offline, shipped as JSON) for paraphrases and
confidence — exactly the brief's "hybrid" verdict, minus the parts that need a
server.

---

## 3. Target architecture — one `src/intelligence/` folder

```
src/intelligence/
  index.ts                 ← the ONLY import surface for the rest of the app
  core/                    ← shared NLP primitives (Auto-Category AND Convo use these)
    normalize.ts           ← tokenize · lowercase · fold diacritics · number-words
    lexicon.ts             ← synonyms · Taglish/Bisaya affixes · shared stop words
    editDistance.ts        ← bounded Damerau-Levenshtein   [from aiCategoryMap]
    matcher.ts             ← trie / Aho-Corasick multi-keyword automaton  [NEW]
    amounts.ts             ← amount + "5k"/word-number extraction  [from aiCategoryMap]
    time.ts                ← PH-aware temporal parser ("last week", "ngayong buwan")  [NEW]
  taxonomy/                ← the tree + built indices       [from constants/taxonomy.ts]
  categorize/              ── "Fino Auto-Category"
    categorize.ts          ← analyzeTransactionText + bubble-up  [from aiCategoryMap]
    account.ts             ← detectAccount
    income.ts              ← incomeKeywords
    displayName.ts         ← buildDisplayName
    merchant.ts            ← merchantMap (client)
    parseTransaction.ts    ← parseChatTransaction (the deterministic logging path)
  convo/                   ── "Fino Convo" (the rebuild)
    brain.ts               ← routeMessage() — the composed pipeline
    intents.ts             ← declarative intents (rules + examples for the classifier)
    canonicalize.ts        ← <srai>-style synonym reduction
    slots.ts               ← entity/slot extraction (reuses taxonomy + core)
    queryFrame.ts          ← frame → data query
    dialogue.ts            ← FSM + slot-filling + unhappy-path handling
    nlg.ts                 ← templated, varied responses
    intelligenceBridge.ts  ← pulls IntelligenceEngine outputs as answer data
    classifier/            ← TF-IDF + Naive Bayes (pure TS) + shipped model.json
  ocr/                     ── "Fino OCR" (CLIENT boundary ONLY — server untouched)
    receiptClient.ts       ← wraps supabase.functions.invoke('parse-receipt')
    splitClient.ts         ← wraps supabase.functions.invoke('split-receipt')
    postprocess.ts         ← merchant + category resolution of the OCR result
    types.ts               ← the frozen OCR JSON contract
  insights/                ← IntelligenceEngine.ts · statistics.ts · sufficiency.ts
  __harness__/             ← test-taxonomy + test-brain fixtures & trainer
```

### The OCR boundary (read this twice)

The actual receipt parsing — Gemini vision — lives in
[supabase/functions/parse-receipt](supabase/functions/parse-receipt),
[split-receipt](supabase/functions/split-receipt) (Deno), and
[backend/](backend/) (Express). **These are separate deployments. They do not
move into `src/intelligence/`, and we do not edit them.** The
`intelligence/ocr/` module owns only the **client** half currently inlined in
[ScreenshotScreen.tsx](src/screens/ScreenshotScreen.tsx) and
[BillSplitterScreen.tsx](src/screens/BillSplitterScreen.tsx):

- the `supabase.functions.invoke(...)` call (function names **frozen**),
- the `{ merchant, amount, date, wallet, account, category }` contract (**frozen**),
- merchant/category post-processing ([merchantMap.ts](src/services/merchantMap.ts)).

> ⚠️ [backend/src/services/merchantMap.ts](backend/src/services/merchantMap.ts)
> is a **second copy** (backend is a separate package; it can't import RN `src/`).
> V2 keeps both but documents the sync, with a stretch goal to generate both from
> one JSON seed. **No backend edits are required for this plan.**

---

## 4. The Convo engine (the actual intelligence)

A composed pipeline — every stage is a pure function; the whole thing is
synchronous and offline:

```
 user message
     │
 1.  normalize        core/normalize  →  tokens, folded, number-words expanded
     │
 2.  log-or-ask?      categorize/parseTransaction  →  has ₱ amount? LOG (deterministic) & stop
     │                                                 (unchanged: "one message = log OR answer")
     ▼ (no amount → it's a question)
 3.  canonicalize     convo/canonicalize  →  <srai>-style: "where'd my money go" ≡ "breakdown"
     │
 4.  intent           RULES first (weighted/keyword, deterministic, confident)
     │                 └─ low confidence → CLASSIFIER fallback (TF-IDF + Naive Bayes, JSON model)
     │                 → { intent, score, margin }
     │
 5.  slots            convo/slots  →  reuse taxonomy matcher + time.ts + amounts + account
     │                 → { category?, timeRange?, account?, metric?, comparator? }
     │
 6.  frame            convo/queryFrame  →  {intent, slots}; mark missing-but-required slots
     │
 7.  dialogue         convo/dialogue (FSM)  →  all slots present? execute : ask for the missing one
     │                 handles unhappy paths: overinform · correct · context-switch · cancel
     │
 8.  execute          convo/intelligenceBridge  →  run the query against IntelligenceEngine / WDB
     │
 9.  generate         convo/nlg  →  template + variation + ₱ format + follow-up chips
     │
10.  confidence gate  margin too small at step 4? → CLARIFY ("Did you mean A or B?") instead of guess
```

### 4.1 Intent layer — rules-first, ML-fallback (the brief's hybrid)

- **Rules (ships first, zero data):** each intent declares weighted trigger
  terms/phrases (EN + Tagalog + Bisaya). `score = Σ weights`; `argmax`;
  confidence = top-1 − top-2 **margin**. This is a hand-built linear model —
  explainable, extendable by adding a row, and already half-present in
  finoBrain's `routeDataIntent`.
- **Classifier (added incrementally):** when the rule margin is low, fall back
  to **Multinomial Naive Bayes** over TF-IDF of **word + char(3–4) n-grams**.
  `P(intent|q) ∝ P(intent)·Π P(tₖ|intent)` with Laplace smoothing. Trained
  **offline** by `__harness__/train-brain.ts` (run with `tsx`, like
  `test:taxonomy`) on a seed corpus; emits `classifier/model.json`; runtime
  inference is pure-TS arithmetic. Char n-grams mean "kumusta/kamusta/musta"
  share features without an exhaustive synonym list.

### 4.2 Slots — rule chunking, not CRF

We deliberately **reuse the categorization engine** as the entity recognizer:
the same taxonomy that tags "kape → Coffee" when *logging* detects "kape" as a
**category slot** when *asking*. Plus:

- **time.ts** — a small rule grammar → `{start,end}` for "today / this week /
  last month / ngayong buwan / kahapon / noong isang buwan / since payday".
- **amounts.ts / account** — reuse [extractAmounts](src/services/aiCategoryMap.ts) / [detectAccount](src/services/aiCategoryMap.ts).
- **operators** — "biggest / top / total / average / more than".

CRF/spaCy (brief §NER) are intentionally **not** used: they need a training
toolchain and weights that don't ship to Hermes, and Fino's dictionary+rule
chunking is already best-in-class for PH finance text.

### 4.3 Dialogue manager — FSM + slot-filling + unhappy paths

The Account Picker in [ChatScreen.tsx](src/screens/ChatScreen.tsx) (`pendingTx`
→ modal → resolve) is **already a one-state slot-fill** — we generalize it:

- **Overinforming:** "how much on food via gcash last week" fills 3 slots at
  once; don't re-ask.
- **Corrections:** "actually last month" overwrites the `timeRange` slot without
  resetting the frame.
- **Context switch + resume:** mid-fill question → answer it → resume the pending
  fill (brief's chit-chat case).
- **Cancel:** "never mind" clears the frame (context action → no slot spillover).

### 4.4 What it can answer (capabilities, all from data Fino already computes)

Balance · income · spend (by category / time range / account) · top category ·
"biggest expense" · count ("how many times did I buy coffee") · savings rate &
forecast · compare periods · recurring bills/subscriptions · **anomalies** ("did
I overspend on food?") · **trajectory** ("will I blow my budget?") · habits ·
help/capabilities · greeting/small-talk · graceful clarify on unknowns. Each
maps to an existing [IntelligenceEngine.ts](src/services/IntelligenceEngine.ts)
output or `BrainContext` field — the engine **narrates local math**, it never
invents numbers.

---

## 5. Auto-Category hardening (keep the strength)

- **`core/matcher.ts` (Aho-Corasick / trie):** match *all* taxonomy hits in
  `O(text length)` instead of looping every keyword — matters as the lexicon and
  the new slot extractor both hit it per keystroke.
- **Shared `core/normalize` + Damerau-Levenshtein** (adds transposition, common
  in fast typing) adopted by both categorize and convo.
- **Optional on-device learning:** count which suggestions/clarifications the
  user accepts → a personal synonym map / intent-weight nudge (perceptron-style).
  Still offline, still deterministic at inference.
- `npm run test:taxonomy` runs after **every** step in this section.

---

## 6. Evaluation — make it measurable

- **`npm run test:brain`** — a new harness mirroring
  [scripts/test-taxonomy.ts](scripts/test-taxonomy.ts): a labeled fixture set of
  EN/Tagalog/Bisaya utterances → reports **intent accuracy** + **slot F1** +
  clarify-rate. The same fixtures seed the Naive-Bayes trainer (§4.1).
- **`npm run test:taxonomy`** — unchanged; the green-light for the categorize move.

---

## 7. Migration — phased, shimmed, reversible

Re-export shims keep old import paths alive so nothing breaks big-bang
(`services/aiCategoryMap.ts` becomes `export * from '@/intelligence/categorize/categorize'`).

| Phase | Status | Work | Gate |
|---|---|---|---|
| **P0 — Docs** | ✅ done | This file; fix the Gemini drift in [FINO_INTELLIGENCE.md](FINO_INTELLIGENCE.md) | review |
| **P1 — Scaffold + move (no behavior change)** | ✅ done | Create `core/` (normalize, editDistance, amounts) ; move taxonomy + categorize behind shims | `test:taxonomy` 133/133 ✅ |
| **P2 — Convo v2 (rules)** | ✅ done | `intents/canonicalize/slots/nlg/intelligenceBridge/brain` ; `core/time.ts` ; finoBrain → shim over the new brain (ChatScreen import unchanged) ; add `test:brain` | `test:brain` 105/105 ✅ |
| **P3 — Convo v2 (classifier)** | ✅ done | `classifier/{vectorize,naiveBayes}` + `model.json` ; `scripts/{brain-corpus,train-brain}.ts` + `train:brain` ; wired as the low-margin fallback (rules→classifier→clarify) | `test:brain` 125/125 ✅ (6 rule-silent paraphrases classifier-resolved, 4 OOS rejected) |
| **P4 — OCR client move** | ✅ done | `ocr/{types,receiptClient,splitClient,postprocess}` ; `ScreenshotScreen` + `BillSplitterScreen` rewired to `parseReceipt`/`resolveReceipt` + `parseSplitReceipt`/`normalizeSplitItems` from `@/intelligence` ; **server untouched** | `test:taxonomy` 133/133 ✅, `test:brain` 125/125 ✅, tsc clean ; receipt + split flows verified on-device ✅ |
| **P5 — Cleanup** | ✅ done | Repointed all consumers (3 screens + `IntelligenceEngine` + 6 scripts) onto `@/intelligence` / sub-paths ; deleted the 6 shims + dead `gemini.ts` ; updated [CLAUDE.md](CLAUDE.md) + [FINO_INTELLIGENCE.md](FINO_INTELLIGENCE.md) + [FINO_CHATBOT.md](FINO_CHATBOT.md) | `test:taxonomy` 133/133 ✅, `test:brain` 125/125 ✅, tsc clean (one pre-existing `_value` baseline error unrelated) |

Import churn is handled by shims + one mechanical pass. `scripts/test-taxonomy.ts`
still imports via the old `@/services/aiCategoryMap` / `@/constants/taxonomy`
shims (unchanged); `scripts/test-brain.ts` imports the new engine from `@/intelligence`.

### Build log / deviations from the spec (kept honest)

- **`core/matcher.ts` (Aho-Corasick) — deferred.** It's a perf optimization
  with no consumer yet; the Convo slot extractor reuses the existing taxonomy
  matcher (`analyzeTransactionText`) rather than a new automaton. Lands in §5
  hardening when something actually loops the lexicon per keystroke.
- **`categorize/account.ts` + `displayName.ts` — not split out.** Those helpers
  still live inside `categorize/categorize.ts`; the split is cosmetic and was
  skipped to keep P1 a pure relocation. Noted in `intelligence/index.ts`.
- **`convo/queryFrame.ts` + `convo/dialogue.ts` — folded into `brain.ts`.** The
  rules-only P2 is single-turn, so the frame + the unhappy-path *clarify* (a
  true top-1/top-2 tie between two data intents → ask with tappable chips) live
  inline in `routeMessage`. They split into their own modules once the
  ChatScreen threads multi-turn slot-fill state in (the Account Picker is
  already that pattern). The P3 Naive-Bayes seam is marked in `brain.ts`.
- **`expandNumberWords`** ships English word-numbers + the unambiguous `5k`
  suffix only; Tagalog/Bisaya number words were dropped because they collide
  with everyday tokens ("usa", "lima", "isa").
- **What the rules engine answers today** (all narrated from `BrainContext`,
  never fabricated): greeting · thanks · help · balance · income · spend
  (this/last month, optionally category-scoped) · breakdown · top category ·
  compare · cut · savings/forecast. Sub-month ranges, per-account, and
  per-purchase **count** intents are *recognized* but answered with an honest
  "open Insights" deferral instead of a guessed number.
- **P3 classifier — single Multinomial NB** (per §10 decision). TF-IDF-weighted
  word + char(3–4) n-grams, Laplace α=1, trained offline from a **dedicated
  corpus** (`scripts/brain-corpus.ts`, 191 utterances incl. a synthetic
  `unknown` class) → reproducible `model.json` (~80 KB, 1183 terms). Inference is
  pure-TS in `naiveBayes.predict`. It runs **only when the rules are weak**
  (margin < 1); a clear rule winner is untouched, so all 105 rule fixtures still
  pass unchanged. **Open-set rejection:** NB softmax saturates (≈1.0 for
  everything), so OOS is rejected via the trained `unknown` class **plus** a
  raw-separation gate (`matched ≥ 3` **and** log-score `margin ≥ 1`) — measured
  band: real rule-silent queries sit at matched ≥ 20 / margin ≥ 35, leaking
  gibberish at matched ≈ 1 / margin ≈ 0.4. Embeddings/vector-search were
  **declined for V2** (a semantic encoder needs the model on-device at query
  time → native runtime + tens of MB, breaking the offline/Hermes/JSON-ship
  laws); revisit as a V3 spike. On-device learning (§5) is **deferred to V3**.
- **P5 shim removal repointed scripts to sub-paths, not the barrel.** App screens
  (`AddTransactionSheet`, `ChatScreen`, `ScreenshotScreen`) now import from
  `@/intelligence`; `IntelligenceEngine.ts` and the `tsx` scripts (`test-taxonomy`,
  `test-parser{,2,3,4}`, `count-taxonomy`) import from the concrete sub-modules
  (`@/intelligence/categorize/categorize`, `…/taxonomy/taxonomy`) for the same
  reason `test-brain` does — the barrel drags in React Native. A `grep` for
  `services/<shim>` missed `IntelligenceEngine`'s **relative** `./aiCategoryMap`
  import; `tsc` caught it. Lesson: after deleting a shim, typecheck — a path grep
  won't see same-directory relative imports.
- **`gemini.ts` deleted whole, not trimmed.** Nothing imported it (the chat moved
  to `convo/`, and `generateBulletInsights` was already unwired), so the entire
  file went rather than just `sendMessage`/`detectTransaction`. The
  `@google/generative-ai` dependency is now **orphaned in the mobile package**
  (only the backend uses Gemini); it was left in `package.json` since an unused
  dep doesn't break the lint/build gate — removing it is optional follow-up.
- **P4 barrel vs. the tsx harness.** `index.ts` now re-exports the OCR clients,
  which import `expo-file-system` + the RN supabase client — so the whole barrel
  transitively pulls in `react-native`, which esbuild/tsx can't transform under
  Node. The **app** still imports everything through `@/intelligence` (the single
  surface holds); only `scripts/test-brain.ts` was narrowed to import
  `routeMessage`/`classifyMessage` from `convo/brain` (+ `core/time`,
  `taxonomy/taxonomy` for the slot types) so the Node harness never eval-loads
  the RN-coupled OCR modules. `train-brain`/`brain-corpus` already used sub-paths.
- **`postprocess.ts` carries the OCR resolution verbatim** from the two screens —
  account name→UUID matching (forward `includes` + reverse word-boundary),
  confidence→status (≥ 0.85 auto-confirm), category name/emoji match with a
  first-category fallback, and split line-item normalization (`price ??
  unit_price × qty`). The screens lost ~120 lines each and now just apply the
  returned plain data to state. `matchedAccount` comes back as `AccountLite`, so
  `ScreenshotScreen` re-`find`s the full `Account` for `setSelectedAccount`.
- **Trainer/corpus live in `scripts/`, not `__harness__/`** — consistent with the
  existing `test-taxonomy`/`test-brain` pattern and the `npm run *` convention.
  Train ↔ eval are kept separate (corpus vs. test-brain fixtures) so the 125/125
  has no leakage.

---

## 8. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Breaking the OCR contract | Only wrap client `invoke`; freeze function names + JSON shape; no edge/Express edits. |
| Import breakage across the app | Re-export shims at every old path; remove only in P5. |
| Classifier needs labeled data | Rules-first layer ships **without** it (P2); ML is additive (P3). A dedicated corpus (`scripts/brain-corpus.ts`) was authored; `test-brain` fixtures are held-out eval (no leakage). |
| `backend/` merchantMap divergence | Document the sync now; stretch goal = generate both from one JSON. |
| Hermes perf as lexicon grows | Aho-Corasick automaton; keep all stages pure & synchronous. |
| Determinism of money logging | Logging never touches the classifier — stays on the taxonomy parser. |

---

## 9. Doc debt this creates/closes

- **Closes:** the Gemini-chat drift in [FINO_INTELLIGENCE.md](FINO_INTELLIGENCE.md)
  (chat is offline) and the scattered-files problem.
- **Updates:** [CLAUDE.md](CLAUDE.md) "Intelligence & chatbot" section to point at
  `src/intelligence/`; [FINO_CHATBOT.md](FINO_CHATBOT.md) send-flow to the new pipeline.

---

## 10. Decisions (resolved before P3 shipped)

1. **Classifier algorithm → Multinomial Naive Bayes.** Single classifier as the
   low-margin fallback. A MNB→logreg cascade was rejected (the two are correlated
   linear twins on the same features — little to gain); the real cascade is
   *rules → classifier → clarify*. Embeddings + local vector search were declined
   for V2 (semantic encoder must run on-device at query time → native runtime +
   tens of MB, breaking the offline/Hermes/JSON-ship laws) and parked as a V3
   spike.
2. **Seed corpus → authored now.** A dedicated `scripts/brain-corpus.ts`
   (~15–20 utterances/intent, EN+Tagalog+Bisaya, + an `unknown` class), kept
   separate from the `test-brain` eval fixtures so accuracy has no train/test
   leakage. Grow it from real local chat logs later.
3. **On-device learning (§5) → deferred to V3.** P3 ships the offline-trained
   classifier only; personalization needs accept/reject signals plumbed from the
   chat UI and is cleaner as its own phase.
