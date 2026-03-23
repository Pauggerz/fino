-- Migration: 007_add_total_budget
-- Adds global monthly budget limit to users table
-- Drives the Stats screen hero card "₱8,000 monthly budget" display
-- and the overall budget progress bar percentage
-- NULL = no limit set, tracking only, no alerts fired
-- Run: psql $RAILWAY_DB_URL -f backend/migrations/007_add_total_budget.sql

ALTER TABLE users
  ADD COLUMN total_budget DECIMAL(12,2);
