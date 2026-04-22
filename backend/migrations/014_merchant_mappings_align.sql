-- Align merchant_mappings with the WatermelonDB schema.
--
-- The client side (src/db/schema.ts, src/db/models/MerchantMapping.ts,
-- src/services/localMutations.ts::upsertMerchantMapping) stores a single
-- string column `merchant_raw` plus `category`.
--
-- The server was created back in 005_merchant_mappings.sql as
-- `raw_ocr_string` + `display_name` + `category` and never updated when the
-- client moved to the current shape. Once `updated_at`/`deleted_at` are added
-- by `supabase/watermelon_sync_migration.sql`, watermelonSync will start
-- pushing/pulling this table and the column mismatch will surface as PGRST
-- errors in both directions.
--
-- This migration reconciles the server to match the client. `display_name`
-- has no reader anywhere in the app, so dropping it is safe.
--
-- Idempotent: re-running is a no-op.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'merchant_mappings'
      AND column_name = 'raw_ocr_string'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'merchant_mappings'
      AND column_name = 'merchant_raw'
  ) THEN
    ALTER TABLE public.merchant_mappings
      RENAME COLUMN raw_ocr_string TO merchant_raw;
  END IF;
END$$;

ALTER TABLE public.merchant_mappings
  DROP COLUMN IF EXISTS display_name;
