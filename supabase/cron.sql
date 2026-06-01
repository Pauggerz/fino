-- ─────────────────────────────────────────────────────────────────────────────
-- pg_cron schedules for the notification dispatchers.
--
-- Prerequisites (run once, in order):
--   1. Apply push_tokens.sql, notification_prefs.sql, notification_deliveries.sql
--   2. Deploy the Edge Functions under supabase/functions/
--   3. Store the shared invocation secret in Vault:
--        select vault.create_secret('<RANDOM_LONG_STRING>', 'edge_invoke_jwt');
--      and set the same value as the EDGE_INVOKE_JWT Edge secret.
--   4. Replace <PROJECT_REF> below with your project ref (e.g. abcdxyz).
--
-- Idempotency note: dispatchers guarantee no double-sends via the unique index
-- notification_deliveries(user_id, kind) — see notification_deliveries.sql. The
-- advisory lock referenced in plan §6.11 is intentionally NOT installed: under
-- Supabase's pooled connections a session advisory lock can leak and wedge all
-- future runs. The unique index is the hard guard; dispatchers fall back to
-- "no lock" automatically when the optional RPC is absent.
-- ─────────────────────────────────────────────────────────────────────────────

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Helper: invoke an Edge Function with the shared bearer secret from Vault.
create or replace function public.invoke_dispatcher(fn text)
returns void
language plpgsql
security definer
as $$
declare
  jwt text;
begin
  select decrypted_secret into jwt
  from vault.decrypted_secrets
  where name = 'edge_invoke_jwt'
  limit 1;

  perform net.http_post(
    url := 'https://<PROJECT_REF>.functions.supabase.co/' || fn,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || coalesce(jwt, '')
    ),
    body := '{}'::jsonb
  );
end;
$$;

-- Unschedule existing jobs so this file is safe to re-run.
do $$
declare j text;
declare jobs text[] := array[
  'bill-reminder-dispatch', 'recurring-bill-dispatch', 'recurring-income-dispatch',
  'weekly-digest-dispatch', 'goal-milestone-dispatch', 'expo-receipts',
  'invalid-token-reaper', 'cleanup-deliveries'
];
begin
  foreach j in array jobs loop
    perform cron.unschedule(j) where exists (select 1 from cron.job where jobname = j);
  end loop;
end$$;

-- ── Schedules (§6.28) ────────────────────────────────────────────────────────
select cron.schedule('bill-reminder-dispatch',    '*/15 * * * *', $$ select public.invoke_dispatcher('bill-reminder-dispatch') $$);
select cron.schedule('recurring-bill-dispatch',   '*/15 * * * *', $$ select public.invoke_dispatcher('recurring-bill-dispatch') $$);
select cron.schedule('recurring-income-dispatch', '*/15 * * * *', $$ select public.invoke_dispatcher('recurring-income-dispatch') $$);
select cron.schedule('weekly-digest-dispatch',    '0 * * * *',    $$ select public.invoke_dispatcher('weekly-digest-dispatch') $$);
select cron.schedule('goal-milestone-dispatch',   '*/15 * * * *', $$ select public.invoke_dispatcher('goal-milestone-dispatch') $$);
select cron.schedule('expo-receipts',             '*/10 * * * *', $$ select public.invoke_dispatcher('expo-receipts') $$);
select cron.schedule('invalid-token-reaper',      '0 3 * * *',    $$ select public.invoke_dispatcher('invalid-token-reaper') $$);
select cron.schedule('cleanup-deliveries',        '0 4 * * *',    $$ select public.invoke_dispatcher('cleanup-deliveries') $$);

-- Verify with:  select jobname, schedule, active from cron.job order by jobname;
