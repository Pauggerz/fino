# Database Improvements

Backlog of Supabase/Postgres improvements, captured from a `get_advisors` (security +
performance) audit on **2026-06-02**. Ordered by priority. Each item has the *why* and
ready-to-run SQL so it can be tackled in a sitting.

> **Project:** `lzewwtsvprlshgoaactc` · **Schema:** `public`
> **How to apply:** Supabase migrations live as loose `.sql` files in [supabase/](supabase/)
> (see [CLAUDE.md](CLAUDE.md)). When you action these, fold them into a new dated `.sql`
> migration there rather than running ad-hoc, so the change is reproducible.
> **Re-audit after applying:** run the `get_advisors` security + performance checks again
> and confirm the lints clear.

---

## 🔴 P0 — Broken access control (do first)

Two `SECURITY DEFINER` functions are `EXECUTE`-grantable by **`anon`** and **`authenticated`**
and perform **no ownership check**. Because `SECURITY DEFINER` bypasses RLS, anyone holding the
anon key (which ships inside the mobile app — effectively public) can call them over
`POST /rest/v1/rpc/<fn>` and mutate **any user's** data.

### `adjust_account_balance(p_account_id uuid, p_delta numeric)`
Worst offender — no auth check, no `search_path`, anon-executable. Lets a caller change the
balance of any account by any delta given only its UUID.

```sql
-- Current body (for reference):
--   UPDATE accounts SET balance = balance + p_delta WHERE id = p_account_id;
```

### `insert_tx_with_balance(tx jsonb)`
Inserts a transaction from raw JSON (including `user_id`/`account_id`) and adjusts the account
balance, with no check that the row belongs to the caller.

### Fix — choose one per function

**Option A (preferred): revoke client access**, call only from the backend with the service
role. Matches the "mutations go through the app/backend" convention in CLAUDE.md.

```sql
REVOKE EXECUTE ON FUNCTION public.adjust_account_balance(uuid, numeric) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.insert_tx_with_balance(jsonb)        FROM anon, authenticated;
```
> Verify nothing in the RN app calls these RPCs directly before revoking. Search the client for
> `rpc('adjust_account_balance'` / `rpc('insert_tx_with_balance'`.

**Option B: keep client-callable but enforce ownership** inside the function.

```sql
-- adjust_account_balance: scope the UPDATE to the caller's own account
CREATE OR REPLACE FUNCTION public.adjust_account_balance(p_account_id uuid, p_delta numeric)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  UPDATE public.accounts
     SET balance = balance + p_delta
   WHERE id = p_account_id
     AND user_id = auth.uid();          -- ownership guard
  IF NOT FOUND THEN
    RAISE EXCEPTION 'account not found or not owned by caller';
  END IF;
END $$;
```
For `insert_tx_with_balance`, force `user_id := auth.uid()` (ignore any client-supplied value)
and validate `account_id` belongs to the caller before inserting.

### Lower-risk SECURITY DEFINER functions (trigger fns exposed as RPC)
`handle_new_user`, `handle_new_auth_user`, `seed_user_defaults`, `seed_notification_prefs` are
trigger functions; calling them via RPC is mostly inert (they rely on `NEW`). Still, revoke RPC
access to reduce surface:

```sql
REVOKE EXECUTE ON FUNCTION public.handle_new_user()        FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_auth_user()   FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.seed_user_defaults()     FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.seed_notification_prefs() FROM anon, authenticated;
```

---

## 🟡 P1 — Hardening & policy correctness

### 1. Pin `search_path` on all functions (9 flagged)
A mutable `search_path` on a `SECURITY DEFINER` function is a privilege-escalation vector.

Affected: `handle_new_user`, `recompute_account_balance`, `trg_recompute_balance_on_tx`,
`trg_account_init_balance`, `handle_new_auth_user`, `bump_updated_at`, `adjust_account_balance`,
`set_updated_at`, `seed_notification_prefs`.

```sql
ALTER FUNCTION public.handle_new_user()              SET search_path = '';
ALTER FUNCTION public.recompute_account_balance()    SET search_path = '';
ALTER FUNCTION public.trg_recompute_balance_on_tx()  SET search_path = '';
ALTER FUNCTION public.trg_account_init_balance()     SET search_path = '';
ALTER FUNCTION public.handle_new_auth_user()         SET search_path = '';
ALTER FUNCTION public.bump_updated_at()              SET search_path = '';
ALTER FUNCTION public.adjust_account_balance(uuid, numeric) SET search_path = '';
ALTER FUNCTION public.set_updated_at()               SET search_path = '';
ALTER FUNCTION public.seed_notification_prefs()      SET search_path = '';
```
> With `search_path = ''` every object reference inside the function must be schema-qualified
> (`public.accounts`, not `accounts`). Check each body after applying.

### 2. Drop duplicate (multiple permissive) policies — 48 lints
Several tables have **two** overlapping permissive policies that say the same thing; both are
evaluated on every query. Keep one per table, drop the redundant one.

| Table | Policies present | Action |
|---|---|---|
| `debts` | `"Users can manage their own debts"` + `debts_own` | drop one |
| `savings_goals` | `"Users manage own goals"` + `savings_goals_own` | drop one |
| `recurring_incomes` | `"Users manage own recurring_incomes"` (+ short form?) | consolidate to one |
| `recurring_bills` | `"Users manage own recurring_bills"` (+ short form?) | consolidate to one |

```sql
-- Example — keep the short, indexed-friendly one; confirm the bodies match first:
DROP POLICY IF EXISTS "Users can manage their own debts" ON public.debts;
DROP POLICY IF EXISTS "Users manage own goals"          ON public.savings_goals;
```
> Before dropping, dump both policy bodies and confirm they're equivalent:
> ```sql
> SELECT tablename, policyname, cmd, qual, with_check
> FROM pg_policies WHERE schemaname='public'
> ORDER BY tablename, policyname;
> ```

### 3. Enable leaked-password protection
Auth setting (not SQL): **Dashboard → Authentication → Policies / Password** → enable the
HaveIBeenPwned compromised-password check.

### 4. `notification_deliveries`: RLS on, no policy
Acceptable **only if** this table is written exclusively by the Edge Function via the service
role and never read by clients (matches the current notifications design). If clients ever need
to read their own delivery history, add:
```sql
CREATE POLICY notification_deliveries_own ON public.notification_deliveries
  FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));
```
Otherwise leave as-is and treat this as a documented decision.

---

## 🟢 P2 — Performance (matters as data grows)

### 1. Wrap `auth.uid()` in RLS policies — 17 lints (`auth_rls_initplan`)
Policies call `auth.<fn>()` directly, so Postgres re-evaluates it **per row**. Wrapping in a
scalar subselect `(select auth.uid())` makes it evaluate **once per query**. Big win on
`transactions` (485 rows today, will grow).

Affected policies: `users_own`, `accounts_own`, `transactions_own`, `categories_own`,
`merchant_mappings_own`, `bill_reminders_own`, `debts_own` + `"Users can manage their own debts"`,
`savings_goals_own` + `"Users manage own goals"`, `"Users manage own recurring_incomes"`,
`"Users manage own recurring_bills"`, `notification_prefs_own`, and the four `push_tokens_own_*`.

Transformation pattern (apply to each policy's `USING` and `WITH CHECK`):
```sql
-- before:  user_id = auth.uid()
-- after:   user_id = (select auth.uid())
```
Recommended workflow: run the `pg_policies` dump from P1.2, then regenerate each policy with the
wrapped form. Do this **together** with the dedupe in P1.2 so each policy is rewritten once.

### 2. Add covering indexes for foreign keys — 3 lints
```sql
CREATE INDEX IF NOT EXISTS transactions_account_id_idx     ON public.transactions(account_id);
CREATE INDEX IF NOT EXISTS recurring_bills_account_id_idx   ON public.recurring_bills(account_id);
CREATE INDEX IF NOT EXISTS recurring_incomes_account_id_idx ON public.recurring_incomes(account_id);
```
`transactions.account_id` is the one that matters; the other two are tiny but cheap to fix.

### 3. Unused indexes — 8 lints (monitor, do **not** drop yet)
These are flagged unused only because data volume is tiny — they may be the right indexes once
usage grows. Revisit after the app has real traffic; drop only if still unused at scale.

`savings_goals_user_updated_idx`, `bill_reminders_user_updated_idx`, `recurring_incomes_user_id_idx`,
`recurring_bills_user_id_idx`, `push_tokens_user_active_idx`, `notification_deliveries_user_sent_idx`,
`notification_deliveries_ticket_idx`, `notification_deliveries_status_idx`.

---

## Non-advisor notes (verify intent)

- **`split-receipt` Edge Function has `verify_jwt: false`** — it's publicly callable. Confirm
  that's intentional (e.g. it does its own auth, or is rate-limited). `parse-receipt` correctly
  has `verify_jwt: true`.
- **`merchant_mappings` is empty (0 rows)** despite being a synced table — confirm
  auto-categorization is meant to populate it, or that it's intentionally unused for now.
- **`push_tokens` is empty (0 rows)** while `notification_prefs` has 13 — push can't reach
  anyone until tokens are registered. Expected if push registration isn't shipped yet.

---

## Suggested order of attack

1. **P0** — revoke/guard `adjust_account_balance` + `insert_tx_with_balance` (security).
2. **P1.1** — pin `search_path` on the 9 functions (cheap, same migration as P0).
3. **P2.1 + P1.2 together** — one pass over `pg_policies`: dedupe and wrap `auth.uid()`.
4. **P2.2** — add the 3 FK indexes.
5. **P1.3** — toggle leaked-password protection in the dashboard.
6. Re-run `get_advisors` (security + performance) to confirm everything clears.
