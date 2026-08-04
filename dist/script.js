// ============================================================
// FIREBASE CONFIG
// ============================================================
const firebaseConfig = {
  apiKey: "AIzaSyDkbAls30xJVY4k7W8GV1nk397Qyu1ymLM",
  authDomain: "campusbulkmart.firebaseapp.com",
  projectId: "campusbulkmart",
  storageBucket: "campusbulkmart.firebasestorage.app",
  messagingSenderId: "397276211409",
  appId: "1:397276211409:web:c8881eae2f5c61b1d33df0",
  measurementId: "G-KJKTC6GCXB"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();

// ============================================================
// SUPABASE CONFIG
// Data storage lives here now (Phase 6 of the Firestore→Supabase
// migration). Firebase above is ONLY used for Auth from this point
// on — no more db.collection() calls anywhere in this file.
//
// The accessToken callback is what makes Supabase's Row Level
// Security policies work correctly: on every request, Supabase
// asks this function for the current Firebase ID token and
// verifies it directly (Firebase was registered as a Third-Party
// Auth provider in Supabase during Phase 2). This is how
// auth.jwt()->>'sub' in your RLS policies resolves to the
// Firebase uid.
// ============================================================
const SUPABASE_URL = "https://oiwgadfjrkuzjkvhugos.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9pd2dhZGZqcmt1emprdmh1Z29zIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM4ODU5MTUsImV4cCI6MjA5OTQ2MTkxNX0.QA0KFZLDbYZxT9wlPVRc2iz_-C7cnrAyFLGWdL9EcBM";

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  accessToken: async () => {
    try {
      const user = firebase.auth().currentUser;
      return user ? await user.getIdToken() : null;
    } catch (e) {
      return null;
    }
  }
});

// ============================================================
// STORE SETTINGS — e.g. Wallet on/off (toggled from Admin Panel)
// Read-only here; only the admin panel writes to this doc.
// Defaults to enabled (true) if the doc/field doesn't exist yet,
// so nothing breaks before the admin ever touches the toggle.
// ============================================================
let walletEnabled = true;

function applyWalletVisibility() {
  // Desktop header balance chip
  const chip = document.getElementById("homepage-vault-chip");
  if (chip && !walletEnabled) chip.style.display = "none";

  // Mobile bottom-nav "Wallet" tab
  const mobileWalletTab = document.getElementById("mobileWalletTab");
  if (mobileWalletTab && !walletEnabled) mobileWalletTab.style.display = "none";

  // "Pay with Hostel Vault" option inside the payment method modal
  const payVaultBtn = document.getElementById("payVaultBtn");
  if (payVaultBtn && !walletEnabled) payVaultBtn.style.display = "none";
}

async function loadWalletSetting() {
  try {
    const { data, error } = await sb.from("settings").select("value").eq("key", "appConfig").maybeSingle();
    if (error) throw error;
    walletEnabled = data ? (data.value?.walletEnabled !== false) : true;
  } catch (e) {
    console.warn("[Settings] Could not load wallet setting, defaulting to enabled:", e.message);
    walletEnabled = true;
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", applyWalletVisibility);
  } else {
    applyWalletVisibility();
  }
}
loadWalletSetting();

// ============================================================
// SITE CONTENT — Hero Banner (admin-editable, settings/siteContent)
// Read-only here; only the admin panel writes to this doc.
// Falls back to the original hardcoded copy if the doc/fields
// don't exist yet, so nothing breaks before the admin ever
// touches the Content tab.
// ============================================================
const SITE_CONTENT_DEFAULTS = {
  heroHeadlineLine1: "Your Campus",
  heroHeadlineLine2: "Superstore",
  heroSubtext: "Groceries, stationeries, hostel services & more — delivered right to your hostel door.",
  heroStats: [
    { value: "200+", label: "Products" },
    { value: "Fast",  label: "Delivery" },
    { value: "24/7",  label: "Support" },
    { value: "₦0",    label: "Hidden Fees" }
  ],
  lowerBannerTitle: "Stock Up Smarter, Save More",
  lowerBannerSubtext: "Join hundreds of LASU students already ordering in bulk with Campus Bulkmart.",
  lowerBannerButtonText: "Shop Now →",
  lowerBannerButtonLink: "products.html",
  footerDisclaimer: "Disclaimer: Campus Bulkmart is an independent, student-run delivery platform. We are not officially affiliated with, endorsed by, or partnered with Lagos State University (LASU) or its management. All services, logistics, and fulfillments are managed entirely by Campus Bulkmart.",
  footerWhatsapp: "+2349169618353",
  footerEmail: "atebelucky123@gmail.com",
  footerHours: "Available daily 8AM – 8PM",
  footerInstagram: "",
  footerTiktok: "",
  footerTwitter: "",
  footerFacebook: ""
};

const FOOTER_SOCIAL_META = [
  { key: "footerInstagram", label: "Instagram", glyph: "IG" },
  { key: "footerTiktok",    label: "TikTok",    glyph: "TT" },
  { key: "footerTwitter",   label: "X / Twitter", glyph: "X" },
  { key: "footerFacebook",  label: "Facebook",  glyph: "f" }
];

function applySiteContent(content) {
  const c = content || {};
  const line1   = c.heroHeadlineLine1 || SITE_CONTENT_DEFAULTS.heroHeadlineLine1;
  const line2   = c.heroHeadlineLine2 || SITE_CONTENT_DEFAULTS.heroHeadlineLine2;
  const subtext = c.heroSubtext || SITE_CONTENT_DEFAULTS.heroSubtext;
  const stats   = (Array.isArray(c.heroStats) && c.heroStats.length === 4) ? c.heroStats : SITE_CONTENT_DEFAULTS.heroStats;

  document.querySelectorAll(".js-hero-headline-line1").forEach(el => el.textContent = line1);
  document.querySelectorAll(".js-hero-headline-line2").forEach(el => el.textContent = line2);
  document.querySelectorAll(".js-hero-subtext").forEach(el => el.textContent = subtext);

  stats.forEach((stat, i) => {
    document.querySelectorAll(`.js-hero-stat-value-${i + 1}`).forEach(el => el.textContent = stat.value);
    document.querySelectorAll(`.js-hero-stat-label-${i + 1}`).forEach(el => el.textContent = stat.label);
  });

  const bannerTitle   = c.lowerBannerTitle || SITE_CONTENT_DEFAULTS.lowerBannerTitle;
  const bannerSubtext = c.lowerBannerSubtext || SITE_CONTENT_DEFAULTS.lowerBannerSubtext;
  const bannerBtnText = c.lowerBannerButtonText || SITE_CONTENT_DEFAULTS.lowerBannerButtonText;
  const bannerBtnLink = c.lowerBannerButtonLink || SITE_CONTENT_DEFAULTS.lowerBannerButtonLink;

  document.querySelectorAll(".js-lower-banner-title").forEach(el => el.textContent = bannerTitle);
  document.querySelectorAll(".js-lower-banner-subtext").forEach(el => el.textContent = bannerSubtext);
  document.querySelectorAll(".js-lower-banner-btn-text").forEach(el => el.textContent = bannerBtnText);
  const bannerBtn = document.getElementById("lowerBannerBtn");
  if (bannerBtn) bannerBtn.setAttribute("href", bannerBtnLink);

  // ── Footer ──
  const fDisclaimer = c.footerDisclaimer || SITE_CONTENT_DEFAULTS.footerDisclaimer;
  const fWhatsapp    = c.footerWhatsapp || SITE_CONTENT_DEFAULTS.footerWhatsapp;
  const fEmail       = c.footerEmail || SITE_CONTENT_DEFAULTS.footerEmail;
  const fHours       = c.footerHours || SITE_CONTENT_DEFAULTS.footerHours;

  document.querySelectorAll(".js-footer-disclaimer").forEach(el => el.textContent = fDisclaimer);
  document.querySelectorAll(".js-footer-whatsapp-link").forEach(el => {
    const digits = fWhatsapp.replace(/[^\d]/g, "");
    el.setAttribute("href", `https://wa.me/${digits}`);
    el.textContent = fWhatsapp;
  });
  document.querySelectorAll(".js-footer-email-link").forEach(el => {
    el.setAttribute("href", `mailto:${fEmail}`);
    el.textContent = fEmail;
  });
  document.querySelectorAll(".js-footer-hours").forEach(el => el.textContent = fHours);

  document.querySelectorAll(".js-footer-social").forEach(container => {
    container.innerHTML = "";
    FOOTER_SOCIAL_META.forEach(s => {
      const url = c[s.key];
      if (!url) return;
      const a = document.createElement("a");
      a.href = url;
      a.target = "_blank";
      a.rel = "noopener";
      a.className = "footer-social-link";
      a.title = s.label;
      a.textContent = s.glyph;
      container.appendChild(a);
    });
  });
}

async function loadSiteContent() {
  let content = null;
  try {
    const { data, error } = await sb.from("settings").select("value").eq("key", "siteContent").maybeSingle();
    if (error) throw error;
    content = data ? data.value : null;
  } catch (e) {
    console.warn("[SiteContent] Could not load site content, using defaults:", e.message);
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => applySiteContent(content));
  } else {
    applySiteContent(content);
  }
}
loadSiteContent();

// Handle pending Google redirect sign-in (fallback from popup-blocked scenarios)
auth.getRedirectResult()
  .then(result => {
    if (result && result.user) {
      // Redirect sign-in succeeded — onAuthStateChanged will update the UI automatically
      console.info("[Auth] Redirect sign-in resolved for:", result.user.email);
    }
  })
  .catch(err => {
    if (err && err.code !== "auth/no-auth-event" && err.code !== "auth/user-cancelled") {
      console.warn("[Auth] getRedirectResult error:", err.code);
    }
  });

// ============================================================
// CONSTANTS
// ============================================================
const ADMIN_UID = "aq0QC7De1GNIOYVH7qtCDwBEH1I2";
const WHATSAPP_NUMBER = "2349169618353";
const MIN_ORDER = 2000;
const GROUP_MIN_THRESHOLD = 15000;

// ============================================================
// STATE
// ============================================================
let PRODUCTS = [];           // loaded from Firestore only
let CUSTOM_CATEGORIES = [];  // admin-created categories, loaded from Firestore "categories" collection
let cart = [];
let currentCategory = "top-picks";
let searchQuery = "";
var isSignUpState = false; // must be `var`, not `let` — see comment in auth-modal.js
let currentUser = null;
let orderMode = "individual"; // "individual" or "group"
let productQtyMap = {};
let variantSelectionMap = {}; // productId -> selected variant index
let variantQtyMap = {};       // productId -> qty for selected variant on card
let searchDebounceTimer = null;
let mobileSearchDebounceTimer = null;

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
          <div class="text-4xl mb-3">📶</div>
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
// TOP PICKS CAROUSEL
// ============================================================
function renderTopPicksCarousel() {
  const section = document.getElementById("topPicksSection");
  if (!section) return;

  const topPicks = PRODUCTS.filter(p => p.isTopPick);
  if (topPicks.length === 0) {
    section.closest(".top-picks-wrapper")?.classList.add("hidden");
    return;
  }

  section.closest(".top-picks-wrapper")?.classList.remove("hidden");
  section.innerHTML = topPicks.map(p => `
    <div class="flex-shrink-0 w-40 sm:w-48 cursor-pointer group" onclick="openProductModal('${p.id}')">
      <div class="relative overflow-hidden rounded-2xl bg-gray-100 shadow-sm" style="height:140px;">
        <img src="${p.image || ''}" alt="${p.name}"
          class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          onerror="this.src='https://placehold.co/200x140/e5e7eb/9ca3af?text=?'" loading="lazy">
        <div class="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent"></div>
        <span class="absolute top-2 left-2 text-white text-[9px] font-bold px-2 py-0.5 rounded-full" style="background:#000080;">⚡ TOP PICK</span>
        <div class="absolute bottom-0 left-0 right-0 p-2">
          <p class="text-white font-bold text-xs leading-tight line-clamp-2">${p.name}</p>
          <p class="text-white/80 font-black text-xs mt-0.5">₦${Number(p.price).toLocaleString()}</p>
        </div>
      </div>
    </div>
  `).join("");
}

// ============================================================
// PRODUCT RENDERING
// ============================================================
function getFilteredProducts() {
  return PRODUCTS.filter(p => {
    if (p.isHidden === true) return false;
    // "all" is used by products.html (the full catalog page) — every other
    // page keeps using "top-picks" as its default curated view.
    const matchCat = currentCategory === "all"
      ? true
      : currentCategory === "top-picks"
        ? p.isTopPick === true
        : p.category === currentCategory;
    const matchSearch = !searchQuery ||
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.desc || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.category || "").toLowerCase().includes(searchQuery.toLowerCase());
    return matchCat && matchSearch;
  });
}

function getProductQty(id) { return productQtyMap[id] || 1; }

function changeProductQty(id, delta, event) {
  if (event) event.stopPropagation();
  productQtyMap[id] = Math.max(1, getProductQty(id) + delta);
  const el = document.getElementById(`qty-display-${id}`);
  if (el) el.value = productQtyMap[id];
  updateCardPrice(id);
}

function setProductQtyFromInput(id, value, event) {
  if (event) event.stopPropagation();
  const parsed = parseInt(value);
  productQtyMap[id] = isNaN(parsed) || parsed < 1 ? 1 : parsed;
  updateCardPrice(id);
}

// Recompute the price shown on a product card (unit price × current qty)
// whenever the qty stepper/input changes. Uses the data-unit-price stored
// on the price element so we don't need to re-look-up the product.
function updateCardPrice(id) {
  const priceEl = document.getElementById(`card-price-${id}`);
  if (!priceEl) return;
  const unitPrice = parseFloat(priceEl.dataset.unitPrice);
  if (isNaN(unitPrice)) return;
  const qty = getProductQty(id);
  priceEl.textContent = `₦${Number(unitPrice * qty).toLocaleString()}`;
}

// ── Variant selection (hostel services) ──────────────────────
function selectVariant(productId, variantIdx, event) {
  if (event) event.stopPropagation();
  variantSelectionMap[productId] = variantIdx;

  // Update pills UI
  const card = event?.target?.closest('.product-card');
  if (card) {
    card.querySelectorAll('.variant-pill').forEach((pill, i) => {
      pill.classList.toggle('selected', i === variantIdx);
    });
  }

  // Update price display on card
  const p = PRODUCTS.find(x => x.id === productId);
  if (p && Array.isArray(p.variants)) {
    const priceEl = document.getElementById(`card-price-${productId}`);
    if (priceEl) {
      const v = p.variants[variantIdx];
      priceEl.textContent = `₦${Number(v.price).toLocaleString()}`;
    }
  }
}

function adjVariantQty(productId, variantIdx, delta) {
  const input = document.getElementById(`vqty-${productId}-${variantIdx}`);
  if (!input) return;
  input.value = Math.max(1, (parseInt(input.value) || 1) + delta);
  updateModalVariantPrice(productId, variantIdx);
}

// Recalculates the "Selected:" price shown in the variant modal —
// unit price of the selected variant × the qty entered for that variant.
function updateModalVariantPrice(productId, variantIdx) {
  const p = PRODUCTS.find(x => x.id === productId);
  if (!p || !Array.isArray(p.variants)) return;

  const idx = variantIdx ?? (variantSelectionMap[productId] ?? 0);
  const variant = p.variants[idx];
  if (!variant) return;

  const qtyInput = document.getElementById(`vqty-${productId}-${idx}`);
  const qty = Math.max(1, parseInt(qtyInput?.value) || 1);

  const priceEl = document.getElementById(`modal-variant-price-${productId}`);
  if (priceEl) {
    priceEl.textContent = `₦${Number(variant.price * qty).toLocaleString()}`;
  }
}

function addVariantToCart(productId) {
  const p = PRODUCTS.find(x => x.id === productId);
  if (!p || !Array.isArray(p.variants)) return;

  const idx = variantSelectionMap[productId] ?? 0;
  const variant = p.variants[idx];
  if (!variant) return;

  // Block the add outright if we're in Group Order mode and this product
  // has group ordering disabled — a toast-only warning let it into the cart anyway.
  if (orderMode === "group" && p.allowGroupOrder === false) {
    showToast("⚠️", `${p.name} isn't available for Group Orders`);
    return;
  }

  // Read qty from the per-variant input in the modal
  const cartKey = `${productId}__v${idx}`;
  const qtyInput = document.getElementById(`vqty-${productId}-${idx}`);
  const addQty = Math.max(1, parseInt(qtyInput?.value) || 1);
  const existing = cart.find(x => x.cartKey === cartKey);
  if (existing) {
    existing.qty += addQty;
  } else {
    cart.push({
      ...p,
      cartKey,
      id: cartKey,
      name: `${p.name} — ${variant.name}`,
      price: variant.price,
      qty: addQty
    });
  }
  updateCartUI();
  saveCartToStorage();
  showToast("🛒", `${p.name} (${variant.name}) × ${addQty} added!`);
}

function renderProducts() {
  const grid = document.getElementById("productGrid");
  const empty = document.getElementById("emptyState");
  if (!grid) return;

  const filtered = getFilteredProducts();

  if (filtered.length === 0) {
    grid.innerHTML = "";
    empty?.classList.remove("hidden");
    return;
  }
  empty?.classList.add("hidden");

  grid.innerHTML = filtered.map(p => {
    // ── Service card (hostel-services with variantGroups) ──
    if (p.isService || p.category === "hostel-services") {
      const sp = (() => {
        const groups = p.variantGroups || [];
        const prices = [];
        groups.forEach(g => (g.items || []).forEach(it => { if (it.price != null && it.price > 0) prices.push(it.price); }));
        return prices.length ? Math.min(...prices) : null;
      })();
      const priceLabel = sp ? `from ₦${Number(sp).toLocaleString()}` : (p.price && p.price > 0 ? `from ₦${Number(p.price).toLocaleString()}` : "Price on request");
      return `
      <div class="product-card bg-white rounded-2xl overflow-hidden border border-gray-100 shadow-sm cursor-pointer" onclick="openServiceModal('${p.id}')">
        <div class="product-img-wrap">
          <img src="${p.image || ''}" alt="${p.name}" class="product-img" loading="lazy"
            onerror="this.src='https://placehold.co/400x400/e5e7eb/9ca3af?text=Service'">
          <span class="absolute top-2 left-2 text-white text-[10px] font-bold px-2 py-0.5 rounded-full" style="background:#000080;">🛎 SERVICE</span>
          ${p.isTopPick ? '<span class="absolute bottom-2 left-2 text-white text-[10px] font-bold px-2 py-0.5 rounded-full" style="background:#000080;">⚡ Top Pick</span>' : ''}
        </div>
        <div class="card-body p-3 sm:p-4">
          <div class="card-text">
            <p class="text-[10px] sm:text-xs font-semibold uppercase tracking-wide mb-1" style="color:#000080;">Hostel Service</p>
            <h3 class="font-bold text-gray-800 text-xs sm:text-sm leading-tight line-clamp-2 mb-1">${p.name}</h3>
            <p class="text-gray-400 text-[10px] sm:text-xs line-clamp-2 mb-2">${p.desc || ''}</p>
          </div>
          <div>
            <span class="font-black text-gray-900 text-xs sm:text-sm">${priceLabel}</span>
            <button onclick="event.stopPropagation(); openServiceModal('${p.id}')"
              class="w-full text-white text-xs font-bold py-1.5 rounded-lg transition mt-2" style="background:#000080;">
              View Price List
            </button>
          </div>
        </div>
      </div>`;
    }

    const qty = getProductQty(p.id);
    const hasVariants = Array.isArray(p.variants) && p.variants.length > 0;

    // Initialise selected variant state if not already set
    if (hasVariants && !variantSelectionMap[p.id]) {
      variantSelectionMap[p.id] = 0; // default to first variant
    }

    const selectedVariantIdx = hasVariants ? (variantSelectionMap[p.id] || 0) : null;
    const selectedVariant    = hasVariants ? p.variants[selectedVariantIdx] : null;
    const displayPrice       = hasVariants ? selectedVariant.price : p.price;

    // Group order eligibility (defaults to true unless the admin explicitly disabled it)
    const groupOrderAllowed = p.allowGroupOrder !== false;

    // CTA area: variant products get "View Product" button; normal get qty+add
    const ctaHTML = hasVariants ? `
      <button onclick="event.stopPropagation(); openProductModal('${p.id}')"
        class="w-full text-white text-xs font-bold py-2 rounded-lg transition flex items-center justify-center gap-1.5" style="background:#000080;">
        <svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
        View Product
      </button>` : `
      <div class="qty-row" onclick="event.stopPropagation()">
        <button onclick="changeProductQty('${p.id}', -1, event)" class="qty-btn">−</button>
        <input id="qty-display-${p.id}" type="text" inputmode="numeric" pattern="[0-9]*"
          value="${qty}" onclick="event.stopPropagation()"
          onchange="setProductQtyFromInput('${p.id}', this.value, event)"
          oninput="setProductQtyFromInput('${p.id}', this.value, event)"
          class="qty-input" />
        <button onclick="changeProductQty('${p.id}', 1, event)" class="qty-btn">+</button>
      </div>
      <button onclick="event.stopPropagation(); addToCartWithQty('${p.id}')"
        class="w-full text-white text-xs font-bold py-1.5 rounded-lg transition" style="background:#000080;">
        + Add to Cart
      </button>`;

    return `
    <div class="product-card bg-white rounded-2xl overflow-hidden border border-gray-100 shadow-sm cursor-pointer" onclick="openProductModal('${p.id}')">
      <div class="product-img-wrap">
        <img src="${p.image || ''}" alt="${p.name}" class="product-img" loading="lazy"
          onerror="this.src='https://placehold.co/400x400/e5e7eb/9ca3af?text=Product'">
        ${p.isTopPick ? '<span class="absolute top-2 left-2 text-white text-[10px] font-bold px-2 py-0.5 rounded-full" style="background:#000080;">⚡ Top Pick</span>' : ''}
        ${!hasVariants && p.stock && p.stock <= 5 ? `<span class="absolute top-2 right-2 bg-red-500 text-white text-[9px] font-bold px-2 py-0.5 rounded-full">Only ${p.stock} left</span>` : ''}
      </div>
      <div class="card-body p-3 sm:p-4">
        <div class="card-text">
          <p class="text-[10px] sm:text-xs font-semibold uppercase tracking-wide mb-1" style="color:#000080;">${(p.category || '').replace(/-/g, ' ')}</p>
          <h3 class="font-bold text-gray-800 text-xs sm:text-sm leading-tight line-clamp-2 mb-1">${p.name}</h3>
          <p class="text-gray-400 text-[10px] sm:text-xs line-clamp-2 mb-2">${p.desc || ''}</p>
        </div>
        <div>
          <div class="flex items-center justify-between mb-2">
            <span class="font-black text-gray-900 text-xs sm:text-sm" id="card-price-${p.id}" data-unit-price="${displayPrice}">
              ${hasVariants ? `From ₦${Number(displayPrice).toLocaleString()}` : `₦${Number(displayPrice * qty).toLocaleString()}`}
            </span>
          </div>
          ${groupOrderAllowed ? '<p class="text-[9px] sm:text-[10px] font-bold mb-1.5" style="color:#3B592D;">🤝 Group Order Available</p>' : ''}
          ${ctaHTML}
        </div>
      </div>
    </div>
  `}).join("");
}

function setCategory(cat) {
  currentCategory = cat;
  document.querySelectorAll(".category-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.cat === cat);
  });
  // Show skeleton shimmer briefly on every category switch
  const grid = document.getElementById("productGrid");
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
  setTimeout(() => renderProducts(), 350);
}

// ============================================================
// PRODUCT MODAL
// ============================================================
function openProductModal(id) {
  document.removeEventListener("keydown", _modalEnterHandler);
  document.addEventListener("keydown", _modalEnterHandler);
  const p = PRODUCTS.find(x => x.id === id);
  if (!p) return;

  const modal = document.getElementById("productModal");
  const content = document.getElementById("productModalContent");

  content.innerHTML = `
    <div class="bg-white overflow-hidden rounded-t-3xl" style="height:120px;">
      <img src="${p.image || ''}" alt="${p.name}" class="w-full h-full object-contain"
        onerror="this.src='https://placehold.co/600x400/e5e7eb/9ca3af?text=Product'">
    </div>
    <div class="p-4">
      <div class="flex flex-wrap gap-2 mb-2">
        ${p.isTopPick ? '<span class="inline-block text-xs font-bold px-3 py-1 rounded-full" style="background:#eff6ff;color:#000080;">⚡ Top Pick</span>' : ''}
        ${(p.allowGroupOrder !== false) ? '<span class="inline-block text-xs font-bold px-3 py-1 rounded-full" style="background:#f0f4ec;color:#3B592D;">🤝 Group Order Available</span>' : ''}
      </div>
      <p class="text-xs font-semibold uppercase tracking-wide mb-1" style="color:#000080;">${(p.category || '').replace(/-/g, ' ')}</p>
      <h2 class="font-black text-lg text-gray-900 mb-1">${p.name}</h2>
      <p class="text-gray-500 text-sm mb-3 line-clamp-2">${p.desc || ''}</p>

      ${Array.isArray(p.variants) && p.variants.length > 0 ? `
        <!-- VARIANT SELECTOR with per-variant qty -->
        <div class="mb-4">
          <p class="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Select Option</p>
          <div class="space-y-2" id="modal-variants-${p.id}">
            ${p.variants.map((v, i) => `
              <div class="flex items-center gap-2 p-3 border-2 rounded-xl cursor-pointer transition modal-variant-row ${i === (variantSelectionMap[p.id] ?? 0) ? 'border-blue-800 bg-blue-50' : 'border-gray-100'}"
                onclick="selectModalVariant('${p.id}', ${i})" style="user-select:none;">
                <div class="w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${i === (variantSelectionMap[p.id] ?? 0) ? 'border-blue-800' : 'border-gray-300'}">
                  ${i === (variantSelectionMap[p.id] ?? 0) ? '<div class="w-2 h-2 rounded-full" style="background:#000080;"></div>' : ''}
                </div>
                <span class="text-sm font-semibold text-gray-800 flex-1">${v.name}</span>
                <span class="font-black text-sm flex-shrink-0" style="color:#000080;">₦${Number(v.price).toLocaleString()}</span>
                <!-- Qty input inline per variant -->
                <div class="flex items-center gap-1 flex-shrink-0 ml-2" onclick="event.stopPropagation()">
                  <button onclick="adjVariantQty('${p.id}',${i},-1)" style="width:20px;height:20px;min-width:20px;min-height:20px;border-radius:50%;background:#000080;color:#fff;border:none;cursor:pointer;font-size:13px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;line-height:1;padding:0;aspect-ratio:1/1;">−</button>
                  <input id="vqty-${p.id}-${i}" type="number" min="1" value="1"
                    onclick="event.stopPropagation()"
                    onchange="this.value=Math.max(1,parseInt(this.value)||1); updateModalVariantPrice('${p.id}', ${i})"
                    oninput="updateModalVariantPrice('${p.id}', ${i})"
                    style="width:26px;height:22px;text-align:center;font-size:11px;font-weight:700;border:1.5px solid #e5e7eb;border-radius:6px;padding:0;outline:none;-moz-appearance:textfield;"
                    onfocus="this.style.borderColor='#000080'" onblur="this.style.borderColor='#e5e7eb'" />
                  <button onclick="adjVariantQty('${p.id}',${i},1)" style="width:20px;height:20px;min-width:20px;min-height:20px;border-radius:50%;background:#000080;color:#fff;border:none;cursor:pointer;font-size:13px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;line-height:1;padding:0;aspect-ratio:1/1;">+</button>
                </div>
              </div>`).join('')}
          </div>
        </div>
        <div class="flex items-center justify-between mb-4">
          <span class="text-sm font-semibold text-gray-600">Selected:</span>
          <span class="font-black text-2xl text-gray-900" id="modal-variant-price-${p.id}">
            ₦${Number(p.variants[variantSelectionMap[p.id] ?? 0].price).toLocaleString()}
          </span>
        </div>
        <button onclick="addVariantToCart('${p.id}'); closeProductModal();"
          class="w-full text-white font-bold py-3 rounded-xl transition text-sm mb-4" style="background:#000080;">
          Add to Cart
        </button>
      ` : `
        <!-- NORMAL add-to-cart -->
        <div class="flex items-center justify-between mb-4">
          <span class="font-black text-2xl text-gray-900" id="modal-price-${p.id}" data-unit-price="${p.price}">₦${Number(p.price * getProductQty(p.id)).toLocaleString()}</span>
          ${p.stock && p.stock <= 5 ? `<span class="bg-red-100 text-red-600 text-xs font-bold px-2 py-1 rounded-full">Only ${p.stock} left</span>` : ''}
        </div>
        <div class="flex items-center gap-3 mb-4">
          <span class="text-sm font-semibold text-gray-600">Qty:</span>
          <div class="flex items-center gap-2">
            <button onclick="changeModalQty('${p.id}', -1)"
              class="flex items-center justify-center rounded-full text-white font-bold text-lg transition hover:opacity-80"
              style="width:32px; height:32px; min-width:32px; min-height:32px; aspect-ratio:1/1; background:#000080;">−</button>
            <input id="modal-qty-${p.id}" type="number" min="1" value="${getProductQty(p.id)}"
              onchange="productQtyMap['${p.id}']=Math.max(1,parseInt(this.value)||1); this.value=productQtyMap['${p.id}']; updateModalPrice('${p.id}')"
              class="w-14 text-center text-base font-bold text-gray-800 border border-gray-200 rounded-xl py-1.5 focus:outline-none"
              onfocus="this.style.boxShadow='0 0 0 2px #000080'" onblur="this.style.boxShadow=''" />
            <button onclick="changeModalQty('${p.id}', 1)"
              class="flex items-center justify-center rounded-full text-white font-bold text-lg transition hover:opacity-80"
              style="width:32px; height:32px; min-width:32px; min-height:32px; aspect-ratio:1/1; background:#000080;">+</button>
          </div>
        </div>
        <button onclick="addToCartWithQty('${p.id}'); closeProductModal();"
          class="w-full text-white font-bold py-3 rounded-xl transition text-sm mb-4" style="background:#000080;">
          Add to Cart
        </button>
      `}

      <div class="mt-2 border-t border-gray-100 pt-4">
        <h3 class="font-bold text-gray-800 mb-3">Reviews</h3>
        <div id="modalReviews_${p.id}" class="space-y-3 mb-4">
          <p class="text-gray-400 text-sm">Loading reviews...</p>
        </div>
        <div id="reviewFormArea_${p.id}">
          <p class="text-sm text-gray-400 text-center py-2">Checking sign-in status...</p>
        </div>
      </div>
    </div>
  `;

  modal.classList.remove("hidden");
  modal.classList.add("flex");
  loadProductReviews(p.id);
  renderModalReviewForm(p.id);
}

function changeModalQty(id, delta) {
  const el = document.getElementById(`modal-qty-${id}`);
  const current = parseInt(el?.value) || 1;
  const newVal = Math.max(1, current + delta);
  productQtyMap[id] = newVal;
  if (el) el.value = newVal;
  updateModalPrice(id);
}

// Recompute the price shown in the product modal (unit price × current qty)
// whenever the qty stepper/input changes.
function updateModalPrice(id) {
  const priceEl = document.getElementById(`modal-price-${id}`);
  if (!priceEl) return;
  const unitPrice = parseFloat(priceEl.dataset.unitPrice);
  if (isNaN(unitPrice)) return;
  const qty = getProductQty(id);
  priceEl.textContent = `₦${Number(unitPrice * qty).toLocaleString()}`;
}

function selectModalVariant(productId, variantIdx) {
  variantSelectionMap[productId] = variantIdx;
  const p = PRODUCTS.find(x => x.id === productId);
  if (!p || !Array.isArray(p.variants)) return;

  // Update radio rows
  const rows = document.querySelectorAll(`#modal-variants-${productId} .modal-variant-row`);
  rows.forEach((row, i) => {
    const isSelected = i === variantIdx;
    row.classList.toggle('border-blue-800', isSelected);
    row.classList.toggle('bg-blue-50', isSelected);
    row.classList.toggle('border-gray-100', !isSelected);
    // Update radio dot
    const dot = row.querySelector('.w-4');
    if (dot) {
      dot.classList.toggle('border-blue-800', isSelected);
      dot.classList.toggle('border-gray-300', !isSelected);
      dot.innerHTML = isSelected ? '<div class="w-2 h-2 rounded-full" style="background:#000080;"></div>' : '';
    }
  });

  // Update price display (unit price × qty for the newly-selected variant)
  updateModalVariantPrice(productId, variantIdx);
}


// Enter key handler for product modal
function _modalEnterHandler(e) {
  if (e.key !== "Enter") return;
  const modal = document.getElementById("productModal");
  if (!modal || modal.classList.contains("hidden")) return;
  // Don't fire if user is typing in a textarea or input (review box, qty)
  const tag = document.activeElement?.tagName;
  if (tag === "TEXTAREA") return;
  // Find the visible add-to-cart / variant button and click it
  const addBtn = modal.querySelector("button[onclick*='addToCartWithQty'], button[onclick*='addVariantToCart']");
  if (addBtn) { e.preventDefault(); addBtn.click(); }
}
function closeProductModal() {
  document.getElementById("productModal").classList.add("hidden");
  document.removeEventListener("keydown", _modalEnterHandler);
  document.getElementById("productModal").classList.remove("flex");
  closeAllReviewsModal();
}

// ============================================================
// SERVICE MODAL — view price list & book via WhatsApp
// ============================================================
let _activeServiceSelection = null; // { groupName, itemName, price, priceLabel }

function openServiceModal(productId) {
  const p = allProducts.find(x => x.id === productId);
  if (!p) return;
  _activeServiceSelection = null;

  const modal = document.getElementById("serviceModal");
  if (!modal) return;

  // Header
  document.getElementById("svcModalImg").src = p.image || "";
  document.getElementById("svcModalImg").onerror = function(){ this.src="https://placehold.co/600x300/e5e7eb/9ca3af?text=Service"; };
  document.getElementById("svcModalName").textContent = p.name;
  document.getElementById("svcModalDesc").textContent = p.desc || "";

  // Build rate card
  const body = document.getElementById("svcModalBody");
  const groups = p.variantGroups || [];
  if (groups.length === 0) {
    body.innerHTML = `<div class="text-center py-10 text-gray-400 text-sm">
      <div class="text-4xl mb-3">💬</div>
      <p>Price list coming soon. <a href="https://wa.me/2349169618353" class="font-bold underline" style="color:#000080;">Contact us on WhatsApp</a>.</p>
    </div>`;
  } else {
    body.innerHTML = groups.map((g, gi) => `
      <div class="mb-5">
        <p class="text-[10px] font-black uppercase tracking-widest mb-2 pb-1 border-b border-gray-100" style="color:#000080;">${escapeHtml(g.groupName || 'Options')}</p>
        <div class="space-y-2">
          ${(g.items || []).map((it, ii) => {
            const isDM = it.price == null || it.priceLabel === "DM for price";
            const priceText = isDM ? `<span class="italic text-gray-400 text-xs">DM for price</span>` : `<span class="font-black text-gray-900 text-sm">₦${Number(it.price).toLocaleString()}</span>`;
            const hasDesc = it.description && it.description.trim();
            return `
            <div class="svc-item-row border border-gray-100 rounded-xl px-4 py-3 cursor-pointer transition hover:border-blue-200"
              id="svcItem_${gi}_${ii}"
              onclick="selectServiceItem(${gi}, ${ii}, ${JSON.stringify(g.groupName)}, ${JSON.stringify(it.name)}, ${it.price != null ? it.price : 'null'}, ${isDM})">
              <div class="flex items-center justify-between gap-3">
                <span class="font-semibold text-gray-800 text-sm">${escapeHtml(it.name)}</span>
                ${priceText}
              </div>
              ${hasDesc ? `<button class="text-[10px] text-blue-600 font-semibold mt-1" onclick="event.stopPropagation(); toggleSvcDesc(this)">▸ What's included</button>
              <p class="svc-desc hidden text-xs text-gray-500 mt-1">${escapeHtml(it.description)}</p>` : ''}
            </div>`;
          }).join('')}
        </div>
      </div>
    `).join('');
  }

  updateSvcBottomBar();
  modal.classList.remove("hidden");
  modal.classList.add("flex");
  document.body.classList.add("modal-open");
}

function toggleSvcDesc(btn) {
  const desc = btn.nextElementSibling;
  if (!desc) return;
  const open = !desc.classList.contains("hidden");
  desc.classList.toggle("hidden", open);
  btn.textContent = open ? "▸ What's included" : "▾ What's included";
}

function selectServiceItem(gi, ii, groupName, itemName, price, isDM) {
  document.querySelectorAll(".svc-item-row").forEach(el => {
    el.style.borderColor = "";
    el.style.background = "";
  });
  const row = document.getElementById(`svcItem_${gi}_${ii}`);
  if (row) { row.style.borderColor = "#000080"; row.style.background = "#eff6ff"; }
  _activeServiceSelection = { groupName, itemName, price: isDM ? null : price, isDM };
  updateSvcBottomBar();
}

function updateSvcBottomBar() {
  const label = document.getElementById("svcSelectionLabel");
  const btn = document.getElementById("svcWhatsappBtn");
  if (!label || !btn) return;
  if (!_activeServiceSelection) {
    label.textContent = "Select a tier above";
    btn.disabled = true;
    btn.style.opacity = "0.5";
    btn.textContent = "Order via WhatsApp →";
    return;
  }
  const { itemName, price, isDM } = _activeServiceSelection;
  label.textContent = isDM ? `${itemName} — DM for price` : `${itemName} — ₦${Number(price).toLocaleString()}`;
  btn.disabled = false;
  btn.style.opacity = "1";
  btn.textContent = isDM ? "Enquire via WhatsApp" : "Order via WhatsApp →";
}

function bookServiceWhatsapp() {
  if (!_activeServiceSelection) return;
  const svcName = document.getElementById("svcModalName")?.textContent || "Service";
  const { itemName, price, isDM } = _activeServiceSelection;
  let msg;
  if (isDM) {
    msg = `Hi, I'd like to enquire about ${svcName} — ${itemName}. `;
  } else {
    msg = `Hi, I'd like to book ${svcName} — ${itemName} (₦${Number(price).toLocaleString()}). My hostel room is: `;
  }
  window.open(`https://wa.me/2349169618353?text=${encodeURIComponent(msg)}`, "_blank");
}

function closeServiceModal() {
  const modal = document.getElementById("serviceModal");
  if (modal) { modal.classList.add("hidden"); modal.classList.remove("flex"); }
  document.body.classList.remove("modal-open");
  _activeServiceSelection = null;
}

function escapeHtml(str) {
  if (!str) return "";
  return String(str).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;");
}

function renderModalReviewForm(productId) {
  const area = document.getElementById(`reviewFormArea_${productId}`);
  if (!area) return;
  if (currentUser) {
    area.innerHTML = `
      <div class="bg-gray-50 rounded-2xl p-4">
        <p class="text-sm font-semibold text-gray-700 mb-2">Leave a Review</p>
        <div class="flex gap-1 mb-3" id="starPicker_${productId}">
          ${[1,2,3,4,5].map(i => `<button class="star-btn" data-star="${i}" onclick="selectStar('${productId}', ${i})">☆</button>`).join('')}
        </div>
        <textarea id="reviewText_${productId}" placeholder="Share your experience..."
          class="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none resize-none" rows="3"
          onfocus="this.style.boxShadow='0 0 0 2px #000080'" onblur="this.style.boxShadow=''"></textarea>
        <button onclick="submitReview('${productId}')" class="mt-2 w-full text-white text-sm font-bold py-2 rounded-xl transition" style="background:#000080;">Submit Review</button>
      </div>`;
  } else {
    area.innerHTML = `<p class="text-sm text-gray-400 text-center"><button onclick="closeProductModal(); openAuthModal()" class="font-semibold" style="color:#000080;">Sign in</button> to leave a review</p>`;
  }
}

let selectedStars = {};
function selectStar(productId, star) {
  selectedStars[productId] = star;
  document.querySelectorAll(`#starPicker_${productId} .star-btn`).forEach(btn => {
    const s = parseInt(btn.dataset.star);
    btn.textContent = s <= star ? "★" : "☆";
    btn.classList.toggle("selected", s <= star);
  });
}

async function submitReview(productId) {
  if (!currentUser) { openAuthModal(); return; }
  const stars = selectedStars[productId] || 0;
  const textEl = document.getElementById(`reviewText_${productId}`);
  const text = textEl?.value.trim();
  if (!stars || !text) { showToast("⚠️", "Please add a rating and review text"); return; }
  try {
    const { error } = await sb.from("reviews").insert({
      product_id: productId,
      user_id: currentUser.uid,
      user_name: currentUser.displayName || currentUser.email,
      stars, text,
      featured: true
      // created_at: Postgres column default (now()) handles this — no need to set it
    });
    if (error) throw error;
    showToast("✅", "Review submitted!");

    // Clear the form so the same review can't be re-submitted by repeatedly
    // pressing Submit — reset both the textarea and the star picker.
    if (textEl) textEl.value = "";
    delete selectedStars[productId];
    document.querySelectorAll(`#starPicker_${productId} .star-btn`).forEach(btn => {
      btn.textContent = "☆";
      btn.classList.remove("selected");
    });

    loadProductReviews(productId);
  } catch (e) { showToast("❌", "Failed to submit review"); }
}

// Cache of the full (unsliced) review list per product, so "Show more"
// doesn't need a second Firestore round-trip.
const REVIEW_DISPLAY_LIMIT = 5;
let reviewsCache = {};

function renderReviewCardHTML(r) {
  const stars = "★".repeat(r.stars || 0) + "☆".repeat(5 - (r.stars || 0));
  return `<div class="bg-gray-50 rounded-xl p-3">
    <div class="flex items-center gap-2 mb-1">
      <span class="font-semibold text-xs text-gray-700">${escapeHtml(r.userName || 'Anonymous')}</span>
      <span class="text-yellow-500 text-xs">${stars}</span>
    </div>
    <p class="text-gray-600 text-xs">${escapeHtml(r.text)}</p>
  </div>`;
}

function loadProductReviews(productId) {
  const el = document.getElementById(`modalReviews_${productId}`);
  if (!el) return;
  sb.from("reviews").select("*").eq("product_id", productId)
    .then(({ data, error }) => {
      if (error) throw error;
      if (!data || data.length === 0) {
        reviewsCache[productId] = [];
        el.innerHTML = '<p class="text-gray-400 text-xs text-center py-2">No reviews yet — be the first!</p>';
        return;
      }
      const allDocs = data
        .map(row => ({
          userName: row.user_name,
          stars: row.stars,
          text: row.text,
          featured: row.featured,
          rank: row.rank,
          // Shimmed to look like a Firestore Timestamp ({seconds}) so the
          // sort comparator below (a.timestamp?.seconds) needed no changes.
          timestamp: { seconds: row.created_at ? new Date(row.created_at).getTime() / 1000 : 0 }
        }))
        .sort((a, b) => {
          // Featured (admin-ranked) reviews always come first, in rank order.
          if (a.featured && b.featured) return (a.rank || 0) - (b.rank || 0);
          if (a.featured && !b.featured) return -1;
          if (!a.featured && b.featured) return 1;
          // Both unfeatured: newest first.
          return (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0);
        });

      reviewsCache[productId] = allDocs;

      const visible = allDocs.slice(0, REVIEW_DISPLAY_LIMIT);
      el.innerHTML = visible.map(renderReviewCardHTML).join("");

      if (allDocs.length > REVIEW_DISPLAY_LIMIT) {
        el.innerHTML += `<button onclick="openAllReviewsModal('${productId}')"
          class="text-xs font-semibold underline" style="color:#000080;">
          Show all ${allDocs.length} reviews
        </button>`;
      }
    })
    .catch(() => { el.innerHTML = '<p class="text-gray-400 text-xs text-center py-2">No reviews yet — be the first!</p>'; });
}

function openAllReviewsModal(productId) {
  const modal = document.getElementById("allReviewsModal");
  const content = document.getElementById("allReviewsModalContent");
  if (!modal || !content) return;
  const reviews = reviewsCache[productId] || [];
  content.innerHTML = reviews.length
    ? reviews.map(renderReviewCardHTML).join("")
    : '<p class="text-gray-400 text-xs text-center py-4">No reviews yet.</p>';
  modal.classList.remove("hidden");
  modal.classList.add("flex");
}

function closeAllReviewsModal() {
  const modal = document.getElementById("allReviewsModal");
  if (modal) { modal.classList.add("hidden"); modal.classList.remove("flex"); }
}

// ============================================================
// DELIVERY FEE CALCULATOR
// ============================================================
function calculateDeliveryFee(cartSubtotal, mode) {
  if (mode === "group") {
    if (cartSubtotal < GROUP_MIN_THRESHOLD) {
      return { fee: null, warning: `Add ₦${(GROUP_MIN_THRESHOLD - cartSubtotal).toLocaleString()} more to unlock group processing` };
    }
    if (cartSubtotal >= 25000) return { fee: 0, label: "FREE (100% Group Discount!)", discount: 3000 };
    if (cartSubtotal >= 15000) return { fee: 1000, label: "₦1,000 (50% Group Discount)", discount: 1000 };
  }

  // Individual mode
  if (cartSubtotal < 2000) return { fee: null, warning: `Minimum order is ₦${MIN_ORDER.toLocaleString()}` };
  if (cartSubtotal >= 25000)               return { fee: 3000, label: "₦3,000" };
  if (cartSubtotal >= 15000)               return { fee: 2000, label: "₦2,000" };
  if (cartSubtotal >= 10000)               return { fee: 1500, label: "₦1,500" };
  if (cartSubtotal >= 9000)                return { fee: 700,  label: "₦700 (Buffer Saver!)" };
  if (cartSubtotal >= 5000)                return { fee: 1000, label: "₦1,000" };
  if (cartSubtotal >= 4500)                return { fee: 500,  label: "₦500 (Buffer Saver!)" };
  if (cartSubtotal >= 3000)                return { fee: 750,  label: "₦750" };
  if (cartSubtotal >= 2000)                return { fee: 500,  label: "₦500" };
  return { fee: null, warning: "Minimum order ₦2,000" };
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
    showToast("⚠️", `${p.name} isn't available for Group Orders`);
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
  updateCartUI();
  saveCartToStorage();
  showToast("🛒", `${p.name} added to cart`);
}

function removeFromCart(productId) {
  cart = cart.filter(x => x.id !== productId);
  updateCartUI();
  saveCartToStorage();
}

function updateQty(productId, delta) {
  const item = cart.find(x => x.id === productId);
  if (!item) return;
  item.qty = Math.max(1, item.qty + delta);
  updateCartUI();
  saveCartToStorage();
}

function setCartQty(productId, value) {
  const item = cart.find(x => x.id === productId);
  if (!item) return;
  const parsed = parseInt(value);
  item.qty = isNaN(parsed) || parsed < 1 ? 1 : parsed;
  updateCartUI();
  saveCartToStorage();
}

function clearCart() {
  if (cart.length === 0) return;
  cart = [];
  updateCartUI();
  clearCartStorage();
  showToast("🗑️", "Cart cleared");
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
    // Individual mode — show next tier hint
    const tiers = [2000, 3000, 4500, 5000, 9000, 10000, 15000, 25000];
    const nextTier = tiers.find(t => t > cartSubtotal);
    if (nextTier) {
      const diff = nextTier - cartSubtotal;
      const nextResult = calculateDeliveryFee(nextTier, "individual");
      const currentResult = calculateDeliveryFee(cartSubtotal, "individual");
      if (currentResult.fee !== null && nextResult.fee !== null && nextResult.fee < currentResult.fee) {
        groupProgressHTML = `
          <div class="mb-3 bg-blue-50 border border-blue-100 rounded-xl p-2.5 text-center">
            <p class="text-[11px] font-semibold" style="color:#000080;">Add ₦${diff.toLocaleString()} more → delivery drops to ${nextResult.label}</p>
          </div>`;
      }
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
  } else {
    const deliveryFee = result.fee;
    const finalTotal = cartSubtotal + deliveryFee;
    const hasDiscount = result.discount > 0;

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
}

// ============================================================
// CHECKOUT — Payment Method Modal
// ============================================================

// Stores pending order details while user picks a payment method
let _pendingOrderDetails = null;

function openPaymentModal() { document.getElementById("paymentModal").classList.remove("hidden"); document.getElementById("paymentModal").classList.add("flex"); }
function closePaymentModal() { document.getElementById("paymentModal").classList.add("hidden"); document.getElementById("paymentModal").classList.remove("flex"); document.getElementById("paymentModalError").classList.add("hidden"); document.getElementById("vaultInsufficientNotice")?.classList.add("hidden"); }

async function checkout() {
  if (!currentUser) { showToast("⚠️", "Please sign in to checkout"); return; }
  if (cart.length === 0) { showToast("⚠️", "Your cart is empty"); return; }

  const cartSubtotal = cart.reduce((sum, item) => sum + item.price * item.qty, 0);
  const result = calculateDeliveryFee(cartSubtotal, orderMode);

  if (result.warning) { showToast("⚠️", result.warning); return; }

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
    showToast("✅", "Order placed! Payment deducted from vault.");
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
  showToast("✅", "Order sent via WhatsApp!");
  _pendingOrderDetails = null;
}

// ============================================================
// AUTH STATE
// ============================================================
auth.onAuthStateChanged(user => {
  currentUser = user;
  // Single source of truth: always close modal + hide loader when auth state resolves
  if (user) {
    if (typeof hideAuthLoader === "function") hideAuthLoader();
    closeAuthModal();
  }
  const run = () => {
    const authBtn  = document.getElementById("authBtn");
    const userMenu = document.getElementById("userMenu");
    if (user) {
      // Hide Sign In button (works for both class-based and inline-style-based buttons)
      if (authBtn) { authBtn.style.display = "none"; authBtn.classList.add("hidden"); }
      if (userMenu) { userMenu.style.display = ""; userMenu.classList.remove("hidden"); }
      const name = user.displayName || user.email?.split("@")[0] || "User";
      const el = document.getElementById("userNameDisplay");
      const av = document.getElementById("userAvatar");
      if (el) el.textContent = name;
      if (av) av.textContent = name.charAt(0).toUpperCase();
      const nameInput = document.getElementById("checkoutName");
      if (nameInput && !nameInput.value) nameInput.value = user.displayName || "";
      if (user.uid === ADMIN_UID) document.getElementById("adminLink")?.classList.remove("hidden");
      document.getElementById("checkoutFormWrapper")?.classList.remove("hidden");
      document.getElementById("signInToCheckout")?.classList.add("hidden");
      const vaultChip = document.getElementById("homepage-vault-chip");
      if (vaultChip) vaultChip.classList.replace("hidden", "flex");
      applyWalletVisibility();
      updateCartUI();
    } else {
      // Show Sign In button
      if (authBtn) { authBtn.style.display = "flex"; authBtn.classList.remove("hidden"); }
      if (userMenu) { userMenu.style.display = "none"; userMenu.classList.add("hidden"); }
      document.getElementById("checkoutFormWrapper")?.classList.add("hidden");
      if (cart.length > 0) document.getElementById("signInToCheckout")?.classList.remove("hidden");
      const vaultChip = document.getElementById("homepage-vault-chip");
      if (vaultChip) { vaultChip.classList.remove("flex"); vaultChip.classList.add("hidden"); }
    }
  };
  if (document.readyState === "loading") { document.addEventListener("DOMContentLoaded", run); } else { run(); }
});

// ============================================================
// AUTH FUNCTIONS
// ============================================================
function openAuthModal() {
  document.getElementById("authModal").classList.remove("hidden");
  document.getElementById("authModal").classList.add("flex");
  // Restore persisted consent + sync button states every time the modal opens.
  // DOMContentLoaded already fired if the user navigated away and came back,
  // so we must re-run this here to avoid buttons staying disabled.
  var cb = document.getElementById("policyCheckbox");
  if (cb) {
    try {
      if (localStorage.getItem("cbm_policy_accepted") === "1") {
        cb.checked = true;
      }
    } catch(e) {}
    if (typeof updateAuthBtnState === "function") updateAuthBtnState();
  }
}
function closeAuthModal() {
  document.getElementById("authModal").classList.add("hidden");
  document.getElementById("authModal").classList.remove("flex");
  document.getElementById("authError")?.classList.add("hidden");
}
function toggleAuthMode() {
  isSignUpState = !isSignUpState;
  const map = isSignUpState
    ? { title:"Create Account", sub:"Join Campus Bulkmart today", btn:"Create Account", toggle:"Already have an account?", toggleBtn:"Sign In" }
    : { title:"Welcome Back", sub:"Sign in to your account", btn:"Sign In", toggle:"Don't have an account?", toggleBtn:"Sign Up" };
  document.getElementById("authTitle").textContent = map.title;
  document.getElementById("authSubtitle").textContent = map.sub;
  document.getElementById("authSubmitBtn").textContent = map.btn;
  document.getElementById("authToggleText").textContent = map.toggle;
  document.getElementById("authToggleBtn").textContent = map.toggleBtn;
  document.getElementById("signUpFields").classList.toggle("hidden", !isSignUpState);
  document.getElementById("confirmPasswordWrapper").classList.toggle("hidden", !isSignUpState);
}
function handleGoogleSignIn() {
  const errEl = document.getElementById("authError");
  const policyCb = document.getElementById("policyCheckbox");
  if (policyCb && !policyCb.checked) {
    if (errEl) { errEl.textContent = "Please accept the Privacy Policy and Refund & Return Policy to continue."; errEl.classList.remove("hidden"); }
    return;
  }

  const provider = new firebase.auth.GoogleAuthProvider();
  provider.addScope("email");
  provider.addScope("profile");
  provider.setCustomParameters({ prompt: "select_account" });

  const googleBtn = document.querySelector('[onclick="handleGoogleSignIn()"]');

  if (googleBtn) { googleBtn.disabled = true; googleBtn.style.opacity = "0.6"; }
  if (typeof showAuthLoader === "function") showAuthLoader("Connecting to Google…");

  auth.signInWithPopup(provider)
    .then(() => {
      // ✅ Don't close modal or update UI here.
      // onAuthStateChanged fires next and is the single source of truth.
      if (googleBtn) { googleBtn.disabled = false; googleBtn.style.opacity = ""; }
    })
    .catch(err => {
      if (typeof hideAuthLoader === "function") hideAuthLoader();
      if (googleBtn) { googleBtn.disabled = false; googleBtn.style.opacity = ""; }

      // User closed the popup themselves — silent, no error shown
      if (err.code === "auth/popup-closed-by-user" || err.code === "auth/cancelled-popup-request") return;

      // Popup was blocked by the browser — fall back to redirect
      if (err.code === "auth/popup-blocked") {
        if (typeof showAuthLoader === "function") showAuthLoader("Redirecting to Google…");
        auth.signInWithRedirect(provider).catch(redirectErr => {
          if (typeof hideAuthLoader === "function") hideAuthLoader();
          if (errEl) { errEl.textContent = redirectErr.message.replace("Firebase: ", ""); errEl.classList.remove("hidden"); }
        });
        return;
      }

      // Any other real error — show it
      if (errEl) { errEl.textContent = err.message.replace("Firebase: ", ""); errEl.classList.remove("hidden"); }
    });
}
// ============================================================
// EMAIL DOMAIN TYPO DETECTION
// Catches near-misses of popular providers (e.g. "gmail.co",
// "gmial.com") that pass normal format validation but are
// almost certainly typos. Only used at sign-up time — never at
// sign-in, since an existing account may already use one of
// these domains and must still be able to log back in.
// ============================================================
const POPULAR_EMAIL_DOMAINS = ["gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "icloud.com", "live.com", "aol.com", "protonmail.com"];

function _levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

function findEmailDomainTypo(email) {
  const atIndex = email.lastIndexOf("@");
  if (atIndex === -1) return null;
  const domain = email.slice(atIndex + 1).toLowerCase();
  if (POPULAR_EMAIL_DOMAINS.includes(domain)) return null;

  let closest = null, closestDist = Infinity;
  for (const d of POPULAR_EMAIL_DOMAINS) {
    const dist = _levenshtein(domain, d);
    if (dist < closestDist) { closestDist = dist; closest = d; }
  }
  // Only flag small, likely-typo edit distances — avoids false positives
  // on legitimate but uncommon domains (school/company email, etc.)
  if (closest && closestDist > 0 && closestDist <= 2 && domain.length >= 4) return closest;
  return null;
}

async function handleAuth() {
  const email = document.getElementById("authEmail").value.trim();
  const password = document.getElementById("authPassword").value;
  const errEl = document.getElementById("authError");
  errEl.classList.add("hidden");

  const policyCb = document.getElementById("policyCheckbox");
  if (policyCb && !policyCb.checked) {
    errEl.textContent = "Please accept the Privacy Policy and Refund & Return Policy to continue.";
    errEl.classList.remove("hidden");
    return;
  }

  if (!email || !password) { errEl.textContent = "Please enter email and password."; errEl.classList.remove("hidden"); return; }

  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailPattern.test(email)) { errEl.textContent = "Please enter a valid email address."; errEl.classList.remove("hidden"); return; }

  let username, name;
  if (isSignUpState) {
    username = document.getElementById("authUsername").value.trim();
    name = document.getElementById("authDisplayName").value.trim();
    const confirmPass = document.getElementById("authConfirmPassword").value;
    if (!username || !name) { errEl.textContent = "Please enter your username and full name."; errEl.classList.remove("hidden"); return; }
    if (password.length < 6) { errEl.textContent = "Password must be at least 6 characters."; errEl.classList.remove("hidden"); return; }
    if (password !== confirmPass) { errEl.textContent = "Passwords do not match."; errEl.classList.remove("hidden"); return; }
    const suggestedDomain = findEmailDomainTypo(email);
    if (suggestedDomain) {
      const localPart = email.slice(0, email.lastIndexOf("@"));
      errEl.textContent = `Did you mean ${localPart}@${suggestedDomain}?`;
      errEl.classList.remove("hidden");
      return;
    }
  }

  const submitBtn = document.getElementById("authSubmitBtn");
  if (submitBtn) { submitBtn.disabled = true; submitBtn.style.opacity = "0.6"; }
  if (typeof showAuthLoader === "function") showAuthLoader(isSignUpState ? "Creating your account…" : "Signing in…");
  try {
    if (isSignUpState) {
      const cred = await auth.createUserWithEmailAndPassword(email, password);
      await cred.user.updateProfile({ displayName: name });
      await sb.from("users").insert({ uid: cred.user.uid, username, display_name: name, email });
      // ✅ onAuthStateChanged handles modal close + UI update
      showToast("✅", "Account created! Welcome!");
    } else {
      await auth.signInWithEmailAndPassword(email, password);
      // ✅ onAuthStateChanged handles modal close + UI update
    }
  } catch (err) {
    if (typeof hideAuthLoader === "function") hideAuthLoader();
    errEl.textContent = err.message.replace("Firebase: ", ""); errEl.classList.remove("hidden");
  } finally {
    if (submitBtn) { submitBtn.disabled = false; submitBtn.style.opacity = ""; }
  }
}
async function signOut() {
  await auth.signOut(); toggleUserDropdown(true); showToast("👋", "Signed out successfully");
}
function toggleUserDropdown(forceClose = false) {
  const dropdown = document.getElementById("userDropdown");
  if (!dropdown) return;
  if (forceClose || !dropdown.classList.contains("hidden")) { dropdown.classList.add("hidden"); }
  else { dropdown.classList.remove("hidden"); }
}
document.addEventListener("click", e => {
  const menu = document.getElementById("userMenu");
  const dropdown = document.getElementById("userDropdown");
  if (menu && dropdown && !menu.contains(e.target)) dropdown.classList.add("hidden");
});

// ============================================================
// TOAST
// ============================================================
let toastTimer;
function showToast(icon, msg) {
  const toast = document.getElementById("toast");
  if (!toast) return;
  document.getElementById("toastIcon").textContent = icon;
  document.getElementById("toastMsg").textContent = msg;
  toast.classList.remove("hidden");
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.classList.add("hidden"); toast.classList.remove("show"); }, 3000);
}

// ============================================================
// SEARCH
// ============================================================
function isMobile() { return window.innerWidth < 640; }

function openSearchOverlay() {
  const overlay = document.getElementById("searchOverlay");
  if (!overlay) return;
  overlay.classList.remove("hidden");
  document.body.style.overflow = "hidden";
  setTimeout(() => {
    if (!isMobile()) {
      document.getElementById("searchOverlayInput")?.focus();
      document.getElementById("searchPanelDesktop")?.classList.add("panel-open");
    } else {
      // Reset hint + results mode
      document.getElementById("searchKeyboardHint")?.classList.remove("visible");
      document.getElementById("searchPanelMobile")?.classList.remove("results-mode");
      // Focus the input to immediately show keyboard
      const inp = document.getElementById("searchMobileInput");
      if (inp) {
        inp.focus();
        setTimeout(() => inp.focus(), 100);
        setTimeout(() => inp.focus(), 350);
      }
    }
  }, 10);
}

function closeSearchOverlay() {
  document.getElementById("searchPanelDesktop")?.classList.remove("panel-open");
  document.getElementById("searchPanelMobile")?.classList.remove("sheet-open", "results-mode");
  // Blur input so keyboard dismisses
  document.getElementById("searchMobileInput")?.blur();
  setTimeout(() => {
    document.getElementById("searchOverlay")?.classList.add("hidden");
    document.body.style.overflow = "";
    resetSearchResults();
    resetMobileSearchResults();
    hideQueryEcho();
    const catRow = document.getElementById("searchCatRow");
    if (catRow) catRow.style.display = "none";
    document.getElementById("searchKeyboardHint")?.classList.remove("visible");
    const clearBtn = document.getElementById("searchClearBtn");
    if (clearBtn) clearBtn.style.display = "none";
    const mobileClearBtn = document.getElementById("searchMobileClearBtn");
    if (mobileClearBtn) mobileClearBtn.style.display = "none";
    const inp = document.getElementById("searchMobileInput");
    if (inp) inp.value = "";
  }, 280);
}

function clearSearchInput() {
  const input = document.getElementById("searchOverlayInput");
  if (input) { input.value = ""; input.focus(); }
  resetSearchResults(); hideQueryEcho();
  document.getElementById("searchClearBtn").style.display = "none";
}
function clearMobileSearchInput() {
  const input = document.getElementById("searchMobileInput");
  if (input) { input.value = ""; input.focus(); }
  resetMobileSearchResults(); hideQueryEcho();
  document.getElementById("searchMobileClearBtn").style.display = "none";
}
function showQueryEcho(query, resultCount) {
  if (isMobile()) {
    const echo = document.getElementById("searchQueryEchoMobile");
    const text = document.getElementById("searchQueryTextMobile");
    const count = document.getElementById("searchResultCountMobile");
    if (!echo || !text) return;
    echo.style.display = "block"; text.textContent = query;
    if (count) { count.textContent = resultCount + " found"; count.style.display = resultCount > 0 ? "inline-block" : "none"; }
  } else {
    const echo = document.getElementById("searchQueryEchoDesktopInner");
    const text = document.getElementById("searchQueryTextDesktop");
    const count = document.getElementById("searchResultCountDesktop");
    if (!echo || !text) return;
    echo.style.display = "flex"; text.textContent = query;
    if (count) { count.textContent = resultCount + " result" + (resultCount !== 1 ? "s" : ""); count.style.display = resultCount > 0 ? "inline-block" : "none"; }
  }
}
function hideQueryEcho() {
  const m = document.getElementById("searchQueryEchoMobile"); if (m) m.style.display = "none";
  const d = document.getElementById("searchQueryEchoDesktopInner"); if (d) d.style.display = "none";
}
function resetSearchResults() {
  document.getElementById("searchDefault")?.classList.remove("hidden");
  document.getElementById("searchResultsList")?.classList.add("hidden");
  document.getElementById("searchEmpty")?.classList.add("hidden");
}
function resetMobileSearchResults() {
  document.getElementById("searchDefaultMobile")?.classList.remove("hidden");
  document.getElementById("searchResultsListMobile")?.classList.add("hidden");
  document.getElementById("searchEmptyMobile")?.classList.add("hidden");
}
// ============================================================
// CATALOG PAGE — STICKY SEARCH BAR (products.html only)
// Unlike the search overlay above (which has its own independent results
// dropdown), this filters the on-page #productGrid directly by reusing the
// existing searchQuery + getFilteredProducts()/renderProducts() pipeline —
// so it naturally combines with whichever category tab is active.
// ============================================================
let catalogSearchDebounceTimer;
function handleCatalogSearch(query) {
  const clearBtn = document.getElementById("catalogSearchClear");
  if (clearBtn) clearBtn.style.display = query.trim() ? "flex" : "none";
  clearTimeout(catalogSearchDebounceTimer);
  catalogSearchDebounceTimer = setTimeout(() => {
    searchQuery = query.trim();
    renderProducts();
  }, 120);
}
function clearCatalogSearch() {
  const input = document.getElementById("catalogSearchInput");
  if (input) { input.value = ""; input.focus(); }
  const clearBtn = document.getElementById("catalogSearchClear");
  if (clearBtn) clearBtn.style.display = "none";
  searchQuery = "";
  renderProducts();
}

function handleSearchKeydown(e) { if (e.key === "Escape") closeSearchOverlay(); }
function handleSearchInput(query) {
  const clearBtn = document.getElementById("searchClearBtn");
  if (clearBtn) clearBtn.style.display = query.trim() ? "flex" : "none";
  clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(() => { if (!query.trim()) hideQueryEcho(); runSearch(query.trim()); }, 120);
}
function handleMobileSearchInput(query) {
  const clearBtn = document.getElementById("searchMobileClearBtn");
  if (clearBtn) clearBtn.style.display = query.trim() ? "flex" : "none";
  // Show category chips as soon as user starts typing
  const catRow = document.getElementById("searchCatRow");
  if (catRow) catRow.style.display = query.trim() ? "flex" : "none";
  clearTimeout(mobileSearchDebounceTimer);
  mobileSearchDebounceTimer = setTimeout(() => {
    if (!query.trim()) { hideQueryEcho(); resetMobileSearchResults(); return; }
    runMobileSearch(query.trim());
  }, 120);
}
function scoreProduct(p, q) {
  const name = p.name.toLowerCase();
  const desc = (p.desc || "").toLowerCase();
  const cat  = (p.category || "").toLowerCase().replace(/-/g, " ");
  if (name.includes(q)) return 3;       // name match — top priority
  if (cat.includes(q))  return 2;       // category match — second
  if (desc.includes(q)) return 1;       // desc match — last
  return 0;
}
function runSearch(query) {
  const defaultEl = document.getElementById("searchDefault");
  const listEl = document.getElementById("searchResultsList");
  const emptyEl = document.getElementById("searchEmpty");
  const emptyQueryEl = document.getElementById("searchEmptyQuery");
  if (!query) { resetSearchResults(); hideQueryEcho(); return; }
  const q = query.toLowerCase();
  const results = PRODUCTS
    .filter(p => p.isHidden !== true && scoreProduct(p, q) > 0)
    .sort((a, b) => scoreProduct(b, q) - scoreProduct(a, q));
  defaultEl?.classList.add("hidden");
  showQueryEcho(query, results.length);
  if (results.length === 0) {
    listEl?.classList.add("hidden"); emptyEl?.classList.remove("hidden");
    if (emptyQueryEl) emptyQueryEl.textContent = `No products matching "${query}"`;
    return;
  }
  emptyEl?.classList.add("hidden"); listEl?.classList.remove("hidden");
  listEl.innerHTML = buildResultsHTML(results, query);
}
function runMobileSearch(query) {
  const defaultEl = document.getElementById("searchDefaultMobile");
  const listEl = document.getElementById("searchResultsListMobile");
  const emptyEl = document.getElementById("searchEmptyMobile");
  const emptyQueryEl = document.getElementById("searchEmptyQueryMobile");
  if (!query) { resetMobileSearchResults(); hideQueryEcho(); return; }
  const q = query.toLowerCase();
  const results = PRODUCTS
    .filter(p => p.isHidden !== true && scoreProduct(p, q) > 0)
    .sort((a, b) => scoreProduct(b, q) - scoreProduct(a, q));
  defaultEl?.classList.add("hidden");
  showQueryEcho(query, results.length);
  if (results.length === 0) {
    listEl?.classList.add("hidden"); emptyEl?.classList.remove("hidden");
    if (emptyQueryEl) emptyQueryEl.textContent = `No products matching "${query}"`;
    return;
  }
  emptyEl?.classList.add("hidden"); listEl?.classList.remove("hidden");
  listEl.innerHTML = buildResultsHTML(results, query);
}
function buildResultsHTML(results, query) {
  return results.map(p => {
    const highlightedName = highlightMatch(p.name, query);
    const categoryLabel = (p.category || "").replace(/-/g, " ");
    return `
      <div class="search-result-item flex items-center gap-3 px-4 py-3 hover:bg-blue-50 cursor-pointer transition group"
           onclick="selectSearchResult('${p.id}')">
        <div class="w-12 h-12 sm:w-14 sm:h-14 rounded-xl overflow-hidden flex-shrink-0 bg-gray-100">
          <img src="${p.image || ''}" alt="${p.name}"
            class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
            onerror="this.src='https://placehold.co/56x56/e5e7eb/9ca3af?text=?'">
        </div>
        <div class="flex-1 min-w-0">
          <p class="text-[10px] font-semibold uppercase tracking-wide mb-0.5" style="color:#000080;">${categoryLabel}</p>
          <p class="text-sm font-bold text-gray-800 leading-tight line-clamp-1">${highlightedName}</p>
          <p class="text-xs text-gray-400 line-clamp-1 mt-0.5">${p.desc || ''}</p>
        </div>
        <div class="flex-shrink-0 text-right">
          <p class="text-sm font-black text-gray-900">₦${Number(p.price).toLocaleString()}</p>
          <svg class="w-4 h-4 text-gray-300 ml-auto mt-1 group-hover:text-blue-600 transition" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"/>
          </svg>
        </div>
      </div>`;
  }).join("");
}
function highlightMatch(text, query) {
  if (!query) return text;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text.replace(new RegExp(`(${escaped})`, "gi"), '<mark style="background:#dbeafe;color:#1d4ed8;border-radius:2px;padding:0 1px;">$1</mark>');
}
function selectSearchResult(productId) {
  closeSearchOverlay();
  setTimeout(() => openProductModal(productId), 350);
}

// ============================================================
// SCROLL TO TOP
// ============================================================
window.addEventListener("scroll", () => {
  const topBtn = document.getElementById("topBtn");
  if (topBtn) topBtn.classList.toggle("hidden", window.scrollY < 300);
  topBtn?.classList.toggle("flex", window.scrollY >= 300);
});

// ============================================================
// KEYBOARD SHORTCUTS
// ============================================================
document.addEventListener("keydown", e => {
  if (e.key !== "Enter") return;
  const authModal = document.getElementById("authModal");
  if (authModal && !authModal.classList.contains("hidden")) handleAuth();
});

// ============================================================
// INIT
// ============================================================
document.addEventListener("DOMContentLoaded", () => {
  restoreCartFromStorage();
  setOrderMode("individual");

  // Load products immediately — works if Firestore rules allow public reads.
  loadProductsFromFirestore();
  loadCustomCategories();

  // Safety net: if products still empty after auth resolves
  // (meaning the anonymous read was blocked by Firestore rules), retry.
  auth.onAuthStateChanged(() => {
    setTimeout(() => {
      if (PRODUCTS.length === 0) {
        console.warn("[CampusBulkmart] Products still empty after auth — retrying Firestore load.");
        loadProductsFromFirestore();
      }
    }, 4000);
  });
});