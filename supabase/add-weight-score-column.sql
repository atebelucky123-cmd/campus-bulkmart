-- ============================================================
-- Campus Bulkmart — Phase 2a Migration
-- Adds the mandatory 1–5 weight score to products, replacing the
-- old binary isHeavy flag as the real input to the delivery-fee
-- weight surcharge (Phases 3/4).
--
-- Run in Supabase Dashboard → SQL Editor.
--
-- Default of 3 (Medium) exists ONLY as a safe backfill for rows
-- that predate this column — it is not meant to be the "correct"
-- weight for any existing product. Per Phase 2a's Your Actions,
-- go through every existing product afterward and set its real
-- weight score. Enforcement that a value is *deliberately chosen*
-- (not just left at the backfill default) happens in the admin
-- form (admin-products-form.js), not at the DB level.
--
-- Safe to re-run: guards on column-not-exists before adding.
-- ============================================================

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'products' and column_name = 'weight_score'
  ) then
    alter table public.products
      add column weight_score smallint not null default 3
        check (weight_score between 1 and 5);
  end if;
end $$;

comment on column public.products.weight_score is
  '1 (very light) to 5 (very heavy) — feeds the delivery-fee weight surcharge (Phase 3/4). Mandatory per-product; admin form blocks save without an explicit selection.';
