# Code Review — Remaining Fixes

Snapshot of issues found in the full review. Items marked **Applied** are already in the tree. Items marked **Pending** still need work. Items marked **Invalid** were re-verified and don't actually hold against the current code.

---

## Applied

### 1. Date-format normalisation on sync pull
`src/services/watermelonSync.ts`

Server stores `date` columns as `TIMESTAMPTZ` but the client treats them as `'YYYY-MM-DD'` strings in every `Q.where('date', Q.gte(...))` comparison. Added a `DATE_ONLY_COLUMNS` map + `toDayString()` in `remoteRowToRaw` so synced rows always land with day strings locally. Covers `transactions.date`, `debts.due_date`, `savings_goals.target_date`, `bill_reminders.due_date`.

### 2. RLS `WITH CHECK` + missing-table coverage
`backend/migrations/011_rls_with_check.sql`

The policies in `010_enable_rls.sql` only have `USING`, which gates SELECT/DELETE but **not** INSERT/UPDATE — a client can write rows with a forged `user_id`. New migration drops and recreates every policy with `USING` + `WITH CHECK`, and also enables RLS on `debts` and `savings_goals`, which were added after 010.

**Action required:** run this migration against the Supabase database.
```
psql $RAILWAY_DB_URL -f backend/migrations/011_rls_with_check.sql
```

### 3. `user_id` filter on local reactive queries
`src/screens/UtangTrackerScreen.tsx`, `src/screens/AccountDetailScreen.tsx`

Both screens queried WatermelonDB without a `user_id` clause — defensive fix in case multiple users ever share the same device (or logout doesn't wipe the local DB). Both now pull `user.id` from `useAuth()` and include `Q.where('user_id', userId)`.

### 4. Transfer rows excluded from category aggregations (cheap fix)
`src/hooks/useCategories.ts`, `src/hooks/useMonthlyTotals.ts`

`saveTransfer` creates two rows with `category='transfer'`. Both hooks now skip them in the aggregation loop. The "proper" fix (dedicated `is_transfer` boolean column) is still pending below.

### 5. Strip dead `TransactionStore` from `balanceCalc.ts`
`src/services/balanceCalc.ts`

Reduced to just the `BALANCE_ANIMATE_MS` export consumed by `HomeScreen`. The obsolete `Account = 'gcash'|'cash'|...` typed code is gone.

### 6. Income filter uses category name, not emoji glyph
`src/hooks/useCategories.ts`

Renamed `INCOME_EMOJI_KEYS` → `INCOME_CATEGORY_NAMES` and matched against `cat.name.toLowerCase()`. Was previously a silent no-op (matched against `cat.emoji`, which holds glyphs), so income categories were leaking into the budget UI.

### 7. WatermelonDB schema migrations scaffolding
`src/db/migrations.ts` (new), `src/db/index.ts`

Empty `schemaMigrations({ migrations: [] })` registry wired into the SQLite adapter so future schema bumps don't force a full local-DB reset. Add `{ toVersion, steps }` entries when bumping `schema.version`.

### 8. TZ-safe sparkline bucketing
`src/hooks/useMonthlyTotals.ts`

Both sides of the `dayDiff` calculation are now normalised to local midnight via a `startOfLocalDay` helper. Today's tx no longer flips into "yesterday" bucket after 00:00 UTC for users west of UTC.

### 9. `refetch` wired to `triggerSync` across hooks
`useAccounts.ts`, `useCategories.ts`, `useMonthlyTotals.ts`, `useTransactions.ts`

Pull-to-refresh now actually pulls from the server instead of being a no-op spinner.

### 10. AuthContext double-fire race guard
`src/contexts/AuthContext.tsx`

`didInit` ref ensures only the first arrival between `getSession()` and the `INITIAL_SESSION` `onAuthStateChange` event triggers the profile fetch. Stops duplicate PGRST116 fallback inserts under slow network. Subsequent auth events (sign-in, refresh) still fetch as before.

### 11. SyncContext throttled + AppState-gated
`src/contexts/SyncContext.tsx`

- 30s sync interval no longer fires when the app is backgrounded; resumes + immediate pull on return to foreground.
- Throttles redundant ticks (interval/NetInfo events fired sooner than 30s after the last successful sync are skipped).
- `forceSync()` from the provider context still bypasses the throttle.

### 12. Money rounded to cents on every write
`src/services/localMutations.ts`

Added `toCents(n) = Math.round(n * 100) / 100` and applied it to every write that touches an `amount`, `balance`, `total_amount`, `amount_paid`, `target_amount`, `current_amount`, `starting_balance`. Stops cumulative float drift on running balances.

### 13. `Q.like` sanitised in transactions hook
`src/hooks/useTransactions.ts`

`Q.like(category)` now wraps `category` in `Q.sanitizeLikeString(...)` so user-supplied wildcards can't leak through.

### 14. `useCachedQuery` cache keys versioned
`src/hooks/useCachedQuery.ts`

All AsyncStorage interactions now go through `versionedKey(key) = "v1:" + key`. Bump `CACHE_KEY_VERSION` to invalidate every cached payload at once when the shape changes.

---

## Invalid (verified against current code)

### `pullChanges` re-emits long-deleted rows forever
The current `pullChanges` runs two separate queries (`updated_at > sinceIso` AND `deleted_at > sinceIso`) and only emits a delete when the tombstone is newer than `lastPulledAt`. Because the soft-delete trigger bumps `updated_at` and `deleted_at` together, once both are < `sinceIso` the row is never returned. No bug.

### `loading` stuck true on empty result
`observe()` always emits an initial value, and the `userId` guard now calls `setLoading(false)` synchronously when no user is signed in. The hook never gets stuck.

---

## Pending

### Proper `is_transfer` column on transactions
`src/hooks/useCategories.ts`, `src/hooks/useMonthlyTotals.ts`, `src/services/localMutations.ts`, `src/db/schema.ts`, `backend/migrations/`

The cheap string-match exclusion works today, but a dedicated `is_transfer` boolean (or `transfer_pair_id`) is more robust — survives renames, allows joining the two legs, and removes the magic string. Requires a Watermelon schema migration and a Postgres migration.

### Crypto-safe UUIDs  *(needs `npm i expo-crypto`)*
`src/services/localMutations.ts`

`uuidv4()` uses `Math.random()` — predictable and has non-trivial collision odds under bursty creation. Install `expo-crypto`, replace with `Crypto.randomUUID()`.

```ts
import * as Crypto from 'expo-crypto';
function uuidv4(): string {
  return Crypto.randomUUID();
}
```

### Pagination + search pushdown into SQLite
`src/hooks/useTransactions.ts`

Observer currently returns every matching row; pagination slices in JS. Every mutation re-emits the full set and `modelToPlain` runs on all of it. At 5k+ transactions this is a perceptible lag.

**Fix:**
- Push `Q.take(visibleCount)` or `Q.experimentalNestedJoin`-based pagination into the query.
- Debounce `searchQuery`, push to SQLite with `Q.or(Q.where('display_name', Q.like(...)), Q.where('merchant_name', Q.like(...)))` + `Q.sanitizeLikeString`.
- Memoise `accountMap` separately from the tx-mapping pass so account updates don't retrigger full remap.

### `due_date` free-text input
`src/screens/UtangTrackerScreen.tsx` (add-debt modal)

`due_date` is typed by hand with placeholder `YYYY-MM-DD` and no validation. A user typing "soon" happily saves and breaks any future date comparisons.

**Fix:** replace with `@react-native-community/datetimepicker` (already a dependency).

### `FeedScreen.listData` unmemoised
`src/screens/FeedScreen.tsx`

`listData` ListItem array + `accountSpend` reduce both rebuild every parent render. Wrap in `useMemo` keyed on `sections` + `selectedAccountId`.

### `StatsScreen` uses imperative fetch
`src/screens/StatsScreen.tsx`

Manual query + AsyncStorage cache runs parallel to Watermelon's reactivity — a new transaction doesn't update stats until next navigation. Convert the primary query to `observe()` and keep AsyncStorage only as a warm-start cache on first mount.

### `DEFAULT_CATEGORY_BUDGETS` hardcoded fallback
`src/screens/StatsScreen.tsx`

If a category has `budget_limit = null` the screen silently uses a compile-time default that can diverge from what the user edited. Read live from the DB or remove the fallback.

### `lastSavedStore` module-level mutable state
`src/services/lastSavedStore.ts`

Works but isn't reactive. If kept, wrap with `useSyncExternalStore`.

---

## Priority order (recommended)

1. Run migration 011 (security) — `psql $RAILWAY_DB_URL -f backend/migrations/011_rls_with_check.sql`.
2. Smoke-test #1 (date normalisation) on real synced data — if there's existing prod data with ISO-timestamp `date` values already in Watermelon, the first pull after upgrade will normalise them as they re-sync. A one-time local rewrite effect may be needed.
3. Install `expo-crypto` and swap `uuidv4()`.
4. Pagination pushdown — biggest perf win.
5. Replace `due_date` text input with date picker.
6. Everything else as capacity allows.
