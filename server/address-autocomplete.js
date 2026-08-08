// ============================================================
// server/address-autocomplete.js — Phase 4b
// GET /api/address-autocomplete?q=...
//
// Wraps LocationIQ's Autocomplete API — a genuinely SEPARATE endpoint
// from the /search geocoding used by geocode.js (Phase 2b/2d) and
// delivery-quote.js's resolveDeliveryLocation(). Per LocationIQ's own
// docs: "The Autocomplete API endpoint is not designed to be
// compatible with Search/Forward Geocoding endpoint" — so this is
// its own function, not a variant of geocodeAddress().
//
// Returns a real list of matching suggestions (each already carrying
// its own lat/lon) for a typeahead dropdown — replaces the old
// single-shot "type + click Verify, get one best guess or nothing"
// flow with live suggestions as the customer types.
//
// Docs: https://docs.locationiq.com/docs/autocomplete
// ============================================================

const express = require("express");
const rateLimit = require("express-rate-limit");

const router = express.Router();

const LOCATIONIQ_API_KEY = process.env.LOCATIONIQ_API_KEY;
const AUTOCOMPLETE_URL = "https://api.locationiq.com/v1/autocomplete";
const REQUEST_TIMEOUT_MS = 6000; // suggestions should feel instant; fail fast rather than let the UI hang

// Tighter window than geocode.js/delivery-quote.js — a single typing
// session can fire several debounced requests (one per pause in
// typing), not just one submit, so this needs more headroom while
// still protecting the LocationIQ free-tier daily quota.
const autocompleteLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, suggestions: [], error: "Too many requests. Please slow down." },
});

router.get("/address-autocomplete", autocompleteLimiter, async (req, res) => {
  const q = (req.query.q || "").toString().trim();

  // Don't even call LocationIQ for very short queries — wastes quota
  // on results that are almost never useful, and matches normal
  // typeahead UX (most autocomplete widgets wait for 3+ characters).
  if (q.length < 3) {
    return res.status(200).json({ success: true, suggestions: [] });
  }

  if (!LOCATIONIQ_API_KEY) {
    console.warn("[Autocomplete] Missing LOCATIONIQ_API_KEY env var.");
    return res.status(200).json({ success: false, suggestions: [], error: "Address search is temporarily unavailable." });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const url = `${AUTOCOMPLETE_URL}?key=${encodeURIComponent(LOCATIONIQ_API_KEY)}&q=${encodeURIComponent(q)}&limit=6&countrycodes=ng`;
    const response = await fetch(url, { signal: controller.signal });

    if (response.status === 404) {
      // LocationIQ's genuine "nothing matched" response — a real,
      // complete answer, same distinction geocode.js makes for /search.
      return res.status(200).json({ success: true, suggestions: [] });
    }
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      console.error(`[Autocomplete] LocationIQ returned ${response.status}: ${body}`);
      return res.status(200).json({ success: false, suggestions: [], error: "Address search is temporarily unavailable." });
    }

    const data = await response.json().catch(() => []);
    const suggestions = (Array.isArray(data) ? data : []).map(item => ({
      lat: parseFloat(item.lat),
      lon: parseFloat(item.lon),
      displayPlace: item.display_place || item.display_name,
      displayAddress: item.display_address || "",
      displayName: item.display_name || "",
    })).filter(s => !isNaN(s.lat) && !isNaN(s.lon));

    return res.status(200).json({ success: true, suggestions });
  } catch (err) {
    console.error("[Autocomplete] request failed:", err.message);
    // Network/timeout failure — genuinely different from "found nothing."
    // Frontend should show a quiet retry state, not jump straight to
    // the landmark fallback the way a real not_found would.
    return res.status(200).json({ success: false, suggestions: [], error: "Could not search right now — try again in a moment." });
  } finally {
    clearTimeout(timeout);
  }
});

module.exports = router;
