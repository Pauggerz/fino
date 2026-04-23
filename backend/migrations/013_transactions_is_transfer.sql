-- Add an explicit is_transfer flag to transactions.
--
-- Previously a balance move between two accounts was distinguished from a real
-- expense/income by the magic category string 'transfer'. That was brittle:
-- a legitimate category the user happens to name "Transfer" would collide,
-- and every reader had to repeat the case-insensitive string compare.
--
-- New rule:
--   • saveTransfer() writes is_transfer = TRUE on both legs.
--   • Stats/budget/trend readers exclude rows where is_transfer = TRUE.
--   • Category is preserved for backwards compatibility — existing clients
--     still filtering on category = 'transfer' keep working until they bump.
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS is_transfer BOOLEAN NOT NULL DEFAULT FALSE;

-- Backfill: any historical transfer rows get the flag so the new filters
-- produce the same output as the old string match on first sync.
UPDATE transactions
SET is_transfer = TRUE
WHERE lower(category) = 'transfer'
  AND is_transfer = FALSE;
