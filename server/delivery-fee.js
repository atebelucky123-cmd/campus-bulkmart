// ============================================================
// server/delivery-fee.js — Phase 3
// Individual-order delivery fee formula:
//   fee = baseFee
//       + (transportRatePerKm × distanceFromOriginKm)
//       + (weightSurchargeRate × ceil(max(0, weightPoints − weightFreeThreshold) / weightSurchargeUnit))
//
// All five inputs are read live from settings.deliveryFeeConfig
// (Phase 2d's admin-editable tab) — nothing here is hardcoded, so
// Lucky can retune pricing from the admin panel with zero redeploy.
//
// weightSurchargeUnit: how many weight points the surcharge rate
// applies per (e.g. rate=100, unit=5 → ₦100 charged per every 5
// points past the threshold, rounded up). Defaults to 1 for configs
// saved before this field existed, so old behavior (₦ per point) is
// unchanged unless Lucky explicitly sets a different unit.
//
// Group-order tiers/weight-threshold logic is Phase 4 — this file
// only handles the individual-order path.
// ============================================================

const { supabase } = require("./supabaseClient");

const DEFAULT_CONFIG = {
  baseFee: 200,
  transportRatePerKm: 300,
  weightFreeThreshold: 5,
  weightSurchargeRate: 100,
  weightSurchargeUnit: 1,
};

async function getDeliveryFeeConfig() {
  const { data, error } = await supabase
    .from("settings")
    .select("value")
    .eq("key", "deliveryFeeConfig")
    .single();
  if (error || !data) {
    // Fall back to defaults rather than hard-failing checkout if the
    // settings row is somehow missing — same spirit as admin-delivery-
    // settings.js's client-side defaults merge.
    console.warn("[DeliveryFee] Could not load deliveryFeeConfig, using defaults:", error?.message);
    return { ...DEFAULT_CONFIG };
  }
  return { ...DEFAULT_CONFIG, ...(data.value || {}) };
}

/**
 * Core formula. Pure function — takes numbers, returns numbers, no I/O —
 * so it's trivially unit-testable and reusable from Phase 4's group logic
 * later if the per-item weight surcharge piece is ever shared.
 *
 * @param {number} distanceFromOriginKm
 * @param {number} weightPoints - cumulative weight_score × qty across the cart
 * @param {object} config - a deliveryFeeConfig object (already defaulted/merged)
 */
function computeFee(distanceFromOriginKm, weightPoints, config) {
  const baseFee = config.baseFee;
  const transportFee = config.transportRatePerKm * distanceFromOriginKm;

  const excessWeight = Math.max(0, weightPoints - config.weightFreeThreshold);
  const unit = config.weightSurchargeUnit > 0 ? config.weightSurchargeUnit : 1; // never divide by zero
  const chargeableUnits = Math.ceil(excessWeight / unit);
  const weightSurcharge = chargeableUnits * config.weightSurchargeRate;

  const total = baseFee + transportFee + weightSurcharge;

  return {
    baseFee,
    transportFee: Math.round(transportFee),
    weightSurcharge,
    total: Math.round(total),
    breakdown: {
      distanceFromOriginKm: Number(distanceFromOriginKm.toFixed(2)),
      weightPoints,
      weightFreeThreshold: config.weightFreeThreshold,
      excessWeight,
      weightSurchargeUnit: unit,
      weightSurchargeRate: config.weightSurchargeRate,
    },
  };
}

/**
 * Convenience wrapper: loads live config, then computes.
 * This is what delivery-quote.js's route actually calls.
 */
async function calculateIndividualDeliveryFee(distanceFromOriginKm, weightPoints) {
  const config = await getDeliveryFeeConfig();
  return computeFee(distanceFromOriginKm, weightPoints, config);
}

module.exports = {
  getDeliveryFeeConfig,
  computeFee,
  calculateIndividualDeliveryFee,
};

// ============================================================
// PHASE 4A — GROUP ORDER FEE
// Tiers apply a MODIFIER to the real individual formula (base +
// transport), never a flat placeholder fee replacing it — this
// matches the original design decision exactly (see
// add-group-fee-settings.sql's own header comment):
//   poolTotal <  tier1Max         -> standard fee (real formula, unmodified)
//   tier1Max <= poolTotal < discountTierMax -> discountPercent OFF the real formula
//   discountTierMax <= poolTotal < freeTierMax -> fully free (₦0)
//   poolTotal >= freeTierMax      -> real formula + flat aboveCapFee
//
// The weight surcharge is GROUP-specific (its own threshold/rate/unit,
// separate from the individual deliveryFeeConfig — a pooled cart
// naturally carries more combined weight and needs its own free
// allowance) and is calculated SEPARATELY, then ADDED ON TOP of
// whichever tier applies — including the free tier. A group order
// can sit in the free-delivery price band and still pick up a
// weight surcharge if enough heavy items pile in.
// ============================================================

const GROUP_DEFAULT_CONFIG = {
  tier1Max: 15000,
  discountTierMax: 20000,
  discountPercent: 50,
  freeTierMax: 40000,
  aboveCapFee: 1000,
  weightFreeThreshold: 10,
  weightSurchargeRate: 100,
  weightSurchargeUnit: 1,
};

async function getGroupFeeConfig() {
  const { data, error } = await supabase
    .from("settings")
    .select("value")
    .eq("key", "groupFeeConfig")
    .single();
  if (error || !data) {
    console.warn("[DeliveryFee] Could not load groupFeeConfig, using defaults:", error?.message);
    return { ...GROUP_DEFAULT_CONFIG };
  }
  return { ...GROUP_DEFAULT_CONFIG, ...(data.value || {}) };
}

/**
 * Core group-order formula. Pure function, same style as computeFee().
 *
 * @param {number} poolTotal - combined subtotal of every participant's items
 * @param {number} standardFee - the real individual base+transport fee for
 *   this delivery (i.e. computeFee(...).baseFee + computeFee(...).transportFee)
 *   — computed by the caller via the individual formula, NOT duplicated here,
 *   so base/transport pricing has exactly one source of truth.
 * @param {number} groupWeightPoints - cumulative weight_score × qty across
 *   every participant's combined cart
 * @param {object} config - a groupFeeConfig object (already defaulted/merged)
 */
function computeGroupFee(poolTotal, standardFee, groupWeightPoints, config) {
  let tierFee;
  let tier;

  if (poolTotal < config.tier1Max) {
    tierFee = standardFee;
    tier = "standard";
  } else if (poolTotal < config.discountTierMax) {
    tierFee = standardFee * (1 - config.discountPercent / 100);
    tier = "discounted";
  } else if (poolTotal < config.freeTierMax) {
    tierFee = 0;
    tier = "free";
  } else {
    tierFee = standardFee + config.aboveCapFee;
    tier = "above_cap";
  }

  const excessWeight = Math.max(0, groupWeightPoints - config.weightFreeThreshold);
  const unit = config.weightSurchargeUnit > 0 ? config.weightSurchargeUnit : 1;
  const chargeableUnits = Math.ceil(excessWeight / unit);
  const weightSurcharge = chargeableUnits * config.weightSurchargeRate;

  const total = tierFee + weightSurcharge;

  return {
    tier,
    standardFee: Math.round(standardFee),
    tierFee: Math.round(tierFee),
    weightSurcharge,
    total: Math.round(total),
    breakdown: {
      poolTotal,
      tier1Max: config.tier1Max,
      discountTierMax: config.discountTierMax,
      freeTierMax: config.freeTierMax,
      discountPercent: config.discountPercent,
      groupWeightPoints,
      weightFreeThreshold: config.weightFreeThreshold,
      excessWeight,
      weightSurchargeUnit: unit,
      weightSurchargeRate: config.weightSurchargeRate,
    },
  };
}

/**
 * Convenience wrapper: loads both configs live, computes the individual
 * standard fee (base+transport only, no individual weight surcharge —
 * group orders use their own weight threshold instead), then applies
 * the group tier/surcharge logic on top.
 *
 * NOT yet wired into any route — Phase 4b calls this once the pool
 * formation + checkout wiring exists.
 *
 * @param {number} poolTotal
 * @param {number} distanceFromOriginKm
 * @param {number} groupWeightPoints
 */
async function calculateGroupDeliveryFee(poolTotal, distanceFromOriginKm, groupWeightPoints) {
  const [individualConfig, groupConfig] = await Promise.all([
    getDeliveryFeeConfig(),
    getGroupFeeConfig(),
  ]);

  const standardFee = individualConfig.baseFee + individualConfig.transportRatePerKm * distanceFromOriginKm;

  return computeGroupFee(poolTotal, standardFee, groupWeightPoints, groupConfig);
}

module.exports.getGroupFeeConfig = getGroupFeeConfig;
module.exports.computeGroupFee = computeGroupFee;
module.exports.calculateGroupDeliveryFee = calculateGroupDeliveryFee;
