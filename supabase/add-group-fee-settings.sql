-- ============================================================
-- Campus Bulkmart — Phase 4a Migration
-- Group Order Fee Settings — same admin-editable pattern as
-- deliveryFeeConfig (Phase 2d/3), read live by delivery-fee.js's
-- computeGroupFee(), never hardcoded.
--
-- Design note: tiers apply a MODIFIER to the real individual
-- formula (base + transport + weight surcharge) — they are NOT
-- flat placeholder fees. This matches the original decision:
-- "<₦15k standard / ₦15k–20k discounted / ₦20k–40k free /
--  ₦40k+ full price + extra base fee". "Standard" and "full price"
-- both mean the real formula, unmodified or with a flat addition —
-- never a made-up flat number replacing it.
--
-- Run in Supabase Dashboard → SQL Editor, after Phase 3 migrations.
-- ============================================================

insert into public.settings (key, value)
values (
  'groupFeeConfig',
  '{
    "tier1Max": 15000,
    "discountTierMax": 20000,
    "discountPercent": 50,
    "freeTierMax": 40000,
    "aboveCapFee": 1000,
    "weightFreeThreshold": 10,
    "weightSurchargeRate": 100,
    "weightSurchargeUnit": 1
  }'::jsonb
)
on conflict (key) do update set value = excluded.value, updated_at = now();

comment on column public.settings.value is
  'For key=groupFeeConfig: tier1Max (pool total below this = standard fee, the real individual formula unmodified), discountTierMax (tier1Max to this = discountPercent off the real formula), discountPercent (% discount applied in that band), freeTierMax (discountTierMax to this = fully free, fee=0), aboveCapFee (flat ₦ added on top of the real formula once pool exceeds freeTierMax), weightFreeThreshold/weightSurchargeRate/weightSurchargeUnit (GROUP-specific weight threshold — deliberately separate from deliveryFeeConfigs individual threshold, since a pooled cart naturally carries more weight and needs its own free allowance). Base fee + transport fee always come from deliveryFeeConfig (same underlying delivery route cost regardless of order type) — only the weight surcharge and the tier modifier are group-specific. All placeholder values — update once real catalog/group-order data exists (Phase 4a admin panel, no code change needed). Intentionally separate from deliveryFeeConfig so tuning one never accidentally affects the other.';
