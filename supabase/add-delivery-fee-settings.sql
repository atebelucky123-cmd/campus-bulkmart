-- ============================================================
-- Campus Bulkmart — Phase 2d Migration
-- Delivery Fee Settings — the four values Phase 3's delivery-fee.js
-- reads live, instead of hardcoding numbers in code. Admin-editable
-- via the new Delivery Settings tab.
--
-- Run in Supabase Dashboard → SQL Editor, after Phase 2c's two
-- migrations.
-- ============================================================

insert into public.settings (key, value)
values (
  'deliveryFeeConfig',
  '{
    "baseFee": 200,
    "transportRatePerKm": 300,
    "weightFreeThreshold": 5,
    "weightSurchargeRate": 100,
    "weightSurchargeUnit": 1
  }'::jsonb
)
on conflict (key) do update set value = excluded.value, updated_at = now();

comment on column public.settings.value is
  'For key=deliveryFeeConfig: baseFee (₦ flat), transportRatePerKm (₦/km), weightFreeThreshold (weight-score points before surcharge starts), weightSurchargeRate (₦ charged per weightSurchargeUnit points beyond threshold), weightSurchargeUnit (how many weight points weightSurchargeRate applies per — e.g. rate=100, unit=5 means ₦100 per every 5 points past the threshold, ceil-rounded; default 1 = old per-point behavior). All placeholder values — update once real catalog/weight data exists (Phase 2d admin panel, no code change needed).';

-- ============================================================
-- ADDENDUM — run this instead if deliveryFeeConfig already exists
-- in your live DB with real values (you've already run Phase 2d).
-- The insert above uses "on conflict do update set value = excluded.value"
-- which would BLOW AWAY any real numbers you've already saved. This
-- merges weightSurchargeUnit in without touching baseFee/transportRatePerKm/
-- weightFreeThreshold/weightSurchargeRate. Safe to re-run.
-- ============================================================
update public.settings
set value = value || '{"weightSurchargeUnit": 1}'::jsonb,
    updated_at = now()
where key = 'deliveryFeeConfig'
  and not (value ? 'weightSurchargeUnit');
