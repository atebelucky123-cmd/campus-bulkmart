// ============================================================
// lib/delivery-geo.js — LocationIQ address geocoding (Phase 2b)
// + Ikeja geofence + landmark distance (Phase 2c)
//
// Phase 2b piece: address -> lat/long via LocationIQ's /search
// endpoint (geocodeAddress, below).
//
// Phase 2c piece: given a lat/long (from geocoding, or from a
// manually-picked landmark), determine (a) whether it falls inside
// the Ikeja service boundary, and (b) what its distance is to the
// delivery origin — always calculated live via Haversine from
// stored coordinates, never a fixed pre-measured number. This means
// editing the origin in Phase 2d's admin panel never leaves a
// landmark's distance stale.
//
// Origin, boundary polygon, and landmarks are read from Supabase
// (settings + landmarks table) rather than hardcoded here, so
// Phase 2d's admin CRUD takes effect immediately with no redeploy.
//
// Docs: https://locationiq.com/docs#search-forward-geocoding
// ============================================================

const { supabase } = require("./supabaseClient");

const LOCATIONIQ_API_KEY = process.env.LOCATIONIQ_API_KEY;
const LOCATIONIQ_BASE_URL = "https://us1.locationiq.com/v1/search.php";
const REQUEST_TIMEOUT_MS = 8000;
const RETRY_DELAY_MS = 400;

if (!LOCATIONIQ_API_KEY) {
  console.warn("[LocationIQ] Missing LOCATIONIQ_API_KEY env var — geocoding will fail.");
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Single geocode attempt against LocationIQ's /search endpoint.
 *
 * Throws on genuine request failure (network error, timeout, bad key,
 * rate limit, malformed response) — callers use the exception to know
 * "we couldn't even ask the question," as distinct from a successful
 * request that genuinely found nothing.
 *
 * Returns null (does NOT throw) for LocationIQ's own "no result"
 * response — that's a valid, complete answer, not a failure.
 *
 * @param {string} address
 */
async function _attemptGeocode(address) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response;
  try {
    const url = `${LOCATIONIQ_BASE_URL}?key=${encodeURIComponent(LOCATIONIQ_API_KEY)}&q=${encodeURIComponent(address)}&format=json&limit=1`;
    response = await fetch(url, { signal: controller.signal });
  } catch (err) {
    // Network failure, DNS error, or our own timeout abort — a genuine
    // failure to reach LocationIQ at all, not an answer of any kind.
    throw new Error(`LocationIQ request failed: ${err.message}`);
  } finally {
    clearTimeout(timeout);
  }

  // LocationIQ returns 404 with {"error":"Unable to geocode"} for a
  // genuine no-match. This IS a real, definitive response — not a failure.
  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    // Any other non-2xx (401 bad/revoked key, 429 rate limit, 5xx) means
    // the request itself failed — it never actually answered the
    // geocoding question, so it must NOT be treated as "no result."
    const body = await response.text().catch(() => "");
    throw new Error(`LocationIQ returned ${response.status}: ${body}`);
  }

  const data = await response.json().catch(() => {
    throw new Error("LocationIQ returned a non-JSON response");
  });

  if (!Array.isArray(data) || data.length === 0) {
    // Defensive: a 200 with an empty array is still "no result," not a failure.
    return null;
  }

  const best = data[0];
  const lat = parseFloat(best.lat);
  const lon = parseFloat(best.lon);
  if (isNaN(lat) || isNaN(lon)) {
    throw new Error("LocationIQ returned a result with invalid coordinates");
  }

  return { lat, lon, displayName: best.display_name || address, raw: best };
}

/**
 * Geocodes an address via LocationIQ.
 *
 * Makes up to 2 attempts — but ONLY retries genuine request failures
 * (network error, timeout, bad key, rate limit). A definitive "no
 * result found" from LocationIQ is returned immediately as-is on the
 * very first attempt; it is never retried and never confused with a
 * network failure, and vice versa.
 *
 * @param {string} address
 * @returns {Promise<
 *   | { success: true, lat: number, lon: number, displayName: string, raw: object }
 *   | { success: false, reason: "not_found" }
 *   | { success: false, reason: "network_error", error: string }
 * >}
 */
async function geocodeAddress(address) {
  if (!address || !address.trim()) {
    return { success: false, reason: "not_found" };
  }
  if (!LOCATIONIQ_API_KEY) {
    return { success: false, reason: "network_error", error: "Missing LOCATIONIQ_API_KEY" };
  }

  let lastError = null;

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const result = await _attemptGeocode(address.trim());
      if (result === null) {
        // Genuine no-match — a definitive answer. Do NOT retry.
        return { success: false, reason: "not_found" };
      }
      return { success: true, ...result };
    } catch (err) {
      // Genuine failure to reach/parse LocationIQ — worth retrying once.
      lastError = err;
      console.error(`[LocationIQ] geocode attempt ${attempt} failed:`, err.message);
      if (attempt === 1) {
        await sleep(RETRY_DELAY_MS);
      }
    }
  }

  // Both attempts failed at the request level — this is NOT "no result
  // found," it's "we couldn't even ask the question." Callers (Phase 2c's
  // landmark fallback) must only trigger on reason === "not_found",
  // never on "network_error".
  return { success: false, reason: "network_error", error: lastError?.message || "Unknown error" };
}

// ============================================================
// PHASE 2C — HAVERSINE DISTANCE
// Great-circle distance between two lat/lng points, in kilometers.
// Used for BOTH: distance from origin to a geocoded address, and
// distance from origin to any landmark — always calculated live,
// never stored as a fixed number.
// ============================================================
function haversineDistanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's radius in km
  const toRad = deg => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// ============================================================
// PHASE 2C — POINT-IN-POLYGON (ray casting algorithm)
// polygon: array of [lat, lng] pairs (matches how we store the
// Ikeja boundary in settings.ikejaBoundary.polygon — see
// add-delivery-origin-boundary.sql). Standard even-odd ray-casting
// check, accurate enough for a city-district-sized boundary; no
// need for anything more sophisticated (e.g. geodesic-aware) at
// this scale.
// ============================================================
function isPointInPolygon(lat, lng, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [latI, lngI] = polygon[i];
    const [latJ, lngJ] = polygon[j];
    const intersects =
      (latI > lat) !== (latJ > lat) &&
      lng < ((lngJ - lngI) * (lat - latI)) / (latJ - latI) + lngI;
    if (intersects) inside = !inside;
  }
  return inside;
}

// ============================================================
// PHASE 2C — READ ORIGIN / BOUNDARY / LANDMARKS FROM SUPABASE
// Kept as separate small fetches (not one giant "get everything"
// call) so each piece can be cached/reused independently later if
// needed, and so a failure in one doesn't silently break the others.
// ============================================================
async function getDeliveryOrigin() {
  const { data, error } = await supabase
    .from("settings")
    .select("value")
    .eq("key", "deliveryOrigin")
    .single();
  if (error || !data) {
    throw new Error("Could not load delivery origin from settings: " + (error?.message || "not found"));
  }
  return data.value; // { address, lat, lng }
}

async function getIkejaBoundaryPolygon() {
  const { data, error } = await supabase
    .from("settings")
    .select("value")
    .eq("key", "ikejaBoundary")
    .single();
  if (error || !data) {
    throw new Error("Could not load Ikeja boundary from settings: " + (error?.message || "not found"));
  }
  return data.value.polygon; // array of [lat, lng]
}

async function getAllLandmarks() {
  const { data, error } = await supabase
    .from("landmarks")
    .select("id, name, address, lat, lng")
    .order("name", { ascending: true });
  if (error) {
    throw new Error("Could not load landmarks: " + error.message);
  }
  return data || [];
}

// ============================================================
// PHASE 2C — NEAREST LANDMARK
// Given a lat/lng, finds the closest stored landmark and its live
// Haversine distance from the ORIGIN (not from the given point) —
// the fee formula (Phase 3) always charges based on origin-to-
// landmark distance, since that's the actual delivery route cost.
// ============================================================
async function findNearestLandmark(lat, lng) {
  const [landmarks, origin] = await Promise.all([getAllLandmarks(), getDeliveryOrigin()]);
  if (landmarks.length === 0) return null;

  let nearest = null;
  let nearestDist = Infinity;
  for (const lm of landmarks) {
    const distFromPoint = haversineDistanceKm(lat, lng, lm.lat, lm.lng);
    if (distFromPoint < nearestDist) {
      nearestDist = distFromPoint;
      nearest = lm;
    }
  }
  const distanceFromOriginKm = haversineDistanceKm(origin.lat, origin.lng, nearest.lat, nearest.lng);
  return { ...nearest, distanceFromOriginKm };
}

// ============================================================
// PHASE 2C — MAIN ENTRY POINT
// Combines geocoding (2b) + boundary check + distance calc (2c)
// into the single call the checkout flow (Phase 3) actually uses.
//
// Returns one of:
//   { success: true, source: "geocoded", lat, lng, distanceFromOriginKm }
//   { success: true, source: "landmark", landmark, distanceFromOriginKm }
//     (only reachable if the CALLER explicitly picks a landmark —
//      this function itself never silently substitutes one)
//   { success: false, reason: "outside_boundary" }
//   { success: false, reason: "not_found" }        -> caller shows landmark dropdown
//   { success: false, reason: "network_error", error }
// ============================================================
async function resolveDeliveryLocation(address) {
  const geoResult = await geocodeAddress(address);

  if (!geoResult.success) {
    // Pass through as-is — caller (Phase 3/Phase 2d's WhatsApp
    // fallback) is responsible for deciding what to do with
    // "not_found" vs "network_error". This function never conflates
    // the two.
    return geoResult;
  }

  const [boundary, origin] = await Promise.all([getIkejaBoundaryPolygon(), getDeliveryOrigin()]);

  const inside = isPointInPolygon(geoResult.lat, geoResult.lon, boundary);
  if (!inside) {
    return { success: false, reason: "outside_boundary" };
  }

  const distanceFromOriginKm = haversineDistanceKm(origin.lat, origin.lng, geoResult.lat, geoResult.lon);

  return {
    success: true,
    source: "geocoded",
    lat: geoResult.lat,
    lng: geoResult.lon,
    displayName: geoResult.displayName,
    distanceFromOriginKm,
  };
}

/**
 * Resolves a manually-picked landmark (checkout's fallback dropdown
 * path) into the same shape resolveDeliveryLocation() returns for a
 * geocoded address, so Phase 3's fee calculation can treat both
 * identically.
 */
async function resolveLandmarkById(landmarkId) {
  const { data, error } = await supabase
    .from("landmarks")
    .select("id, name, address, lat, lng")
    .eq("id", landmarkId)
    .single();
  if (error || !data) {
    throw new Error("Landmark not found: " + (error?.message || landmarkId));
  }
  const origin = await getDeliveryOrigin();
  const distanceFromOriginKm = haversineDistanceKm(origin.lat, origin.lng, data.lat, data.lng);
  return { success: true, source: "landmark", landmark: data, distanceFromOriginKm };
}

module.exports = {
  geocodeAddress,
  haversineDistanceKm,
  isPointInPolygon,
  getDeliveryOrigin,
  getIkejaBoundaryPolygon,
  getAllLandmarks,
  findNearestLandmark,
  resolveDeliveryLocation,
  resolveLandmarkById,
};
