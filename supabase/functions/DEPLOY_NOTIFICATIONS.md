# Notification dispatchers — deploy & verify runbook

The push-notification **server rail** is code-complete (8 Edge Functions + the
pg_cron schedule in [`supabase/cron.sql`](../cron.sql)). It is **not** live until
the steps below are run against your Supabase project. This is a manual,
one-time setup; re-running it is safe (every step is idempotent).

The **local rail** (on-device scheduled reminders via `expo-notifications`)
needs none of this — it works offline once the app ships.

> Architecture recap: two rails write one inbox. The hard idempotency guard is
> the unique index `notification_deliveries(user_id, kind)` — see
> [`expoPush.ts`](_shared/expoPush.ts) `claimDelivery`. The advisory lock is an
> optional, currently-uninstalled optimization (see `cron.sql` for why).

---

## Prerequisites

- Supabase CLI authenticated against the target project (`supabase login`,
  `supabase link --project-ref <PROJECT_REF>`).
- Project ref handy (the `abcdxyz` in `https://abcdxyz.supabase.co`).
- An Expo access token if you use one (`EXPO_ACCESS_TOKEN`) — optional but
  recommended so Expo associates sends with your account and raises rate limits.

---

## Step 1 — Apply SQL in dependency order

`notification_prefs` and the bump trigger depend on `bump_updated_at()` from the
sync migration, so order matters:

```bash
# from repo root, via the SQL editor or `supabase db execute`/psql
1. supabase/watermelon_sync_migration.sql   # defines bump_updated_at()
2. supabase/push_tokens.sql
3. supabase/notification_prefs.sql           # seeds a row per user (id == user_id)
4. supabase/notification_deliveries.sql
```

If `watermelon_sync_migration.sql` was already applied for the main sync engine,
re-running it is safe. Confirm the seed/backfill landed:

```sql
select count(*) as pref_rows from public.notification_prefs;
-- should be ~= number of rows in public.users
```

## Step 2 — Deploy the Edge Functions

```bash
for fn in bill-reminder-dispatch recurring-bill-dispatch recurring-income-dispatch \
          weekly-digest-dispatch goal-milestone-dispatch expo-receipts \
          invalid-token-reaper cleanup-deliveries; do
  supabase functions deploy "$fn" --no-verify-jwt
done
```

`--no-verify-jwt` is correct here: these are invoked by pg_cron with a **shared
secret** (`EDGE_INVOKE_JWT`), not a user JWT. Authorization is enforced in code
by `isAuthorisedInvocation` ([`expoPush.ts`](_shared/expoPush.ts)).

## Step 3 — Set secrets

```bash
# Shared cron→function invocation secret (any long random string).
INVOKE_SECRET="$(openssl rand -hex 32)"

# Edge-side secret (read by isAuthorisedInvocation):
supabase secrets set EDGE_INVOKE_JWT="$INVOKE_SECRET"

# Same value in Vault so invoke_dispatcher() can send it as the Bearer token:
#   (run in the SQL editor)
#   select vault.create_secret('<INVOKE_SECRET>', 'edge_invoke_jwt');

# Expo sending (optional but recommended):
supabase secrets set EXPO_ACCESS_TOKEN="<your-expo-access-token>"

# Staging guard — set on staging only so it never messages real users:
#   supabase secrets set APP_ENV=staging
#   (leave STAGING_REAL_SENDS unset; set it to "true" only to allow real sends)
```

The Vault secret name **must** be `edge_invoke_jwt` and its value **must equal**
`EDGE_INVOKE_JWT`, or every cron invocation returns 401. (See `invoke_dispatcher`
in `cron.sql`.)

## Step 4 — Substitute the project ref and apply the cron schedule

`cron.sql` has a `<PROJECT_REF>` placeholder in the function URL. Replace it,
then run the file:

```bash
sed "s/<PROJECT_REF>/<your-project-ref>/g" supabase/cron.sql > /tmp/cron.applied.sql
# then run /tmp/cron.applied.sql in the SQL editor
```

This `create extension`s `pg_cron` + `pg_net`, defines `invoke_dispatcher(fn)`,
unschedules any prior jobs, and (re)schedules all 8. Safe to re-run.

---

## Verify

```sql
-- 1. All 8 jobs scheduled and active.
select jobname, schedule, active from cron.job order by jobname;

-- 2. Watch invocations land (after the next tick).
select jobname, status, return_message, start_time
from cron.job_run_details order by start_time desc limit 20;

-- 3. Deliveries being recorded once dispatch fires.
select kind, channel, status, count(*)
from public.notification_deliveries group by 1,2,3 order by 1;
```

Smoke-test a single dispatcher by hand (replace ref + secret):

```bash
curl -s -X POST "https://<PROJECT_REF>.functions.supabase.co/bill-reminder-dispatch" \
  -H "Authorization: Bearer <INVOKE_SECRET>" \
  -H "Content-Type: application/json" -d '{}'
# → {"candidates":N,"sent":M,"outcomes":{...}}  (200)
# A 401 means EDGE_INVOKE_JWT and the Vault secret don't match.
```

End-to-end check: register a device (open the app → permission priming →
`push_tokens` row appears with `is_active = true`), create a bill due tomorrow
with `bill_reminders` on, and confirm a `bill-reminder:<id>:<date>` delivery flips
to `sent` after the configured hour in your timezone.

---

## Cadence reference (from `cron.sql`)

| Function | Schedule | Idempotency `kind` |
|---|---|---|
| bill-reminder-dispatch | every 15 min | `bill-reminder:<bill>:<due>` |
| recurring-bill-dispatch | every 15 min | `recurring-bill:<id>:<next_due>` |
| recurring-income-dispatch | every 15 min | `recurring-income:<id>:<date>` |
| goal-milestone-dispatch | every 15 min | `goal:<id>:<bucket>` |
| weekly-digest-dispatch | hourly | `weekly-digest:<user>:<ISO-week>` |
| expo-receipts | every 10 min | (polls receipts; no send) |
| invalid-token-reaper | daily 03:00 UTC | (reaps 60-day-stale tokens) |
| cleanup-deliveries | daily 04:00 UTC | (90-day audit retention) |

## Troubleshooting

- **All cron runs 401** → `EDGE_INVOKE_JWT` ≠ Vault `edge_invoke_jwt`. Re-set both.
- **`no_tokens` outcomes** → no active `push_tokens` for that user; the device
  hasn't registered (permission not granted, simulator, or missing EAS
  `projectId` in app config).
- **Nothing sends but candidates > 0** → check the user's `notification_prefs`
  (`push_enabled`, the per-category toggle, quiet hours, `rate_limit_per_day`),
  and the timezone hour gate (`bill_reminder_hour` / `weekly_digest_hour`).
- **Copy looks wrong / inconsistent with the app** → the two copy files drifted;
  run `npm run check:copy-sync` (it gates the pre-commit, so this shouldn't
  happen).
