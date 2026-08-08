// ============================================================
// cart-checkout.js — split from the original script.js (see split-plan notes)
// Cart persistence, delivery fee calc, order mode toggle, cart logic, checkout (WhatsApp + vault RPC).
// ============================================================

// CART PERSISTENCE
// ============================================================
const CART_STORAGE_KEY = "lasu_bulkmart_cart_v2";

function saveCartToStorage() {
  try { localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart)); } catch (e) {}
}

function restoreCartFromStorage() {
  try {
    const saved = localStorage.getItem(CART_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) cart = parsed;
    }
  } catch (e) { cart = []; }
}

function clearCartStorage() {
  try { localStorage.removeItem(CART_STORAGE_KEY); } catch (e) {}
}

// ============================================================
// LOCAL CACHE — products & categories
// Avoids re-downloading the whole catalog on every single page
// visit, which is what was burning through the Firestore free
// quota (each visit = 1 read per product + 1 per category).
//
// TTL default: 10 minutes. After that, the next visit fetches
// fresh data from Firestore and re-caches it.
//
// DEV / TESTING NOTES:
//   • A normal hard refresh (Ctrl+Shift+R) does NOT clear this —
//     hard refresh only bypasses the browser's file cache
//     (script.js, css, images), not localStorage.
//   • To force-fetch fresh data while testing changes you just
//     made in the admin panel / Firestore console, either:
//       1) load the page with ?freshdata=1 in the URL, or
//       2) open DevTools console and run: clearProductCache()
// ============================================================
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const PRODUCTS_CACHE_KEY = "cbm_products_cache_v1";
const CATEGORIES_CACHE_KEY = "cbm_categories_cache_v1";

function _forceFreshData() {
  try {
    return new URLSearchParams(window.location.search).get("freshdata") === "1";
  } catch (e) {
    return false;
  }
}

function _readCache(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.data) || typeof parsed.savedAt !== "number") return null;
    if (Date.now() - parsed.savedAt > CACHE_TTL_MS) return null; // expired
    return parsed.data;
  } catch (e) {
    return null;
  }
}

function _writeCache(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify({ data, savedAt: Date.now() }));
  } catch (e) {
    // localStorage full or unavailable — fail silently, just means no caching this time
  }
}

/** Console helper — run clearProductCache() in DevTools to force a fresh Firestore fetch. */
function clearProductCache() {
  try {
    localStorage.removeItem(PRODUCTS_CACHE_KEY);
    localStorage.removeItem(CATEGORIES_CACHE_KEY);
    console.log("[Cache] Cleared. Reload the page to fetch fresh data from Firestore.");
  } catch (e) {
    console.warn("[Cache] Could not clear cache:", e.message);
  }
}
window.clearProductCache = clearProductCache;

// ============================================================
// LOAD PRODUCTS FROM SUPABASE (cached, with TTL)
// Supabase columns are snake_case; mapped back to the same
// camelCase shape the rest of this file already expects, so
// renderProducts/renderTopPicksCarousel/etc. needed zero changes.
// ============================================================
function _mapProductRow(row) {
  return {
    id: row.id,
    name: row.name,
    desc: row.description,
    image: row.image,
    category: row.category,
    price: row.price,
    costPrice: row.cost_price,
    marketName: row.market_name,
    isHidden: row.is_hidden,
    isTopPick: row.is_top_pick,
    isService: row.is_service,
    allowGroupOrder: row.allow_group_order,
    stock: row.stock,
    variants: row.variants || [],
    variantGroups: row.variant_groups || [],
    createdAt: row.created_at
  };
}

function loadProductsFromFirestore() {
  if (!_forceFreshData()) {
    const cached = _readCache(PRODUCTS_CACHE_KEY);
    if (cached) {
      PRODUCTS = cached;
      renderTopPicksCarousel();
      renderProducts();
      return;
    }
  }

  showProductSkeleton();
  sb.from("products").select("*")
    .then(({ data, error }) => {
      if (error) throw error;
      PRODUCTS = (data || []).map(_mapProductRow);
      _writeCache(PRODUCTS_CACHE_KEY, PRODUCTS);
      hideProductSkeleton();
      renderTopPicksCarousel();
      renderProducts();
    })
    .catch(err => {
      console.error("Supabase load error:", err);
      hideProductSkeleton();
      const grid = document.getElementById("productGrid");
      if (grid) {
        grid.innerHTML = `<div class="col-span-full text-center py-16 text-gray-400">
          <div class="mb-3 flex justify-center"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="1" y1="1" x2="23" y2="23"/><path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"/><path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"/><path d="M10.71 5.05A16 16 0 0 1 22.58 9"/><path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></svg></div>
          <p class="font-semibold">Couldn't load products</p>
          <p class="text-sm mt-1">Check your connection and refresh the page</p>
          <button onclick="location.reload()" class="mt-4 px-5 py-2 rounded-xl text-white text-sm font-bold" style="background:#000080;">Retry</button>
        </div>`;
      }
    });
}

// ============================================================
// CUSTOM CATEGORIES (admin-created, from Supabase "categories" table)
// The 3 built-in tabs (Groceries, Stationeries, Hostel Services) stay
// hardcoded in the HTML. Anything the admin adds gets appended after them.
// Cached the same way as products (see cache block above).
// ============================================================
function loadCustomCategories() {
  if (!_forceFreshData()) {
    const cached = _readCache(CATEGORIES_CACHE_KEY);
    if (cached) {
      CUSTOM_CATEGORIES = cached;
      renderCustomCategoryTabs();
      return;
    }
  }

  sb.from("categories").select("*").order("sort_order", { ascending: true })
    .then(({ data, error }) => {
      if (error) throw error;
      CUSTOM_CATEGORIES = (data || []).map(row => ({
        id: row.id,
        name: row.name,
        slug: row.slug,
        emoji: row.emoji,
        createdAt: row.created_at
      }));
      _writeCache(CATEGORIES_CACHE_KEY, CUSTOM_CATEGORIES);
      renderCustomCategoryTabs();
    })
    .catch(err => {
      console.warn("[Categories] Could not load custom categories:", err.message);
    });
}

function renderCustomCategoryTabs() {
  const row = document.getElementById("categoryRow");
  if (!row) return;

  // Remove any previously-injected custom tabs before re-rendering
  row.querySelectorAll(".category-btn-custom").forEach(el => el.remove());

  // The 3 "built-in" tabs (Top Picks, Groceries, Stationeries, Hostel
  // Services) are hardcoded directly in the HTML — but they ALSO exist
  // as real rows in the categories table (same in the old Firestore
  // data). Without this filter, they'd render twice: once from the
  // HTML, once from this dynamic list.
  const BUILT_IN_SLUGS = new Set(["top-picks", "groceries", "stationeries", "hostel-services"]);

  CUSTOM_CATEGORIES
    .filter(cat => !BUILT_IN_SLUGS.has(cat.slug))
    .forEach(cat => {
      const btn = document.createElement("button");
      btn.className = "category-btn category-btn-custom flex-shrink-0 px-3 sm:px-5 py-2 rounded-full text-xs sm:text-sm font-semibold border-2 transition whitespace-nowrap";
      btn.dataset.cat = cat.slug;
      btn.setAttribute("onclick", `setCategory('${cat.slug}')`);
      btn.textContent = `${cat.emoji || "🏷️"} ${cat.name}`;
      row.appendChild(btn);
    });
}

function showProductSkeleton() {
  const grid = document.getElementById("productGrid");
  const topPicksSection = document.getElementById("topPicksSection");
  if (topPicksSection) {
    topPicksSection.innerHTML = `<div class="flex gap-3 overflow-x-auto pb-2">
      ${[1,2,3,4].map(() => `<div class="flex-shrink-0 w-40 h-52 bg-gray-200 rounded-2xl animate-pulse"></div>`).join("")}
    </div>`;
  }
  if (grid) {
    grid.innerHTML = Array(8).fill(0).map(() => `
      <div class="bg-white rounded-2xl overflow-hidden border border-gray-100 shadow-sm animate-pulse">
        <div class="bg-gray-200 h-44"></div>
        <div class="p-3 space-y-2">
          <div class="bg-gray-200 h-3 rounded w-1/3"></div>
          <div class="bg-gray-200 h-4 rounded w-full"></div>
          <div class="bg-gray-200 h-3 rounded w-2/3"></div>
          <div class="bg-gray-200 h-8 rounded-lg w-full mt-2"></div>
        </div>
      </div>
    `).join("");
  }
}

function hideProductSkeleton() {
  const grid = document.getElementById("productGrid");
  if (grid) grid.innerHTML = "";
}

// ============================================================
// DELIVERY FEE CALCULATOR
// ============================================================
// Individual-order fee (Phase 3) now comes from the backend's
// /api/delivery-quote — real distance-from-origin × weight formula,
// resolved once the customer verifies their address below. Until
// that happens, calculateDeliveryFee() returns a "pending" state
// instead of a number, so the UI can prompt for verification rather
// than guessing off subtotal like the old flat-tier system did.
//
// Group-order pricing is untouched here — still the flat subtotal
// tier system, since Phase 4 (not yet built) is what extends it with
// its own distance/weight-aware logic.
// ============================================================
const GEOCODE_BACKEND_URL = "https://campus-bulkmart.onrender.com";

// Holds the last successfully resolved delivery quote for individual
// orders: { source, distanceFromOriginKm, lat, lng, resolvedAddress,
// landmark, fee: { total, baseFee, transportFee, weightSurcharge, breakdown } }
// Reset to null any time the typed address changes, so a stale fee
// can never silently ride along with a different address.
let _resolvedDelivery = null;
let _savedAddresses = [];

function getCartWeightPoints() {
  // Falls back to 3 (the DB's own backfill default — see
  // add-weight-score-column.sql) for any cart item missing a
  // weight_score, e.g. stale items cached in localStorage from
  // before Phase 2a shipped.
  return cart.reduce((sum, item) => sum + (Number(item.weight_score) || 3) * item.qty, 0);
}

function calculateDeliveryFee(cartSubtotal, mode) {
  if (mode === "group") {
    if (cartSubtotal < GROUP_MIN_THRESHOLD) {
      return { fee: null, warning: `Add ₦${(GROUP_MIN_THRESHOLD - cartSubtotal).toLocaleString()} more to unlock group processing` };
    }
    if (cartSubtotal >= 25000) return { fee: 0, label: "FREE (100% Group Discount!)", discount: 3000 };
    if (cartSubtotal >= 15000) return { fee: 1000, label: "₦1,000 (50% Group Discount)", discount: 1000 };
    // Below both thresholds but past GROUP_MIN_THRESHOLD — standard rate,
    // no discount yet. Reuses the individual rate table as the base;
    // Phase 4 replaces this whole branch with the real group tier system.
    return { fee: 1500, label: "₦1,500" };
  }

  // Individual mode
  if (cartSubtotal < MIN_ORDER) return { fee: null, warning: `Minimum order is ₦${MIN_ORDER.toLocaleString()}` };

  if (!_resolvedDelivery) {
    return { fee: null, pending: true, label: "Verify your delivery address to see the fee" };
  }

  const feeTotal = _resolvedDelivery.fee.total;
  return {
    fee: feeTotal,
    label: feeTotal === 0 ? "FREE" : `₦${feeTotal.toLocaleString()}`,
    breakdown: _resolvedDelivery.fee.breakdown,
    distanceFromOriginKm: _resolvedDelivery.distanceFromOriginKm,
  };
}

function _invalidateDeliveryQuote() {
  if (_resolvedDelivery) {
    _resolvedDelivery = null;
    const statusEl = document.getElementById("addressVerifyStatus");
    if (statusEl) statusEl.innerHTML = "";
    document.getElementById("saveAddressRow")?.classList.add("hidden");
  }
}

// ============================================================
// ADDRESS VERIFICATION — Phase 3
// address input -> POST /api/delivery-quote -> boundary check +
// distance + fee, OR a landmark-picker / WhatsApp fallback if the
// address can't be resolved automatically.
// ============================================================
async function verifyDeliveryAddress() {
  const addressEl = document.getElementById("checkoutAddress");
  const btn = document.getElementById("verifyAddressBtn");
  const statusEl = document.getElementById("addressVerifyStatus");
  const address = (addressEl?.value || "").trim();

  if (!address) { showToast("warning", "Enter your address first"); return; }
  if (cart.length === 0) { showToast("warning", "Your cart is empty"); return; }

  document.getElementById("landmarkFallbackWrapper")?.classList.add("hidden");
  document.getElementById("whatsappFallbackWrapper")?.classList.add("hidden");
  if (btn) { btn.disabled = true; btn.textContent = "Checking…"; }
  if (statusEl) statusEl.innerHTML = `<p class="text-xs text-gray-400">📍 Verifying address…</p>`;

  try {
    const res = await fetch(`${GEOCODE_BACKEND_URL}/api/delivery-quote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address, weightPoints: getCartWeightPoints() }),
    });
    const data = await res.json();
    _handleDeliveryQuoteResponse(data, address);
  } catch (e) {
    _renderDeliveryQuoteError("network_error", statusEl);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = "Verify Address"; }
  }
}

async function selectLandmarkFallback(landmarkId) {
  if (!landmarkId) return;
  const statusEl = document.getElementById("addressVerifyStatus");
  if (statusEl) statusEl.innerHTML = `<p class="text-xs text-gray-400">📍 Calculating fee…</p>`;

  try {
    const res = await fetch(`${GEOCODE_BACKEND_URL}/api/delivery-quote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ landmarkId, weightPoints: getCartWeightPoints() }),
    });
    const data = await res.json();
    _handleDeliveryQuoteResponse(data, null);
  } catch (e) {
    _renderDeliveryQuoteError("network_error", statusEl);
  }
}

async function selectSavedAddress(id) {
  const saved = _savedAddresses.find(a => a.id === id);
  if (!saved) return;
  const addressEl = document.getElementById("checkoutAddress");
  if (addressEl) addressEl.value = saved.address;
  const statusEl = document.getElementById("addressVerifyStatus");
  if (statusEl) statusEl.innerHTML = `<p class="text-xs text-gray-400">📍 Calculating fee…</p>`;

  try {
    const res = await fetch(`${GEOCODE_BACKEND_URL}/api/delivery-quote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lat: saved.lat, lng: saved.lng, weightPoints: getCartWeightPoints() }),
    });
    const data = await res.json();
    _handleDeliveryQuoteResponse(data, saved.address);
    document.getElementById("saveAddressRow")?.classList.add("hidden"); // already saved, no need to re-offer
  } catch (e) {
    _renderDeliveryQuoteError("network_error", statusEl);
  }
}

function _handleDeliveryQuoteResponse(data, typedAddress) {
  const statusEl = document.getElementById("addressVerifyStatus");

  if (data.success) {
    _resolvedDelivery = {
      source: data.source,
      distanceFromOriginKm: data.distanceFromOriginKm,
      lat: data.lat,
      lng: data.lng,
      resolvedAddress: data.resolvedAddress || typedAddress,
      landmark: data.landmark,
      fee: data.fee,
    };
    document.getElementById("landmarkFallbackWrapper")?.classList.add("hidden");
    document.getElementById("whatsappFallbackWrapper")?.classList.add("hidden");
    if (statusEl) {
      statusEl.innerHTML = `<p class="text-xs font-semibold text-green-600">✅ Address verified — ${data.distanceFromOriginKm} km from base</p>`;
    }
    document.getElementById("saveAddressRow")?.classList.remove("hidden");
    updateCartUI();
    return;
  }

  _renderDeliveryQuoteError(data.reason, statusEl, data.error);
}

function _renderDeliveryQuoteError(reason, statusEl, errorDetail) {
  _resolvedDelivery = null;

  if (reason === "not_found") {
    if (statusEl) statusEl.innerHTML = `<p class="text-xs font-semibold text-amber-600">Couldn't pinpoint that address — pick the nearest landmark below.</p>`;
    renderLandmarkPicker();
    document.getElementById("landmarkFallbackWrapper")?.classList.remove("hidden");
  } else if (reason === "outside_boundary") {
    if (statusEl) statusEl.innerHTML = `<p class="text-xs font-semibold text-red-500">That address is outside our current delivery area.</p>`;
    document.getElementById("whatsappFallbackWrapper")?.classList.remove("hidden");
  } else {
    // network_error or bad_request — genuine failure, not a "no result"
    if (statusEl) statusEl.innerHTML = `<p class="text-xs font-semibold text-red-500">Couldn't verify address right now — try again in a moment.</p>`;
  }
  document.getElementById("saveAddressRow")?.classList.add("hidden");
  updateCartUI();
}

// Landmark picker — populated from the public `landmarks` table
// (same one Phase 2d's admin CRUD manages), only fetched lazily the
// first time a not_found response actually needs it.
let _landmarksCache = null;
async function renderLandmarkPicker() {
  const wrapper = document.getElementById("landmarkFallbackWrapper");
  const select = document.getElementById("landmarkFallbackSelect");
  if (!wrapper || !select) return;

  if (!_landmarksCache) {
    try {
      const { data, error } = await sb.from("landmarks").select("id, name").order("name", { ascending: true });
      if (error) throw error;
      _landmarksCache = data || [];
    } catch (e) {
      select.innerHTML = `<option value="">Couldn't load landmarks</option>`;
      return;
    }
  }

  select.innerHTML = `<option value="">Select the nearest landmark…</option>` +
    _landmarksCache.map(lm => `<option value="${lm.id}">${lm.name}</option>`).join("");
}

function openWhatsAppDeliveryFallback() {
  const address = (document.getElementById("checkoutAddress")?.value || "").trim();
  const name = document.getElementById("checkoutName")?.value.trim() || "";
  const phone = document.getElementById("checkoutPhone")?.value.trim() || "";
  const cartSubtotal = cart.reduce((sum, item) => sum + item.price * item.qty, 0);

  let text = `*Campus Bulkmart — DELIVERY OUTSIDE STANDARD AREA*%0A`;
  text += `==============================%0A`;
  text += `*Customer:* ${name || "(not entered)"}%0A`;
  text += `*Phone:* ${phone || "(not entered)"}%0A`;
  text += `*Typed Address:* ${address || "(not entered)"}%0A`;
  text += `==============================%0A%0A*ORDER ITEMS:*%0A`;
  cart.forEach((item, i) => { text += `${i + 1}. ${item.name} (x${item.qty}) — ₦${(item.price * item.qty).toLocaleString()}%0A`; });
  text += `%0A*Subtotal:* ₦${cartSubtotal.toLocaleString()}%0A`;
  text += `_Delivery fee to be worked out manually since this address is outside our automatic delivery zone._`;

  window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${text}`, '_blank');
}

// ============================================================
// SAVED ADDRESSES — Phase 3
// ============================================================
async function loadSavedAddresses() {
  const wrapper = document.getElementById("savedAddressWrapper");
  const select = document.getElementById("savedAddressSelect");
  if (!wrapper || !select || !currentUser) return;

  try {
    const { data, error } = await sb.from("saved_addresses").select("*").eq("user_id", currentUser.uid).order("created_at", { ascending: false });
    if (error) throw error;
    _savedAddresses = data || [];
  } catch (e) {
    _savedAddresses = [];
  }

  if (_savedAddresses.length === 0) {
    wrapper.classList.add("hidden");
    return;
  }
  wrapper.classList.remove("hidden");
  select.innerHTML = `<option value="">Use a saved address…</option>` +
    _savedAddresses.map(a => `<option value="${a.id}">${a.label}${a.is_default ? " (default)" : ""}</option>`).join("");
}

async function saveCurrentAddress() {
  if (!_resolvedDelivery || !currentUser) return;
  const labelInput = document.getElementById("saveAddressLabel");
  const label = (labelInput?.value || "").trim() || "Saved address";
  const address = (document.getElementById("checkoutAddress")?.value || "").trim();

  try {
    const { error } = await sb.from("saved_addresses").insert({
      user_id: currentUser.uid,
      label,
      address,
      lat: _resolvedDelivery.lat,
      lng: _resolvedDelivery.lng,
      source: _resolvedDelivery.source === "landmark" ? "landmark" : "geocoded",
      landmark_id: _resolvedDelivery.landmark?.id || null,
    });
    if (error) throw error;
    showToast("success", "Address saved for next time");
    document.getElementById("saveAddressRow")?.classList.add("hidden");
    if (labelInput) labelInput.value = "";
    loadSavedAddresses();
  } catch (e) {
    showToast("error", "Couldn't save address: " + e.message);
  }
}

async function deleteSavedAddress(id) {
  if (!confirm("Remove this saved address?")) return;
  try {
    const { error } = await sb.from("saved_addresses").delete().eq("id", id);
    if (error) throw error;
    loadSavedAddresses();
  } catch (e) {
    showToast("error", "Couldn't remove address: " + e.message);
  }
}

// ============================================================
// ORDER MODE TOGGLE
// ============================================================
function setOrderMode(mode) {
  orderMode = mode;
  const indBtn = document.getElementById("modeIndividual");
  const grpBtn = document.getElementById("modeGroup");
  const groupInfo = document.getElementById("groupOrderInfo");

  if (indBtn && grpBtn) {
    if (mode === "group") {
      indBtn.classList.remove("active-mode");
      grpBtn.classList.add("active-mode");
      groupInfo?.classList.remove("hidden");
    } else {
      grpBtn.classList.remove("active-mode");
      indBtn.classList.add("active-mode");
      groupInfo?.classList.add("hidden");
    }
  }
  updateCartUI();
}

// ============================================================
// CART
// ============================================================
function addToCart(productId) { addToCartWithQty(productId); }

function addToCartWithQty(productId) {
  const p = PRODUCTS.find(x => x.id === productId);
  if (!p) return;

  // Block the add outright if we're in Group Order mode and this product
  // has group ordering disabled — previously this only showed a warning
  // toast but still let the product into the cart.
  if (orderMode === "group" && p.allowGroupOrder === false) {
    showToast("warning", `${p.name} isn't available for Group Orders`);
    return;
  }

  const qty = getProductQty(productId);
  const existing = cart.find(x => x.id === productId);
  if (existing) { existing.qty += qty; } else { cart.push({ ...p, qty }); }
  productQtyMap[productId] = 1;
  const gridQtyEl = document.getElementById(`qty-display-${productId}`);
  if (gridQtyEl) gridQtyEl.value = 1;
  updateCardPrice(productId);
  updateModalPrice(productId);
  _invalidateDeliveryQuote(); // cart weight changed — old fee no longer valid
  updateCartUI();
  saveCartToStorage();
  showToast("cart", `${p.name} added to cart`);
}

function removeFromCart(productId) {
  cart = cart.filter(x => x.id !== productId);
  _invalidateDeliveryQuote();
  updateCartUI();
  saveCartToStorage();
}

function updateQty(productId, delta) {
  const item = cart.find(x => x.id === productId);
  if (!item) return;
  item.qty = Math.max(1, item.qty + delta);
  _invalidateDeliveryQuote();
  updateCartUI();
  saveCartToStorage();
}

function setCartQty(productId, value) {
  const item = cart.find(x => x.id === productId);
  if (!item) return;
  const parsed = parseInt(value);
  item.qty = isNaN(parsed) || parsed < 1 ? 1 : parsed;
  _invalidateDeliveryQuote();
  updateCartUI();
  saveCartToStorage();
}

function clearCart() {
  if (cart.length === 0) return;
  cart = [];
  _invalidateDeliveryQuote();
  updateCartUI();
  clearCartStorage();
  showToast("trash", "Cart cleared");
}

function updateCartUI() {
  const cartSubtotal = cart.reduce((sum, item) => sum + item.price * item.qty, 0);
  const count = cart.reduce((sum, item) => sum + item.qty, 0);

  // Update counts
  const countEl = document.getElementById("cartCount");
  const itemCountEl = document.getElementById("cartItemCount");
  if (countEl) countEl.textContent = count;
  if (itemCountEl) itemCountEl.textContent = `${cart.length} item${cart.length !== 1 ? 's' : ''}`;

  const cartItemsEl = document.getElementById("cartItems");
  const emptyCartEl = document.getElementById("emptyCart");
  const cartFooter = document.getElementById("cartFooter");
  const signInPrompt = document.getElementById("signInToCheckout");
  const checkoutForm = document.getElementById("checkoutFormWrapper");

  if (cart.length === 0) {
    if (emptyCartEl) emptyCartEl.classList.remove("hidden");
    if (cartFooter) cartFooter.classList.add("hidden");
    if (cartItemsEl) { cartItemsEl.innerHTML = ''; cartItemsEl.appendChild(emptyCartEl); }
    return;
  }

  if (emptyCartEl) emptyCartEl.classList.add("hidden");
  if (cartFooter) cartFooter.classList.remove("hidden");

  if (currentUser) {
    signInPrompt?.classList.add("hidden");
    checkoutForm?.classList.remove("hidden");
  } else {
    signInPrompt?.classList.remove("hidden");
    checkoutForm?.classList.add("hidden");
  }

  // Render cart items
  if (cartItemsEl) {
    cartItemsEl.innerHTML = cart.map(item => `
      <div class="flex items-center gap-3 bg-gray-50 rounded-xl p-3">
        <img src="${item.image || ''}" alt="${item.name}" class="w-12 h-12 sm:w-14 sm:h-14 object-cover rounded-lg flex-shrink-0"
          onerror="this.src='https://placehold.co/100x100/e5e7eb/9ca3af?text=?'">
        <div class="flex-1 min-w-0">
          <p class="text-xs sm:text-sm font-semibold text-gray-800 line-clamp-2 leading-tight">${item.name}</p>
          ${orderMode === "group" && item.allowGroupOrder === false ? '<p class="text-[10px] font-bold text-red-500 mt-0.5">⚠️ Not available for Group Orders</p>' : ''}
          <p class="font-black text-xs sm:text-sm mt-0.5" style="color:#000080;">₦${(item.price * item.qty).toLocaleString()}</p>
          <div class="flex items-center gap-1.5 mt-1.5">
            <button onclick="updateQty('${item.id}', -1)"
              class="w-6 h-6 border border-gray-200 rounded-full text-gray-600 hover:bg-gray-100 flex items-center justify-center text-xs font-bold transition bg-white">−</button>
            <input type="number" min="1" value="${item.qty}"
              onchange="setCartQty('${item.id}', this.value)"
              class="w-9 text-center text-xs font-bold text-gray-800 border border-gray-200 rounded-lg py-0.5 focus:outline-none" />
            <button onclick="updateQty('${item.id}', 1)"
              class="w-6 h-6 border border-gray-200 rounded-full text-gray-600 hover:bg-gray-100 flex items-center justify-center text-xs font-bold transition bg-white">+</button>
          </div>
        </div>
        <button onclick="removeFromCart('${item.id}')"
          class="flex-shrink-0 w-7 h-7 bg-red-50 hover:bg-red-100 text-red-500 rounded-full flex items-center justify-center transition">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12"/>
          </svg>
        </button>
      </div>
    `).join("");
  }

  // ── Price breakdown with delivery logic ──────────────────
  updatePriceBreakdown(cartSubtotal);
}

function updatePriceBreakdown(cartSubtotal) {
  const breakdownEl = document.getElementById("cartPriceBreakdown");
  const checkoutBtn = document.getElementById("checkoutBtn");
  if (!breakdownEl) return;

  const result = calculateDeliveryFee(cartSubtotal, orderMode);

  // Group order progress bar
  let groupProgressHTML = "";
  if (orderMode === "group") {
    if (result.warning) {
      const needed = GROUP_MIN_THRESHOLD - cartSubtotal;
      const pct = Math.min((cartSubtotal / GROUP_MIN_THRESHOLD) * 100, 100);
      groupProgressHTML = `
        <div class="mb-3">
          <div class="flex justify-between text-xs mb-1">
            <span class="font-semibold text-amber-700">Group threshold progress</span>
            <span class="font-bold text-amber-700">${Math.round(pct)}%</span>
          </div>
          <div class="w-full bg-gray-200 rounded-full h-2.5 overflow-hidden">
            <div class="h-2.5 rounded-full transition-all duration-500" style="width:${pct}%;background:linear-gradient(90deg,#f59e0b,#000080);"></div>
          </div>
          <p class="text-xs text-amber-700 font-semibold mt-1.5 text-center">
            ➕ Add <strong>₦${needed.toLocaleString()}</strong> more to unlock group wholesale!
          </p>
        </div>`;
    } else {
      const nextTier = cartSubtotal < 25000 ? `₦${(25000 - cartSubtotal).toLocaleString()} away from FREE delivery!` : "🎉 FREE delivery unlocked!";
      groupProgressHTML = `
        <div class="mb-3 bg-green-50 border border-green-200 rounded-xl p-2.5">
          <p class="text-xs text-green-700 font-bold text-center">✅ Group wholesale unlocked!</p>
          <p class="text-xs text-green-600 text-center mt-0.5">${nextTier}</p>
        </div>`;
    }
  } else {
    // Individual mode — prompt to verify address until we have a real
    // quote; no more "next subtotal tier" hint since fee no longer
    // depends on subtotal at all (it's distance + weight now).
    if (!_resolvedDelivery) {
      groupProgressHTML = `
        <div class="mb-3 bg-blue-50 border border-blue-100 rounded-xl p-2.5 text-center">
          <p class="text-[11px] font-semibold" style="color:#000080;">📍 Verify your delivery address below to see your delivery fee</p>
        </div>`;
    }
  }

  let breakdownHTML = groupProgressHTML;

  if (result.warning) {
    // Show warning and disabled checkout
    breakdownHTML += `
      <div class="space-y-2 text-sm">
        <div class="flex justify-between">
          <span class="text-gray-500">Subtotal</span>
          <span class="font-semibold text-gray-800">₦${cartSubtotal.toLocaleString()}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-gray-500">Delivery</span>
          <span class="text-gray-400 italic text-xs">—</span>
        </div>
        <div class="border-t pt-2 flex justify-between font-black text-base">
          <span class="text-gray-800">Total</span>
          <span style="color:#000080;">₦${cartSubtotal.toLocaleString()}</span>
        </div>
      </div>`;
    if (checkoutBtn) {
      checkoutBtn.disabled = true;
      checkoutBtn.style.background = "#9ca3af";
      checkoutBtn.style.cursor = "not-allowed";
    }
  } else if (result.pending) {
    // Individual mode, above minimum, but address not yet verified —
    // show subtotal only, block checkout until verifyDeliveryAddress()
    // resolves a real fee.
    breakdownHTML += `
      <div class="space-y-2 text-sm">
        <div class="flex justify-between">
          <span class="text-gray-500">Subtotal</span>
          <span class="font-semibold text-gray-800">₦${cartSubtotal.toLocaleString()}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-gray-500">Delivery Fee</span>
          <span class="text-gray-400 italic text-xs">Verify address below</span>
        </div>
        <div class="border-t pt-2 flex justify-between font-black text-base">
          <span class="text-gray-800">Total</span>
          <span class="text-gray-400">—</span>
        </div>
      </div>`;
    if (checkoutBtn) {
      checkoutBtn.disabled = true;
      checkoutBtn.style.background = "#9ca3af";
      checkoutBtn.style.cursor = "not-allowed";
    }
  } else {
    const deliveryFee = result.fee;
    const finalTotal = cartSubtotal + deliveryFee;
    const hasDiscount = result.discount > 0;
    const b = result.breakdown; // present for resolved individual-mode quotes

    breakdownHTML += `
      <div class="space-y-2 text-sm">
        <div class="flex justify-between">
          <span class="text-gray-500">Subtotal</span>
          <span class="font-semibold text-gray-800">₦${cartSubtotal.toLocaleString()}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-gray-500">Delivery Fee</span>
          <span class="font-semibold ${deliveryFee === 0 ? 'text-green-600' : 'text-gray-800'}">${result.label}</span>
        </div>
        ${b ? `<div class="text-[10px] text-gray-400 pl-2 -mt-1 space-y-0.5">
          <div>${result.distanceFromOriginKm} km from base${b.excessWeight > 0 ? ` · ${b.excessWeight} pt weight surcharge` : ''}</div>
        </div>` : ''}
        ${hasDiscount ? `<div class="flex justify-between text-green-600">
          <span class="font-semibold">Group Discount</span>
          <span class="font-bold">−₦${result.discount.toLocaleString()}</span>
        </div>` : ''}
        <div class="border-t pt-2 flex justify-between font-black text-base">
          <span class="text-gray-800">Final Total</span>
          <span style="color:#000080;">₦${finalTotal.toLocaleString()}</span>
        </div>
      </div>`;
    if (checkoutBtn) {
      checkoutBtn.disabled = false;
      checkoutBtn.style.background = "#000080";
      checkoutBtn.style.cursor = "pointer";
    }
  }

  breakdownEl.innerHTML = breakdownHTML;
}

function toggleCart() {
  const overlay = document.getElementById("cartOverlay");
  overlay.classList.toggle("hidden");
  if (currentUser && !overlay.classList.contains("hidden")) loadSavedAddresses();
}

// ============================================================
// CHECKOUT — Payment Method Modal
// ============================================================

// Stores pending order details while user picks a payment method
let _pendingOrderDetails = null;

function openPaymentModal() { document.getElementById("paymentModal").classList.remove("hidden"); document.getElementById("paymentModal").classList.add("flex"); }
function closePaymentModal() { document.getElementById("paymentModal").classList.add("hidden"); document.getElementById("paymentModal").classList.remove("flex"); document.getElementById("paymentModalError").classList.add("hidden"); document.getElementById("vaultInsufficientNotice")?.classList.add("hidden"); }

async function checkout() {
  if (!currentUser) { showToast("warning", "Please sign in to checkout"); return; }
  if (cart.length === 0) { showToast("warning", "Your cart is empty"); return; }

  const cartSubtotal = cart.reduce((sum, item) => sum + item.price * item.qty, 0);
  const result = calculateDeliveryFee(cartSubtotal, orderMode);

  if (result.warning) { showToast("warning", result.warning); return; }
  if (result.pending) { showToast("warning", "Please verify your delivery address first"); return; }

  const name    = document.getElementById("checkoutName")?.value.trim();
  const phone   = document.getElementById("checkoutPhone")?.value.trim();
  const address = document.getElementById("checkoutAddress")?.value.trim();
  const errEl   = document.getElementById("checkoutError");

  if (!name || !phone || !address) { errEl?.classList.remove("hidden"); return; }
  errEl?.classList.add("hidden");

  const deliveryFee = result.fee;
  const finalTotal  = cartSubtotal + deliveryFee;

  // Save pending order details for whichever payment path the user picks
  _pendingOrderDetails = { name, phone, address, cartSubtotal, deliveryFee, finalTotal, result };

  // Wallet/Vault is switched off admin-side — skip the payment method
  // picker entirely and go straight to the WhatsApp checkout flow.
  if (!walletEnabled) {
    checkoutWhatsApp();
    return;
  }

  // Check vault balance to hint the user
  try {
    const { data, error } = await sb.from("users").select("wallet_balance").eq("uid", currentUser.uid).maybeSingle();
    if (error) throw error;
    const balance = data ? (data.wallet_balance ?? 0) : 0;
    const insufficient = balance < finalTotal;
    document.getElementById("vaultInsufficientNotice")?.classList.toggle("hidden", !insufficient);
    const payVaultBtn = document.getElementById("payVaultBtn");
    if (payVaultBtn) { payVaultBtn.disabled = insufficient; payVaultBtn.style.opacity = insufficient ? "0.5" : "1"; payVaultBtn.style.cursor = insufficient ? "not-allowed" : "pointer"; }
  } catch (e) { /* if check fails, just show both options */ }

  openPaymentModal();
}

// ── Vault payment path ───────────────────────────────────────
async function checkoutVault() {
  if (!_pendingOrderDetails || !currentUser) return;
  const errEl = document.getElementById("paymentModalError");
  errEl?.classList.add("hidden");

  const { name, phone, address, cartSubtotal, deliveryFee, finalTotal, result } = _pendingOrderDetails;

  try {
    // Atomic equivalent of the old Firestore transaction: a single
    // Postgres function (see supabase/functions.sql — checkout_with_wallet)
    // does the balance check, deduction, and order insert together,
    // wrapped in Postgres's own implicit transaction with a row lock.
    const { data, error } = await sb.rpc("checkout_with_wallet", {
      p_uid: currentUser.uid,
      p_amount: finalTotal,
      p_customer_name: name,
      p_customer_email: currentUser.email || "",
      p_customer_phone: phone,
      p_delivery_address: address,
      p_items: cart.map(i => ({ id: i.id, name: i.name, price: i.price, qty: i.qty })),
      p_subtotal: cartSubtotal,
      p_delivery_fee: deliveryFee,
      p_total_discount: result.discount || 0,
      p_order_mode: orderMode
    });

    if (error) throw new Error(error.message);
    const outcome = Array.isArray(data) ? data[0] : data;
    if (!outcome || !outcome.success) {
      throw new Error(outcome?.message === "Insufficient vault balance" ? "Insufficient vault balance" : (outcome?.message || "Payment failed"));
    }

    closePaymentModal();
    clearCart();
    clearCartStorage();
    toggleCart();
    showToast("success", "Order placed! Payment deducted from vault.");
    _pendingOrderDetails = null;

  } catch (err) {
    const msg = err.message === "Insufficient vault balance"
      ? "Your vault balance is too low. Top up on your dashboard."
      : "Payment failed. Please try again.";
    if (errEl) { errEl.textContent = msg; errEl.classList.remove("hidden"); }
  }
}

// ── WhatsApp payment path ────────────────────────────────────
async function checkoutWhatsApp() {
  if (!_pendingOrderDetails || !currentUser) return;
  const { name, phone, address, cartSubtotal, deliveryFee, finalTotal, result } = _pendingOrderDetails;

  let orderText = `*Campus Bulkmart — NEW ORDER*%0A`;
  orderText += `==============================%0A`;
  orderText += `*Order Type:* ${orderMode === "group" ? "🤝 Group Order" : "👤 Individual Order"}%0A`;
  orderText += `*Customer:* ${name}%0A`;
  orderText += `*Phone:* ${phone}%0A`;
  orderText += `*Hostel/Room:* ${address}%0A`;
  orderText += `==============================%0A%0A`;
  orderText += `*ORDER ITEMS:*%0A`;
  cart.forEach((item, i) => { orderText += `${i + 1}. ${item.name} (x${item.qty}) — ₦${(item.price * item.qty).toLocaleString()}%0A`; });
  orderText += `%0A==============================%0A`;
  orderText += `*Subtotal:* ₦${cartSubtotal.toLocaleString()}%0A`;
  orderText += `*Delivery Fee:* ${deliveryFee === 0 ? 'FREE 🎉' : '₦' + deliveryFee.toLocaleString()}%0A`;
  if (result.discount) orderText += `*Group Discount:* −₦${result.discount.toLocaleString()}%0A`;
  orderText += `*FINAL TOTAL:* *₦${finalTotal.toLocaleString()}*%0A`;
  orderText += `==============================`;

  try {
    const { error } = await sb.from("orders").insert({
      user_id: currentUser.uid,
      customer_name: name,
      customer_email: currentUser.email || "",
      customer_phone: phone,
      delivery_address: address,
      items: cart.map(i => ({ id: i.id, name: i.name, price: i.price, qty: i.qty })),
      subtotal: cartSubtotal,
      delivery_fee: deliveryFee,
      total_discount: result.discount || 0,
      final_total: finalTotal,
      order_mode: orderMode,
      payment_method: "whatsapp",
      status: "pending"
      // created_at: Postgres column default (now()) handles this
    });
    if (error) throw error;
  } catch (e) { console.warn("Supabase order save failed:", e.message); }

  closePaymentModal();
  window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${orderText}`, '_blank');
  clearCart();
  clearCartStorage();
  toggleCart();
  showToast("success", "Order sent via WhatsApp!");
  _pendingOrderDetails = null;
}

// ============================================================
// LOCATIONIQ ATTRIBUTION — checkout address field (Phase 2b)
// Required by LocationIQ's free-tier terms wherever geocoded address
// data is used — the address typed here is what Phase 2c/3 will
// actually send to LocationIQ. Injected via JS right under the input
// so it doesn't require editing the raw page HTML for #checkoutAddress.
// ============================================================
document.addEventListener("DOMContentLoaded", () => {
  const addressInput = document.getElementById("checkoutAddress");
  const addressRow = document.getElementById("checkoutAddressRow");
  if (!addressInput || !addressRow) return;
  if (addressRow.parentElement?.querySelector(".js-locationiq-checkout-attribution")) return;

  const note = document.createElement("p");
  note.className = "js-locationiq-checkout-attribution";
  note.style.cssText = "font-size:11px;color:#9ca3af;margin-top:4px;";
  note.innerHTML = '📍 Location search by <a href="https://locationiq.com" target="_blank" rel="noopener" style="color:#9ca3af;text-decoration:underline;">LocationIQ.com</a>';
  // Insert after the WHOLE address row (input + Verify button), not
  // after the input alone — the input lives inside a flex row with
  // the Verify button, and "afterend" on the input would insert the
  // note as a sibling INSIDE that same flex row, squeezing all three
  // elements onto one line instead of the note sitting on its own
  // line below. This was the actual bug behind the collapsed layout.
  addressRow.insertAdjacentElement("afterend", note);

  // Any manual edit to the typed address invalidates whatever fee was
  // last resolved — a stale fee tied to the previous text must never
  // silently carry over to a new (unverified) address.
  addressInput.addEventListener("input", () => _invalidateDeliveryQuote());
});

// ============================================================
// SAVED ADDRESSES — load once auth resolves, and again any time the
// cart drawer opens (covers the case where the user signed in with
// the drawer already open).
// ============================================================
document.addEventListener("DOMContentLoaded", () => {
  auth.onAuthStateChanged(user => { if (user) loadSavedAddresses(); });
});

// ============================================================
