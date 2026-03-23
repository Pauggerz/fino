-- Migration: 008_bill_reminders
-- Stores bill reminders shown on the More screen
-- "Electricity due in 3 days · ₱1,200 · Meralco · Mar 25"
-- Manual entry only in v1
-- Run: psql $RAILWAY_DB_URL -f backend/migrations/008_bill_reminders.sql

CREATE TABLE bill_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(200) NOT NULL,
  amount DECIMAL(12,2),
  merchant_name VARCHAR(200),
  due_date TIMESTAMPTZ NOT NULL,
  is_recurring BOOLEAN DEFAULT FALSE,
  is_paid BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
