-- Migration: 006_add_ocr_confidence
-- Adds per-field OCR confidence scores to transactions
-- These drive the green (≥0.85) vs coral (<0.85) field states
-- in the Screenshot screen UI
-- NULL = transaction was entered manually, not from a screenshot
-- Run: psql $RAILWAY_DB_URL -f backend/migrations/006_add_ocr_confidence.sql

ALTER TABLE transactions
  ADD COLUMN merchant_confidence DECIMAL(4,2),
  ADD COLUMN amount_confidence   DECIMAL(4,2),
  ADD COLUMN date_confidence     DECIMAL(4,2);
