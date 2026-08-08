// ============================================================
// routes/geocode.js — POST /api/geocode-address (Phase 2d)
//
// Thin, rate-limited wrapper around delivery-geo.js's geocodeAddress().
// Exists as its own endpoint because the LocationIQ API key is a
// server-side secret — neither the admin panel's origin editor nor
// checkout (Phase 3) can call LocationIQ directly from the browser.
//
// Rate-limited (not admin-gated) since Phase 3's checkout flow will
// also call this for regular customers, not just the admin panel.
// ============================================================

const express = require("express");
const rateLimit = require("express-rate-limit");
const { geocodeAddress } = require("./delivery-geo");

const router = express.Router();

// Generous enough for normal checkout/admin use, tight enough to
// protect the LocationIQ free-tier daily quota from abuse.
const geocodeLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, reason: "network_error", error: "Too many requests. Please try again shortly." },
});

router.post("/geocode-address", geocodeLimiter, async (req, res) => {
  try {
    const { address } = req.body || {};
    if (!address || typeof address !== "string" || !address.trim()) {
      return res.status(400).json({ success: false, reason: "not_found", error: "Address is required." });
    }

    const result = await geocodeAddress(address);
    // geocodeAddress() already returns the exact { success, ... } shape
    // callers need (see delivery-geo.js) — pass it straight through.
    return res.status(200).json(result);
  } catch (err) {
    console.error("[Geocode] unexpected error:", err);
    return res.status(500).json({ success: false, reason: "network_error", error: "Something went wrong." });
  }
});

module.exports = router;
