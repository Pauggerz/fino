-- ─────────────────────────────────────────────────────────────────────────────
-- Server-side account balance reconciliation
--
-- Replaces the prior "client pushes balance, server upserts it" model, which
-- exhibited last-write-wins data loss when two devices synced concurrent
-- transactions while offline.
--
-- After this migration:
--   • balance = starting_balance + Σ(income) − Σ(expense) over live (non-
--     tombstoned) transactions. The server owns this column; the client
--     strips it from pushes (see src/services/watermelonSync.ts).
--   • New accounts default balance := starting_balance on INSERT.
--   • Any INSERT / UPDATE / DELETE on transactions recomputes the affected
--     account(s) inside the same SQL statement, so any concurrent syncs
--     serialize through the row lock.
--
-- Idempotent: safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Recompute a single account from its live transactions ────────────────────
create or replace function public.recompute_account_balance(p_account_id uuid)
returns void
language plpgsql
as $$
begin
  update public.accounts a
     set balance = coalesce(a.starting_balance, 0) + coalesce((
       select sum(
         case t.type
           when 'income'  then t.amount
           when 'expense' then -t.amount
           else 0
         end
       )
       from public.transactions t
       where t.account_id = a.id
         and t.deleted_at is null
     ), 0)
   where a.id = p_account_id;
end;
$$;

-- ── Trigger: recompute on every transaction write ────────────────────────────
create or replace function public.trg_recompute_balance_on_tx()
returns trigger
language plpgsql
as $$
begin
  if TG_OP = 'DELETE' then
    perform public.recompute_account_balance(OLD.account_id);
    return OLD;
  end if;

  perform public.recompute_account_balance(NEW.account_id);

  -- Transaction moved to a different account — the old one also needs
  -- recomputing so its balance drops the removed row.
  if TG_OP = 'UPDATE' and OLD.account_id is distinct from NEW.account_id then
    perform public.recompute_account_balance(OLD.account_id);
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_tx_recompute_balance on public.transactions;
create trigger trg_tx_recompute_balance
  after insert or update or delete on public.transactions
  for each row execute function public.trg_recompute_balance_on_tx();

-- ── Trigger: seed balance := starting_balance on account INSERT ──────────────
-- The client no longer pushes `balance`, so without this trigger new accounts
-- would land on the server with balance = 0 and lose their starting balance.
create or replace function public.trg_account_init_balance()
returns trigger
language plpgsql
as $$
begin
  if new.balance is null or new.balance = 0 then
    new.balance := coalesce(new.starting_balance, 0);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_accounts_init_balance on public.accounts;
create trigger trg_accounts_init_balance
  before insert on public.accounts
  for each row execute function public.trg_account_init_balance();

-- ── One-time reconciliation of existing data ─────────────────────────────────
-- Fix any drift that accumulated while the client was authoritative for
-- balance. Safe to re-run.
do $$
declare
  acc_id uuid;
begin
  for acc_id in select id from public.accounts loop
    perform public.recompute_account_balance(acc_id);
  end loop;
end$$;
