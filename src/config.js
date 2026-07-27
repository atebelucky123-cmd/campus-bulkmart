// ============================================================
// config.js — split from the original script.js (see split-plan notes)
// Firebase/Supabase init, constants, global state. MUST load first — everything else depends on these globals.
// ============================================================

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
