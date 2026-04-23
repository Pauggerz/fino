-- ─────────────────────────────────────────────────────────────────────────────
-- WatermelonDB sync migration
-- Adds `updated_at` + `deleted_at` columns and auto-update triggers to every
-- synced table so the client can pull deltas and push soft-deletes.
-- Idempotent: safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Helper: trigger function that bumps updated_at on every UPDATE ───────────
create or replace function public.bump_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ── Per-table patches ────────────────────────────────────────────────────────
do $$
declare
  t text;
  tables text[] := array[
    'accounts',
    'transactions',
    'categories',
    'debts',
    'savings_goals',
    'bill_reminders',
    'merchant_mappings'
  ];
begin
  foreach t in array tables loop
    execute format('alter table public.%I add column if not exists updated_at timestamptz not null default now()', t);
    execute format('alter table public.%I add column if not exists deleted_at timestamptz', t);
    execute format('create index if not exists %I on public.%I (user_id, updated_at desc)', t || '_user_updated_idx', t);
    execute format('drop trigger if exists %I on public.%I', 'trg_' || t || '_bump', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.bump_updated_at()', 'trg_' || t || '_bump', t);
  end loop;
end$$;

-- ── savings_goals table (create if it does not exist yet) ────────────────────
create table if not exists public.savings_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  description text,
  target_amount numeric(12,2) not null,
  current_amount numeric(12,2) not null default 0,
  target_date date,
  icon text not null default 'piggy',
  color text not null default '#1C9E4B',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table public.savings_goals enable row level security;
drop policy if exists "savings_goals_own" on public.savings_goals;
create policy "savings_goals_own" on public.savings_goals using (auth.uid() = user_id);

drop trigger if exists trg_savings_goals_bump on public.savings_goals;
create trigger trg_savings_goals_bump
  before update on public.savings_goals
  for each row execute function public.bump_updated_at();
