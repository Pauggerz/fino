-- ─────────────────────────────────────────────────────────────────────────────
-- push_tokens — Expo push tokens, one row per (user, device).
--
-- NOT part of WatermelonDB sync. The device writes its own token directly via
-- the Supabase JS client (see src/services/pushTokens.ts). Server-side
-- dispatchers (Edge Functions) read active tokens to fan out push messages.
-- Idempotent: safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.push_tokens (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  token       text not null,                       -- ExponentPushToken[...]
  platform    text not null check (platform in ('ios', 'android', 'web')),
  device_id   text,                                -- expo-device installationId / osInternalBuildId
  device_name text,
  app_version text,
  last_seen_at timestamptz not null default now(),
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- One row per (user, token). Re-registering the same token upserts.
create unique index if not exists push_tokens_user_token_uniq
  on public.push_tokens (user_id, token);

-- Dispatchers fan out only to active tokens — partial index keeps that lookup hot.
create index if not exists push_tokens_user_active_idx
  on public.push_tokens (user_id) where is_active;

-- bump_updated_at() defined in watermelon_sync_migration.sql.
drop trigger if exists trg_push_tokens_bump on public.push_tokens;
create trigger trg_push_tokens_bump
  before update on public.push_tokens
  for each row execute function public.bump_updated_at();

alter table public.push_tokens enable row level security;

drop policy if exists "push_tokens_own_select" on public.push_tokens;
drop policy if exists "push_tokens_own_insert" on public.push_tokens;
drop policy if exists "push_tokens_own_update" on public.push_tokens;
drop policy if exists "push_tokens_own_delete" on public.push_tokens;

create policy "push_tokens_own_select" on public.push_tokens
  for select using (auth.uid() = user_id);
create policy "push_tokens_own_insert" on public.push_tokens
  for insert with check (auth.uid() = user_id);
create policy "push_tokens_own_update" on public.push_tokens
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "push_tokens_own_delete" on public.push_tokens
  for delete using (auth.uid() = user_id);
