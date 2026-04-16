create table if not exists debts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  debtor_name text not null,
  description text,
  total_amount numeric(12,2) not null,
  amount_paid numeric(12,2) not null default 0,
  due_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists debts_user_id_idx on debts(user_id);
create index if not exists debts_created_at_idx on debts(user_id, created_at desc);

alter table debts enable row level security;

drop policy if exists "Users can manage their own debts" on debts;
create policy "Users can manage their own debts"
  on debts for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
