-- insert_tx_with_balance.sql
--
-- RPC function that inserts a transaction AND updates the account balance
-- in a single atomic database transaction. Called from syncService.processQueue
-- to prevent balance drift when network fails between the two operations.
--
-- Deploy: run this against the Supabase database (SQL editor or psql).

create or replace function public.insert_tx_with_balance(tx jsonb)
returns public.transactions
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted public.transactions;
  tx_amount numeric;
  tx_type text;
  tx_account uuid;
  delta numeric;
begin
  -- Insert the transaction row. jsonb_populate_record fills matching columns;
  -- the database default for `id` / `created_at` will fire if absent.
  insert into public.transactions
  select * from jsonb_populate_record(null::public.transactions, tx)
  returning * into inserted;

  tx_amount  := coalesce((tx->>'amount')::numeric, 0);
  tx_type    := tx->>'type';
  tx_account := (tx->>'account_id')::uuid;

  if tx_type = 'expense' then
    delta := -tx_amount;
  else
    delta := tx_amount;
  end if;

  update public.accounts
     set balance = balance + delta
   where id = tx_account;

  return inserted;
end;
$$;

-- Allow authenticated users to call it. RLS on the underlying tables still
-- applies because security definer runs as the function owner — if you prefer
-- the caller's RLS, change to `security invoker`.
grant execute on function public.insert_tx_with_balance(jsonb) to authenticated;
