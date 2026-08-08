// ============================================================
// admin-delivery-settings.js — Phase 2d
// Delivery Settings tab: origin editor, landmarks CRUD, delivery
// fee settings (base fee / transport rate / weight threshold /
// weight surcharge rate). Uses the existing getSettingValue()/
// mergeSettingValue() helpers from admin-core.js for the two
// settings-table entries (deliveryOrigin, deliveryFeeConfig), and
// direct sb.from("landmarks") calls for the CRUD list — same
// conventions as admin-categories.js.
// ============================================================

const GEOCODE_BACKEND_URL = "https://campus-bulkmart.onrender.com";

let allLandmarks = [];
let currentOrigin = null;

// ── Client-side Haversine (mirrors delivery-geo.js's server-side
// version) — used only to DISPLAY each landmark's live distance from
// origin in the admin list; the real fee calculation always happens
// server-side in Phase 3's delivery-fee.js, not here. ──
function _haversineDistanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
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
// LOAD — called once when the Delivery tab is first opened
// (lazy-loaded from admin-core.js's switchTab(), same pattern as
// content/waitlist tabs)
// ============================================================
async function loadDeliverySettingsTab() {
  // Origin must resolve BEFORE landmarks render, since each landmark's
  // displayed distance depends on currentOrigin being set — running
  // everything in Promise.all would risk landmarks rendering first and
  // showing "set origin first" even when origin data is a moment away.
  await loadOriginSection();
  await Promise.all([loadLandmarksSection(), loadFeeSettingsSection(), loadGroupFeeSettingsSection()]);
  deliverySettingsLoaded = true;
}

// ============================================================
// ORIGIN EDITOR
// ============================================================
async function loadOriginSection() {
  try {
    currentOrigin = await getSettingValue("deliveryOrigin");
    if (!currentOrigin) currentOrigin = { address: "", lat: null, lng: null };
    renderOriginForm();
  } catch (e) {
    showAdminToast("error", "Failed to load delivery origin: " + e.message);
  }
}

function renderOriginForm() {
  const addressEl = document.getElementById("originAddressInput");
  const latEl = document.getElementById("originLatInput");
  const lngEl = document.getElementById("originLngInput");
  if (addressEl) addressEl.value = currentOrigin.address || "";
  if (latEl) latEl.value = currentOrigin.lat ?? "";
  if (lngEl) lngEl.value = currentOrigin.lng ?? "";
}

// Re-geocodes whatever's currently typed in the address field via the
// backend (LocationIQ key is server-side only — the admin panel can't
// call LocationIQ directly), then fills in lat/lng for review before saving.
async function reGeocodeOrigin() {
  const addressEl = document.getElementById("originAddressInput");
  const btn = document.getElementById("reGeocodeOriginBtn");
  const address = (addressEl?.value || "").trim();
  if (!address) {
    showAdminToast("error", "Enter an address first.");
    return;
  }

  if (btn) { btn.disabled = true; btn.textContent = "Looking up…"; }
  try {
    const res = await fetch(`${GEOCODE_BACKEND_URL}/api/geocode-address`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address })
    });
    const data = await res.json();

    if (!data.success) {
      const msg = data.reason === "not_found"
        ? "Couldn't find that address — check spelling, or enter lat/lng manually."
        : "Lookup failed (network issue) — try again in a moment, or enter lat/lng manually.";
      showAdminToast("error", msg);
      return;
    }

    document.getElementById("originLatInput").value = data.lat;
    document.getElementById("originLngInput").value = data.lon;
    showAdminToast("success", "Coordinates found — review, then click Save Origin.");
  } catch (e) {
    showAdminToast("error", "Lookup failed: " + e.message);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = "🔍 Re-geocode from address"; }
  }
}

async function saveOrigin() {
  const address = (document.getElementById("originAddressInput")?.value || "").trim();
  const lat = parseFloat(document.getElementById("originLatInput")?.value);
  const lng = parseFloat(document.getElementById("originLngInput")?.value);

  if (!address || isNaN(lat) || isNaN(lng)) {
    showAdminToast("error", "Address, latitude, and longitude are all required.");
    return;
  }
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    showAdminToast("error", "Latitude/longitude values look invalid — double-check them.");
    return;
  }

  try {
    await mergeSettingValue("deliveryOrigin", { address, lat, lng });
    currentOrigin = { address, lat, lng };
    showAdminToast("success", "Delivery origin saved — landmark distances will use this immediately.");
    renderLandmarksList(); // distances shown are relative to origin, so refresh them
  } catch (e) {
    showAdminToast("error", "Failed to save origin: " + e.message);
  }
}

// ============================================================
// LANDMARKS CRUD
// ============================================================
async function loadLandmarksSection() {
  try {
    const { data, error } = await sb.from("landmarks").select("*").order("name", { ascending: true });
    if (error) throw error;
    allLandmarks = data || [];
    renderLandmarksList();
  } catch (e) {
    showAdminToast("error", "Failed to load landmarks: " + e.message);
  }
}

function renderLandmarksList() {
  const list = document.getElementById("landmarksList");
  if (!list) return;

  if (allLandmarks.length === 0) {
    list.innerHTML = `<p class="text-xs text-gray-400 py-2">No landmarks yet — add one below.</p>`;
    return;
  }

  const originKnown = currentOrigin && currentOrigin.lat != null && currentOrigin.lng != null;

  list.innerHTML = allLandmarks.map(lm => {
    const dist = originKnown
      ? _haversineDistanceKm(currentOrigin.lat, currentOrigin.lng, lm.lat, lm.lng).toFixed(2) + " km"
      : "— (set origin first)";
    return `
      <div class="flex items-center justify-between gap-2 py-2 border-b border-gray-50 last:border-0">
        <div class="min-w-0">
          <p class="text-sm font-semibold text-gray-800">${escapeHtml(lm.name)}</p>
          <p class="text-xs text-gray-400 truncate">${escapeHtml(lm.address || "")}</p>
          <p class="text-[11px] text-gray-500 mt-0.5">${lm.lat.toFixed(6)}, ${lm.lng.toFixed(6)} · <span class="font-semibold" style="color:#000080;">${dist}</span> from origin</p>
        </div>
        <button onclick="deleteLandmark(${lm.id})" class="flex-shrink-0 text-red-500 hover:text-red-700 text-xs font-semibold">Delete</button>
      </div>
    `;
  }).join("");
}

// Same "type an address, hit re-geocode" convenience as the origin
// editor — optional; admin can also just type lat/lng directly if
// they already have coordinates (e.g. from Google Maps, same as the
// seed data Lucky provided for Phase 2c).
async function reGeocodeNewLandmark() {
  const addressEl = document.getElementById("newLandmarkAddress");
  const btn = document.getElementById("reGeocodeLandmarkBtn");
  const address = (addressEl?.value || "").trim();
  if (!address) {
    showAdminToast("error", "Enter an address first.");
    return;
  }

  if (btn) { btn.disabled = true; btn.textContent = "Looking up…"; }
  try {
    const res = await fetch(`${GEOCODE_BACKEND_URL}/api/geocode-address`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address })
    });
    const data = await res.json();

    if (!data.success) {
      const msg = data.reason === "not_found"
        ? "Couldn't find that address — check spelling, or enter lat/lng manually."
        : "Lookup failed (network issue) — try again, or enter lat/lng manually.";
      showAdminToast("error", msg);
      return;
    }

    document.getElementById("newLandmarkLat").value = data.lat;
    document.getElementById("newLandmarkLng").value = data.lon;
    showAdminToast("success", "Coordinates found — review, then click Add Landmark.");
  } catch (e) {
    showAdminToast("error", "Lookup failed: " + e.message);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = "🔍 Re-geocode"; }
  }
}

async function addLandmark() {
  const nameEl = document.getElementById("newLandmarkName");
  const addressEl = document.getElementById("newLandmarkAddress");
  const latEl = document.getElementById("newLandmarkLat");
  const lngEl = document.getElementById("newLandmarkLng");

  const name = (nameEl?.value || "").trim();
  const address = (addressEl?.value || "").trim();
  const lat = parseFloat(latEl?.value);
  const lng = parseFloat(lngEl?.value);

  if (!name || isNaN(lat) || isNaN(lng)) {
    showAdminToast("error", "Name, latitude, and longitude are required (address is optional).");
    return;
  }
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    showAdminToast("error", "Latitude/longitude values look invalid — double-check them.");
    return;
  }

  try {
    const { error } = await sb.from("landmarks").insert({ name, address, lat, lng });
    if (error) throw error;
    nameEl.value = "";
    addressEl.value = "";
    latEl.value = "";
    lngEl.value = "";
    showAdminToast("success", `"${name}" landmark added`);
    await loadLandmarksSection();
  } catch (e) {
    showAdminToast("error", "Failed to add landmark: " + e.message);
  }
}

async function deleteLandmark(id) {
  const lm = allLandmarks.find(l => l.id === id);
  if (!lm) return;
  if (!confirm(`Delete "${lm.name}"? This cannot be undone.`)) return;

  try {
    const { error } = await sb.from("landmarks").delete().eq("id", id);
    if (error) throw error;
    showAdminToast("success", `"${lm.name}" deleted`);
    await loadLandmarksSection();
  } catch (e) {
    showAdminToast("error", "Failed to delete landmark: " + e.message);
  }
}

// ============================================================
// DELIVERY FEE SETTINGS (base fee / transport rate / weight
// threshold / weight surcharge rate) — read live by Phase 3's
// delivery-fee.js, never hardcoded there.
// ============================================================
async function loadFeeSettingsSection() {
  try {
    const config = await getSettingValue("deliveryFeeConfig");
    const defaults = { baseFee: 200, transportRatePerKm: 300, weightFreeThreshold: 5, weightSurchargeRate: 100 };
    const merged = { ...defaults, ...(config || {}) };

    document.getElementById("feeBaseFeeInput").value = merged.baseFee;
    document.getElementById("feeTransportRateInput").value = merged.transportRatePerKm;
    document.getElementById("feeWeightThresholdInput").value = merged.weightFreeThreshold;
    document.getElementById("feeWeightSurchargeInput").value = merged.weightSurchargeRate;
  } catch (e) {
    showAdminToast("error", "Failed to load delivery fee settings: " + e.message);
  }
}

async function saveFeeSettings() {
  const baseFee = parseFloat(document.getElementById("feeBaseFeeInput")?.value);
  const transportRatePerKm = parseFloat(document.getElementById("feeTransportRateInput")?.value);
  const weightFreeThreshold = parseFloat(document.getElementById("feeWeightThresholdInput")?.value);
  const weightSurchargeRate = parseFloat(document.getElementById("feeWeightSurchargeInput")?.value);

  if ([baseFee, transportRatePerKm, weightFreeThreshold, weightSurchargeRate].some(v => isNaN(v) || v < 0)) {
    showAdminToast("error", "All four values are required and must be zero or greater.");
    return;
  }

  try {
    await mergeSettingValue("deliveryFeeConfig", {
      baseFee, transportRatePerKm, weightFreeThreshold, weightSurchargeRate
    });
    showAdminToast("success", "Delivery fee settings saved — takes effect on the next checkout, no redeploy needed.");
  } catch (e) {
    showAdminToast("error", "Failed to save fee settings: " + e.message);
  }
}

// ============================================================
// GROUP ORDER FEE SETTINGS (Phase 4a) — tier1Max / discountTierMax /
// discountPercent / freeTierMax / aboveCapFee / group-specific weight
// threshold/rate/unit. Read live by delivery-fee.js's computeGroupFee(),
// never hardcoded. Base fee + transport rate are NOT duplicated here —
// they come from the individual Delivery Fee Settings card above, since
// group tiers modify that same real formula rather than replacing it.
// ============================================================
async function loadGroupFeeSettingsSection() {
  try {
    const config = await getSettingValue("groupFeeConfig");
    const defaults = {
      tier1Max: 15000, discountTierMax: 20000, discountPercent: 50,
      freeTierMax: 40000, aboveCapFee: 1000,
      weightFreeThreshold: 10, weightSurchargeRate: 100, weightSurchargeUnit: 1
    };
    const merged = { ...defaults, ...(config || {}) };

    document.getElementById("groupTier1MaxInput").value = merged.tier1Max;
    document.getElementById("groupDiscountTierMaxInput").value = merged.discountTierMax;
    document.getElementById("groupDiscountPercentInput").value = merged.discountPercent;
    document.getElementById("groupFreeTierMaxInput").value = merged.freeTierMax;
    document.getElementById("groupAboveCapFeeInput").value = merged.aboveCapFee;
    document.getElementById("groupWeightThresholdInput").value = merged.weightFreeThreshold;
    document.getElementById("groupWeightSurchargeInput").value = merged.weightSurchargeRate;
    document.getElementById("groupWeightSurchargeUnitInput").value = merged.weightSurchargeUnit;
  } catch (e) {
    showAdminToast("error", "Failed to load group order fee settings: " + e.message);
  }
}

async function saveGroupFeeSettings() {
  const tier1Max = parseFloat(document.getElementById("groupTier1MaxInput")?.value);
  const discountTierMax = parseFloat(document.getElementById("groupDiscountTierMaxInput")?.value);
  const discountPercent = parseFloat(document.getElementById("groupDiscountPercentInput")?.value);
  const freeTierMax = parseFloat(document.getElementById("groupFreeTierMaxInput")?.value);
  const aboveCapFee = parseFloat(document.getElementById("groupAboveCapFeeInput")?.value);
  const weightFreeThreshold = parseFloat(document.getElementById("groupWeightThresholdInput")?.value);
  const weightSurchargeRate = parseFloat(document.getElementById("groupWeightSurchargeInput")?.value);
  const weightSurchargeUnit = parseFloat(document.getElementById("groupWeightSurchargeUnitInput")?.value);

  const values = [tier1Max, discountTierMax, discountPercent, freeTierMax, aboveCapFee, weightFreeThreshold, weightSurchargeRate, weightSurchargeUnit];
  if (values.some(v => isNaN(v) || v < 0)) {
    showAdminToast("error", "All eight values are required and must be zero or greater.");
    return;
  }
  if (discountPercent > 100) {
    showAdminToast("error", "Discount % can't exceed 100.");
    return;
  }
  // Tier boundaries must actually ascend, or the tier lookup in
  // computeGroupFee() silently misbehaves (e.g. discount tier
  // unreachable if discountTierMax <= tier1Max).
  if (!(tier1Max < discountTierMax && discountTierMax < freeTierMax)) {
    showAdminToast("error", "Tier boundaries must ascend: Tier 1 Max < Discount Tier Max < Free Tier Max.");
    return;
  }

  try {
    await mergeSettingValue("groupFeeConfig", {
      tier1Max, discountTierMax, discountPercent, freeTierMax, aboveCapFee,
      weightFreeThreshold, weightSurchargeRate, weightSurchargeUnit
    });
    showAdminToast("success", "Group order fee settings saved — takes effect on the next checkout, no redeploy needed.");
  } catch (e) {
    showAdminToast("error", "Failed to save group order fee settings: " + e.message);
  }
}
