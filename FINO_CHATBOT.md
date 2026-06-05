# Fino Chatbot

The conversational surface of Fino — the chat screen where a user can **ask
about their money** ("how much did I spend on food?") *and* **log a transaction
by typing it** ("spent 50 on grab via gcash"), in the same input box.

This is the focused companion to [FINO_INTELLIGENCE.md](FINO_INTELLIGENCE.md)
(the whole intelligence layer, both tiers) and
[INSIGHTS_FORMULAS.md](INSIGHTS_FORMULAS.md) (the math behind the insights the
chatbot narrates). Where this doc covers the *engine* feeding the chat, it links
out rather than repeating.

The chatbot is **offline-first** — it makes no network calls. It is two things
stitched into one screen:

1. **A logger** — every message is first run through the **offline** parser and,
   if it looks like a transaction, saved to WatermelonDB. The green
   `TxConfirmCard` is the acknowledgement; no chat reply is generated for a
   message that logged a transaction. This is Tier 1 (see FINO_INTELLIGENCE.md §1).
2. **An assistant** — non-transaction messages are answered **on-device** by the
   **Fino Brain** ([convo/brain.ts](src/intelligence/convo/brain.ts)), a
   rules-first intent router with an offline Naive-Bayes fallback. No Gemini, no
   API key, no network.

The thread is **persisted locally** to the `chat_messages` WatermelonDB table and
reloaded when the screen reopens. It is **never synced to Supabase** — chat
history stays on the device (the table is deliberately absent from
`SYNCED_TABLES` in [watermelonSync.ts](src/services/watermelonSync.ts)).

> **The invariant that defines the chatbot:** it works fully offline. Both
> logging and replies run on-device; nothing about the chat depends on
> connectivity.

---

## 1. Where it lives

| Piece | File | Role |
|-------|------|------|
| **Chat screen** | [src/screens/ChatScreen.tsx](src/screens/ChatScreen.tsx) | All UI + orchestration (the bulk of the chatbot) |
| **Offline brain** | [convo/brain.ts](src/intelligence/convo/brain.ts) | `routeMessage()` — rules-first intent router + Naive-Bayes fallback; generates replies on-device |
| **Chat tx parser** | [parseTransaction.ts](src/intelligence/categorize/parseTransaction.ts) | Offline text → structured transaction |
| **Chat history** | [chatMutations.ts](src/services/chatMutations.ts) + [ChatMessage.ts](src/db/models/ChatMessage.ts) | Save/load/clear the local-only `chat_messages` thread |
| **Mutation** | [src/services/localMutations.ts](src/services/localMutations.ts) | `createTransaction()` — the actual write |
| **Registration** | [src/navigation/RootNavigator.tsx](src/navigation/RootNavigator.tsx) | `React.lazy` modal screen, `headerShown: false`, `presentation: 'modal'` |

> **Historical note:** chat replies used to come from Google Gemini via
> `src/services/gemini.ts`. That coupling was removed and `gemini.ts` has since
> been **deleted** — the chat is offline-only, and the whole intelligence layer
> (brain included) now lives under `src/intelligence/`, imported via the
> `@/intelligence` barrel (see [FINO_INTELLIGENCE_V2.md](FINO_INTELLIGENCE_V2.md)).

ChatScreen is a **lazy-loaded modal** (per CLAUDE.md, all heavy modals are
`React.lazy` + `Suspense`). It is reached from several entry points:

| Entry point | File |
|-------------|------|
| Home "Ask Fino" CTA | [src/screens/HomeScreen.tsx](src/screens/HomeScreen.tsx) |
| Stats screen | [src/screens/StatsScreen.tsx](src/screens/StatsScreen.tsx) |
| Tools carousel tile | [src/components/ToolsCarousel.tsx](src/components/ToolsCarousel.tsx) |
| Profile sidebar | [src/components/ProfileSidebar.tsx](src/components/ProfileSidebar.tsx) |
| More screen (`'fino'` item) | [src/screens/MoreScreen.tsx](src/screens/MoreScreen.tsx) |

All call `navigation.navigate('ChatScreen')`. The onboarding
[AskFinoSlide](src/screens/onboarding/AskFinoSlide.tsx) is a *preview/teaser* of
the experience, not the live screen.

---

## 2. What the screen knows (data wiring)

On mount, ChatScreen subscribes to live local data — no props are passed in:

| Source | Hook / query | Used for |
|--------|--------------|----------|
| Accounts + total balance | `useAccounts()` | account picker, stats strip, hero card |
| Monthly income / expense | `useMonthlyTotals()` | hero card, stats strip |
| Expense categories (+ budgets) | `useCategories()` | category resolution for logging |
| Income categories | `useIncomeCategories()` | income parsing |
| Recent transactions | live WatermelonDB `query.observe()` on `transactions` | empty-state guard (does the user have any data yet?) |
| **Tx snapshot (V3)** | bounded `query.observeWithColumns()` on `transactions` (trailing ~13 mo + this year, capped ~2k rows) → `TxLite[]` | the brain's record-level / pattern / summary answers — injected as `BrainContext.transactions` |
| **Recurring income (V3)** | `query.observe()` on `recurring_incomes` (active) | `salaryStatus` ("did my salary hit yet?") via `BrainContext.recurringIncome` |
| Pre-computed `Insights` | `getInsights()` (async, resolved on the screen) | forecast / coach / overspend / trend cards via `BrainContext.insights` |
| Persisted thread | `loadChatHistory(userId)` on mount | restores the conversation from `chat_messages` |

ChatScreen also derives `accounts` (per-account balances) and `budgets` (from
`Category.budgetLimit`) into `BrainContext` so the brain can answer "balance
across accounts" and "am I under my shopping budget" — all of it injected, so the
brain stays pure & synchronous (no DB/async in the brain).

On mount, `loadChatHistory(userId)` restores the persisted thread into the
`messages` array. New messages are appended to state for the live render **and**
written back to `chat_messages` via `saveChatMessage`, so the conversation
survives closing and reopening the screen.

The opening message is a **hero card** built locally: a time-of-day greeting and
a "you're saving ₱X this month" headline derived from `totalIncome − monthlySpent`,
with balance / spent / income columns. It is recomputed live and rendered as a
fixed header above the thread — it is **not** persisted, so it never stacks up or
goes stale across reopens.

---

## 3. The send flow

`handleSend(text)` in [ChatScreen.tsx](src/screens/ChatScreen.tsx) is the heart
of the chatbot. A message is either a **transaction to log** or a **question to
answer** — never both. Everything runs offline.

```
handleSend("spent 50 on grab via gcash")
  │
  ├─ 0. clear input · abort any in-flight stream (streamGenRef++)
  │
  ├─ 1. append the user's bubble · saveChatMessage(role:'user')
  │
  ├─ 2. parseChatTransaction(text, accounts, categories, incomeCategories)   [OFFLINE, sync]
  │        → null            ⇒ not a transaction, go to step 4
  │        → { amount, displayName, category, type, accountId }
  │
  ├─ 3. LOG IT, then RETURN (no chat reply — the card IS the reply)
  │        accountId resolved?  ── yes ─► doLogTransaction() → TxConfirmCard (persisted)
  │                             └─ no ──► open AccountPickerModal (pendingTx)
  │
  ├─ 4. pickSteps(text) → show ThinkingSteps · setIsTyping(true)
  │
  └─ 5. routeMessage(text)                                                   [OFFLINE, sync]
           short delay (keeps ThinkingSteps visible) ─► typewriter-stream the
           reply ─► saveChatMessage(role:'ai')
```

### 3.1 Step 2 — offline parse (source of truth)

[parseTransaction.ts](src/intelligence/categorize/parseTransaction.ts) (exported
as `parseChatTransaction`) reuses the exact taxonomy the **Add Transaction** sheet
uses (see FINO_INTELLIGENCE.md §3–§4). It
decides income vs expense, extracts and **sums** multiple amounts ("chicken 50
and rice 50" → one ₱100 transaction), resolves the category and a display name,
and resolves an account (explicit mention, or the sole account if the user has
exactly one). It returns `null` when no peso amount is found — the signal for
"this is a question, not a log."

### 3.2 Step 3 — logging & the account picker

If a transaction was parsed:

- **Account resolved** → `doLogTransaction()` calls
  `createTransaction({ …, signalSource: 'description' })` and appends a green
  **`TxConfirmCard`** ("Transaction Logged") to the thread.
- **Account ambiguous** (>1 account, none named) → the transaction is held in
  `pendingTx` and the **`AccountPickerModal`** bottom sheet slides up. Picking an
  account resolves the pending log; dismissing cancels it.

### 3.3 Step 5 — the offline reply

`routeMessage()` returns a `BrainResponse` (`{ text, card?, followUps? }`)
synchronously. A short artificial delay keeps the `ThinkingSteps` animation on
screen (there's no network latency to fill it anymore), then the reply text is
**typewritten** into a bubble (see §5), the optional `card` renders once the
stream finishes, and both are persisted via `saveChatMessage` (the `card` is
snapshotted into the `payload` JSON — see §5.3). This step only runs for
non-transaction messages — step 3 `return`s for anything that logged. To unlock
the forecast/coach cards, ChatScreen resolves `getInsights` (async, local
WatermelonDB) and injects it into `BrainContext.insights` so the synchronous
brain can narrate it (FINO_CHATBOT_CARDS.md §1–§2).

---

## 4. The offline brain (`convo/brain.ts`)

[convo/brain.ts](src/intelligence/convo/brain.ts) generates every chat reply
on-device. No model, no network, no API key.

### 4.1 How it works

`routeMessage(raw, ctx)` is a **synchronous, composed pipeline** (no model load
on the render path): normalize → canonicalize (`<srai>`-style idiom reduction) →
**score intents** → extract slots → bridge to data → narrate. Intent scoring is
**rules-first** — weighted keyword/phrase triggers (EN + Tagalog + Bisaya) in
[convo/intents.ts](src/intelligence/convo/intents.ts), `score = Σ weights`,
argmax wins, confidence = top-1 − top-2 margin. When the margin is low it falls
back to a **Multinomial Naive-Bayes classifier**
([convo/classifier/](src/intelligence/convo/classifier/), shipped `model.json`),
whose synthetic `unknown` class rejects out-of-scope chatter into the gentle
fallback. A true tie between two data intents yields a **clarify** instead of a
guess. The architectural summary lives in
[FINO_INTELLIGENCE.md](FINO_INTELLIGENCE.md) §6.

### 4.2 What it can answer

The brain answers four families of questions, all offline. Data answers are
narrated by [convo/intelligenceBridge.ts](src/intelligence/convo/intelligenceBridge.ts)
from the live `BrainContext` ChatScreen injects — it never invents numbers:

- **Aggregates** — balance (now per-account), income, spend, breakdown, top
  category, compare (now range/category-scoped), savings forecast, coach,
  overspend.
- **Transaction info (V3)** — `transactions` (last N / over ₱X / tagged / find
  the charge / highest), `categoryOf` ("which category was my Spotify payment"),
  `salaryStatus`, `billStatus`. Powered by the **`TxLite` snapshot** ChatScreen
  injects + the pure query engine [convo/query.ts](src/intelligence/convo/query.ts).
- **Patterns & summaries (V3)** — `dowPattern`, `trend`, `incomeShare`,
  `typicalSpend`, `budgetStatus`, `needsVsWants`, `summary` (Q1/week/weekend/
  digest/income-vs-expense/fixed-vs-variable).
- **Advice (V3)** — `subscriptionCut`, `emergencyFund`, `goalPlan`,
  `bonusAdvice`, `improveSavings`, `cutAmount`, `ruleOfThumb`, `impulseTips`
  ([convo/advice.ts](src/intelligence/convo/advice.ts)) — each a coach card with
  **action buttons**.

### 4.3 Naming

The message label is **"Fino"** and the engine is the **Fino Brain**. (The
redesigned header is a centered "Fino" wordmark — no identity bar, no model pill.)

### 4.4 Extending it

Add a row to the intent registry **plus a canonicalize anchor** for the new
phrasing, wire an `answer*` in `intelligenceBridge.ts` (or `advice.ts`), and add
the intent to `DATA_INTENTS` in `brain.ts`. Grow the `scripts/brain-corpus.ts`
corpus and re-run `npm run train:brain` so the classifier learns the paraphrases,
then gate with `npm run test:brain` / `test:query`. The logging path stays
separate: typed transactions go through `parseChatTransaction`, not the brain (§3).

---

## 5. UI anatomy

ChatScreen renders entirely from a `Message[]` array; each message is one of a
few shapes (`text`, `card`, `txData`, `followUps`). Theme tokens come from
`useTheme()` — no hard-coded colors (per CLAUDE.md). Notable pieces:

| Element | What it is |
|---------|------------|
| **Header** | Back button, Fino avatar with a status dot (amber while thinking, green when idle), "Online · Knows your finances" subtitle, shortcut to Stats |
| **Stats strip** | Balance / Spent / Income cells under the header (only when the user has data) |
| **Hero card** | The opening greeting + monthly snapshot (§2) |
| **Proactive coach card** | A live, dismissible card pinned atop the thread when there's a noteworthy nudge — recomputed each open from `Insights`, **never persisted** (see FINO_CHATBOT_CARDS.md §5). |
| **`ChatCardView`** | The graphical reply cards (breakdown / compare / forecast / coach / txList / status / summary / budget / needsWants / pattern) — bubble-sized mini visuals in `src/components/chat/`, populated by the brain (FINO_CHATBOT_CARDS.md). |
| **`ThinkingSteps`** | Animated "working" bubble: context-aware step rows (e.g. *Fetching transactions → Grouping by category → Comparing to last month*) that advance one per beat, then unmount as the reply swaps in |
| **Block reveal** | The AI reply arrives **all at once** and fades in (via `Reveal`) after the working beat — the old per-character typewriter was removed (§5.1) |
| **`TxConfirmCard`** | Green "Transaction Logged" card with amount, name, category, account |
| **`AccountPickerModal`** | Bottom sheet for choosing an account when ambiguous (§3.2) |
| **Action buttons** | Theme-free `CardAction`s under a reply / inside a card: `navigate` (open a screen, optionally pre-filled to confirm) or `prompt` (re-enter `handleSend`) — dispatched by `handleCardAction` |
| **Follow-up chips** | Tappable suggested prompts that re-enter `handleSend` |
| **Empty-state guard** | When the user has no data, replaces the thread with "Start your journey" + a "Log your first expense" button |

### 5.3 Graphical cards (`msg.card`)

A brain reply can carry a typed `ChatCard` payload alongside its text — rendered
as a purpose-built mini visual inside the bubble by
[`ChatCardView`](src/components/chat/ChatCardView.tsx). Ten kinds ship today:
`breakdown · compare · forecast · coach · txList · status · summary · budget ·
needsWants · pattern` (advice rides `coach` + action buttons). The brain emits
semantic **roles** (`cat-0…`) and **status** (`good`/`watch`/`over`), never
colors, and theme-/navigator-free **`CardAction`**s (`navigate`/`prompt`); the
renderer maps roles/status to theme tokens and `handleCardAction` maps targets to
screens, so cards stay correct across all accents + light/dark. Reply cards (and
their actions) are **snapshots**: frozen into the `payload` JSON when sent and
never recomputed (history is correct as-of-asked). The live **proactive coach
card** is the exception — recomputed each open and unpersisted. The whole design
is in [FINO_CHATBOT_CARDS.md](FINO_CHATBOT_CARDS.md).

### 5.1 Reply reveal (the typewriter was removed)

Replies are produced synchronously, so there's no stream to animate. The send
path now:

- **Drops concurrent sends.** `isBusyRef` guards `handleSend` so a follow-up tap
  during the working beat can't produce a second reply in parallel (this replaced
  the old `streamGenRef` per-character generation guard).
- **Holds a deterministic "working" beat.** The reply is computed instantly; the
  only wait is `steps.length × WORK_STAGE_MS`, so `ThinkingSteps` lands on its
  final step exactly as the bubble swaps in.
- **Reveals as a block.** The full text appears at once and the bubble + any card
  fade in via `Reveal` — long coach/breakdown/txList replies no longer crawl
  character-by-character.

### 5.2 Thinking steps

`pickSteps(text)` regex-matches the user's message to a step set (`spend`,
`category`, `budget`, `bills`, `save`, `income`, or `default`) so the
"working" animation looks like it's doing the relevant work. Steps advance one
per `WORK_STAGE_MS` (deterministic, to match the parent's beat) — cosmetic, not
tied to real progress.

---

## 6. Failure modes

Because the chat is fully offline, the old network/quota failure ladder is gone.
What remains:

| Failure | Chatbot behavior |
|---------|------------------|
| **No network** | Irrelevant — nothing in the chat reaches out. Logging and replies both work. |
| **Unrecognized message** | The brain's `FALLBACK`: "I'm still in development right now 🚧". |
| **`createTransaction` throws** | Logged to console; the confirmation card isn't shown. The user's message bubble still persists. |
| **`saveChatMessage` fails** | Swallowed (`.catch`) so it never blocks the UI — the message still renders for the session, it just may not survive a reopen. |

---

## 7. Extending the chatbot

- **Add a new reply / intent** → append an `Intent` to
  [convo/intents.ts](src/intelligence/convo/intents.ts) (and a labelled row to
  `scripts/brain-corpus.ts`), then run `npm run test:brain`. Rules match first;
  a low-margin query falls back to the Naive-Bayes classifier, then to a clarify.
- **Make replies data-aware** → thread a context object through
  `routeMessage(raw, ctx)` and read the live totals ChatScreen already computes
  (balance, monthly spend, categories) via `convo/intelligenceBridge.ts`.
- **Change how typed transactions are parsed/categorized** → this is the offline
  taxonomy, not the brain. Edit [taxonomy.ts](src/intelligence/taxonomy/taxonomy.ts) /
  [parseTransaction.ts](src/intelligence/categorize/parseTransaction.ts) and run
  `npm run test:taxonomy` (see FINO_INTELLIGENCE.md §10).
- **Add a thinking-step set** → extend `STEP_SETS` and the `pickSteps` regex.
- **Persist a new message shape** → serialize it into the `payload` JSON in
  `saveChatMessage`, and rehydrate it in `rowToMessage` (ChatScreen).

---

## 8. Design principles (the "why")

1. **Offline-first.** Everything — logging *and* replies — runs on-device, so the
   chat works with no connectivity, no API key, and no quota to burn.
2. **Local and private.** Chat history lives only in the `chat_messages` table on
   the device; it is never synced to Supabase.
3. **Deterministic logging.** Typed transactions go through the same offline
   taxonomy as the Add Transaction sheet — reproducible and auditable.
4. **One message, one job.** A message either logs a transaction (acknowledged by
   the card) or gets a brain reply — never both.
5. **Additive growth.** New replies are new intents in a registry; the engine
   loop never has to change.
