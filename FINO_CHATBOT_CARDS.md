# Fino Chatbot — Graphical Cards + Money-Coach Upgrade

> **Status:** 🟢 **P1–P4 + P6 built and green** (`test:taxonomy` 133/133,
> `test:brain` **154/154**, tsc clean except the one pre-existing
> `ChatScreen._value` baseline error). The reply cards (breakdown · compare ·
> forecast · coach), the `src/components/chat/` mini-visual kit, the widened
> `BrainContext.insights`, the reactive card answers, and the live proactive
> opening coach card all ship. **P5 (coach push notifications) is the remaining
> phase — deferred**: it needs on-device verification and touches the
> notification scheduler, so it's split out like the Edge rail. The `budget`
> card is also deferred (§10 Q1) until per-category budgets are threaded into
> `BrainContext`. Builds on the completed
> [FINO_INTELLIGENCE_V2.md](FINO_INTELLIGENCE_V2.md) consolidation. Companion
> docs: [FINO_CHATBOT.md](FINO_CHATBOT.md) (the chat screen as-built),
> [INSIGHTS_FORMULAS.md](INSIGHTS_FORMULAS.md) (the coach math), and the
> notifications subsystem (the push rail, for P5).

This upgrade does two things, on top of the existing offline brain:

1. **Graphical cards** — let a chat reply carry a **typed, fully-populated card
   payload**, rendered as a **purpose-built mini visual** (spark-bars, rings,
   sparklines) inside the bubble — not just a sentence of numbers.
2. **Money-Coach** — turn the capabilities V2 *recognized but deferred* (anomalies,
   budget pace, trajectory, habits) into **real, opinionated answers**, and push
   the coach **beyond "when asked"** into a **proactive opening card** and
   **push notifications**.

---

## 0. The three decisions that shaped this plan (resolved)

These were chosen up front; everything below assumes them.

| # | Decision | Choice | Consequence |
|---|---|---|---|
| **D1 — Card visuals** | reuse the Stats chart kit vs. build new | **Purpose-built mini visuals** | New bubble-sized primitives in `src/components/chat/`; we do **not** embed `CategoryDonut`/`TrajectoryChart` (they assume Stats-screen sizing). Full control over density; some chart logic is re-expressed in miniature. |
| **D2 — Coach reach** | reactive only → proactive → push | **Full reach: reactive + proactive-on-open + push** | The coach answers when asked, surfaces one live card when the chat opens, **and** fires through the notifications subsystem. Largest scope; touches `notification_prefs` + the inbox. |
| **D3 — Card data source** | brain emits data vs. screen resolves | **Brain emits fully-populated card data** | `BrainResponse` gains a `card?` payload the brain fills. To stay pure-sync, the brain reads a **widened `BrainContext`** (ChatScreen injects pre-computed `Insights`). Card output is then covered by `npm run test:brain`. |

---

## 1. The lever: the coach engine already exists

The single most important fact for scoping this: **we are not building the money
math.** [IntelligenceEngine.getInsights()](src/services/IntelligenceEngine.ts#L751)
already returns everything the coach needs:

```ts
type Insights = {
  headline: string; whereChip: string; whenChip: string;
  anomalies: Anomaly[];                 // {category, current, baseline, pctOver}
  trajectory: TrajectoryForecast | null;// {projected, spent, dailyAvg, pacingOver, rolling3MoAvg, ciLow, ciHigh, …}
  habits: Habit[];                      // {merchant, visitsPerMonth, avgAmount, monthlySpend, annualized}
  weekDeltas: WeekDelta[];
  recurring: RecurringBill[];           // {merchant, amount, dayOfMonth, nextEstimatedDate, daysUntilNext}
  coach: CoachMessage;                  // {sentiment, message} ← already an actionable one-liner
  trendSlope: TrendSlope | null;
  sufficiency: InsightsSufficiency;     // per-card "needs more data" gates
};
```

There is **already a `CoachMessage` with `sentiment` + an actionable message**
([IntelligenceEngine.ts:605-658](src/services/IntelligenceEngine.ts#L605)). The
chat simply never consumes it. So the Money-Coach half of this plan is mostly
**surfacing** existing, tested math (the formulas are documented in
[INSIGHTS_FORMULAS.md](INSIGHTS_FORMULAS.md)) — into three new places (chat
answer, opening card, push) — not re-deriving it.

> ⚠️ `getInsights` is **`async`** (it queries WatermelonDB). The brain is
> **synchronous and offline-pure** and must stay that way. The bridge is:
> ChatScreen resolves `getInsights` (it already subscribes to the same data) and
> injects the result into `BrainContext.insights`; the brain reads it
> synchronously. The brain never touches the DB — D3 holds without breaking the
> offline/sync law.

---

## 2. Where we are today (the seams we build on)

| Seam | State today | What we do with it |
|---|---|---|
| **`BrainResponse`** ([convo/types.ts](src/intelligence/convo/types.ts)) | `{ text, followUps? }` — text only | Add `card?: ChatCard` |
| **`BrainContext`** ([convo/types.ts](src/intelligence/convo/types.ts)) | aggregates only (balance, income, spent, lastMonthSpent, topCategories, day/daysInMonth) | Add `insights?: Insights` (+ category budgets) |
| **`richData`** ([ChatScreen.tsx:78](src/screens/ChatScreen.tsx#L78)) | a `{label,value,color}[]` message shape **wired into render + persistence but produced by nothing** | **Retire** — the typed `card` union supersedes it |
| **Card render branch** ([ChatScreen.tsx:1079](src/screens/ChatScreen.tsx#L1079)) | `{!isStreaming && msg.richData ? …}` | Replace with `{!isStreaming && msg.card ? <ChatCardView … />}` |
| **Persistence** ([chatMutations.ts](src/services/chatMutations.ts)) | `payload` JSON already round-trips `txData`/`richData`/`followUps` | Serialize `card` into the same `payload` (see §6 snapshot rule) |
| **intelligenceBridge** ([convo/intelligenceBridge.ts](src/intelligence/convo/intelligenceBridge.ts)) | `answer*()` return text-only `BrainResponse` | Upgrade the relevant answers to attach a `card`; add coach intents |
| **Insights math** ([IntelligenceEngine.ts](src/services/IntelligenceEngine.ts)) | `getInsights()` computed, consumed only by Stats | Inject into `BrainContext`; narrate as cards + coach |
| **Notifications** (two-rail subsystem → one inbox) | local-schedule + Edge push, `notification_prefs.id === user_id` | New `coach` notification type on the local rail |

---

## 3. The card contract (D3)

A discriminated union, fully populated by the brain, rendered dumbly by the
screen. Lives in [convo/types.ts](src/intelligence/convo/types.ts) so it is part
of the brain's public contract and travels through the `@/intelligence` barrel.

```ts
export type ChatCard =
  | { kind: 'breakdown';  data: BreakdownCard }
  | { kind: 'compare';    data: CompareCard }
  | { kind: 'forecast';   data: ForecastCard }
  | { kind: 'budget';     data: BudgetCard }
  | { kind: 'coach';      data: CoachCard };

export type BrainResponse = {
  text: string;
  card?: ChatCard;     // NEW — the graphical payload (optional, back-compatible)
  followUps?: string[];
};
```

### 3.1 Theming rule — the brain emits *roles*, never colors

The brain has no theme. So **card data carries semantic roles, never hex.** The
renderer (`ChatCardView`, which has `useTheme()`) maps role → token:

- a breakdown segment carries `role: 'cat-0' | 'cat-1' | …` (palette index), not a color;
- a coach/forecast status carries `status: 'good' | 'watch' | 'over'`, mapped to
  the theme's positive / amber / negative tokens.

This keeps cards correct across all seven accent themes + light/dark, and keeps
the brain testable without a theme (per CLAUDE.md "never hard-code colors").

### 3.2 The v1 card catalog

| `kind` | Triggered by | Mini visual | Data (from) |
|---|---|---|---|
| **breakdown** | "where did my money go", "spending breakdown" | `MiniBars` (top categories) + total | `ctx.topCategories`, `ctx.spent`, optional `compare` vs `lastMonthSpent` |
| **compare** | "vs last month", "am I spending more" | two bars + `DeltaChip` | `ctx.spent`, `ctx.lastMonthSpent` |
| **forecast** | "am I on track to save", "will I blow my budget" | `MiniSparkline` (cumulative + projected dot + CI band) | `ctx.insights.trajectory` (`projected`, `ciLow/High`, `pacingOver`), `ctx.income` |
| **budget** | "am I within budget", category budget status | `ProgressBar` with limit marker + pace | category budget (added to ctx) + `trajectory.projected` pace |
| **coach** | "am I overspending on X", "what should I do", **proactive**, **push** | sentiment header + 1–3 reason rows + optional inline `ProgressBar`/comparison + action chip | `ctx.insights.coach` + the specific `anomaly`/`trajectory`/`recurring` that triggered it |

`coach` is the flexible advisory card — it is the same shape used by the
reactive answer (§7 P3), the proactive opening card (P4), and the push
notification (P5). One card type, three surfaces.

### 3.3 The V3 card catalog (transaction-query era — shipped)

The V3 upgrade ([FINO_INTELLIGENCE.md](FINO_INTELLIGENCE.md) "Convo brain") added a
synchronous transaction-query layer (`convo/query.ts` over a bounded `TxLite`
snapshot in `BrainContext`), which unlocked record-level and pattern/summary
answers — each with its own card. All stay theme-free (roles `cat-N`, status
`good/watch/over`); `ChatCardView` owns the theme mapping.

| `kind` | Triggered by | Mini visual | Data (from) |
|---|---|---|---|
| **txList** | "last 5", "over ₱5k this year", "tagged Entertainment", find-the-charge, highest expense | `TxRow`s (name · category · date · amount), each tappable → `TransactionDetail` | `convo/query.ts` `selectTx`/`sortByDateDesc`/`take` over `ctx.transactions` |
| **status** | "did my salary hit?", "did I pay the internet bill?" | check/✗ header + the matched (or missing) tx row | income/expense filter over the this-month range, cross-ref `recurringIncome`/`insights.recurring` |
| **summary** | Q1 / week / weekend / today digest / "income vs expenses" / "fixed vs variable" / "how did I do" | in/out/net header + `MiniBars` category inset | range-scoped `selectTx` + `groupByCategory`; "Open Cash Flow" / "Open Insights" |
| **budget** | "am I under my shopping budget", "budget health" | `ProgressBar` per category w/ limit marker | `ctx.budgets` (`Category.budgetLimit`) vs this-month spend + month-progress pace |
| **needsWants** | "needs vs wants" | two-segment bar + ratio | `convo/needsWants.ts` rough heuristic over `groupByCategory` (surfaced as approximate) |
| **pattern** | "what day do I spend most", category trend up/down | day-of-week `MiniBars` (peak highlighted) or a 2-bar week-over-week trend | `groupByDayOfWeek`; `insights.weekDeltas`/`trendSlope` for trend direction |

**Advice cards (Category 4)** ride the existing **`coach`** kind, extended with
**action buttons** — `convo/advice.ts` builds data-aware coaching
(`subscriptionCut` / `emergencyFund` / `goalPlan` / `bonusAdvice` /
`improveSavings` / `cutAmount` / `ruleOfThumb` / `impulseTips`) as a coach card
with reason rows + a `CardAction[]`.

**Actions (`CardAction`) replace the single "Open Insights" chip.** Both
reply-level (`BrainResponse.actions`) and card-level (`card.actions`, with the
old single `card.action` kept as a back-compat alias). The union is theme- and
navigator-free; ChatScreen's `handleCardAction` dispatches it:

```ts
type CardAction =
  | { kind: 'navigate'; label; target: NavTarget; params? }  // open a screen, optionally pre-filled
  | { kind: 'prompt';   label; send: string };               // re-enter handleSend with a canned query
```

**"Do" actions = prefill + confirm (no silent writes).** A `navigate` action can
pass `params` so the target opens **staged** for the user to confirm —
`SavingsGoal` (`{ name?, target?, monthlyContribution? }` → opens the create
form pre-filled) and `Categories` (`{ focusCategory?, budgetLimit? }` → opens the
focused category's budget editor). Those screens read the params via `useRoute`
and open their form; the user saves. `TransactionDetail`/`RecurringBills`/
`Accounts`/`CashFlow` already suffice without prefill.

---

## 4. The mini-visual primitives (D1)

Purpose-built, bubble-sized, theme-token driven, in a new folder
`src/components/chat/`. None embed the Stats components; charts that need a path
use `react-native-svg` (already a dep), simple bars use plain `View` widths.

| Primitive | Built with | Used by |
|---|---|---|
| `MiniBars` | `View` widths (no lib) | breakdown |
| `ProgressBar` | `View` + optional marker | budget, coach |
| `MiniRing` | `react-native-svg` `Circle` (dash-offset) | budget (alt), coach pct |
| `MiniSparkline` | `react-native-svg` `Path` (line + area + CI band + dot) | forecast |
| `DeltaChip` | `View` + `Ionicons` ▲/▼ | compare, breakdown |
| `ChatCardView` | `switch(card.kind)` → the above, `useTheme()` for color roles | the render seam |

Sizing target: full bubble width, ~100–160 px tall, no scroll, no interaction in
v1 beyond an optional "Open Insights" deep-link chip.

---

## 5. Money-Coach — the three surfaces (D2)

The coach is one engine (`getInsights`) read three ways:

1. **Reactive (in chat).** Coach/anomaly/budget/forecast intents answer with a
   `coach`/`forecast`/`budget` card instead of the V2 "open Insights" deferral.
   *Asked → answered.* (P3)
2. **Proactive (opening card).** On chat open, `selectProactiveCoach(insights)`
   picks the **single most important** nudge and renders it as a **live**,
   dismissible card near the hero — recomputed each open, **not persisted** (same
   pattern as the hero card, so it never stales or stacks). Prioritized:
   over-budget / negative → anomaly → upcoming bill → positive milestone. Shows
   **only** when its `sufficiency` gate passes and the sentiment is non-neutral
   (no "everything's fine" noise). (P4)
3. **Push (out of chat).** A new `coach` notification type on the **local-schedule
   rail** of the notifications subsystem: a scheduled on-device check runs
   `getInsights`, and if a high-priority nudge exists, writes an inbox row +
   fires a local notification routed (via `navigationRef`) to ChatScreen.
   Gated by a `notification_prefs` toggle, throttled (≤1 coach push/day),
   sentiment-gated (cautious/negative or a positive milestone only). The **Edge
   push rail is deferred** — the server has no copy of the coach math, and
   replicating it from Supabase belongs to its own effort. (P5)

---

## 6. Persistence: snapshot vs. live (the staleness rule)

A card holds numbers. Two different lifetimes, and conflating them stales the UI:

- **Reply cards are snapshots.** When the brain answers a question with a card,
  the numbers are **frozen into the `payload` JSON** alongside `txData`, exactly
  like a sent message. On reopen it shows the numbers *as of when asked* — that
  is correct; it is history. **Never recomputed.**
- **The proactive opening card is live.** Computed fresh from current `Insights`
  every open, rendered as a fixed element (not a `messages[]` entry),
  **never persisted** — mirrors the existing hero card so it can't stack or go
  stale.

This split mirrors how the hero card (live, unpersisted) and `TxConfirmCard`
(snapshot, persisted) already coexist in [FINO_CHATBOT.md](FINO_CHATBOT.md) §2/§3.2.

---

## 7. Phases (shimmed where helpful, each gated)

| Phase | Status | Work | Gate |
|---|---|---|---|
| **P0 — This plan** | ✅ done | This doc; resolve the open questions in §10 | review |
| **P1 — Card contract + renderer** | ✅ done | `ChatCard` union + `BrainResponse.card?` in `convo/types.ts`; built `src/components/chat/` primitives (`MiniBars`, `ProgressBar`, `MiniSparkline`, `DeltaChip`) + `ChatCardView`; render `msg.card` in ChatScreen (gated `!isStreaming`); serialize `card` in `payload` ([chatMutations.ts](src/services/chatMutations.ts) + `rowToMessage`); **retired `richData`** | renders in app; `tsc` clean; new files lint-clean |
| **P2 — Widen `BrainContext` with `Insights`** | ✅ done | Added `insights?: Insights` to `BrainContext` (**type-only** import keeps the brain pure/sync & the `tsx` harness loadable); ChatScreen resolves `getInsights(userId, y, m)` on mount + debounced on tx change and injects it; `buildInsights()` fixture in `test-brain` | `tsc`; `test:brain` 154/154 |
| **P3 — Cards in reactive answers** | ✅ done | `intelligenceBridge.answer{Breakdown,Compare,Savings→forecast}` attach a `card`; new `coach` + `overspend` intents → coach cards; pure builders in `convo/cards.ts`; anomalies folded into the flexible `coach` card (§10 Q3); deep-link "Open Insights" chip on forecast/coach (§10 Q4) | `test:brain` asserts `card.kind` + key fields; 154/154 |
| **P4 — Proactive opening coach card** | ✅ done | `selectProactiveCoach(insights) → ChatCard \| null` in `convo/coach.ts` (sentiment-gated: non-neutral only, no "everything's fine" noise); ChatScreen renders it live atop the thread, dismissible, **unpersisted** | selector unit test (in `test-brain`); visual on-device pending |
| **P5 — Coach push notifications** | ⏳ **deferred** | `coach` notification type on the local-schedule rail; on-device `getInsights` check → inbox row + local notif + `navigationRef` route to ChatScreen; `notification_prefs` toggle; throttle + sentiment gate; **Edge rail deferred** | notif fires; inbox row; nav route; pref respected; throttle holds |
| **P6 — Docs** | ✅ done | Updated [FINO_CHATBOT.md](FINO_CHATBOT.md) (card message shape, coach surfaces), [FINO_INTELLIGENCE.md](FINO_INTELLIGENCE.md) (coach now surfaced, not deferred), [CLAUDE.md](CLAUDE.md) | docs match code |

**Suggested first slice (smallest end-to-end vertical):** P1 + P2 + the
**breakdown** and **compare** cards in P3 — they need only aggregates ChatScreen
already holds (`topCategories`, `spent`, `lastMonthSpent`), no `Insights`
plumbing, proving the whole pipe (brain → payload → snapshot render) before the
coach/forecast cards depend on `getInsights`.

---

## 8. Hard constraints (unchanged Fino laws)

| Constraint | Consequence |
|---|---|
| **Offline-first** | No network in the chat. `getInsights` is local WatermelonDB; cards narrate local math. |
| **Brain is pure & synchronous** | All async data (`getInsights`) is resolved by ChatScreen and injected via `BrainContext`. Card builders are pure functions. |
| **Determinism where money is involved** | Logging still goes through the deterministic taxonomy parser, untouched. Cards only *report*; they never log. |
| **Never hard-code colors** | Cards carry semantic roles; `ChatCardView` owns the theme mapping (§3.1). |
| **`test:taxonomy` + `test:brain` stay green** | `test:brain` is extended to assert card payloads; taxonomy is untouched. |
| **Local-only chat history** | `card` rides in the existing `chat_messages.payload`; still never synced. |

---

## 9. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Async `Insights` vs. sync brain | ChatScreen resolves once + on change, injects into ctx; when absent, card builders **degrade to the existing text answer** (back-compatible). |
| Stale persisted cards | Reply cards are frozen snapshots; only the opening coach card is live + unpersisted (§6). |
| Theme breakage | Brain emits roles/status, never hex; renderer maps to tokens (§3.1). |
| Thin-data cards (false confidence) | Honor `InsightsSufficiency` — no forecast card below its gate, exactly like the Insights overlays. |
| Push noise | Pref toggle + ≤1/day throttle + sentiment gate; proactive card only when non-neutral. |
| `test:brain` not covering visuals | Assert the **data**, not pixels: `card.kind` + key numeric fields per fixture. |
| Scope creep into the Stats kit | D1 stands: mini visuals are independent; we don't refactor `components/stats/`. |

---

## 10. Open questions — resolved

All four were taken in the direction the plan recommended:

1. **v1 catalog → breakdown + compare + forecast + coach; `budget` deferred.** It's
   the only kind needing per-category budgets in `BrainContext`; the `ChatCard`
   union omits it for now (add it when that ctx data lands).
2. **Proactive cadence → every open when noteworthy** (recomputed live,
   dismissible per session, never persisted). Push cadence (P5) is a deferred
   decision along with the phase.
3. **`anomaly` folds into the flexible `coach` card** — one renderer, anomalies
   surface as the coach card's reason rows (with inline `ProgressBar`).
4. **One optional deep-link chip** — `card.action = { label: 'Open Insights',
   target: 'insights' }`, attached to forecast + coach cards, reusing the
   existing Stats-tab navigation.

The original questions, for the record:

1. **v1 catalog scope** — ship all five card kinds, or start with
   **breakdown + compare + forecast + coach** and defer **budget** until
   per-category budgets are threaded into `BrainContext`? *(Recommend: defer
   budget; it's the only kind needing new ctx data.)*
2. **Proactive cadence** — show the opening coach card **every** open (when
   noteworthy) or at most once/day? And push cadence: daily check, weekly, or
   event-driven (e.g. only when an anomaly crosses threshold)?
3. **`anomaly` as its own card?** — keep it folded into the flexible `coach`
   card (recommended, one renderer) or split a dedicated `anomaly` kind?
4. **Card affordance** — are v1 cards purely visual, or does each carry a
   tappable "Open Insights / Open category" deep-link chip? *(Recommend: a
   single optional deep-link chip, reusing the existing Stats navigation.)*

---

## 11. Decisions log

- **D1 — Purpose-built mini visuals** (not the Stats kit). See §0/§4.
- **D2 — Full coach reach**: reactive + proactive-on-open + push. See §0/§5.
- **D3 — Brain emits fully-populated card data** via a widened `BrainContext`.
  See §0/§1/§3.
- **Coach math is reused, not rebuilt** — `getInsights` already computes
  anomalies/trajectory/habits/recurring + a `CoachMessage`. See §1.
- **Edge push rail deferred** — local rail first; server has no coach math. See §5.

---

## 12. Build log / deviations (kept honest)

- **`Insights` is imported type-only into the brain.** `convo/types.ts`,
  `convo/cards.ts`, and `convo/coach.ts` do `import type { Insights } from
  '../../services/IntelligenceEngine'`. `IntelligenceEngine` pulls in WatermelonDB
  / React Native, which the `tsx` harness can't transform — but a type-only
  import is erased before module resolution, so `test:brain` still loads. The
  brain reads `ctx.insights` as plain data and never imports the engine at
  runtime, so D3 holds without breaking the offline/sync law.
- **Card builders live in `convo/cards.ts`, not inline in `intelligenceBridge`.**
  Pure functions (`buildBreakdownCard` / `buildCompareCard` / `buildForecastCard`
  / `buildCoachCard`) shared by the reactive bridge **and** the proactive
  `selectProactiveCoach` — one source of card shape across surfaces 1 & 2.
- **`MiniSparkline` is a 2-segment line, not a per-day series.** `getInsights`
  exposes `spent`, `dailyAvg`, `projected`, `ciLow/High` — not a cumulative daily
  array. The forecast visual draws the actual pace so far (solid) → the projected
  month-end dot (dashed) + a CI band + optional income line. Honest given the
  data; if a daily cumulative is later threaded in, the sparkline can use it
  without changing the card contract.
- **`MiniRing` was not built.** The catalog listed it for `budget (alt)` / coach
  pct; `budget` is deferred and the coach card uses `ProgressBar` for its anomaly
  reason, so the ring had no consumer. Add it with the budget card.
- **`overspend` is its own intent, but reuses the `coach` card** (per §10 Q3 — one
  renderer). `coach` ("how am I doing") narrates `Insights.coach`; `overspend`
  ("am I overspending [on X]") focuses the same card on the worst / named-category
  anomaly. Both are rules-first; the shipped `model.json` predates them, so they
  resolve on weighted triggers (margin ≥ 1), never the classifier — `test:brain`
  asserts that.
- **Proactive card renders atop the message thread, not in the empty-state
  landing.** It appears once a thread exists (the common reopen case); the clean
  Gemini-style landing is left undisturbed. It's gated to non-neutral sentiment
  so the chat never opens with filler.
- **`test:brain` 125 → 154.** +8 intent fixtures (coach/overspend, EN+TL) and a
  card-payload block: `kind` + field assertions per reply card, the breakdown
  delta on/off, graceful text-only degradation without insights, and the
  proactive selector (non-neutral → card, neutral → null).
- **`ChatScreen` pre-existing lint untouched.** The file carries a dirty
  prettier/CRLF baseline (repo-wide, ~3.5k errors); new code is lint-clean and
  the file's unrelated regions were intentionally **not** reformatted. The one
  `tsc` error (`ChatScreen._value`) is the documented pre-existing baseline.

### V3 — transaction-query upgrade (shipped)

- **The "budget" card is no longer deferred.** `Category.budgetLimit` is now
  threaded into `BrainContext.budgets`, so `budgetStatus` renders a real
  `ProgressBar`-per-category card with a month-progress pace verdict. `MiniRing`
  is still unbuilt — the budget card uses `ProgressBar`, which reads cleaner at
  bubble width.
- **Six new card kinds beyond the v1 catalog:** `txList`, `status`, `summary`,
  `budget`, `needsWants`, `pattern` (§3.3). The brain queries a bounded
  `TxLite` snapshot ChatScreen injects (`convo/query.ts`, pure & synchronous);
  no DB or async entered the brain. New primitives are inline in `ChatCardView`
  (TxRow, two-segment needs/wants bar, day-of-week/trend bars) — still no Stats
  chart kit, still theme-token driven.
- **Advice = the `coach` card + `actions[]`.** `convo/advice.ts` builds the eight
  Category-4 coaching answers as coach cards carrying a `CardAction[]`; no new
  renderer was needed.
- **`CardAction` is now a union** (`navigate` | `prompt`), replacing the single
  `{ label; target:'insights' }`. The old `card.action` is kept as a back-compat
  alias and still renders. "Do" actions are `navigate` + `params` (prefill +
  confirm); `SavingsGoalScreen` and `CategoryScreen` read the params via
  `useRoute` and open their form staged. **No silent writes** — the V3 decision.
- **No typewriter.** The reply now arrives as a block (fade-in via `Reveal`)
  after a deterministic "working" beat, instead of the per-character stream —
  long coach/breakdown/txList replies no longer crawl.
- **Gating:** new `npm run test:query` (60+ cases: filters/ranges/slots/needs-
  wants) + `test:brain` grown to **292** (intent + slot + card-payload + action
  + the retrained classifier-fallback cases for the new intents). The classifier
  corpus (`scripts/brain-corpus.ts`) was expanded and `model.json` retrained
  (`npm run train:brain`, 32 classes) with a no-regression assert on the original
  fixtures + OOS rejection.
