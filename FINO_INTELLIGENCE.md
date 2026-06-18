# Fino Intelligence

The full intelligence layer of Fino — everything the app does to **understand**,
**categorize**, **forecast**, and **converse about** a user's money. This
document is the system-level map: what each piece does, how they fit together,
and where to change behavior.

It is the architectural companion to [INSIGHTS_FORMULAS.md](INSIGHTS_FORMULAS.md)
(the math) and [CLAUDE.md](CLAUDE.md) (the codebase rules). Where this doc says
"see §X", it means a section of INSIGHTS_FORMULAS.md.

> ✅ **The chat is offline and the layer is consolidated.** The whole intelligence
> layer now lives in one folder, [src/intelligence/](src/intelligence/), behind a
> single import surface (`@/intelligence`); the consolidation + offline-brain
> rebuild specced in [FINO_INTELLIGENCE_V2.md](FINO_INTELLIGENCE_V2.md) is
> **complete (P0–P5)**. **The chatbot no longer uses Gemini** — it runs on the
> on-device **Fino Brain** ([convo/brain.ts](src/intelligence/convo/brain.ts);
> see [FINO_CHATBOT.md](FINO_CHATBOT.md)), and the old `gemini.ts` client has been
> **deleted**. Gemini now powers **only receipt OCR** (server-side: the Express
> backend + Supabase edge functions); the mobile app holds no Gemini key. So the
> "Tier 2" boundary below is now **OCR-only** — chat is fully Tier 1.

---

## 1. The one big idea: offline first, online optional

Fino Intelligence is built in **two tiers**, and the boundary between them is
the most important thing to understand.

| Tier | Runs | Network | Cost | Powers |
|------|------|---------|------|--------|
| **Tier 1 — Local engine** | On-device, against WatermelonDB | None | Free | Insights, categorization, trajectory, anomalies, chat transaction logging, **and the chatbot's replies** |
| **Tier 2 — Cloud (Gemini)** | Express backend + Supabase edge functions | Required | Metered (Gemini quota) | **Receipt / screenshot OCR only** |

**The rule that keeps the app usable:** anything the user *needs* works in
Tier 1 — including the chatbot, which now answers entirely on-device. Tier 2 is
just OCR, and it only ever *enriches* (you can always log a transaction by hand).
The clearest example lives in [ChatScreen.tsx](src/screens/ChatScreen.tsx) —
type "spent 50 on Grab" and the transaction is parsed and saved by the **local**
parser; ask "how much did I spend on food?" and the **local** Fino Brain answers
from `IntelligenceEngine` output. No network is involved in either path.

```
                          ┌─────────────────────────────────────────┐
        user input ─────► │            FINO INTELLIGENCE             │
   (text / receipt /      └─────────────────────────────────────────┘
    screen focus)            │                              │
                             ▼                              ▼
                 ┌───────────────────────┐     ┌───────────────────────────┐
                 │   TIER 1 — LOCAL       │     │   TIER 2 — CLOUD (Gemini)  │
                 │   (offline, free)      │     │   (online, metered)        │
                 ├───────────────────────┤     ├───────────────────────────┤
                 │ • Taxonomy categorizer │     │ • Receipt OCR (backend +   │
                 │ • IntelligenceEngine   │     │   Edge Functions) — the    │
                 │ • Chat tx parser       │     │   ONLY cloud capability    │
                 │ • Convo brain (chat)   │     │                            │
                 │ • Merchant resolver    │     │                            │
                 │ • Income detector      │     │                            │
                 └───────────────────────┘     └───────────────────────────┘
                             │                              │
                             └──────────────┬───────────────┘
                                            ▼
                              WatermelonDB (local) ⇄ Supabase (server)
```

### 1.4 Failure modes

| Failure | Behavior |
|---------|----------|
| No network | Tier 1 works fully — categorization, insights, **and chat** (logging *and* conversational replies) all run on-device. Only receipt OCR is unavailable. |
| Receipt parse timeout | Backend returns `408` with empty `partialData` after 5s (see [receipt.controller.ts](backend/src/controllers/receipt.controller.ts)). |
| Edge OCR 429 / quota | The Deno function retries honoring the API's suggested delay (capped 10s); the client surfaces the unwrapped error to the receipt/split screen. |

---

## 2. Component map

Everything under `src/intelligence/*` is reached through the single
`@/intelligence` barrel — the file column gives the home module.

| Component | File | Tier | Responsibility |
|-----------|------|------|----------------|
| **Taxonomy** | [intelligence/taxonomy/taxonomy.ts](src/intelligence/taxonomy/taxonomy.ts) | 1 | Hierarchical keyword tree, source of truth for categorization |
| **Category analyzer** | [intelligence/categorize/categorize.ts](src/intelligence/categorize/categorize.ts) | 1 | Text → category, account detection, amount extraction, display-name builder |
| **Income detector** | [intelligence/categorize/income.ts](src/intelligence/categorize/income.ts) | 1 | Income vs expense + income category match |
| **Chat tx parser** | [intelligence/categorize/parseTransaction.ts](src/intelligence/categorize/parseTransaction.ts) | 1 | Chat message → structured transaction |
| **Convo brain** | [intelligence/convo/brain.ts](src/intelligence/convo/brain.ts) | 1 | Offline chat: normalize → intent (rules + NB) → slots → narrate |
| **Tx query engine** | [intelligence/convo/query.ts](src/intelligence/convo/query.ts) | 1 | Pure filter/aggregate over the injected `TxLite` snapshot (V3 record-level answers) |
| **Advice templates** | [intelligence/convo/advice.ts](src/intelligence/convo/advice.ts) | 1 | Data-aware Category-4 coaching cards (subscriptions, emergency fund, goal plan, …) |
| **Needs/wants map** | [intelligence/convo/needsWants.ts](src/intelligence/convo/needsWants.ts) | 1 | Rough category → need\|want heuristic for the needsWants split |
| **Intelligence Engine** | [src/services/IntelligenceEngine.ts](src/services/IntelligenceEngine.ts) | 1 | Insight bundle: anomalies, trajectory, recurring, habits, coach, trend, suggestions |
| **Statistics** | [src/utils/statistics.ts](src/utils/statistics.ts) | 1 | Pure stat primitives (median, MAD, OLS, χ², t-table, HHI) |
| **Sufficiency gates** | [src/utils/sufficiency.ts](src/utils/sufficiency.ts) | 1 | "Needs more data" thresholds per chart |
| **Merchant resolver** | [intelligence/categorize/merchant.ts](src/intelligence/categorize/merchant.ts) | 1 | OCR string → known PH merchant + category |
| **OCR client** | [intelligence/ocr/](src/intelligence/ocr/) | 1→2 | Client wrappers (`parseReceipt`/`parseSplitReceipt`) + post-processing that *invoke* the cloud OCR |
| **Receipt OCR (backend)** | [backend/src/services/receipt.service.ts](backend/src/services/receipt.service.ts) | 2 | Express + Gemini 1.5 Flash receipt parse |
| **Receipt OCR (edge)** | [supabase/functions/parse-receipt/index.ts](supabase/functions/parse-receipt/index.ts) | 2 | Deno + Gemini 2.5 Flash receipt parse (+ category & account inference) |
| **Chat UI** | [src/screens/ChatScreen.tsx](src/screens/ChatScreen.tsx) | 1 | Orchestrates local parse + offline brain reply + tx confirm |

---

## 3. Tier 1a — The categorization engine

This is the part of Fino Intelligence that turns free text like
*"palit kug pagkaon nga rice ug dinuguan via gcash 120"* into a structured
transaction: `Food`, `₱120`, display name `"Food - Rice & Dinuguan"`, account
`GCash`. It is **100% offline, deterministic, and bilingual** (English /
Tagalog / Cebuano).

### 3.1 The taxonomy tree

[taxonomy.ts](src/intelligence/taxonomy/taxonomy.ts) defines a tree of `TaxonomyNode`s under
seven master categories: `food`, `transport`, `bills`, `health`, `shopping`,
`entertainment`, `other`. Each node carries two distinct surface-form lists:

- **`keywords`** — specific brands/items/services that *would appear as a line
  item on a receipt* (`"jollibee"`, `"tuition fee"`, `"biogesic"`,
  `"meralco"`). These stay in the formatted display name's item list.
- **`aliases`** — alternative names for the *category itself*, not a purchase
  (`"school"`, `"doctor"`, `"kape"`, `"kuryente"`). These match the category but
  are stripped from the display name's item list.

> **Rule of thumb baked into the file:** *"Would this word appear as a line item
> on a receipt? Yes → `keywords`. No → `aliases`."*

The tree is deeply Philippines-localized: jeepney/tricycle/habal-habal transit,
GCash/Maya/Palawan e-wallets and remittance, sari-sari stores, kakanin and
street food, PhilHealth/Pag-IBIG/SSS, telco load, and Taglish/Bisaya verbs.

### 3.2 Index build & the bubble-up resolver

At module load, [categorize.ts](src/intelligence/categorize/categorize.ts) flattens the
tree into:

- `KEYWORD_PATHS` — `keyword → [leaf … master]` path array.
- `aiMappings` — flat `keyword → master` dictionary (back-compat).
- `_aliasesByMaster` — umbrella terms per master, used to scrub display names.

**Children are indexed before parents**, and first-registration wins, so a more
specific node always claims a shared surface form ("more specific wins").

The killer feature is **bubble-up**: when the user's active category list is
passed in, `bubbleUp()` walks the matched keyword's path leaf→master and returns
the *most specific* node whose `name` **or** `alias` matches one of the user's
categories — preserving the user's exact casing.

```
"starbucks"  →  path [Coffee → Food]
   user has ["Coffee","Food"]  ⇒  "Coffee"
   user has ["Food"]           ⇒  "Food"
   user has neither            ⇒  null  (UI falls back to "Others")

"tuition fee"  →  path [Education → Bills]
   user has ["School","Bills"] ⇒  "School"   (alias of Education wins over Bills)
```

### 3.3 Matching precedence

`analyzeTransactionText()` tries, in order:

1. **Multi-word phrase** match (`"milk tea"`, `"piso wifi"`) → high confidence
2. **Exact single-word** match → high
3. **Substring** match for compounds (`"grabcar"` → `grab`, `"foodpanda"`) → high
4. **Fuzzy** match — bounded Levenshtein, edit tolerance scaled by keyword length
   (`≤3 chars` exact only, `≤5` one edit, else two) → high (0 edits) / medium

It always returns any extracted amounts even when no category matches, so the UI
can still auto-fill the amount field.

### 3.4 Account detection

`detectAccount()` finds which wallet/bank a description references, layered by
signal strength:

1. **Trigger phrase** (`"via gcash"`, `"from BPI"`, `"sa maya"`) → high
2. **Direct alias** anywhere (word-boundary enforced so `"bpi"` ≠ inside a word) → high
3. **Fuzzy alias** (≤1 edit, length ≥4) → medium

`ACCOUNT_ALIASES` maps canonical accounts to surface forms
(`gcash`/`g-cash`/`gc`, `maya`/`paymaya`, `gotyme`/`tyme`, etc.).

### 3.5 Amount extraction & the calculator bridge

`extractAmounts()` uses an anchored regex so multi-digit numbers stay whole
(`"1234"` → `[1234]`, not `[123, 4]`) and handles `₱`/`php`/`pesos`/commas.
`buildAmountState()` then turns multiple amounts into pending calculator state
(`20 + 10`) so the Add-Transaction keypad mirrors a manual chain.

### 3.6 Display-name builder

`buildDisplayName()` produces human-readable names per master category:

- **Food / Shopping / Bills / Health** → `"<Category> - <Item> & <Item>"`
  (e.g. `"Food - Adobo & Rice"`), with stop words, account surfaces, and
  category-umbrella aliases scrubbed out.
- **Transport** → `"<Vehicle> to <Place>"` (e.g. `"Grab to Quezon City"`),
  splitting multi-leg trips on connectors.

A large multilingual `DISPLAY_STOP_WORDS` set (English + Tagalog + Cebuano
fillers, verbs, particles, time refs) keeps item lists clean.

---

## 4. Tier 1b — Chat & income parsing

### 4.1 Income detection

[income.ts](src/intelligence/categorize/income.ts) is the income counterpart to
the expense taxonomy (which has no income masters). `looksLikeIncome()` checks
phrase patterns (`received`, `got paid`, `kumita`, `na-credit`) plus the keyword
table; `matchIncomeKeyword()` maps tokens to canonical income categories
(`salary`, `allowance`, `freelance`, `business`, `investment`, `gifts`) — but
only returns a category that actually exists in the user's income list.

### 4.2 Chat transaction parser

[parseTransaction.ts](src/intelligence/categorize/parseTransaction.ts) (exported
as `parseChatTransaction`) is the glue that ChatScreen calls **synchronously** to
log a typed message. It:

1. Decides income vs expense via `looksLikeIncome()`.
2. Runs `analyzeTransactionText()` against the correct category list.
3. Returns `null` if no peso amount was found (signal: "not a transaction").
4. Sums multi-amounts, resolves category (bubble-up for expense, keyword for
   income), builds the display name, and resolves the account (explicit match,
   or the sole account if the user has exactly one).

---

## 5. Tier 1c — The Intelligence Engine

[IntelligenceEngine.ts](src/services/IntelligenceEngine.ts) is the analytics
core. It reads **directly from WatermelonDB** (fully offline) and is consumed by
the Insights/Stats screen (chips + charts), the Add-Transaction flow (category
suggestions), and the offline Convo brain (which narrates this output as chat
answers — see §6). Every exported function is pure apart from the DB read.

### 5.1 `getInsights(userId, year, month)` → `Insights`

Loads the month plus the prior 3 months (and 6 months for the trend) in two/three
batched queries, then runs every detector. The returned bundle:

| Field | Detector | What it is |
|-------|----------|------------|
| `headline` | `composeHeadline` | One-line lede; anomaly > overpace > coach > trend |
| `whereChip` / `whenChip` | `composeWhereChip/WhenChip` | "Where money goes" / "when you spend" chips |
| `anomalies` | `detectAnomalies` | Categories spiking vs 3-mo baseline |
| `trajectory` | `forecastTrajectory` | End-of-month projection + 95% CI |
| `habits` | `recognizeHabits` | Frequent small merchants + annualized cost |
| `weekDeltas` | `computeWeekDeltas` | Week-over-week category shifts |
| `recurring` | `detectRecurring` | Detected subscriptions/bills + next charge |
| `coach` | `buildCoachMessage` | Sentiment + actionable one-liner |
| `trendSlope` | OLS over 6-mo net | Direction only when R² ≥ 0.6 |
| `sufficiency` | `@/utils/sufficiency` | Per-card "needs more data" verdicts |

### 5.2 The detectors (and their statistical backbone)

- **Anomalies** — Iglewicz-Hoaglin **modified z-score** on a per-category,
  per-prior-month baseline. Flag when `(current − median) / (1.4826·MAD) > 3.5`;
  if MAD = 0 (perfectly stable subscription), fall back to `current > 1.5×median`.
  Requires ≥2 prior months with spend. (§3.6)
- **Trajectory** — day-of-week-weighted run-rate projection (falls back to flat
  daily average without ≥4 populated weekday buckets), wrapped in a 95% CI that
  uses **Student-t** for `daysElapsed < 30`, normal otherwise. (§5.1)
- **Recurring** — merchant appears in ≥2 distinct months, amounts within ±25% of
  the median, day-of-month within ±4 days; predicts the next charge date.
- **Coach** — prioritized rules: negative net → overpace vs 3-mo avg →
  concentration risk (top category ≥45%) → strong savings rate → under-pace →
  neutral nudge. Weekend-vs-weekday pressure refines the message.
- **Trend** — OLS slope + R² over the 6-month net series; only asserts a
  direction at R² ≥ 0.6. (§3.14)
- **`whenChip`** — runs a **χ² goodness-of-fit test against uniform** on the
  day-of-week and time-of-day distributions; only crowns a "peak day/window"
  when significant at α = 0.05 *and* expected count ≥ 5. (§3.9 / §3.10)

### 5.3 `suggestCategory(...)` — the Add-Transaction suggester

A cheap, offline two-step suggester:

1. **History match** — `LIKE` query against past `merchant_name`/`display_name`
   of the same type; picks the most-frequent category. High confidence when the
   leading category covers ≥60% of ≥3 hits.
2. **Keyword fallback** — the static taxonomy (`analyzeTransactionText`).
   Income callers skip this step (the taxonomy is expense-only), so a "client
   payment" never gets tagged `Food`.

### 5.4 Sufficiency gates — honesty over eagerness

[sufficiency.ts](src/utils/sufficiency.ts) prevents the app from making claims
the data can't support. Each gate returns `{ ok, current, needed, reason }`; a
failing gate renders a plain-English "needs more data" overlay instead of a
misleading chart.

| Gate | Requires | Why |
|------|----------|-----|
| `checkSankey` | income AND expense | flow needs a source and a sink |
| `checkTrajectory` | ≥10 txns AND ≥7 days | CI exceeds projection below this |
| `checkComposition` | ≥10 txns AND ≥3 categories | rank stability; avoid tautology |
| `checkDowPattern` | ≥14 txns, ≥4 weekdays | χ² validity floor |
| `checkTodPattern` | ≥15 txns, ≥2 buckets | χ² validity floor |
| `checkTrendSlope` | ≥3 months | OLS undefined/perfect below |
| `checkQuotedPercentage` | ≥25 txns | keeps ±20pp margin on a quoted % |

Full derivations of every threshold and formula are in
[INSIGHTS_FORMULAS.md](INSIGHTS_FORMULAS.md).

---

## 6. Tier 1d — The offline Convo brain

The chatbot is **fully on-device** — no Gemini, no API key, no network. It lives
in [src/intelligence/convo/](src/intelligence/convo/) and is invoked through
`routeMessage()` in [convo/brain.ts](src/intelligence/convo/brain.ts). The
detailed send-flow, UI anatomy, and local-only history are owned by
[FINO_CHATBOT.md](FINO_CHATBOT.md); this section is the architectural summary.

### 6.1 The pipeline

`routeMessage(text, ctx)` is a synchronous composed pipeline:

```
normalize → log-or-ask? → canonicalize → intent → slots → frame → narrate
```

- **log-or-ask?** — if the message carries a ₱ amount it's a *logging* message
  and the brain stays out of it (the deterministic `parseChatTransaction` path
  owns money). Otherwise it's a question.
- **intent** — **rules-first**: weighted keyword/phrase intents (EN + Tagalog +
  Bisaya) in [convo/intents.ts](src/intelligence/convo/intents.ts); `score = Σ
  weights`, argmax, confidence = top-1 − top-2 margin. When the margin is low,
  it falls back to a **Multinomial Naive-Bayes classifier**
  ([convo/classifier/](src/intelligence/convo/classifier/)) over TF-IDF of word +
  char n-grams, trained offline and shipped as `model.json`. The NB output is
  trusted only above an **open-set acceptance gate** (`matched`/`margin` floors)
  that is now **calibrated at train time** — `train:brain` measures a gibberish
  panel against the freshly-built vocab and emits `model.gate`, so the floor
  self-adjusts as the corpus grows instead of being a hand-bumped constant. A true
  tie between two data intents yields a **clarify** ("did you mean A or B?")
  instead of a guess.
- **slots** — entities are extracted by *reusing the categorization engine* as
  the recognizer (the taxonomy that tags "kape → Coffee" when logging detects it
  as a category slot when asking), plus a PH-aware time grammar
  ([core/time.ts](src/intelligence/core/time.ts)) — extended in V3 to
  year/quarter/named-month/weekday/weekend/last-30-days, and in V3.1 to **explicit
  calendar dates** ("June 3", "the 15th") and relative **N-weeks/N-months-ago**
  windows — and V3 amount-bound (`over/under/between ₱X`), result-limit
  ("last 5"), and free-text merchant ("Spotify") slots
  ([convo/slots.ts](src/intelligence/convo/slots.ts)).

### 6.2 It narrates local math, never invents numbers

Answers are generated by [convo/intelligenceBridge.ts](src/intelligence/convo/intelligenceBridge.ts),
which pulls **pre-computed `IntelligenceEngine` output** (balance, spend,
breakdown, anomalies, trajectory, recurring, habits) and templated NLG in
[convo/nlg.ts](src/intelligence/convo/nlg.ts). The brain only ever narrates what
the local engine (or the V3 query layer below) already computed; it never
fabricates a figure — when the data can't support an answer it says so.

**V3 transaction-query layer.** ChatScreen injects a **bounded `TxLite`
snapshot** (trailing ~13 months + this year, capped) plus `accounts`/`budgets`/
`recurringIncome` into `BrainContext`, and the brain answers record-level and
pattern/summary questions with **pure, synchronous** filter/aggregate functions
in [convo/query.ts](src/intelligence/convo/query.ts) — no DB, no async ever
enters the brain. This retired the old "open Insights for sub-month views"
deferral: real per-range/per-category/per-account numbers are now answerable.
New intents span four families — transaction info (`transactions`, `categoryOf`,
`salaryStatus`, `billStatus`), pattern analysis (`dowPattern`, `trend`,
`incomeShare`, `typicalSpend`, `budgetStatus`, `needsVsWants`, range-scoped
`compare`), summarization (`summary`), and data-aware advice in
[convo/advice.ts](src/intelligence/convo/advice.ts) (`subscriptionCut`,
`emergencyFund`, `goalPlan`, `bonusAdvice`, `improveSavings`, `cutAmount`,
`ruleOfThumb`, `impulseTips`). The needs/wants split uses a documented rough
heuristic in [convo/needsWants.ts](src/intelligence/convo/needsWants.ts).

The coach/anomaly/trajectory capabilities — previously *recognized but
deferred* — are now **surfaced**: a reply can carry a typed `ChatCard` payload
(`breakdown · compare · forecast · coach · txList · status · summary · budget ·
needsWants · pattern`) rendered as a bubble-sized mini visual, plus theme-free
**action buttons** (`navigate`/`prompt`; "do" actions open a pre-filled screen
to confirm). The chat opens with a live **proactive coach card** when there's a
noteworthy nudge. ChatScreen resolves the async `getInsights` and injects it into
`BrainContext.insights` so the synchronous brain can narrate it. The full design
is in [FINO_CHATBOT_CARDS.md](FINO_CHATBOT_CARDS.md). (Coach **push
notifications** are the one remaining, deferred surface.)

### 6.3 Evaluation

`npm run test:brain` runs a labelled EN/Tagalog/Bisaya fixture set (intent +
slot + card-payload + action assertions; 292 cases as of V3); `npm run
test:query` covers the pure query engine, the extended time grammar, the new
slots, and the needs/wants heuristic. The classifier is (re)trained from a
separate corpus via `npm run train:brain` (32 classes) so train and eval don't
leak. See FINO_INTELLIGENCE_V2.md §4–§6.

---

## 7. Tier 2 — Receipt & screenshot OCR (the only cloud capability)

Fino extracts transactions from GCash/Maya/BDO/BPI receipt screenshots. As noted
in [CLAUDE.md](CLAUDE.md), **two independent paths exist** and share the merchant
taxonomy — audit both when changing parsing behavior.

### 7.1 Path A — Express backend

[receipt.controller.ts](backend/src/controllers/receipt.controller.ts) →
[receipt.service.ts](backend/src/services/receipt.service.ts): strips the data
URI, rejects payloads >5MB, races the Gemini call against a **5s timeout**
(returns `408` + empty `partialData`). Uses **Gemini 1.5 Flash** with
`responseMimeType: "application/json"` and extracts
`merchant / amount / date / wallet`, each with a `0.0–1.0` confidence.

### 7.2 Path B — Supabase Edge Function

[parse-receipt/index.ts](supabase/functions/parse-receipt/index.ts): Deno
function calling **Gemini 2.5 Flash** directly over REST, with a **429 retry**
that honors the API's suggested delay (capped 10s). Its prompt is richer — it
also infers **`category`** (food/transport/shopping/bills/health/other) and the
**`account`** (the app the screenshot was taken *from*, inferred from UI colors
/ logo / layout, not just text). A sibling
[split-receipt](supabase/functions/split-receipt) function handles itemized
bill-splitting (feeding the Bill Splitter screen).

### 7.3 Merchant resolution

[merchant.ts](src/intelligence/categorize/merchant.ts) maps raw OCR text to ~30 seeded PH
merchants (Jollibee, SM, Mercury Drug, Grab, Meralco, …) with priority:
description text → raw OCR → verbatim OCR (flagged `unknown` to trigger a
"what did you buy?" nudge) → empty fallback. `merchant_name` always preserves the
raw OCR string per the data model.

---

## 8. End-to-end flow: "spent 50 on grab via gcash"

```
ChatScreen.handleSend("spent 50 on grab via gcash")
  │
  ├─ 1. parseChatTransaction()                         [Tier 1, synchronous]
  │       looksLikeIncome → false
  │       analyzeTransactionText → master "transport", amount [50]
  │       detectAccount → "GCash" (trigger "via gcash", high)
  │       buildDisplayName → "Grab" (transport, no destination)
  │       ⇒ { amount: 50, category: <user's Transport>, account: GCash }
  │
  └─ 2. createTransaction(...)  → WatermelonDB write   [logged, guaranteed]
          (UI shows TxConfirmCard immediately)
```

Because the message carried a ₱ amount, it is a *logging* message and the brain
is **not** invoked (one message = log OR answer, never both). A question without
an amount — "how much did I spend on food?" — skips straight to
`routeMessage()`, which narrates the local `IntelligenceEngine` output entirely
on-device. Either way there is no network round-trip.

---

## 9. Environment & configuration

| Variable | Used by | Notes |
|----------|---------|-------|
| `GEMINI_API_KEY` | backend + Edge Function | Server-side receipt OCR (the only Gemini use) |
| `VISION_API_KEY` | backend | Google Cloud Vision (OCR assist) |

The mobile app no longer reads any Gemini key — chat is offline, and the
deleted `gemini.ts` was its last client-side consumer.

Copy `.env.example` → `.env.local`; the mobile app, scripts, and backend read the
same file (see [CLAUDE.md](CLAUDE.md) §Env). The dev-only
`/api/parse-receipt-test` route is gated on `NODE_ENV !== 'production'`.

---

## 10. Extending the system

- **Add a category / keyword** → edit [taxonomy.ts](src/intelligence/taxonomy/taxonomy.ts)
  only. The flat dicts in `categorize.ts` are derived at load — never hand-edit
  them. Decide `keywords` vs `aliases` by the receipt line-item test (§3.1).
- **Add an income category keyword** → [income.ts](src/intelligence/categorize/income.ts).
- **Add a known merchant** → [merchant.ts](src/intelligence/categorize/merchant.ts) (and
  the backend copy if relevant).
- **Add / extend a chat intent** → append to [convo/intents.ts](src/intelligence/convo/intents.ts)
  (and a corpus row in `scripts/brain-corpus.ts`), then `npm run test:brain`.
- **Tune an insight threshold** → change the gate in
  [sufficiency.ts](src/utils/sufficiency.ts) **and** update the matching section
  of [INSIGHTS_FORMULAS.md](INSIGHTS_FORMULAS.md).
- **Change parsing/categorization behavior** → audit **both** receipt paths
  (backend + Edge Function) and run `npm run test:taxonomy`.
- **New stat** → add a pure function to [statistics.ts](src/utils/statistics.ts)
  with its formula in the docstring.

### Testing

There is no unit test runner; `npm run test:taxonomy` runs
[scripts/test-taxonomy.ts](scripts/test-taxonomy.ts) via `tsx` as a one-off
categorization harness. Run it after any taxonomy or analyzer change.

---

## 11. Design principles (the "why")

1. **Local-first.** The user's core experience never depends on a network or a
   paid API — including the chatbot, which now answers on-device. The only cloud
   capability (Tier 2) is receipt OCR, and it is gravy, never the meal.
2. **Deterministic where it matters.** Money logging goes through the
   deterministic taxonomy parser, never a probabilistic classifier — reproducible
   and auditable.
3. **Statistically honest.** Robust estimators (median/MAD over mean/stddev),
   small-sample corrections (Student-t), and sufficiency gates mean Fino refuses
   to make claims its data can't support. See [INSIGHTS_FORMULAS.md](INSIGHTS_FORMULAS.md).
4. **Deeply localized.** Taglish/Bisaya verbs, PH merchants, e-wallets, jeepney
   fares, and government contributions are first-class, not afterthoughts.
5. **Narrate, don't compute.** The chat brain only ever *narrates* pre-computed
   local analytics (`IntelligenceEngine` output) — it is never trusted to do math
   or invent numbers, and it answers without any LLM in the loop.
