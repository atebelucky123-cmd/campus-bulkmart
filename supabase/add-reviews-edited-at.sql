-- ============================================================
-- Campus Bulkmart — Add edited_at column to reviews (Phase 8)
-- Run in Supabase SQL Editor. Purely additive, safe on existing data.
--
-- Why: reviews.html lets a user edit their own review, which stamps
-- an "editedAt" timestamp — this field was never in the original
-- schema.sql (reviews.html wasn't migrated until Phase 8).
-- ============================================================

alter table public.reviews
  add column if not exists edited_at timestamptz;
