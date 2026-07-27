-- ============================================================
-- Campus Bulkmart — Add missing order-tracking columns (Phase 7)
-- Run this in Supabase SQL Editor against your EXISTING database.
--
-- Why: while rewriting admin.js, three fields turned up in the order
-- status workflow (amountPaid, confirmedAt, completedAt) that never
-- made it into the original schema.sql. Since your orders table
-- already has real migrated data in it, this uses ALTER TABLE
-- instead of dropping/recreating — safe to run, adds columns only,
-- touches no existing rows.
-- ============================================================

alter table public.orders
  add column if not exists amount_paid numeric,
  add column if not exists confirmed_at timestamptz,
  add column if not exists completed_at timestamptz;
