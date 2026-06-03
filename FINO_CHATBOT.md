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
   **Fino Brain** ([src/services/finoBrain.ts](src/services/finoBrain.ts)), a
   rule-based intent router. No Gemini, no API key, no network.

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
| **Offline brain** | [src/services/finoBrain.ts](src/services/finoBrain.ts) | `routeMessage()` — rule-based intent router; generates replies on-device |
| **Chat tx parser** | [src/services/parseChatTransaction.ts](src/services/parseChatTransaction.ts) | Offline text → structured transaction |
| **Chat history** | [chatMutations.ts](src/services/chatMutations.ts) + [ChatMessage.ts](src/db/models/ChatMessage.ts) | Save/load/clear the local-only `chat_messages` thread |
| **Mutation** | [src/services/localMutations.ts](src/services/localMutations.ts) | `createTransaction()` — the actual write |
| **Registration** | [src/navigation/RootNavigator.tsx](src/navigation/RootNavigator.tsx) | `React.lazy` modal screen, `headerShown: false`, `presentation: 'modal'` |

> **Historical note:** chat replies used to come from Google Gemini via
> `src/services/gemini.ts`. That coupling was removed — the chat is now
> offline-only. `gemini.ts` may still exist in the tree but is no longer wired
> into the chatbot.

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
| Persisted thread | `loadChatHistory(userId)` on mount | restores the conversation from `chat_messages` |

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

[parseChatTransaction.ts](src/services/parseChatTransaction.ts) reuses the exact
taxonomy the **Add Transaction** sheet uses (see FINO_INTELLIGENCE.md §3–§4). It
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

`routeMessage()` returns a `BrainResponse` (`{ text, followUps? }`) synchronously.
A short artificial delay keeps the `ThinkingSteps` animation on screen (there's
no network latency to fill it anymore), then the reply text is **typewritten**
into a bubble (see §5) and persisted via `saveChatMessage`. This step only runs
for non-transaction messages — step 3 `return`s for anything that logged.

---

## 4. The offline brain (`finoBrain.ts`)

[finoBrain.ts](src/services/finoBrain.ts) generates every chat reply on-device.
No model, no network, no API key.

### 4.1 How it works

`routeMessage(raw)` normalizes the text (trim + lowercase) and walks an **ordered
registry of intents**. Each intent has a `test(normalized) → boolean` and a
`respond() → { text, followUps? }`. The first intent whose `test` matches wins;
if none match, a `FALLBACK` response is returned. Order matters — put specific
intents before broad ones. This mirrors the `STEP_SETS` / `pickSteps` pattern in
ChatScreen.

### 4.2 Seeded intents (current)

| Intent | Matches | Reply |
|--------|---------|-------|
| `greeting` | `hi`, `hello`, `hey`, `kumusta`, `kamusta`, `musta`, … (whole-word) | "Hello! How can I help you? 👋" |
| *(fallback)* | anything else | "I'm still in development right now 🚧" |

This is deliberately minimal — the screen is in UI/UX-testing mode, so most
non-greeting messages hit the fallback.

### 4.3 Naming

The chat header reads **"Fino AI"**, the message label is **"Fino"**, and the
engine is the **Fino Brain**. Same assistant, a few labels.

### 4.4 Extending it

Add an `Intent` to the registry — growth is additive, you don't rewire the loop.
To answer real questions offline (e.g. "what's my balance"), thread a context
object (the live totals ChatScreen already holds) through `routeMessage(raw, ctx)`
into `respond(ctx)` and read from it. The logging path stays separate: typed
transactions go through `parseChatTransaction`, not the brain (see §3).

---

## 5. UI anatomy

ChatScreen renders entirely from a `Message[]` array; each message is one of a
few shapes (`text`, `heroData`, `richData`, `txData`, `followUps`). Theme tokens
come from `useTheme()` — no hard-coded colors (per CLAUDE.md). Notable pieces:

| Element | What it is |
|---------|------------|
| **Header** | Back button, Fino avatar with a status dot (amber while thinking, green when idle), "Online · Knows your finances" subtitle, shortcut to Stats |
| **Stats strip** | Balance / Spent / Income cells under the header (only when the user has data) |
| **Hero card** | The opening greeting + monthly snapshot (§2) |
| **`ThinkingSteps`** | Animated "thinking" bubble: context-aware step rows (e.g. *Fetching transactions → Grouping by category → Comparing to last month*) that complete one by one with a spinner |
| **Typewriter stream** | The AI reply renders character-by-character with a blinking cursor (§5.1) |
| **`TxConfirmCard`** | Green "Transaction Logged" card with amount, name, category, account |
| **`AccountPickerModal`** | Bottom sheet for choosing an account when ambiguous (§3.2) |
| **Follow-up chips** | Tappable suggested prompts that re-enter `handleSend` |
| **Empty-state guard** | When the user has no data, replaces the thread with "Start your journey" + a "Log your first expense" button |

### 5.1 Streaming mechanics

The typewriter has a few deliberate subtleties worth preserving:

- **Generation guard.** `streamGenRef` is bumped on every new send; the
  per-character loop checks `streamGenRef.current === gen` and aborts mid-stream
  if a newer message arrives. This prevents two replies typing over each other.
- **Blank-first-frame.** `streamingMsgId` is set *before* the message is pushed,
  so the bubble renders empty from frame one — otherwise the full reply flashes
  for a render before the typewriter "restarts" it at char 0.
- **Stale-on-purpose finish.** When streaming ends, only `streamingMsgId` is
  cleared (not `streamingText`); the bubble falls back to the stored full
  `msg.text`. Clearing `streamingText` here could race the state flip and blank
  the bubble.

### 5.2 Thinking steps

`pickSteps(text)` regex-matches the user's message to a step set (`spend`,
`category`, `budget`, `bills`, `save`, `income`, or `default`) so the
"thinking" animation looks like it's doing the relevant work. The steps
complete on randomized timers (520–800 ms each) — they are cosmetic, not tied to
real progress.

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

- **Add a new reply / intent** → append an `Intent` to the registry in
  [finoBrain.ts](src/services/finoBrain.ts). First match wins; the fallback
  catches the rest.
- **Make replies data-aware** → thread a context object through
  `routeMessage(raw, ctx)` into `respond(ctx)` and read the live totals
  ChatScreen already computes (balance, monthly spend, categories).
- **Change how typed transactions are parsed/categorized** → this is the offline
  taxonomy, not the brain. Edit [taxonomy.ts](src/constants/taxonomy.ts) /
  [parseChatTransaction.ts](src/services/parseChatTransaction.ts) and run
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
