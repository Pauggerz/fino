-- ─────────────────────────────────────────────────────────────────────────────
-- notification_deliveries — audit log + idempotency guard for dispatched pushes.
--
-- NOT synced to the client. Written only by server-side Edge Function
-- dispatchers. The (user_id, kind) unique index is the idempotency key: a
-- dispatcher computes a deterministic `kind` (e.g. "bill-reminder:<id>:<date>")
-- and `insert ... on conflict do nothing` to claim the right to send exactly
-- once. Idempotent: safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.notification_deliveries (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  kind          text not null,                     -- deterministic idempotency key
  channel       text not null check (channel in ('push', 'local')),
  status        text not null check (status in (
                  'queued', 'sent', 'failed', 'dead',
                  'skipped_prefs', 'skipped_quiet_hours', 'rate_limited'
                )),
  expo_ticket_id  text,
  expo_receipt_id text,
  error_code    text,
  retry_count   smallint not null default 0,
  payload       jsonb,
  sent_at       timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Idempotency guard — one delivery per (user, kind).
create unique index if not exists notification_deliveries_kind_user_uniq
  on public.notification_deliveries (user_id, kind);

create index if not exists notification_deliveries_user_sent_idx
  on public.notification_deliveries (user_id, sent_at desc);

-- Receipt poller looks up rows by ticket id.
create index if not exists notification_deliveries_ticket_idx
  on public.notification_deliveries (expo_ticket_id)
  where expo_ticket_id is not null;

-- Reconciliation / retry sweeps scan failed rows by status + time.
create index if not exists notification_deliveries_status_idx
  on public.notification_deliveries (status, sent_at desc);

drop trigger if exists trg_notification_deliveries_bump on public.notification_deliveries;
create trigger trg_notification_deliveries_bump
  before update on public.notification_deliveries
  for each row execute function public.bump_updated_at();

-- RLS: server (service-role) writes; no client access. Enable RLS with no
-- permissive policies so the anon/auth roles can never read the audit log.
alter table public.notification_deliveries enable row level security;
