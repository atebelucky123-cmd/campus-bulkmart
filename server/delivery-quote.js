// ============================================================
// server/delivery-quote.js — Phase 3
// POST /api/delivery-quote
//
// Single endpoint the checkout page calls to go from "address the
// customer typed (or landmark they picked)" all the way to "final
// delivery fee, itemized." Combines:
//   - delivery-geo.js  (Phase 2b/2c: geocode, boundary check, distance)
//   - delivery-fee.js  (Phase 3: the fee formula)
//
// Rate-limited the same way geocode.js is (this endpoint calls
// geocodeAddress() under the hood via resolveDeliveryLocation(),
// so it shares the same LocationIQ-quota concern).
//
// Request body:
//   { address: string }                       -- free-text address path
//   OR
//   { landmarkId: number }                     -- manual landmark-picker fallback path
//   OR
//   { lat: number, lng: number }               -- replaying a saved address (Phase 3's
//                                                  "Save this address" feature) — skips
//                                                  geocoding/boundary re-check entirely
//                                                  since that already happened once when
//                                                  the address was first saved
//   + weightPoints: number (required either way — cumulative
//     weight_score × qty across the customer's cart, computed
//     client-side from PRODUCTS data already in the page)
//
// Response shapes:
//   { success: true, distanceFromOriginKm, source, fee: {...}, resolvedAddress? , landmark? }
//   { success: false, reason: "not_found" }        -> frontend shows landmark picker
//   { success: false, reason: "outside_boundary" }  -> frontend shows WhatsApp fallback
//   { success: false, reason: "network_error", error }
//   { success: false, reason: "bad_request", error }
// ============================================================

const express = require("express");
const rateLimit = require("express-rate-limit");
const {
  resolveDeliveryLocation,
  resolveLandmarkById,
  getDeliveryOrigin,
  haversineDistanceKm,
} = require("./delivery-geo");
const { calculateIndividualDeliveryFee } = require("./delivery-fee");

const router = express.Router();

// Same window/budget as geocode.js — this endpoint calls the same
// LocationIQ path when given a free-text address.
const quoteLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, reason: "network_error", error: "Too many requests. Please try again shortly." },
});

router.post("/delivery-quote", quoteLimiter, async (req, res) => {
  try {
    const { address, landmarkId, lat, lng, weightPoints } = req.body || {};

    const weight = Number(weightPoints);
    if (isNaN(weight) || weight < 0) {
      return res.status(400).json({ success: false, reason: "bad_request", error: "weightPoints is required and must be a non-negative number." });
    }

    const hasAddress = typeof address === "string" && address.trim();
    const hasLandmark = landmarkId !== undefined && landmarkId !== null && landmarkId !== "";
    const hasLatLng = typeof lat === "number" && typeof lng === "number" && !isNaN(lat) && !isNaN(lng);
    if (!hasAddress && !hasLandmark && !hasLatLng) {
      return res.status(400).json({ success: false, reason: "bad_request", error: "Provide address, landmarkId, or lat/lng." });
    }

    let location;
    if (hasLatLng) {
      // Saved-address replay path — trusted coordinates from a previously
      // resolved+saved address, so just recompute distance/fee live
      // (fee config or origin may have changed since it was saved) without
      // re-hitting LocationIQ or re-running the boundary check.
      const origin = await getDeliveryOrigin();
      const distanceFromOriginKm = haversineDistanceKm(origin.lat, origin.lng, lat, lng);
      location = { success: true, source: "saved", lat, lng, distanceFromOriginKm };
    } else if (hasLandmark) {
      // Manual landmark-picker path — caller already decided which
      // landmark to use (e.g. after a not_found response on their typed
      // address), so this never fails with not_found/outside_boundary;
      // a picked landmark is by definition inside the service area.
      location = await resolveLandmarkById(landmarkId);
    } else {
      location = await resolveDeliveryLocation(address.trim());
      if (!location.success) {
        // Pass through as-is: not_found / outside_boundary / network_error
        // — same three-way distinction delivery-geo.js already guarantees.
        return res.status(200).json(location);
      }
    }

    const fee = await calculateIndividualDeliveryFee(location.distanceFromOriginKm, weight);

    return res.status(200).json({
      success: true,
      source: location.source,
      distanceFromOriginKm: Number(location.distanceFromOriginKm.toFixed(2)),
      resolvedAddress: location.displayName || null,
      landmark: location.landmark || null,
      lat: location.lat ?? location.landmark?.lat ?? null,
      lng: location.lng ?? location.landmark?.lng ?? null,
      fee,
    });
  } catch (err) {
    console.error("[DeliveryQuote] unexpected error:", err);
    return res.status(500).json({ success: false, reason: "network_error", error: "Something went wrong calculating your delivery fee." });
  }
});

module.exports = router;
