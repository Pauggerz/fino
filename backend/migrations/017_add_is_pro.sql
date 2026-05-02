-- Add is_pro flag to users table for Pro tier feature gating.
-- Defaults to false for all existing and new users.
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_pro boolean NOT NULL DEFAULT false;
