-- Adds a direction to debt records so the Debt Tracker can model both
-- receivables (someone owes the user) and payables (the user owes someone).
--
--   'owed_to_me' — a receivable (default; preserves the pre-migration meaning,
--                  where every row was money owed TO the user)
--   'i_owe'      — a payable (the user owes this person)
--
-- Left nullable on purpose: WatermelonDB sync may push rows without the column
-- set, and readers treat anything that isn't 'i_owe' as a receivable. The
-- DEFAULT backfills every existing row to 'owed_to_me' on add (Postgres 11+
-- does this without a table rewrite), so historical debts keep their meaning.

alter table debts
  add column if not exists direction text default 'owed_to_me';
