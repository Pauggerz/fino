-- ─────────────────────────────────────────────────────────────────────────────
-- notification_prefs — server mirror of the client NotificationPrefs.
--
-- SYNCED via WatermelonDB (see src/services/watermelonSync.ts). To satisfy the
-- "Watermelon id === Supabase id" invariant for a singleton-per-user row, `id`
-- is set equal to `user_id` everywhere it is written (handle_new_user trigger +
-- client). This makes upserts deterministic and idempotent: the first-run
-- AsyncStorage→DB migration on the client can create a local row keyed on the
-- user id and it will collide-merge with the server row instead of duplicating.
--
-- `user_id` carries a UNIQUE constraint as a second guard against duplicates.
-- updated_at / deleted_at are present so the generic sync engine round-trips it
-- like every other synced table. Idempotent: safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.notification_prefs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null unique references auth.users(id) on delete cascade,

  push_enabled              boolean  not null default true,

  bill_reminders            boolean  not null default true,
  bill_reminder_days_before smallint not null default 1
    check (bill_reminder_days_before between 0 and 3),
  bill_reminder_hour        smallint not null default 9
    check (bill_reminder_hour between 0 and 23),

  budget_alerts             boolean  not null default true,
  budget_threshold          smallint not null default 80
    check (budget_threshold in (50, 80, 100)),

  weekly_digest             boolean  not null default true,
  weekly_digest_day         smallint not null default 0
    check (weekly_digest_day between 0 and 6),
  weekly_digest_hour        smallint not null default 20
    check (weekly_digest_hour between 0 and 23),

  inactivity_reminder       boolean  not null default false,
  goal_milestones           boolean  not null default true,
  payday_reminders          boolean  not null default false,

  quiet_hours_enabled       boolean  not null default false,
  quiet_hours_start         smallint not null default 22
    check (quiet_hours_start between 0 and 23),
  quiet_hours_end           smallint not null default 7
    check (quiet_hours_end between 0 and 23),

  hide_amounts_on_lockscreen boolean not null default true,
  rate_limit_per_day         smallint not null default 10
    check (rate_limit_per_day between 0 and 50),

  timezone    text not null default 'Asia/Manila',

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create index if not exists notification_prefs_user_updated_idx
  on public.notification_prefs (user_id, updated_at desc);

-- bump_updated_at() defined in watermelon_sync_migration.sql.
drop trigger if exists trg_notification_prefs_bump on public.notification_prefs;
create trigger trg_notification_prefs_bump
  before update on public.notification_prefs
  for each row execute function public.bump_updated_at();

alter table public.notification_prefs enable row level security;
drop policy if exists "notification_prefs_own" on public.notification_prefs;
create policy "notification_prefs_own" on public.notification_prefs
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── Seed a prefs row for every user (id == user_id) ──────────────────────────
-- Fires on public.users INSERT so it covers both the auth-trigger path
-- (handle_new_auth_user) and the AuthContext PGRST116 fallback insert. Using
-- public.users (rather than auth.users) means the row exists by the time the
-- client first pulls.
create or replace function public.seed_notification_prefs()
returns trigger
language plpgsql
security definer
as $$
begin
  -- Defensive: the user_id FK targets auth.users. A public.users row without a
  -- matching auth.users row (e.g. a legacy/orphan profile) must NOT abort the
  -- public.users insert — only seed prefs when the auth user actually exists.
  if exists (select 1 from auth.users a where a.id = new.id) then
    insert into public.notification_prefs (id, user_id)
    values (new.id, new.id)
    on conflict (user_id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_seed_notification_prefs on public.users;
create trigger trg_seed_notification_prefs
  after insert on public.users
  for each row execute function public.seed_notification_prefs();

-- Backfill existing users that predate this table. Only those present in
-- auth.users — orphan public.users rows would violate the user_id FK.
insert into public.notification_prefs (id, user_id)
select u.id, u.id
from public.users u
where exists (select 1 from auth.users a where a.id = u.id)
on conflict (user_id) do nothing;
