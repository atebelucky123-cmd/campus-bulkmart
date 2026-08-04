// ============================================================
// FIREBASE CONFIG — same as script.js
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
const auth    = firebase.auth();
// Images are stored as plain URLs typed into the form (e.g. Unsplash links) —
// no upload service (Cloudinary removed — was unreliable / not working).

// ============================================================
// SUPABASE CONFIG (Phase 7 of the Firestore→Supabase migration)
// Data storage lives here now. Firebase above is ONLY used for Auth.
// See script.js for the matching client-side setup and explanation
// of the accessToken callback (Firebase-as-third-party-auth for RLS).
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
// SETTINGS HELPERS
// The "settings" table stores each doc as a {key, value(jsonb)} row.
// These two helpers replicate Firestore's .set(data, {merge:true})
// shallow-merge behavior, since Supabase has no built-in equivalent
// for merging into a jsonb column from the client.
// ============================================================
async function getSettingValue(key) {
  const { data, error } = await sb.from("settings").select("value").eq("key", key).maybeSingle();
  if (error) throw error;
  return data ? data.value : null;
}

async function mergeSettingValue(key, partial) {
  const current = (await getSettingValue(key)) || {};
  const merged = { ...current, ...partial };
  const { error } = await sb.from("settings").upsert(
    { key, value: merged, updated_at: new Date().toISOString() },
    { onConflict: "key" }
  );
  if (error) throw error;
}

// ============================================================
// PRODUCT ROW MAPPING (Supabase snake_case <-> app camelCase)
// Same convention as script.js — keeps every existing render/edit
// function in this file working against the same shape as before.
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

// Reverse mapping for writes — only includes keys actually present on
// the input object, so partial updates only ever touch fields the
// caller explicitly set (mirrors Firestore's per-field update() calls).
function _toProductRow(p) {
  const row = {};
  if ("name" in p) row.name = p.name;
  if ("desc" in p) row.description = p.desc;
  if ("image" in p) row.image = p.image;
  if ("category" in p) row.category = p.category;
  if ("price" in p) row.price = p.price;
  if ("costPrice" in p) row.cost_price = p.costPrice;
  if ("marketName" in p) row.market_name = p.marketName;
  if ("isHidden" in p) row.is_hidden = p.isHidden;
  if ("isTopPick" in p) row.is_top_pick = p.isTopPick;
  if ("isService" in p) row.is_service = p.isService;
  if ("allowGroupOrder" in p) row.allow_group_order = p.allowGroupOrder;
  if ("stock" in p) row.stock = p.stock;
  if ("variants" in p) row.variants = p.variants;
  if ("variantGroups" in p) row.variant_groups = p.variantGroups;
  return row;
}

// ============================================================
// ADMIN UID — must match ADMIN_UID in script.js
// ============================================================
const ADMIN_UID = "aq0QC7De1GNIOYVH7qtCDwBEH1I2";

// ============================================================
// STATE
// ============================================================
let allProducts = [];
let selectedProductIds = new Set();   // all products loaded from Firestore
let allCategories = [];  // admin-created categories, from Firestore "categories" collection
let allReviews  = [];   // all reviews loaded from Firestore
let adminProductSearchQuery = ""; // current search query in products tab
let adminSearchDebounceTimer = null;

// ============================================================
// HARDCODED LOCAL PRODUCTS (same as script.js, used as seed)
// These are shown on the products tab even before Firestore loads.
// The admin can also add new ones directly to Firestore.
// ============================================================
const LOCAL_PRODUCTS = [
  { id:"g1",  name:"Premium Rice Bag (Mini Lot)",            price:4500,  category:"groceries",        image:"https://images.unsplash.com/photo-1586201375761-83865001e31c?w=400&q=80", isTopPick:true,  desc:"High-grade stone-free parboiled rice in convenient mini-lots for effortless student cooking and hostel storage." },
  { id:"g2",  name:"Indomie Instant Noodles (Super Pack x5)",price:1800,  category:"groceries",        image:"https://images.unsplash.com/photo-1621996346565-e3dbc646d9a9?w=400&q=80", isTopPick:false, desc:"The quintessential campus fuel pack. Quick preparation, with aromatic seasoning spice packets." },
  { id:"g3",  name:"Spaghetti Carton Lot (Split Pack)",      price:2400,  category:"groceries",        image:"https://images.unsplash.com/photo-1621996346565-e3dbc646d9a9?w=400&q=80", isTopPick:false, desc:"Long-strand easy-boil pasta for quick student stir-fry or late-night study sessions." },
  { id:"s1",  name:"Exams Success Stationery Bundle",        price:1000,  category:"stationeries",     image:"https://images.unsplash.com/photo-1456735190827-d1262f71b8a3?w=400&q=80", isTopPick:true,  desc:"Complete exam-prep set: high-grade pens, pencils, rulers, and erasers." },
  { id:"s2",  name:"Campus Ledger Notebook (Hardcover A5)",  price:2200,  category:"stationeries",     image:"https://images.unsplash.com/photo-1531346878377-a5be20888e57?w=400&q=80", isTopPick:false, desc:"Durable 200-page lined notebook for intensive lecture documentation." },
  { id:"sv1", name:"Nail Tech Custom Setup",                 price:3500,  category:"hostel-services",  image:"https://images.unsplash.com/photo-1604654894610-df63bc536371?w=400&q=80", isTopPick:false, desc:"Professional on-campus nail extension, filing, gel polishing, and custom press-on nail installation." },
  { id:"sv2", name:"Henna Artist Session",                   price:2000,  category:"hostel-services",  image:"https://images.unsplash.com/photo-1604654894610-df63bc536371?w=400&q=80", isTopPick:false, desc:"Beautiful henna designs done right in your hostel." },
  { id:"sv3", name:"Make Up Artist Session",                 price:5000,  category:"hostel-services",  image:"https://images.unsplash.com/photo-1512496015851-a90fb38ba796?w=400&q=80", isTopPick:false, desc:"Professional makeup for events, occasions, or a fresh campus look." },
  { id:"sv4", name:"Lash Tech Appointment",                  price:4000,  category:"hostel-services",  image:"https://images.unsplash.com/photo-1512496015851-a90fb38ba796?w=400&q=80", isTopPick:false, desc:"Lash extensions and fills done professionally in your hostel room." },
  { id:"sv5", name:"Cooked Meals Dispatch",                  price:2500,  category:"hostel-services",  image:"https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400&q=80", isTopPick:true,  desc:"Freshly prepared native rice, swallow, or soups delivered to you." },
  { id:"sv6", name:"Gourmet Toast Bread Slot",               price:1200,  category:"hostel-services",  image:"https://images.unsplash.com/photo-1484723091739-30990bf21c4c?w=400&q=80", isTopPick:false, desc:"Hot double-layered toasted bread loaded with egg, sardines, or cheese." },
];

// ============================================================
// AUTH GUARD — runs immediately on page load
// ============================================================
auth.onAuthStateChanged(user => {
  const checkScreen = document.getElementById("authCheckScreen");
  const adminApp    = document.getElementById("adminApp");

  if (!user || user.uid !== ADMIN_UID) {
    // Not logged in or not admin — redirect immediately
    window.location.href = "index.html";
    return;
  }

  // ✅ Admin confirmed — show the panel
  checkScreen.classList.add("hidden");
  adminApp.classList.remove("hidden");
  adminApp.classList.add("flex");

  // Show admin name in nav
  const badge = document.getElementById("adminNameBadge");
  if (badge) {
    const name = user.displayName || user.email?.split("@")[0] || "Admin";
    badge.textContent = `👤 ${name}`;
    badge.classList.remove("hidden");
  }

  // Load data
  loadAllProducts();
  loadAllReviews();
  loadAllOrders();
  loadWalletSettingAdmin();
  loadCategories();
});

// ============================================================
// WALLET TOGGLE (store setting — settings/appConfig.walletEnabled)
// Read by script.js on the storefront to hide/show wallet checkout.
// ============================================================
let walletSettingEnabled = true;

function updateWalletToggleUI(enabled) {
  const btn   = document.getElementById("walletToggleBtn");
  const knob  = document.getElementById("walletToggleKnob");
  const label = document.getElementById("walletToggleLabel");
  if (label) label.textContent = enabled ? "On" : "Off";
  if (knob)  knob.style.transform = enabled ? "translateX(1.375rem)" : "translateX(0.125rem)";
  if (btn)   btn.style.background = enabled ? "#000080" : "#9ca3af";
}

async function loadWalletSettingAdmin() {
  try {
    const value = await getSettingValue("appConfig");
    walletSettingEnabled = value ? (value.walletEnabled !== false) : true;
  } catch (e) {
    console.warn("[Admin] Could not load wallet setting, defaulting to enabled:", e.message);
    walletSettingEnabled = true;
  }
  updateWalletToggleUI(walletSettingEnabled);
}

async function toggleWalletSetting() {
  const btn = document.getElementById("walletToggleBtn");
  if (btn) btn.disabled = true;

  const next = !walletSettingEnabled;
  try {
    await mergeSettingValue("appConfig", { walletEnabled: next });
    walletSettingEnabled = next;
    updateWalletToggleUI(walletSettingEnabled);
    showAdminToast(next ? "✅" : "⏸️", `Wallet checkout turned ${next ? "on" : "off"}`);
  } catch (e) {
    console.error("[Admin] Failed to update wallet setting:", e);
    showAdminToast("❌", "Could not update wallet setting — check your connection and try again");
  } finally {
    if (btn) btn.disabled = false;
  }
}

// ============================================================
// SITE CONTENT — Hero Banner editor (settings/siteContent)
// Same doc/shape script.js reads on the storefront. Falls back
// to these defaults if the doc doesn't exist yet (first time
// the admin opens the Content tab).
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
  lowerBannerSubtext: "Join hundreds of LASUCOM students already ordering in bulk with Campus Bulkmart.",
  lowerBannerButtonText: "Shop Now →",
  lowerBannerButtonLink: "products.html",
  footerDisclaimer: "Disclaimer: Campus Bulkmart is an independent, student-run delivery platform. We are not officially affiliated with, endorsed by, or partnered with LASU (Lagos State University) or LASUCOM (Lagos State University College of Medicine), or their respective managements. All services, logistics, and fulfillments are managed entirely by Campus Bulkmart.",
  footerWhatsapp: "+2349169618353",
  footerEmail: "atebelucky123@gmail.com",
  footerHours: "Available daily 8AM – 8PM",
  footerInstagram: "",
  footerTiktok: "",
  footerTwitter: "",
  footerFacebook: "",
  aboutHeroTitle: "Our Story",
  aboutHeroSubtitle: "From a simple idea to LASUCOM's most trusted campus delivery platform — here's how Campus Bulkmart was born.",
  aboutOriginParagraph1: "Every LASUCOM student knows the struggle — you're mid-assignment, your data runs out, your toiletries are empty, and the market feels a world away. **Campus Bulkmart** was born from exactly that frustration.",
  aboutOriginParagraph2: "We built a digital procurement platform that acts as your personal campus runner — you browse, you order, we go to the market and deliver straight to your hostel door. No hidden fees, no long waits, no stress.",
  aboutOriginParagraph3: "What started as a simple idea has grown into a full-service campus superstore serving students across all LASUCOM hostels daily.",
  aboutMissionQuote: "Make campus life easier — one delivery at a time.",
  aboutMissionText: "Our mission is simple: eliminate the friction between LASUCOM students and the essentials they need. We believe no student should lose study time to market runs or go without because the market is far."
};

let siteContentLoaded = false;

// Escapes HTML then turns **text** into <strong>text</strong> — mirrors the
// parser in about.html so the admin preview matches what visitors see.
function mdBoldToHtml(str) {
  const escaped = String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return escaped.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
}

function populateHeroForm(content) {
  const c = content || {};
  const stats = (Array.isArray(c.heroStats) && c.heroStats.length === 4) ? c.heroStats : SITE_CONTENT_DEFAULTS.heroStats;

  const line1El = document.getElementById("heroLine1Input");
  const line2El = document.getElementById("heroLine2Input");
  const subEl   = document.getElementById("heroSubtextInput");
  if (line1El) line1El.value = c.heroHeadlineLine1 || SITE_CONTENT_DEFAULTS.heroHeadlineLine1;
  if (line2El) line2El.value = c.heroHeadlineLine2 || SITE_CONTENT_DEFAULTS.heroHeadlineLine2;
  if (subEl)   subEl.value   = c.heroSubtext || SITE_CONTENT_DEFAULTS.heroSubtext;

  stats.forEach((stat, i) => {
    const valEl = document.getElementById(`heroStat${i + 1}ValueInput`);
    const lblEl = document.getElementById(`heroStat${i + 1}LabelInput`);
    if (valEl) valEl.value = stat.value;
    if (lblEl) lblEl.value = stat.label;
  });

  const bTitleEl = document.getElementById("lowerBannerTitleInput");
  const bSubEl   = document.getElementById("lowerBannerSubtextInput");
  const bBtnEl   = document.getElementById("lowerBannerButtonTextInput");
  const bLinkEl  = document.getElementById("lowerBannerButtonLinkInput");
  if (bTitleEl) bTitleEl.value = c.lowerBannerTitle || SITE_CONTENT_DEFAULTS.lowerBannerTitle;
  if (bSubEl)   bSubEl.value   = c.lowerBannerSubtext || SITE_CONTENT_DEFAULTS.lowerBannerSubtext;
  if (bBtnEl)   bBtnEl.value   = c.lowerBannerButtonText || SITE_CONTENT_DEFAULTS.lowerBannerButtonText;
  if (bLinkEl)  bLinkEl.value  = c.lowerBannerButtonLink || SITE_CONTENT_DEFAULTS.lowerBannerButtonLink;

  const fdEl  = document.getElementById("footerDisclaimerInput");
  const fwEl  = document.getElementById("footerWhatsappInput");
  const feEl  = document.getElementById("footerEmailInput");
  const fhEl  = document.getElementById("footerHoursInput");
  const figEl = document.getElementById("footerInstagramInput");
  const fttEl = document.getElementById("footerTiktokInput");
  const ftwEl = document.getElementById("footerTwitterInput");
  const ffbEl = document.getElementById("footerFacebookInput");
  if (fdEl)  fdEl.value  = c.footerDisclaimer || SITE_CONTENT_DEFAULTS.footerDisclaimer;
  if (fwEl)  fwEl.value  = c.footerWhatsapp || SITE_CONTENT_DEFAULTS.footerWhatsapp;
  if (feEl)  feEl.value  = c.footerEmail || SITE_CONTENT_DEFAULTS.footerEmail;
  if (fhEl)  fhEl.value  = c.footerHours || SITE_CONTENT_DEFAULTS.footerHours;
  if (figEl) figEl.value = c.footerInstagram || "";
  if (fttEl) fttEl.value = c.footerTiktok || "";
  if (ftwEl) ftwEl.value = c.footerTwitter || "";
  if (ffbEl) ffbEl.value = c.footerFacebook || "";

  const atEl  = document.getElementById("aboutHeroTitleInput");
  const asEl  = document.getElementById("aboutHeroSubtitleInput");
  const ap1El = document.getElementById("aboutOriginP1Input");
  const ap2El = document.getElementById("aboutOriginP2Input");
  const ap3El = document.getElementById("aboutOriginP3Input");
  const amqEl = document.getElementById("aboutMissionQuoteInput");
  const amtEl = document.getElementById("aboutMissionTextInput");
  if (atEl)  atEl.value  = c.aboutHeroTitle || SITE_CONTENT_DEFAULTS.aboutHeroTitle;
  if (asEl)  asEl.value  = c.aboutHeroSubtitle || SITE_CONTENT_DEFAULTS.aboutHeroSubtitle;
  if (ap1El) ap1El.value = c.aboutOriginParagraph1 || SITE_CONTENT_DEFAULTS.aboutOriginParagraph1;
  if (ap2El) ap2El.value = c.aboutOriginParagraph2 || SITE_CONTENT_DEFAULTS.aboutOriginParagraph2;
  if (ap3El) ap3El.value = c.aboutOriginParagraph3 || SITE_CONTENT_DEFAULTS.aboutOriginParagraph3;
  if (amqEl) amqEl.value = c.aboutMissionQuote || SITE_CONTENT_DEFAULTS.aboutMissionQuote;
  if (amtEl) amtEl.value = c.aboutMissionText || SITE_CONTENT_DEFAULTS.aboutMissionText;

  updateHeroPreview();
}

function readHeroFormValues() {
  const val = id => (document.getElementById(id)?.value || "").trim();
  const stats = [1, 2, 3, 4].map(i => ({
    value: val(`heroStat${i}ValueInput`) || SITE_CONTENT_DEFAULTS.heroStats[i - 1].value,
    label: val(`heroStat${i}LabelInput`) || SITE_CONTENT_DEFAULTS.heroStats[i - 1].label
  }));
  return {
    heroHeadlineLine1: val("heroLine1Input") || SITE_CONTENT_DEFAULTS.heroHeadlineLine1,
    heroHeadlineLine2: val("heroLine2Input") || SITE_CONTENT_DEFAULTS.heroHeadlineLine2,
    heroSubtext: val("heroSubtextInput") || SITE_CONTENT_DEFAULTS.heroSubtext,
    heroStats: stats,
    lowerBannerTitle: val("lowerBannerTitleInput") || SITE_CONTENT_DEFAULTS.lowerBannerTitle,
    lowerBannerSubtext: val("lowerBannerSubtextInput") || SITE_CONTENT_DEFAULTS.lowerBannerSubtext,
    lowerBannerButtonText: val("lowerBannerButtonTextInput") || SITE_CONTENT_DEFAULTS.lowerBannerButtonText,
    lowerBannerButtonLink: val("lowerBannerButtonLinkInput") || SITE_CONTENT_DEFAULTS.lowerBannerButtonLink,
    footerDisclaimer: val("footerDisclaimerInput") || SITE_CONTENT_DEFAULTS.footerDisclaimer,
    footerWhatsapp: val("footerWhatsappInput") || SITE_CONTENT_DEFAULTS.footerWhatsapp,
    footerEmail: val("footerEmailInput") || SITE_CONTENT_DEFAULTS.footerEmail,
    footerHours: val("footerHoursInput") || SITE_CONTENT_DEFAULTS.footerHours,
    footerInstagram: val("footerInstagramInput"),
    footerTiktok: val("footerTiktokInput"),
    footerTwitter: val("footerTwitterInput"),
    footerFacebook: val("footerFacebookInput"),
    aboutHeroTitle: val("aboutHeroTitleInput") || SITE_CONTENT_DEFAULTS.aboutHeroTitle,
    aboutHeroSubtitle: val("aboutHeroSubtitleInput") || SITE_CONTENT_DEFAULTS.aboutHeroSubtitle,
    aboutOriginParagraph1: val("aboutOriginP1Input") || SITE_CONTENT_DEFAULTS.aboutOriginParagraph1,
    aboutOriginParagraph2: val("aboutOriginP2Input") || SITE_CONTENT_DEFAULTS.aboutOriginParagraph2,
    aboutOriginParagraph3: val("aboutOriginP3Input") || SITE_CONTENT_DEFAULTS.aboutOriginParagraph3,
    aboutMissionQuote: val("aboutMissionQuoteInput") || SITE_CONTENT_DEFAULTS.aboutMissionQuote,
    aboutMissionText: val("aboutMissionTextInput") || SITE_CONTENT_DEFAULTS.aboutMissionText
  };
}

function updateHeroPreview() {
  const c = readHeroFormValues();
  const line1El = document.getElementById("heroPreviewLine1");
  const line2El = document.getElementById("heroPreviewLine2");
  const subEl   = document.getElementById("heroPreviewSubtext");
  if (line1El) line1El.textContent = c.heroHeadlineLine1;
  if (line2El) line2El.textContent = c.heroHeadlineLine2;
  if (subEl)   subEl.textContent = c.heroSubtext;
  c.heroStats.forEach((stat, i) => {
    const valEl = document.getElementById(`heroPreviewStat${i + 1}Value`);
    const lblEl = document.getElementById(`heroPreviewStat${i + 1}Label`);
    if (valEl) valEl.textContent = stat.value;
    if (lblEl) lblEl.textContent = stat.label;
  });

  const bTitleEl = document.getElementById("lowerBannerPreviewTitle");
  const bSubEl   = document.getElementById("lowerBannerPreviewSubtext");
  const bBtnEl   = document.getElementById("lowerBannerPreviewBtnText");
  if (bTitleEl) bTitleEl.textContent = c.lowerBannerTitle;
  if (bSubEl)   bSubEl.textContent = c.lowerBannerSubtext;
  if (bBtnEl)   bBtnEl.textContent = c.lowerBannerButtonText;

  const fdPrev = document.getElementById("footerPreviewDisclaimer");
  const fwPrev = document.getElementById("footerPreviewWhatsapp");
  const fePrev = document.getElementById("footerPreviewEmail");
  const fhPrev = document.getElementById("footerPreviewHours");
  if (fdPrev) fdPrev.textContent = c.footerDisclaimer;
  if (fwPrev) fwPrev.textContent = c.footerWhatsapp;
  if (fePrev) fePrev.textContent = c.footerEmail;
  if (fhPrev) fhPrev.textContent = c.footerHours;

  const socialPrev = document.getElementById("footerPreviewSocial");
  if (socialPrev) {
    const socials = [
      { url: c.footerInstagram, glyph: "IG", label: "Instagram" },
      { url: c.footerTiktok,    glyph: "TT", label: "TikTok" },
      { url: c.footerTwitter,   glyph: "X",  label: "X / Twitter" },
      { url: c.footerFacebook,  glyph: "f",  label: "Facebook" }
    ];
    socialPrev.innerHTML = "";
    const active = socials.filter(s => s.url);
    if (active.length === 0) {
      socialPrev.innerHTML = '<span style="font-size:11px; color:#9ca3af;">No social links added yet</span>';
    } else {
      active.forEach(s => {
        const span = document.createElement("span");
        span.title = s.label;
        span.textContent = s.glyph;
        span.style.cssText = "width:28px;height:28px;border-radius:50%;background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.2);display:flex;align-items:center;justify-content:center;color:#e5e7eb;font-size:10px;font-weight:800;";
        socialPrev.appendChild(span);
      });
    }
  }

  const atPrev  = document.getElementById("aboutPreviewTitle");
  const asPrev  = document.getElementById("aboutPreviewSubtitle");
  const ap1Prev = document.getElementById("aboutPreviewOriginP1");
  const ap2Prev = document.getElementById("aboutPreviewOriginP2");
  const ap3Prev = document.getElementById("aboutPreviewOriginP3");
  const amqPrev = document.getElementById("aboutPreviewMissionQuote");
  const amtPrev = document.getElementById("aboutPreviewMissionText");
  if (atPrev)  atPrev.textContent  = c.aboutHeroTitle;
  if (asPrev)  asPrev.textContent  = c.aboutHeroSubtitle;
  if (ap1Prev) ap1Prev.innerHTML   = mdBoldToHtml(c.aboutOriginParagraph1);
  if (ap2Prev) ap2Prev.innerHTML   = mdBoldToHtml(c.aboutOriginParagraph2);
  if (ap3Prev) ap3Prev.innerHTML   = mdBoldToHtml(c.aboutOriginParagraph3);
  if (amqPrev) amqPrev.textContent = `"${c.aboutMissionQuote}"`;
  if (amtPrev) amtPrev.innerHTML   = mdBoldToHtml(c.aboutMissionText);
}

async function loadSiteContentAdmin() {
  try {
    const value = await getSettingValue("siteContent");
    populateHeroForm(value);
  } catch (e) {
    console.warn("[Admin] Could not load site content, using defaults:", e.message);
    populateHeroForm(null);
  }
  siteContentLoaded = true;
}

async function saveHeroContent() {
  const btn = document.getElementById("heroSaveBtn");
  if (btn) { btn.disabled = true; btn.textContent = "Saving…"; }
  try {
    const content = readHeroFormValues();
    await mergeSettingValue("siteContent", content);
    populateHeroForm(content);
    showAdminToast("✅", "Home page content updated");
  } catch (e) {
    console.error("[Admin] Failed to save site content:", e);
    showAdminToast("❌", "Could not save changes — check your connection and try again");
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = "💾 Save Changes"; }
  }
}

async function resetHeroContent() {
  if (!confirm("Reset the hero banner, lower banner, footer, and About page text back to the original default copy? This saves immediately.")) return;
  const btn = document.getElementById("heroResetBtn");
  if (btn) btn.disabled = true;
  try {
    await mergeSettingValue("siteContent", SITE_CONTENT_DEFAULTS);
    populateHeroForm(SITE_CONTENT_DEFAULTS);
    showAdminToast("✅", "Home page content reset to default");
  } catch (e) {
    console.error("[Admin] Failed to reset site content:", e);
    showAdminToast("❌", "Could not reset — check your connection and try again");
  } finally {
    if (btn) btn.disabled = false;
  }
}

// ============================================================
// MOBILE MENU DRAWER (hamburger button)
// Uses .admin-drawer / .admin-drawer-backdrop (plain CSS in
// admin.css) rather than Tailwind utilities — see admin.css for why.
// ============================================================
let adminDrawerCloseTimeout = null;

function openAdminMobileDrawer() {
  const backdrop = document.getElementById("adminMobileDrawerBackdrop");
  const drawer   = document.getElementById("adminMobileDrawer");
  if (!backdrop || !drawer) return;

  // Cancel any pending "hide after close animation" left over from a
  // previous toggle, so rapid open/close/open clicks can't get stuck.
  if (adminDrawerCloseTimeout) {
    clearTimeout(adminDrawerCloseTimeout);
    adminDrawerCloseTimeout = null;
  }

  backdrop.classList.remove("hidden");
  // Double rAF forces the browser to paint the "hidden" removal first,
  // so the transition reliably plays even when re-opening immediately
  // after a close.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      backdrop.classList.add("show");
      drawer.classList.add("open");
    });
  });
  document.body.classList.add("overflow-hidden");
}

function closeAdminMobileDrawer() {
  const backdrop = document.getElementById("adminMobileDrawerBackdrop");
  const drawer   = document.getElementById("adminMobileDrawer");
  if (!backdrop || !drawer) return;

  if (adminDrawerCloseTimeout) clearTimeout(adminDrawerCloseTimeout);

  drawer.classList.remove("open");
  backdrop.classList.remove("show");
  document.body.classList.remove("overflow-hidden");
  adminDrawerCloseTimeout = setTimeout(() => {
    backdrop.classList.add("hidden");
    adminDrawerCloseTimeout = null;
  }, 300); // matches the transform transition duration in admin.css
}

// ============================================================
// SIGN OUT
// ============================================================
function adminSignOut() {
  auth.signOut().then(() => {
    window.location.href = "index.html";
  });
}

// ============================================================
// TAB SWITCHING
// ============================================================
function switchTab(tabName, clickedBtn) {
  // Hide all tabs
  document.querySelectorAll(".admin-tab").forEach(t => t.classList.add("hidden"));
  // Show the selected one
  document.getElementById(`tab-${tabName}`)?.classList.remove("hidden");

  // Desktop sidebar buttons
  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.classList.remove("active", "text-white");
    btn.classList.add("text-gray-700", "hover:bg-gray-100");
  });

  // Mobile tab bar buttons
  document.querySelectorAll(".mobile-tab").forEach(btn => {
    btn.classList.remove("active-mobile", "text-brandBlue");
    btn.classList.add("text-gray-400");
  });

  // Highlight clicked
  if (clickedBtn) {
    clickedBtn.classList.add("active");
    clickedBtn.classList.remove("text-gray-700", "hover:bg-gray-100", "text-gray-400");
    // For mobile tabs, also add active-mobile for SVG icon coloring
    if (clickedBtn.classList.contains("mobile-tab")) {
      clickedBtn.classList.add("active-mobile");
    }
  }
  if (tabName === "reviews") renderAdminReviews();
  if (tabName === "orders") renderAdminOrders();
  if (tabName === "services") renderAdminServices();
  if (tabName === "users") { /* ready on demand */ }
  if (tabName === "content" && !siteContentLoaded) loadSiteContentAdmin();

  // Contextual category preset: if coming from products tab with a filter active, preset Add Product category
  if (tabName === "add-product") {
    const catFilter = document.getElementById("productCatFilter")?.value;
    if (catFilter && catFilter !== "all") {
      const sel = document.getElementById("newCategory");
      if (sel) sel.value = catFilter;
    }
  }
}

// ============================================================
// LOAD ALL PRODUCTS (Firestore + local merge)
// ============================================================
function loadAllProducts() {
  sb.from("products").select("*")
    .then(({ data, error }) => {
      if (error) throw error;
      allProducts = (data || []).map(_mapProductRow);
      updateStats();
      renderAdminProducts();
    })
    .catch((err) => {
      // Fallback to local demo data only if Supabase is genuinely unreachable —
      // logged clearly so this doesn't silently mask a real problem.
      console.error("[Admin] Could not load products from Supabase — falling back to LOCAL_PRODUCTS demo data. Reason:", err);
      allProducts = [...LOCAL_PRODUCTS];
      updateStats();
      renderAdminProducts();
    });
}

// ============================================================
// CATEGORY MANAGEMENT
// Admin-created categories live in Firestore "categories" collection:
// { name, slug, emoji, order, createdAt }. The 3 built-in categories
// (groceries, stationeries, hostel-services) are NOT stored here —
// they're baked into the product forms already. This collection only
// holds extra categories the admin adds on top of those.
// script.js reads this same collection (read-only) to render the
// matching tabs on the storefront home page.
// ============================================================
function slugifyCategoryName(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

function loadCategories() {
  sb.from("categories").select("*").order("sort_order", { ascending: true })
    .then(({ data, error }) => {
      if (error) throw error;
      allCategories = (data || []).map(row => ({
        id: row.id, name: row.name, slug: row.slug, emoji: row.emoji, createdAt: row.created_at
      }));
      renderCategoryManager();
      populateCategoryDropdowns();
    })
    .catch(err => {
      console.warn("[Categories] Could not load categories:", err.message);
    });
}

function renderCategoryManager() {
  const list = document.getElementById("categoryManagerList");
  if (!list) return;

  if (allCategories.length === 0) {
    list.innerHTML = `<p class="text-xs text-gray-400 py-2">No custom categories yet — add one below.</p>`;
    return;
  }

  list.innerHTML = allCategories.map(cat => `
    <div class="flex items-center justify-between gap-2 py-2 border-b border-gray-50 last:border-0">
      <span class="text-sm">${cat.emoji || "🏷️"} <span class="font-semibold text-gray-800">${escapeHtml(cat.name)}</span>
        <span class="text-gray-400 text-xs">(${escapeHtml(cat.slug)})</span></span>
      <button onclick="deleteCategory('${cat.id}')" class="text-red-500 hover:text-red-700 text-xs font-semibold">🗑️ Delete</button>
    </div>
  `).join("");
}

async function addCategory() {
  const nameInput  = document.getElementById("newCategoryName");
  const emojiInput = document.getElementById("newCategoryEmoji");
  const errEl      = document.getElementById("categoryError");

  const name  = (nameInput?.value || "").trim();
  const emoji = (emojiInput?.value || "").trim() || "🏷️";

  if (errEl) errEl.classList.add("hidden");

  if (!name) {
    if (errEl) { errEl.textContent = "Please enter a category name."; errEl.classList.remove("hidden"); }
    return;
  }

  const slug = slugifyCategoryName(name);
  const RESERVED = ["groceries", "stationeries", "hostel-services", "top-picks", "all"];
  if (RESERVED.includes(slug)) {
    if (errEl) { errEl.textContent = "That category already exists by default."; errEl.classList.remove("hidden"); }
    return;
  }
  if (allCategories.some(c => c.slug === slug)) {
    if (errEl) { errEl.textContent = "A category with that name already exists."; errEl.classList.remove("hidden"); }
    return;
  }

  try {
    const newId = (crypto.randomUUID ? crypto.randomUUID() : `cat_${Date.now()}_${Math.random().toString(36).slice(2)}`);
    const { error } = await sb.from("categories").insert({
      id: newId,
      name,
      slug,
      emoji,
      sort_order: allCategories.length
      // created_at: Postgres column default (now()) handles this
    });
    if (error) throw error;
    nameInput.value = "";
    emojiInput.value = "";
    showAdminToast("✅", `"${name}" category added`);
    loadCategories();
  } catch (e) {
    if (errEl) { errEl.textContent = "Failed to add category: " + e.message; errEl.classList.remove("hidden"); }
  }
}

async function deleteCategory(id) {
  const cat = allCategories.find(c => c.id === id);
  if (!cat) return;

  const inUse = allProducts.some(p => p.category === cat.slug);
  const warning = inUse
    ? `Delete "${cat.name}"? Some products are still tagged with this category — they won't be deleted, but the tab will disappear from the home page.`
    : `Delete "${cat.name}"?`;
  if (!confirm(warning)) return;

  try {
    const { error } = await sb.from("categories").delete().eq("id", id);
    if (error) throw error;
    showAdminToast("✅", `"${cat.name}" category deleted`);
    loadCategories();
  } catch (e) {
    showAdminToast("❌", "Failed to delete category: " + e.message);
  }
}

// Appends admin-created categories as extra <option> entries onto the
// existing hardcoded selects, so they can be assigned to products.
function populateCategoryDropdowns() {
  const selectIds = ["newCategory", "editCategory", "productCatFilter"];
  selectIds.forEach(id => {
    const sel = document.getElementById(id);
    if (!sel) return;
    // Remove previously-injected custom options before re-adding
    sel.querySelectorAll("option[data-custom-category]").forEach(opt => opt.remove());
    allCategories.forEach(cat => {
      const opt = document.createElement("option");
      opt.value = cat.slug;
      opt.textContent = `${cat.emoji || "🏷️"} ${cat.name}`;
      opt.setAttribute("data-custom-category", "1");
      sel.appendChild(opt);
    });
  });
}


// ============================================================
// MULTI-SELECT & BULK DELETE
// ============================================================
function toggleProductSelect(productId, checked) {
  if (checked) {
    selectedProductIds.add(productId);
  } else {
    selectedProductIds.delete(productId);
  }
  updateBulkDeleteBar();
  syncSelectAllCheckbox();
}

function toggleSelectAll(checked) {
  const checkboxes = document.querySelectorAll(".product-checkbox");
  checkboxes.forEach(cb => {
    cb.checked = checked;
    if (checked) selectedProductIds.add(cb.value);
    else selectedProductIds.delete(cb.value);
  });
  updateBulkDeleteBar();
}

function syncSelectAllCheckbox() {
  const all = document.querySelectorAll(".product-checkbox");
  const checked = document.querySelectorAll(".product-checkbox:checked");
  const selectAll = document.getElementById("selectAllCheckbox");
  if (!selectAll) return;
  if (all.length === 0) { selectAll.checked = false; selectAll.indeterminate = false; return; }
  if (checked.length === all.length) { selectAll.checked = true; selectAll.indeterminate = false; }
  else if (checked.length === 0) { selectAll.checked = false; selectAll.indeterminate = false; }
  else { selectAll.checked = false; selectAll.indeterminate = true; }
}

function updateBulkDeleteBar() {
  const bar = document.getElementById("bulkDeleteBar");
  const countEl = document.getElementById("bulkDeleteCount");
  if (!bar) return;
  const count = selectedProductIds.size;
  if (count > 0) {
    bar.classList.remove("hidden");
    bar.classList.add("flex");
    if (countEl) countEl.textContent = count;
  } else {
    bar.classList.remove("flex");
    bar.classList.add("hidden");
  }
}

function confirmBulkDelete() {
  const count = selectedProductIds.size;
  if (count === 0) return;
  const msg = document.getElementById("deleteModalMsg");
  if (msg) msg.textContent = `${count} product${count > 1 ? 's' : ''} will be permanently deleted. This cannot be undone.`;
  // Snapshot the selected IDs immediately so they can't be cleared before confirm
  const idsToDelete = new Set(selectedProductIds);
  pendingDeleteFn = () => executeBulkDelete(idsToDelete);
  const btn = document.getElementById("deleteConfirmBtn");
  if (btn) btn.onclick = () => executeBulkDelete(idsToDelete);
  openDeleteModal();
}

async function executeBulkDelete(idsToDelete) {
  closeDeleteModal();
  const ids = [...(idsToDelete || selectedProductIds)];
  let deleted = 0;
  for (const id of ids) {
    try {
      const { error } = await sb.from("products").delete().eq("id", id);
      if (error) throw error;
      deleted++;
    } catch(e) { /* already gone */ }
  }
  const idSet = new Set(ids);
  allProducts = allProducts.filter(p => !idSet.has(p.id));
  selectedProductIds.clear();
  updateBulkDeleteBar();
  updateStats();
  renderAdminProducts();
  showAdminToast("🗑️", `${deleted} product${deleted > 1 ? 's' : ''} deleted`);
}

// ============================================================
// RENDER PRODUCTS TABLE
// ============================================================
function renderAdminProducts() {
  selectedProductIds.clear();
  updateBulkDeleteBar();
  const catFilter = document.getElementById("productCatFilter")?.value || "all";
  const loading   = document.getElementById("productLoadingState");
  const wrapper   = document.getElementById("productTableWrapper");
  const tbody     = document.getElementById("productTableBody");
  const emptyRow  = document.getElementById("productEmptyRow");

  loading?.classList.add("hidden");

  // Show table on desktop (md+), mobile cards on mobile — hide the other.
  // admin-mobile.html has no #productTableWrapper at all (mobile-only file),
  // so fall back to cards unconditionally there rather than trusting a width
  // check that can get out of sync and cause the wide table to flash on-screen.
  const isMobile = !wrapper || window.innerWidth < 768;
  const mobileCardsEl = document.getElementById("productMobileCards");
  const mobileEmptyEl = document.getElementById("productMobileEmpty");

  if (isMobile) {
    wrapper?.classList.add("hidden");
    mobileCardsEl?.classList.remove("hidden");
  } else {
    wrapper?.classList.remove("hidden");
    // Completely hide and clear mobile cards on desktop
    if (mobileCardsEl) { mobileCardsEl.classList.add("hidden"); mobileCardsEl.innerHTML = ""; }
    if (mobileEmptyEl) mobileEmptyEl.classList.add("hidden");
  }

  let filtered = catFilter === "all"
    ? allProducts
    : allProducts.filter(p => p.category === catFilter);

  // Apply search query filter
  if (adminProductSearchQuery) {
    const q = adminProductSearchQuery.toLowerCase();
    filtered = filtered.filter(p =>
      p.name.toLowerCase().includes(q) ||
      (p.desc || "").toLowerCase().includes(q) ||
      (p.category || "").toLowerCase().replace(/-/g, " ").includes(q)
    );
  }

  // ---- Desktop table ----
  if (filtered.length === 0) {
    tbody.innerHTML = "";
    emptyRow?.classList.remove("hidden");
  } else {
    emptyRow?.classList.add("hidden");
  }

  if (filtered.length > 0) {
  tbody.innerHTML = filtered.map(p => `
    <tr class="product-row border-b border-gray-50 transition" id="row-${p.id}">
      <td class="px-4 py-3 w-8">
        <input type="checkbox" class="product-checkbox w-4 h-4 rounded cursor-pointer" style="accent-color:#000080;"
          value="${p.id}" onchange="toggleProductSelect('${p.id}', this.checked)">
      </td>
      <td class="px-4 py-3">
        <div class="flex items-center gap-3">
          <img src="${p.image || ''}" alt="${p.name}"
            class="w-10 h-10 rounded-lg object-cover flex-shrink-0 bg-gray-100"
            onerror="this.src='https://placehold.co/80x80/e5e7eb/9ca3af?text=?'">
          <div class="min-w-0">
            <p class="font-semibold text-gray-800 text-xs leading-tight line-clamp-2">${p.name}</p>
            ${p.isTopPick ? '<span class="text-[10px] font-bold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded-full">⚡ Top Pick</span>' : ''}
          </div>
        </div>
      </td>
      <td class="px-4 py-3 hidden sm:table-cell">
        <span class="text-xs text-gray-500 capitalize">${(p.category || '').replace(/-/g,' ')}</span>
      </td>
      <td class="px-4 py-3">
        <span class="font-bold text-gray-800 text-sm">₦${Number(p.price || 0).toLocaleString()}</span>
      </td>
      <td class="px-4 py-3 hidden md:table-cell">
        <span class="text-xs ${p.isTopPick ? 'text-green-600' : 'text-gray-300'}">${p.isTopPick ? '✓ Yes' : '— No'}</span>
      </td>
      <td class="px-4 py-3 hidden md:table-cell">
        <span class="text-xs ${p.allowGroupOrder !== false ? 'text-green-600' : 'text-gray-300'}">${p.allowGroupOrder !== false ? '✓ Yes' : '— No'}</span>
      </td>
      <td class="px-4 py-3">
        <div class="flex items-center gap-2 justify-end">
          <button onclick="openAdminPreviewModal('${p.id}')"
            class="text-xs font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-lg transition">
            View
          </button>
          <button onclick="openEditModal('${p.id}')"
            class="text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition">
            Edit
          </button>
          <button onclick="cloneProduct('${p.id}')" title="Clone this product"
            class="text-xs font-semibold text-purple-700 bg-purple-50 hover:bg-purple-100 px-3 py-1.5 rounded-lg transition">
            ⧉
          </button>
          <button onclick="toggleProductVisibility('${p.id}', ${!!p.isHidden})"
            title="${p.isHidden ? 'Show product' : 'Hide product'}"
            style="position:relative;display:inline-flex;align-items:center;width:40px;height:22px;border-radius:999px;border:none;cursor:pointer;flex-shrink:0;transition:background 0.2s;background:${p.isHidden ? '#d1d5db' : '#7c3aed'};">
            <span style="position:absolute;width:16px;height:16px;background:#fff;border-radius:50%;box-shadow:0 1px 3px rgba(0,0,0,0.3);transition:transform 0.2s;transform:translateX(${p.isHidden ? '3px' : '21px'});"></span>
          </button>
          <button onclick="confirmDeleteProduct('${p.id}', '${escapeForAttr(p.name)}')"
            class="text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-lg transition">
            Delete
          </button>
        </div>
      </td>
    </tr>
  `).join("");
  } // end if (filtered.length > 0)

  // Mobile cards view — only render on mobile, skip entirely on desktop
  const mobileCards = document.getElementById("productMobileCards");
  const mobileEmpty = document.getElementById("productMobileEmpty");
  if (!isMobile) {
    // Desktop: clear and hide mobile cards completely, do not render
    if (mobileCards) { mobileCards.innerHTML = ""; mobileCards.classList.add("hidden"); }
    if (mobileEmpty) mobileEmpty.classList.add("hidden");
    return;
  }
  if (mobileCards) {
    if (filtered.length === 0) {
      mobileCards.innerHTML = "";
      mobileEmpty?.classList.remove("hidden");
    } else {
      mobileEmpty?.classList.add("hidden");
      mobileCards.innerHTML = filtered.map(p => `
        <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-3 flex items-center gap-3">
          <img src="${p.image || ''}" alt="${p.name}"
            class="w-14 h-14 rounded-xl object-cover flex-shrink-0 bg-gray-100"
            onerror="this.src='https://placehold.co/80x80/e5e7eb/9ca3af?text=?'">
          <div class="flex-1 min-w-0">
            <p class="font-semibold text-gray-800 text-sm leading-tight line-clamp-2">${p.name}</p>
            <div class="flex items-center gap-2 mt-1 flex-wrap">
              <span class="text-xs text-gray-400 capitalize">${(p.category || '').replace(/-/g,' ')}</span>
              ${p.isTopPick ? '<span class="text-[10px] font-bold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded-full">⚡</span>' : ''}
              ${p.allowGroupOrder !== false ? '<span class="text-[10px] font-bold text-green-700 bg-green-50 px-1.5 py-0.5 rounded-full">🤝</span>' : ''}
            </div>
            <p class="font-black text-sm mt-0.5" style="color:#000080;">₦${Number(p.price || 0).toLocaleString()}</p>
          </div>
          <div class="flex flex-col gap-1.5 flex-shrink-0">
            <button onclick="openAdminPreviewModal('${p.id}')"
              class="text-xs font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-lg transition">
              View
            </button>
            <button onclick="openEditModal('${p.id}')"
              class="text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition">
              Edit
            </button>
            <button onclick="cloneProduct('${p.id}')" title="Clone"
              class="text-xs font-semibold text-purple-700 bg-purple-50 hover:bg-purple-100 px-3 py-1.5 rounded-lg transition">
              ⧉ Clone
            </button>
            <button onclick="toggleProductVisibility('${p.id}', ${!!p.isHidden})"
              title="${p.isHidden ? 'Show' : 'Hide'}"
              style="position:relative;display:inline-flex;align-items:center;width:40px;height:22px;border-radius:999px;border:none;cursor:pointer;flex-shrink:0;transition:background 0.2s;background:${p.isHidden ? '#d1d5db' : '#7c3aed'};">
              <span style="position:absolute;width:16px;height:16px;background:#fff;border-radius:50%;box-shadow:0 1px 3px rgba(0,0,0,0.3);transition:transform 0.2s;transform:translateX(${p.isHidden ? '3px' : '21px'});"></span>
            </button>
            <button onclick="confirmDeleteProduct('${p.id}', '${escapeForAttr(p.name)}')"
              class="text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-lg transition">
              Delete
            </button>
          </div>
        </div>
      `).join("");
    }
  }
}

// ============================================================
// ADMIN PRODUCT SEARCH
// ============================================================
function handleAdminProductSearch(value) {
  const clearBtn = document.getElementById("adminSearchClearBtn");
  if (clearBtn) clearBtn.style.display = value.trim() ? "flex" : "none";

  clearTimeout(adminSearchDebounceTimer);
  adminSearchDebounceTimer = setTimeout(() => {
    adminProductSearchQuery = value.trim();
    updateAdminSearchEcho(adminProductSearchQuery);
    renderAdminProducts();
  }, 120);
}

function clearAdminProductSearch() {
  adminProductSearchQuery = "";
  const input = document.getElementById("adminProductSearch");
  if (input) input.value = "";
  const clearBtn = document.getElementById("adminSearchClearBtn");
  if (clearBtn) clearBtn.style.display = "none";
  const echo = document.getElementById("adminSearchQueryEcho");
  if (echo) echo.style.display = "none";
  renderAdminProducts();
}

function updateAdminSearchEcho(query) {
  const echo = document.getElementById("adminSearchQueryEcho");
  const queryText = document.getElementById("adminSearchQueryText");
  const countEl = document.getElementById("adminSearchResultCount");
  if (!echo) return;

  if (!query) {
    echo.style.display = "none";
    return;
  }

  const q = query.toLowerCase();
  const catFilter = document.getElementById("productCatFilter")?.value || "all";
  let pool = catFilter === "all" ? allProducts : allProducts.filter(p => p.category === catFilter);
  const matchCount = pool.filter(p =>
    p.name.toLowerCase().includes(q) ||
    (p.desc || "").toLowerCase().includes(q) ||
    (p.category || "").toLowerCase().replace(/-/g, " ").includes(q)
  ).length;

  if (queryText) queryText.textContent = query;
  if (countEl) countEl.textContent = `${matchCount} result${matchCount !== 1 ? "s" : ""}`;
  echo.style.display = "flex";
}

// ============================================================
// ADMIN PRODUCT PREVIEW MODAL
// ============================================================
function openAdminPreviewModal(id) {
  const p = allProducts.find(x => x.id === id);
  if (!p) return;

  const modal   = document.getElementById("adminPreviewModal");
  const content = document.getElementById("adminPreviewModalContent");

  content.innerHTML = `
    <div class="aspect-video bg-gray-100 overflow-hidden rounded-t-3xl">
      <img src="${p.image || ''}" alt="${escapeHtml(p.name)}" class="w-full h-full object-cover"
        onerror="this.src='https://placehold.co/600x400/e5e7eb/9ca3af?text=Product'">
    </div>
    <div class="p-5 sm:p-6">
      ${p.isTopPick ? '<span class="inline-block text-xs font-bold px-3 py-1 rounded-full mb-3" style="background:#eff6ff;color:#000080;">⚡ Top Pick</span>' : ''}
      <p class="text-xs font-semibold uppercase tracking-wide mb-1" style="color:#000080;">${(p.category || '').replace(/-/g, ' ')}</p>
      <h2 class="font-black text-xl text-gray-900 mb-2">${escapeHtml(p.name)}</h2>
      <p class="text-gray-500 text-sm mb-4">${escapeHtml(p.desc || '')}</p>
      <div class="flex items-center justify-between mb-5">
        <span class="font-black text-2xl text-gray-900">₦${Number(p.price || 0).toLocaleString()}</span>
      </div>

      <!-- Admin action buttons -->
      <div class="flex gap-3 mb-6">
        <button onclick="closeAdminPreviewModal(); openEditModal('${p.id}')"
          class="flex-1 text-white font-bold py-3 rounded-xl transition text-sm" style="background:#000080;">
          ✏️ Edit Product
        </button>
        <button onclick="closeAdminPreviewModal(); confirmDeleteProduct('${p.id}', '${escapeForAttr(p.name)}')"
          class="flex-1 bg-red-50 hover:bg-red-100 text-red-600 font-bold py-3 rounded-xl transition text-sm border border-red-200">
          🗑️ Delete
        </button>
      </div>

      <!-- Reviews section -->
      <div class="border-t border-gray-100 pt-4">
        <h3 class="font-bold text-gray-800 mb-3">Reviews</h3>
        <div id="adminPreviewReviews_${p.id}" class="space-y-3">
          <p class="text-gray-400 text-sm">Loading reviews...</p>
        </div>
      </div>
    </div>
  `;

  modal.classList.remove("hidden");
  modal.classList.add("flex");
  loadAdminPreviewReviews(p.id);
}

function loadAdminPreviewReviews(productId) {
  const container = document.getElementById(`adminPreviewReviews_${productId}`);
  if (!container) return;

  // Use reviews already loaded in allReviews, filtered by productId
  const productReviews = allReviews.filter(r => r.productId === productId);

  if (productReviews.length === 0) {
    // Try fetching from Supabase in case they haven't loaded yet
    sb.from("reviews").select("*").eq("product_id", productId)
      .then(({ data, error }) => {
        if (error) throw error;
        renderAdminPreviewReviews(container, (data || []).map(_mapReviewRow));
      })
      .catch(() => {
        container.innerHTML = '<p class="text-gray-400 text-sm">No reviews yet.</p>';
      });
    return;
  }

  renderAdminPreviewReviews(container, productReviews);
}

function renderAdminPreviewReviews(container, reviews) {
  if (!reviews || reviews.length === 0) {
    container.innerHTML = '<p class="text-gray-400 text-sm">No reviews yet.</p>';
    return;
  }

  const sorted = [...reviews].sort((a, b) => {
    const ta = a.timestamp?.seconds || 0;
    const tb = b.timestamp?.seconds || 0;
    return tb - ta;
  });

  container.innerHTML = sorted.map(r => {
    const stars = "★".repeat(r.stars || 0) + "☆".repeat(5 - (r.stars || 0));
    const date  = r.timestamp?.toDate
      ? r.timestamp.toDate().toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" })
      : "—";
    return `
      <div class="bg-gray-50 rounded-2xl p-4">
        <div class="flex items-center justify-between mb-1">
          <p class="font-semibold text-gray-800 text-sm">${escapeHtml(r.userName || "Anonymous")}</p>
          <p class="text-[10px] text-gray-400">${date}</p>
        </div>
        <div class="text-yellow-500 text-sm mb-2 tracking-wide">${stars}</div>
        <p class="text-gray-600 text-sm">${escapeHtml(r.text || "")}</p>
      </div>
    `;
  }).join("");
}

function closeAdminPreviewModal() {
  const modal = document.getElementById("adminPreviewModal");
  modal.classList.add("hidden");
  modal.classList.remove("flex");
}

// ============================================================
// REVIEW ROW MAPPING
// docId (was Firestore doc.id) -> Supabase's uuid "id" column.
// timestamp is shimmed to support BOTH .seconds and .toDate(),
// since both patterns are used in different places in this file.
// ============================================================
function _mapReviewRow(row) {
  const d = row.created_at ? new Date(row.created_at) : null;
  return {
    docId: row.id,
    productId: row.product_id,
    userId: row.user_id,
    userName: row.user_name,
    stars: row.stars,
    text: row.text,
    featured: row.featured,
    rank: row.rank,
    timestamp: d ? { seconds: d.getTime() / 1000, toDate: () => d } : null
  };
}
function loadAllReviews() {
  sb.from("reviews").select("*")
    .then(({ data, error }) => {
      if (error) throw error;
      allReviews = (data || []).map(_mapReviewRow);
      // Sort newest first (client-side)
      allReviews.sort((a, b) => {
        const ta = a.timestamp?.seconds || 0;
        const tb = b.timestamp?.seconds || 0;
        return tb - ta;
      });
      updateStats();
      renderAdminReviews();
    })
    .catch(() => {
      allReviews = [];
      renderAdminReviews();
    });
}

// ============================================================
// RENDER REVIEWS GRID
// ============================================================
function renderAdminReviews() {
  const starFilter     = document.getElementById("reviewStarFilter")?.value || "all";
  const featuredOnly   = document.getElementById("reviewFeaturedFilter")?.checked || false;
  const loading        = document.getElementById("reviewLoadingState");
  const grid           = document.getElementById("reviewsGrid");
  const emptyEl        = document.getElementById("reviewsEmpty");

  loading?.classList.add("hidden");

  let filtered = starFilter === "all"
    ? allReviews
    : allReviews.filter(r => String(r.stars) === starFilter);

  if (featuredOnly) filtered = filtered.filter(r => r.featured);

  if (filtered.length === 0) {
    grid?.classList.add("hidden");
    emptyEl?.classList.remove("hidden");
    return;
  }

  grid?.classList.remove("hidden");
  grid?.classList.add("grid");
  emptyEl?.classList.add("hidden");

  // Get product name by id
  function getProductName(pid) {
    const p = allProducts.find(x => x.id === pid);
    return p ? p.name : pid || "Unknown Product";
  }

  // Featured reviews first (ordered by rank ascending), then the rest
  // (already newest-first, since allReviews is sorted that way on load).
  const featured = filtered.filter(r => r.featured).sort((a, b) => (a.rank || 0) - (b.rank || 0));
  const others   = filtered.filter(r => !r.featured);
  const ordered  = [...featured, ...others];

  const minRank = featured.length ? featured[0].rank : null;
  const maxRank = featured.length ? featured[featured.length - 1].rank : null;

  grid.innerHTML = ordered.map(r => {
    const stars  = "★".repeat(r.stars || 0) + "☆".repeat(5 - (r.stars || 0));
    const date   = r.timestamp?.toDate
      ? r.timestamp.toDate().toLocaleDateString("en-NG", { day:"numeric", month:"short", year:"numeric" })
      : "—";
    const isFeatured  = !!r.featured;
    const atTop       = isFeatured && r.rank === minRank;
    const atBottom     = isFeatured && r.rank === maxRank;

    const rankBadge = isFeatured
      ? `<span class="flex-shrink-0 text-[10px] font-black text-white rounded-full w-5 h-5 flex items-center justify-center" style="background:#f59e0b;">${r.rank}</span>`
      : "";

    const featureControls = isFeatured
      ? `
        <button onclick="moveReviewRank('${r.docId}','up')" ${atTop ? "disabled" : ""}
          class="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition ${atTop ? "text-gray-200 cursor-not-allowed" : "bg-gray-50 hover:bg-gray-100 text-gray-600"}">↑</button>
        <button onclick="moveReviewRank('${r.docId}','down')" ${atBottom ? "disabled" : ""}
          class="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition ${atBottom ? "text-gray-200 cursor-not-allowed" : "bg-gray-50 hover:bg-gray-100 text-gray-600"}">↓</button>
        <button onclick="toggleFeatureReview('${r.docId}')"
          class="text-[10px] font-bold px-2 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-600 transition">Unfeature</button>
      `
      : `
        <button onclick="toggleFeatureReview('${r.docId}')"
          class="text-[10px] font-bold px-2 py-1 rounded-lg bg-gray-50 hover:bg-amber-50 hover:text-amber-600 text-gray-500 transition">☆ Feature</button>
      `;

    return `
      <div class="bg-white rounded-2xl border ${isFeatured ? "border-amber-200" : "border-gray-100"} shadow-sm p-4">
        <div class="flex items-start justify-between gap-3 mb-2">
          <div class="min-w-0 flex items-center gap-2">
            ${rankBadge}
            <div class="min-w-0">
              <p class="font-semibold text-gray-800 text-sm line-clamp-1">${escapeHtml(r.userName || "Anonymous")}</p>
              <p class="text-[10px] text-gray-400">${date}</p>
            </div>
          </div>
          <button onclick="confirmDeleteReview('${r.docId}', '${escapeForAttr(r.userName || 'this review')}')"
            class="flex-shrink-0 w-7 h-7 bg-red-50 hover:bg-red-100 text-red-500 rounded-full flex items-center justify-center transition text-xs font-bold">
            ✕
          </button>
        </div>
        <div class="text-yellow-500 text-sm mb-2 tracking-wide">${stars}</div>
        <p class="text-gray-600 text-sm mb-3 line-clamp-3">${escapeHtml(r.text || "")}</p>
        <div class="pt-2 border-t border-gray-50 flex items-center justify-between gap-2">
          <p class="text-[10px] text-gray-400 flex-1 min-w-0 truncate">Product: <span class="font-medium text-gray-600">${escapeHtml(getProductName(r.productId))}</span></p>
          <div class="flex items-center gap-1 flex-shrink-0">${featureControls}</div>
        </div>
      </div>
    `;
  }).join("");
}

// ============================================================
// FEATURE / RANK REVIEWS
// ============================================================
async function toggleFeatureReview(docId) {
  const r = allReviews.find(x => x.docId === docId);
  if (!r) return;

  try {
    if (r.featured) {
      // Unfeature: clear rank, then close the gap for reviews ranked below it
      const oldRank = r.rank;
      const { error } = await sb.from("reviews").update({ featured: false, rank: null }).eq("id", docId);
      if (error) throw error;
      r.featured = false;
      delete r.rank;

      const toShift = allReviews.filter(x => x.featured && x.rank > oldRank);
      if (toShift.length) {
        await Promise.all(toShift.map(x => {
          x.rank -= 1;
          return sb.from("reviews").update({ rank: x.rank }).eq("id", x.docId);
        }));
      }
      showAdminToast("☆", "Review unfeatured");
    } else {
      // Feature: put it at the end of the current featured list
      const maxRank = allReviews.reduce((m, x) => (x.featured && x.rank > m ? x.rank : m), 0);
      const newRank = maxRank + 1;
      const { error } = await sb.from("reviews").update({ featured: true, rank: newRank }).eq("id", docId);
      if (error) throw error;
      r.featured = true;
      r.rank = newRank;
      showAdminToast("⭐", "Review featured");
    }
    renderAdminReviews();
  } catch (e) {
    showAdminToast("❌", "Failed to update review: " + e.message);
  }
}

async function moveReviewRank(docId, direction) {
  const r = allReviews.find(x => x.docId === docId);
  if (!r || !r.featured) return;

  const targetRank = direction === "up" ? r.rank - 1 : r.rank + 1;
  const swap = allReviews.find(x => x.featured && x.rank === targetRank);
  if (!swap) return; // already at the top/bottom of the featured list

  try {
    const originalRank = r.rank;
    const [{ error: err1 }, { error: err2 }] = await Promise.all([
      sb.from("reviews").update({ rank: swap.rank }).eq("id", r.docId),
      sb.from("reviews").update({ rank: originalRank }).eq("id", swap.docId)
    ]);
    if (err1 || err2) throw (err1 || err2);

    r.rank = swap.rank;
    swap.rank = originalRank;
    renderAdminReviews();
  } catch (e) {
    showAdminToast("❌", "Failed to reorder: " + e.message);
  }
}

// ============================================================
// ADD PRODUCT
// ============================================================

// ============================================================
// VARIANT BUILDER — Add/Edit product forms
// ============================================================

function addVariantRow(formType, name = "", price = "") {
  const listId = formType === "new" ? "newVariantsList" : "editVariantsList";
  const list = document.getElementById(listId);
  if (!list) return;

  const row = document.createElement("div");
  row.className = "variant-builder-row flex items-center gap-2";
  row.innerHTML = `
    <input type="text" placeholder="Label (e.g. 500g)" value="${name}"
      class="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm"
      style="min-width:0;" />
    <span class="text-gray-400 text-xs font-bold flex-shrink-0">₦</span>
    <input type="number" placeholder="Price" value="${price}" min="1"
      class="w-24 border border-gray-200 rounded-lg px-3 py-2 text-sm flex-shrink-0" />
    <button type="button" onclick="this.closest('.variant-builder-row').remove()"
      class="text-red-400 hover:text-red-600 text-lg font-bold flex-shrink-0 leading-none px-1">×</button>
  `;
  list.appendChild(row);
}

function getVariantsFromForm(formType) {
  const listId = formType === "new" ? "newVariantsList" : "editVariantsList";
  const list = document.getElementById(listId);
  if (!list) return [];
  const rows = list.querySelectorAll(".variant-builder-row");
  const variants = [];
  rows.forEach(row => {
    const inputs = row.querySelectorAll("input");
    const label = (inputs[0]?.value || "").trim();
    const price = parseFloat(inputs[1]?.value);
    if (label && !isNaN(price) && price > 0) {
      variants.push({ name: label, price });
    }
  });
  return variants;
}

function clearVariantRows(formType) {
  const listId = formType === "new" ? "newVariantsList" : "editVariantsList";
  const list = document.getElementById(listId);
  if (list) list.innerHTML = "";
}

function loadVariantsIntoForm(formType, variants) {
  clearVariantRows(formType);
  if (!Array.isArray(variants)) return;
  variants.forEach(v => addVariantRow(formType, v.name || "", v.price || ""));
}

// ============================================================
// (Removed: toggleGroupOrderVisibility — the Allow Group Order
// checkbox is now shown for every category, not just hostel-services)
// ============================================================

// ============================================================
// SERVICES — ADD
// ============================================================
async function addService() {
  const name       = document.getElementById("svcName")?.value.trim();
  const desc       = document.getElementById("svcDesc")?.value.trim();
  let image = document.getElementById("svcImage")?.value.trim() || "";
  const isTopPick  = document.getElementById("svcIsTopPick")?.checked || false;
  const allowGroupOrder = document.getElementById("svcAllowGroupOrder")?.checked || false;
  const errEl      = document.getElementById("addServiceError");

  errEl.classList.add("hidden");

  if (!name || !desc || !image) {
    errEl.textContent = "Please fill in name, description, and image URL.";
    errEl.classList.remove("hidden");
    return;
  }

  const btn = document.getElementById("addServiceBtn");
  if (btn) { btn.disabled = true; btn.textContent = "Adding..."; }

  try {
    const nameLower = name.toLowerCase();
    const localMatch = allProducts.find(p => p.name.trim().toLowerCase() === nameLower);
    if (localMatch) {
      errEl.textContent = `A service named "${name}" already exists.`;
      errEl.classList.remove("hidden");
      return;
    }

    const newId = (crypto.randomUUID ? crypto.randomUUID() : `prod_${Date.now()}_${Math.random().toString(36).slice(2)}`);
    const newProduct = { name, desc, image, category: "hostel-services", isService: true, price: 0, isTopPick, allowGroupOrder, variantGroups: [] };
    const { error: insertErr } = await sb.from("products").insert({ id: newId, ..._toProductRow(newProduct) });
    if (insertErr) throw insertErr;

    allProducts.push({ id: newId, ...newProduct });

    // Reset form
    ["svcName","svcDesc","svcImage"].forEach(id => { const el = document.getElementById(id); if (el) el.value = ""; });
    document.getElementById("svcIsTopPick").checked = false;
    document.getElementById("svcAllowGroupOrder").checked = false;

    updateStats();
    showAdminToast("✅", "Service added! Now add its price list from the Services tab.");
    switchTab("services", document.querySelector(".tab-btn[onclick=\"switchTab('services', this)\"]"));

  } catch (e) {
    errEl.textContent = "Failed to add service: " + e.message;
    errEl.classList.remove("hidden");
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = "➕ Add Service"; }
  }
}

// ============================================================
// SERVICES — RENDER TAB
// ============================================================
function renderAdminServices() {
  const container = document.getElementById("servicesTableBody");
  const mobileContainer = document.getElementById("servicesMobileCards");
  const emptyEl = document.getElementById("servicesEmpty");
  if (!container) return;

  const services = allProducts.filter(p => p.category === "hostel-services");

  if (services.length === 0) {
    container.innerHTML = "";
    emptyEl?.classList.remove("hidden");
    if (mobileContainer) mobileContainer.innerHTML = "";
    return;
  }
  emptyEl?.classList.add("hidden");

  function getStartingPrice(svc) {
    const groups = svc.variantGroups || [];
    const prices = [];
    groups.forEach(g => (g.items || []).forEach(it => { if (it.price != null && it.price > 0) prices.push(it.price); }));
    return prices.length ? Math.min(...prices) : null;
  }

  function getTotalItems(svc) {
    return (svc.variantGroups || []).reduce((sum, g) => sum + (g.items || []).length, 0);
  }

  // Desktop table rows
  container.innerHTML = services.map(svc => {
    const sp = getStartingPrice(svc);
    const spText = sp != null ? `₦${sp.toLocaleString()}` : "—";
    const groups = (svc.variantGroups || []).length;
    const items  = getTotalItems(svc);
    return `
      <tr class="product-row border-b border-gray-50 transition">
        <td class="px-4 py-3">
          <div class="flex items-center gap-3">
            <img src="${svc.image || ''}" alt="${svc.name}"
              class="w-10 h-10 rounded-lg object-cover flex-shrink-0 bg-gray-100"
              onerror="this.src='https://placehold.co/80x80/e5e7eb/9ca3af?text=?'">
            <div class="min-w-0">
              <p class="font-semibold text-gray-800 text-xs leading-tight line-clamp-2">${escapeHtml(svc.name)}</p>
              <div class="flex items-center gap-1.5 flex-wrap mt-0.5">
                ${svc.isTopPick ? '<span class="text-[10px] font-bold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded-full">⚡ Top Pick</span>' : ''}
                ${svc.allowGroupOrder ? '<span class="text-[10px] font-bold text-green-700 bg-green-50 px-1.5 py-0.5 rounded-full">🤝 Group Order</span>' : ''}
              </div>
            </div>
          </div>
        </td>
        <td class="px-4 py-3 text-xs text-gray-500">${groups} group${groups !== 1 ? 's' : ''}</td>
        <td class="px-4 py-3 text-xs text-gray-500">${items} item${items !== 1 ? 's' : ''}</td>
        <td class="px-4 py-3 font-bold text-gray-800 text-sm">${spText}</td>
        <td class="px-4 py-3">
          <div class="flex items-center gap-2 justify-end flex-wrap">
            <button onclick="openEditServiceModal('${svc.id}')"
              class="text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition">
              Edit Details
            </button>
            <button onclick="openPriceListModal('${svc.id}')"
              class="text-xs font-semibold text-white px-3 py-1.5 rounded-lg transition" style="background:#000080;">
              💰 Price List
            </button>
            <button onclick="confirmDeleteProduct('${svc.id}', '${escapeForAttr(svc.name)}')"
              class="text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-lg transition">
              Delete
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join("");

  // Mobile cards
  if (mobileContainer) {
    mobileContainer.innerHTML = services.map(svc => {
      const sp = getStartingPrice(svc);
      const spText = sp != null ? `from ₦${sp.toLocaleString()}` : "No pricing yet";
      const items = getTotalItems(svc);
      return `
        <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-3 flex items-center gap-3">
          <img src="${svc.image || ''}" alt="${svc.name}"
            class="w-14 h-14 rounded-xl object-cover flex-shrink-0 bg-gray-100"
            onerror="this.src='https://placehold.co/80x80/e5e7eb/9ca3af?text=?'">
          <div class="flex-1 min-w-0">
            <p class="font-semibold text-gray-800 text-sm leading-tight line-clamp-2">${escapeHtml(svc.name)}</p>
            <p class="text-xs text-gray-400 mt-0.5">${items} item${items !== 1 ? 's' : ''} · ${spText}</p>
          </div>
          <div class="flex flex-col gap-1.5 flex-shrink-0">
            <button onclick="openEditServiceModal('${svc.id}')"
              class="text-xs font-semibold text-blue-700 bg-blue-50 px-3 py-1.5 rounded-lg">Edit</button>
            <button onclick="openPriceListModal('${svc.id}')"
              class="text-xs font-semibold text-white px-3 py-1.5 rounded-lg" style="background:#000080;">Price List</button>
            <button onclick="confirmDeleteProduct('${svc.id}', '${escapeForAttr(svc.name)}')"
              class="text-xs font-semibold text-red-600 bg-red-50 px-3 py-1.5 rounded-lg">Delete</button>
          </div>
        </div>
      `;
    }).join("");
  }
}

// ============================================================
// SERVICES — EDIT SERVICE MODAL
// ============================================================
function openEditServiceModal(serviceId) {
  const svc = allProducts.find(x => x.id === serviceId);
  if (!svc) return;

  document.getElementById("editSvcId").value            = svc.id;
  document.getElementById("editSvcName").value          = svc.name || "";
  document.getElementById("editSvcDesc").value          = svc.desc || "";
  document.getElementById("editSvcImage").value         = svc.image || "";
  document.getElementById("editSvcIsTopPick").checked   = !!svc.isTopPick;
  document.getElementById("editSvcAllowGroupOrder").checked = !!svc.allowGroupOrder;
  document.getElementById("editServiceError").classList.add("hidden");

  const modal = document.getElementById("editServiceModal");
  modal.classList.remove("hidden");
  modal.classList.add("flex");
  document.body.classList.add("modal-open");
}

function closeEditServiceModal() {
  document.getElementById("editServiceModal").classList.add("hidden");
  document.getElementById("editServiceModal").classList.remove("flex");
  document.body.classList.remove("modal-open");
}

async function saveEditService() {
  const id       = document.getElementById("editSvcId").value;
  const name     = document.getElementById("editSvcName")?.value.trim();
  const desc     = document.getElementById("editSvcDesc")?.value.trim();
  let image = document.getElementById("editSvcImage")?.value.trim() || "";
  const isTopPick = document.getElementById("editSvcIsTopPick")?.checked || false;
  const allowGroupOrder = document.getElementById("editSvcAllowGroupOrder")?.checked || false;
  const errEl    = document.getElementById("editServiceError");

  errEl.classList.add("hidden");

  if (!name || !desc || !image) {
    errEl.textContent = "Name, description and image URL are required.";
    errEl.classList.remove("hidden");
    return;
  }

  const saveBtn = document.getElementById("saveEditServiceBtn");
  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = "Saving..."; }

  try {
    const updateData = { name, desc, image, isTopPick, allowGroupOrder };
    const { error } = await sb.from("products").update(_toProductRow(updateData)).eq("id", id);
    if (error) throw error;
    const idx = allProducts.findIndex(p => p.id === id);
    if (idx !== -1) allProducts[idx] = { ...allProducts[idx], ...updateData };
    closeEditServiceModal();
    renderAdminServices();
    showAdminToast("✅", "Service updated!");
  } catch (e) {
    errEl.textContent = "Failed to save: " + e.message;
    errEl.classList.remove("hidden");
  } finally {
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = "Save Changes"; }
  }
}

// ============================================================
// PRICE LIST MANAGER
// ============================================================
let activePriceListServiceId = null;
let csvParsedGroups = [];

function openPriceListModal(serviceId) {
  const svc = allProducts.find(x => x.id === serviceId);
  if (!svc) return;
  activePriceListServiceId = serviceId;
  csvParsedGroups = [];

  document.getElementById("priceListServiceName").textContent = svc.name;
  document.getElementById("csvGroupPreviewArea").classList.add("hidden");
  document.getElementById("csvGroupError").classList.add("hidden");
  document.getElementById("csvGroupFileInput").value = "";

  renderPriceListBuilder(svc.variantGroups || []);
  updatePriceListSummary();

  const modal = document.getElementById("priceListModal");
  modal.classList.remove("hidden");
  modal.classList.add("flex");
  document.body.classList.add("modal-open");
}

function closePriceListModal() {
  document.getElementById("priceListModal").classList.add("hidden");
  document.getElementById("priceListModal").classList.remove("flex");
  document.body.classList.remove("modal-open");
  activePriceListServiceId = null;
}

function renderPriceListBuilder(variantGroups) {
  const container = document.getElementById("priceListGroupsContainer");
  container.innerHTML = "";
  (variantGroups || []).forEach(g => addGroupToBuilder(g.groupName || "", g.items || []));
}

function addGroupToBuilder(groupName = "", items = []) {
  const container = document.getElementById("priceListGroupsContainer");
  const groupDiv = document.createElement("div");
  groupDiv.className = "price-list-group border border-gray-200 rounded-2xl p-4 mb-3";
  groupDiv.innerHTML = `
    <div class="flex items-center gap-2 mb-3">
      <input type="text" value="${escapeHtml(groupName)}" placeholder="Group name (e.g. Ear Piercings)"
        class="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm font-semibold"
        style="min-width:0;" oninput="updatePriceListSummary()" />
      <button type="button" onclick="removeGroup(this)"
        class="text-red-400 hover:text-red-600 font-bold text-sm px-2 flex-shrink-0">× Remove Group</button>
    </div>
    <div class="price-list-items space-y-2 mb-3"></div>
    <button type="button" onclick="addItemToGroup(this)"
      class="text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 px-3 py-2 rounded-lg transition">
      + Add Item
    </button>
  `;
  container.appendChild(groupDiv);
  const itemsContainer = groupDiv.querySelector(".price-list-items");
  items.forEach(it => addItemRow(itemsContainer, it.name || "", it.price, it.description || ""));
  updatePriceListSummary();
}

function addItemToGroup(btn) {
  const itemsContainer = btn.closest(".price-list-group").querySelector(".price-list-items");
  addItemRow(itemsContainer, "", "", "");
}

function addItemRow(container, name = "", price = "", description = "") {
  const row = document.createElement("div");
  row.className = "price-list-item-row grid gap-2 items-start";
  row.style.gridTemplateColumns = "1fr 100px 1fr auto";
  const priceVal = (price != null && price !== "") ? price : "";
  row.innerHTML = `
    <input type="text" value="${escapeHtml(name)}" placeholder="Item name"
      class="border border-gray-200 rounded-lg px-3 py-2 text-sm" oninput="updatePriceListSummary()" />
    <input type="number" value="${priceVal}" placeholder="Price" min="0"
      class="border border-gray-200 rounded-lg px-3 py-2 text-sm"
      title="Leave blank for 'DM for price'" oninput="updatePriceListSummary()" />
    <input type="text" value="${escapeHtml(description)}" placeholder="Description (optional)"
      class="border border-gray-200 rounded-lg px-3 py-2 text-sm" />
    <button type="button" onclick="this.closest('.price-list-item-row').remove(); updatePriceListSummary();"
      class="text-red-400 hover:text-red-600 text-lg font-bold leading-none px-1 mt-1">×</button>
  `;
  container.appendChild(row);
  updatePriceListSummary();
}

function removeGroup(btn) {
  if (!confirm("Remove this entire group and all its items?")) return;
  btn.closest(".price-list-group").remove();
  updatePriceListSummary();
}

function updatePriceListSummary() {
  const { variantGroups, startingPrice, totalItems } = readPriceListFromBuilder();
  const el = document.getElementById("priceListSummaryText");
  if (!el) return;
  const spText = startingPrice != null ? `· from ₦${startingPrice.toLocaleString()}` : "";
  el.textContent = `${variantGroups.length} group${variantGroups.length !== 1 ? 's' : ''} · ${totalItems} item${totalItems !== 1 ? 's' : ''} ${spText}`;
}

function readPriceListFromBuilder() {
  const groups = [];
  let totalItems = 0;
  const prices = [];
  document.querySelectorAll(".price-list-group").forEach(groupEl => {
    const groupNameInput = groupEl.querySelector("input[type='text']");
    const groupName = groupNameInput?.value.trim() || "";
    const items = [];
    groupEl.querySelectorAll(".price-list-item-row").forEach(row => {
      const inputs = row.querySelectorAll("input");
      const name = (inputs[0]?.value || "").trim();
      const priceRaw = inputs[1]?.value;
      const description = (inputs[2]?.value || "").trim();
      if (!name) return;
      const price = priceRaw !== "" ? parseFloat(priceRaw) : null;
      const priceLabel = (price == null || isNaN(price)) ? "DM for price" : null;
      const finalPrice = (price != null && !isNaN(price) && price >= 0) ? price : null;
      if (finalPrice != null) prices.push(finalPrice);
      items.push({ name, price: finalPrice, priceLabel, description });
      totalItems++;
    });
    if (groupName || items.length) groups.push({ groupName, items });
  });
  const startingPrice = prices.length ? Math.min(...prices) : null;
  return { variantGroups: groups, startingPrice, totalItems };
}

async function savePriceList() {
  if (!activePriceListServiceId) return;
  const { variantGroups, startingPrice } = readPriceListFromBuilder();

  const btn = document.getElementById("savePriceListBtn");
  if (btn) { btn.disabled = true; btn.textContent = "Saving..."; }

  try {
    const updateData = {
      variantGroups,
      price: startingPrice || 0
    };
    const { error } = await sb.from("products").update(_toProductRow(updateData)).eq("id", activePriceListServiceId);
    if (error) throw error;
    const idx = allProducts.findIndex(p => p.id === activePriceListServiceId);
    if (idx !== -1) allProducts[idx] = { ...allProducts[idx], ...updateData };
    closePriceListModal();
    renderAdminServices();
    showAdminToast("✅", "Price list saved!");
  } catch (e) {
    showAdminToast("❌", "Failed to save: " + e.message);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = "💾 Save Price List"; }
  }
}

// ============================================================
// PRICE LIST CSV — DOWNLOAD TEMPLATE
// ============================================================
function downloadPriceListTemplate() {
  const csv = [
    "group,name,price,description",
    "Ear Piercings,Upper Lobe,5000,Standard lobe piercing with jewellery",
    "Ear Piercings,Lobe,5000,",
    "Advanced Ear Piercings,Conch,7500,Cartilage piercing",
    "Advanced Ear Piercings,Industrial,10000,Double cartilage bar piercing",
    "18+ Piercings,Nipple (single or pair),,DM for price and booking",
  ].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url; a.download = "service_pricelist_template.csv";
  a.click(); URL.revokeObjectURL(url);
}

// ============================================================
// PRICE LIST CSV — PARSE & PREVIEW
// ============================================================
function handlePriceListCsvSelect(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => parsePriceListCsv(e.target.result);
  reader.readAsText(file);
}

function parsePriceListCsv(text) {
  const errEl = document.getElementById("csvGroupError");
  errEl.classList.add("hidden");
  csvParsedGroups = [];

  // Parse CSV respecting quoted fields
  function parseRow(line) {
    const cols = [];
    let cur = "", inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"' && !inQuote) { inQuote = true; continue; }
      if (ch === '"' && inQuote)  { inQuote = false; continue; }
      if (ch === ',' && !inQuote) { cols.push(cur.trim()); cur = ""; continue; }
      cur += ch;
    }
    cols.push(cur.trim());
    return cols;
  }

  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) {
    errEl.textContent = "CSV is empty or missing data rows.";
    errEl.classList.remove("hidden");
    return;
  }

  const header = parseRow(lines[0]).map(h => h.toLowerCase().replace(/\s+/g, ""));
  const gIdx = header.indexOf("group");
  const nIdx = header.indexOf("name");
  const pIdx = header.indexOf("price");
  const dIdx = header.indexOf("description");

  if (gIdx === -1 || nIdx === -1) {
    errEl.textContent = "CSV must have 'group' and 'name' columns.";
    errEl.classList.remove("hidden");
    return;
  }

  const errors = [];
  const groupMap = new Map();

  lines.slice(1).forEach((line, i) => {
    if (!line.trim()) return;
    const cols = parseRow(line);
    const group = (cols[gIdx] || "").trim();
    const name  = (cols[nIdx] || "").trim();
    const priceRaw = pIdx !== -1 ? (cols[pIdx] || "").trim() : "";
    const desc  = dIdx !== -1 ? (cols[dIdx] || "").trim() : "";

    if (!group) { errors.push(`Row ${i + 2}: missing group`); return; }
    if (!name)  { errors.push(`Row ${i + 2}: missing name`);  return; }

    let price = null;
    let priceLabel = null;
    if (priceRaw !== "") {
      price = parseFloat(priceRaw);
      if (isNaN(price) || price < 0) { errors.push(`Row ${i + 2}: invalid price "${priceRaw}"`); return; }
    } else {
      priceLabel = desc || "DM for price";
    }

    if (!groupMap.has(group)) groupMap.set(group, []);
    groupMap.get(group).push({ name, price, priceLabel: priceLabel || null, description: desc });
  });

  if (errors.length > 0) {
    errEl.textContent = errors.slice(0, 3).join(" | ") + (errors.length > 3 ? ` (+${errors.length - 3} more)` : "");
    errEl.classList.remove("hidden");
    return;
  }

  csvParsedGroups = [...groupMap.entries()].map(([groupName, items]) => ({ groupName, items }));

  // Safety cap
  const totalItems = csvParsedGroups.reduce((s, g) => s + g.items.length, 0);
  if (totalItems > 50) {
    errEl.textContent = `CSV has ${totalItems} items — maximum is 50 per service.`;
    errEl.classList.remove("hidden");
    csvParsedGroups = [];
    return;
  }

  renderCsvGroupPreview();
}

function renderCsvGroupPreview() {
  const area    = document.getElementById("csvGroupPreviewArea");
  const label   = document.getElementById("csvGroupPreviewLabel");
  const tbody   = document.getElementById("csvGroupPreviewBody");

  if (csvParsedGroups.length === 0) { area.classList.add("hidden"); return; }

  const totalItems = csvParsedGroups.reduce((s, g) => s + g.items.length, 0);
  label.textContent = `${csvParsedGroups.length} group${csvParsedGroups.length !== 1 ? 's' : ''} · ${totalItems} item${totalItems !== 1 ? 's' : ''} ready to apply`;

  tbody.innerHTML = csvParsedGroups.flatMap(g =>
    g.items.map((it, i) => `
      <tr class="border-b border-gray-50">
        <td class="px-3 py-2 text-gray-500 text-xs">${i === 0 ? escapeHtml(g.groupName) : ''}</td>
        <td class="px-3 py-2 text-gray-800 font-medium text-xs">${escapeHtml(it.name)}</td>
        <td class="px-3 py-2 text-xs font-bold text-gray-700">${it.price != null ? '₦' + it.price.toLocaleString() : '<span class="text-gray-400 italic">DM for price</span>'}</td>
        <td class="px-3 py-2 text-gray-400 text-xs max-w-[140px] truncate">${escapeHtml(it.description || '—')}</td>
      </tr>
    `)
  ).join("");

  area.classList.remove("hidden");
}

function applyPriceListCsv() {
  if (csvParsedGroups.length === 0) return;
  const mergeMode = document.getElementById("csvMergeMode")?.value === "merge";

  if (mergeMode) {
    // Merge: add groups/items not already present by name
    csvParsedGroups.forEach(csvGroup => {
      const existing = [...document.querySelectorAll(".price-list-group")].find(el => {
        const nameInput = el.querySelector("input[type='text']");
        return nameInput?.value.trim().toLowerCase() === csvGroup.groupName.toLowerCase();
      });
      if (existing) {
        const itemsContainer = existing.querySelector(".price-list-items");
        csvGroup.items.forEach(it => addItemRow(itemsContainer, it.name, it.price, it.description || ""));
      } else {
        addGroupToBuilder(csvGroup.groupName, csvGroup.items);
      }
    });
  } else {
    // Replace: wipe builder and rebuild
    renderPriceListBuilder(csvParsedGroups);
  }

  updatePriceListSummary();
  showAdminToast("✅", "CSV applied to builder — review and save when ready.");
}

async function addProduct() {
  const name     = document.getElementById("newName")?.value.trim();
  const category = document.getElementById("newCategory")?.value;
  const priceRaw = document.getElementById("newPrice")?.value;
  const desc     = document.getElementById("newDesc")?.value.trim();
  let image = document.getElementById("newImage")?.value.trim() || "";
  const costPriceRaw = document.getElementById("newCostPrice")?.value;
  const marketName    = document.getElementById("newMarketName")?.value.trim() || "";
  const isTopPick = document.getElementById("newIsTopPick")?.checked || false;
  // Group order is allowed by default for every product; admin can untick per-product.
  const allowGroupOrder = document.getElementById("newAllowGroupOrder")?.checked ?? true;
  const errEl    = document.getElementById("addProductError");

  errEl.classList.add("hidden");

  if (!name || !category || !priceRaw || !desc) {
    errEl.textContent = "Please fill in all required fields.";
    errEl.classList.remove("hidden");
    return;
  }

  const price = parseFloat(priceRaw);
  if (isNaN(price) || price <= 0) {
    errEl.textContent = "Please enter a valid price.";
    errEl.classList.remove("hidden");
    return;
  }

  // Cost price is optional — what you actually pay at the market for this item.
  // Left blank, the market list falls back to the selling price.
  let costPrice = null;
  if (costPriceRaw && costPriceRaw.trim() !== "") {
    costPrice = parseFloat(costPriceRaw);
    if (isNaN(costPrice) || costPrice < 0) {
      errEl.textContent = "Please enter a valid cost price (or leave it blank).";
      errEl.classList.remove("hidden");
      return;
    }
  }

  const btn = document.querySelector("#tab-add-product button[onclick='addProduct()']");
  if (btn) { btn.disabled = true; btn.textContent = "Adding..."; }

  try {
    // ── Duplicate check ──────────────────────────────────────
    const nameLower = name.trim().toLowerCase();
    const { data: existingMatches, error: dupErr } = await sb.from("products").select("id").eq("name", name.trim()).limit(1);
    if (dupErr) throw dupErr;
    const localMatch = allProducts.find(p => p.name.trim().toLowerCase() === nameLower);
    if ((existingMatches && existingMatches.length > 0) || localMatch) {
      errEl.textContent = `A product named "${name}" already exists. Use the Edit button to update it instead.`;
      errEl.classList.remove("hidden");
      return;
    }
    // ── End duplicate check ──────────────────────────────────

    const variants = getVariantsFromForm("new");
    const newId = (crypto.randomUUID ? crypto.randomUUID() : `prod_${Date.now()}_${Math.random().toString(36).slice(2)}`);
    const newProductData = {
      name, category, price, desc,
      image: image || "https://placehold.co/400x400/e5e7eb/9ca3af?text=Product",
      costPrice, marketName, isTopPick, allowGroupOrder, variants
    };
    const { error: insertErr } = await sb.from("products").insert({ id: newId, ..._toProductRow(newProductData) });
    if (insertErr) throw insertErr;

    // Add to local state
    const newProduct = { id: newId, ...newProductData };
    allProducts.push(newProduct);

    // Reset form
    ["newName","newDesc","newImage","newCostPrice","newMarketName"].forEach(id => { const el = document.getElementById(id); if(el) el.value = ""; });
    document.getElementById("newCategory").value = "";
    document.getElementById("newPrice").value = "";
    document.getElementById("newIsTopPick").checked = false;
    document.getElementById("newAllowGroupOrder").checked = true;
    clearVariantRows("new");

    updateStats();
    showAdminToast("✅", "Product added to store!");

    // Switch to products tab
    switchTab("products", document.querySelector(".tab-btn"));
    renderAdminProducts();

  } catch (e) {
    errEl.textContent = "Failed to add product: " + e.message;
    errEl.classList.remove("hidden");
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = "➕ Add Product to Store"; }
  }
}

// ============================================================
// EDIT PRODUCT MODAL
// ============================================================
function openEditModal(productId) {
  const p = allProducts.find(x => x.id === productId);
  if (!p) return;

  document.getElementById("editId").value       = p.id;
  document.getElementById("editName").value     = p.name || "";
  document.getElementById("editCategory").value = p.category || "groceries";
  document.getElementById("editPrice").value    = p.price || "";
  document.getElementById("editDesc").value     = p.desc || "";
  document.getElementById("editImage").value    = p.image || "";
  document.getElementById("editCostPrice").value  = (p.costPrice ?? "") === null ? "" : (p.costPrice ?? "");
  document.getElementById("editMarketName").value = p.marketName || "";
  document.getElementById("editIsTopPick").checked = !!p.isTopPick;
  document.getElementById("editAllowGroupOrder").checked = p.allowGroupOrder !== false;
  document.getElementById("editProductError").classList.add("hidden");
  loadVariantsIntoForm("edit", p.variants || []);

  const modal = document.getElementById("editModal");
  modal.classList.remove("hidden");
  modal.classList.add("flex");
  document.body.classList.add("modal-open");
}

function closeEditModal() {
  const modal = document.getElementById("editModal");
  modal.classList.add("hidden");
  modal.classList.remove("flex");
  document.body.classList.remove("modal-open");
}

async function saveEditProduct() {
  const id       = document.getElementById("editId").value;
  const name     = document.getElementById("editName")?.value.trim();
  const category = document.getElementById("editCategory")?.value;
  const priceRaw = document.getElementById("editPrice")?.value;
  const desc     = document.getElementById("editDesc")?.value.trim();
  let image = document.getElementById("editImage")?.value.trim() || "";
  const costPriceRaw = document.getElementById("editCostPrice")?.value;
  const marketName    = document.getElementById("editMarketName")?.value.trim() || "";
  const isTopPick = document.getElementById("editIsTopPick")?.checked || false;
  // Group order is allowed by default for every product; admin can untick per-product.
  const allowGroupOrder = document.getElementById("editAllowGroupOrder")?.checked ?? true;
  const errEl    = document.getElementById("editProductError");

  errEl.classList.add("hidden");

  if (!name || !category || !priceRaw || !desc) {
    errEl.textContent = "Please fill in all fields.";
    errEl.classList.remove("hidden");
    return;
  }

  const price = parseFloat(priceRaw);
  if (isNaN(price) || price <= 0) {
    errEl.textContent = "Please enter a valid price.";
    errEl.classList.remove("hidden");
    return;
  }

  let costPrice = null;
  if (costPriceRaw && costPriceRaw.trim() !== "") {
    costPrice = parseFloat(costPriceRaw);
    if (isNaN(costPrice) || costPrice < 0) {
      errEl.textContent = "Please enter a valid cost price (or leave it blank).";
      errEl.classList.remove("hidden");
      return;
    }
  }

  const saveBtn = document.querySelector("#editModal button[onclick='saveEditProduct()']");
  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = "Saving..."; }

  const variants = getVariantsFromForm("edit");
  const updateData = { name, category, price, desc, image, costPrice, marketName, isTopPick, allowGroupOrder, variants };

  try {
    // Upsert works for both local-seed-id and real Supabase-id products
    const { error } = await sb.from("products").upsert({ id, ..._toProductRow(updateData) }, { onConflict: "id" });
    if (error) throw error;

    // Update local state
    const idx = allProducts.findIndex(p => p.id === id);
    if (idx !== -1) allProducts[idx] = { ...allProducts[idx], ...updateData };

    closeEditModal();
    renderAdminProducts();
    showAdminToast("✅", "Product updated!");
  } catch (e) {
    errEl.textContent = "Failed to save: " + e.message;
    errEl.classList.remove("hidden");
  } finally {
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = "Save Changes"; }
  }
}

// ============================================================
// DELETE PRODUCT
// ============================================================
let pendingDeleteFn = null;

// ============================================================
// HIDE / SHOW PRODUCT TOGGLE
// ============================================================
async function toggleProductVisibility(productId, currentlyHidden) {
  try {
    const { error } = await sb.from("products").update({ is_hidden: !currentlyHidden }).eq("id", productId);
    if (error) throw error;
    // Update local state
    const p = allProducts.find(x => x.id === productId);
    if (p) p.isHidden = !currentlyHidden;
    renderAdminProducts();
    showAdminToast(currentlyHidden ? "👁" : "🙈", currentlyHidden ? "Product is now visible" : "Product hidden from customers");
  } catch (e) {
    showAdminToast("❌", "Failed to update visibility: " + e.message);
  }
}

function confirmDeleteProduct(productId, productName) {
  const msg = document.getElementById("deleteModalMsg");
  if (msg) msg.textContent = `"${productName}" will be permanently removed.`;

  pendingDeleteFn = () => executeDeleteProduct(productId);

  const btn = document.getElementById("deleteConfirmBtn");
  if (btn) btn.onclick = () => { if(pendingDeleteFn) pendingDeleteFn(); };

  openDeleteModal();
}

async function executeDeleteProduct(productId) {
  closeDeleteModal();
  try {
    const { error } = await sb.from("products").delete().eq("id", productId);
    if (error) throw error;
    allProducts = allProducts.filter(p => p.id !== productId);
    updateStats();
    renderAdminProducts();
    showAdminToast("🗑️", "Product deleted");
  } catch (e) {
    // If it's a local product not in Supabase, just remove from local state
    allProducts = allProducts.filter(p => p.id !== productId);
    updateStats();
    renderAdminProducts();
    showAdminToast("🗑️", "Product removed");
  }
}

// ============================================================
// DELETE REVIEW
// ============================================================
function confirmDeleteReview(docId, reviewerName) {
  const msg = document.getElementById("deleteModalMsg");
  if (msg) msg.textContent = `Review by "${reviewerName}" will be permanently deleted.`;

  pendingDeleteFn = () => executeDeleteReview(docId);

  const btn = document.getElementById("deleteConfirmBtn");
  if (btn) btn.onclick = () => { if(pendingDeleteFn) pendingDeleteFn(); };

  openDeleteModal();
}

async function executeDeleteReview(docId) {
  closeDeleteModal();
  const deleted = allReviews.find(r => r.docId === docId);
  try {
    const { error } = await sb.from("reviews").delete().eq("id", docId);
    if (error) throw error;
    allReviews = allReviews.filter(r => r.docId !== docId);

    // If the deleted review was featured, close the rank gap it left behind
    if (deleted?.featured && deleted.rank != null) {
      const toShift = allReviews.filter(x => x.featured && x.rank > deleted.rank);
      if (toShift.length) {
        await Promise.all(toShift.map(x => {
          x.rank -= 1;
          return sb.from("reviews").update({ rank: x.rank }).eq("id", x.docId);
        }));
      }
    }

    updateStats();
    renderAdminReviews();
    showAdminToast("🗑️", "Review deleted");
  } catch (e) {
    showAdminToast("❌", "Failed to delete review: " + e.message);
  }
}

// ============================================================
// DELETE MODAL HELPERS
// ============================================================
function openDeleteModal() {
  const modal = document.getElementById("deleteModal");
  modal.classList.remove("hidden");
  modal.classList.add("flex");
  document.body.classList.add("modal-open");
}

function closeDeleteModal() {
  const modal = document.getElementById("deleteModal");
  modal.classList.add("hidden");
  modal.classList.remove("flex");
  document.body.classList.remove("modal-open");
  pendingDeleteFn = null;
}

// ============================================================
// STATS
// ============================================================
function updateStats() {
  const sp = document.getElementById("statProducts");
  const sr = document.getElementById("statReviews");
  const so = document.getElementById("statPendingOrders");
  const badge = document.getElementById("pendingOrdersBadge");
  const mobileBadge = document.getElementById("mobileOrdersBadge");

  if (sp) sp.textContent = allProducts.length;
  if (sr) sr.textContent = allReviews.length;

  const pendingCount = allOrders.filter(o => o.status === "pending").length;
  if (so) so.textContent = pendingCount;
  if (badge) {
    badge.textContent = pendingCount;
    badge.classList.toggle("hidden", pendingCount === 0);
  }
  if (mobileBadge) {
    mobileBadge.classList.toggle("hidden", pendingCount === 0);
    mobileBadge.classList.toggle("flex", pendingCount > 0);
  }
}

// ============================================================
// TOAST
// ============================================================
let toastTimer;
function showAdminToast(icon, msg) {
  const toast = document.getElementById("adminToast");
  if (!toast) return;
  document.getElementById("adminToastIcon").textContent = icon;
  document.getElementById("adminToastMsg").textContent  = msg;
  toast.classList.add("show");
  toast.style.opacity = "1";
  toast.style.transform = "translateY(0) translateX(-50%)";
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove("show");
    toast.style.opacity = "0";
    toast.style.transform = "translateY(1rem) translateX(-50%)";
  }, 3000);
}

// ============================================================
// ORDER ROW MAPPING
// ============================================================
function _mapOrderRow(row) {
  const d = row.created_at ? new Date(row.created_at) : null;
  return {
    docId: row.id,
    userId: row.user_id,
    customerName: row.customer_name,
    customerEmail: row.customer_email,
    customerPhone: row.customer_phone,
    deliveryAddress: row.delivery_address,
    items: row.items || [],
    subtotal: row.subtotal,
    deliveryFee: row.delivery_fee,
    totalDiscount: row.total_discount,
    finalTotal: row.final_total,
    orderMode: row.order_mode,
    paymentMethod: row.payment_method,
    status: row.status,
    amountPaid: row.amount_paid,
    completedAt: row.completed_at,
    confirmedAt: row.confirmed_at,
    createdAt: d ? { seconds: d.getTime() / 1000, toDate: () => d } : null
  };
}

// ============================================================
// ORDERS
// ============================================================
let allOrders = [];

function loadAllOrders() {
  sb.from("orders").select("*").order("created_at", { ascending: false })
    .then(({ data, error }) => {
      if (error) throw error;
      allOrders = (data || []).map(_mapOrderRow);
      updateStats();
      renderAdminOrders();
    })
    .catch(() => {
      allOrders = [];
      renderAdminOrders();
    });
}

function renderAdminOrders() {
  const statusFilter = document.getElementById("orderStatusFilter")?.value || "all";
  const loading      = document.getElementById("orderLoadingState");
  const container    = document.getElementById("ordersContainer");
  const emptyEl      = document.getElementById("ordersEmpty");

  loading?.classList.add("hidden");

  const filtered = statusFilter === "all"
    ? allOrders
    : allOrders.filter(o => o.status === statusFilter);

  if (filtered.length === 0) {
    container?.classList.add("hidden");
    emptyEl?.classList.remove("hidden");
    return;
  }

  emptyEl?.classList.add("hidden");
  container?.classList.remove("hidden");

  const statusColors = {
    pending:   "bg-yellow-50 text-yellow-700 border-yellow-200",
    confirmed: "bg-blue-50 text-blue-700 border-blue-200",
    completed: "bg-green-50 text-green-700 border-green-200",
    cancelled: "bg-red-50 text-red-600 border-red-200"
  };

  container.innerHTML = filtered.map(order => {
    const date = order.createdAt?.toDate
      ? order.createdAt.toDate().toLocaleString("en-NG", { day:"numeric", month:"short", year:"numeric", hour:"2-digit", minute:"2-digit" })
      : "—";

    const status = order.status || "pending";
    const statusColor = statusColors[status] || statusColors.pending;
    // finalTotal is the field actually written at checkout; `total` kept as a fallback for any legacy orders.
    const total = Number(order.finalTotal ?? order.total ?? 0);

    const items = (order.items || []).map(i =>
      `<div class="flex justify-between text-xs text-gray-600 py-1 border-b border-gray-50 last:border-0">
        <span class="flex-1 pr-2">${escapeHtml(i.name)} <span class="text-gray-400">x${i.qty}</span></span>
        <span class="font-semibold text-gray-800 flex-shrink-0">₦${(i.price * i.qty).toLocaleString()}</span>
      </div>`
    ).join("");

    let paidLine = "";
    if (order.amountPaid != null) {
      const confirmedDate = order.confirmedAt?.toDate
        ? order.confirmedAt.toDate().toLocaleString("en-NG", { day:"numeric", month:"short", hour:"2-digit", minute:"2-digit" })
        : "—";
      paidLine = `<p class="text-xs text-green-700 mt-1">💰 Paid ₦${Number(order.amountPaid).toLocaleString()} · confirmed ${confirmedDate}</p>`;
    }

    let actions = "";
    if (status === "pending") {
      actions = `
        <button onclick="openConfirmOrderModal('${order.docId}')" class="text-xs font-bold px-3 py-1.5 rounded-lg text-white transition" style="background:#000080;">✅ Confirm Payment</button>
        <button onclick="cancelOrder('${order.docId}')" class="text-xs font-bold px-3 py-1.5 rounded-lg bg-red-100 hover:bg-red-200 text-red-600 transition">✕ Cancel</button>
      `;
    } else if (status === "confirmed") {
      actions = `
        <button onclick="markCompleted('${order.docId}')" class="text-xs font-bold px-3 py-1.5 rounded-lg bg-green-500 hover:bg-green-600 text-white transition">📦 Mark Completed</button>
        <button onclick="openReceiptModal('${order.docId}')" class="text-xs font-semibold px-4 py-1.5 rounded-lg border transition hover:bg-gray-50" style="color:#000080; border-color:#000080;">🧾 Receipt</button>
        <button onclick="revertToPending('${order.docId}')" class="text-xs font-bold px-3 py-1.5 rounded-lg bg-yellow-100 hover:bg-yellow-200 text-yellow-700 transition">↩ Revert to Pending</button>
        <button onclick="cancelOrder('${order.docId}')" class="text-xs font-bold px-3 py-1.5 rounded-lg bg-red-100 hover:bg-red-200 text-red-600 transition">✕ Cancel</button>
      `;
    } else if (status === "completed") {
      actions = `
        <button onclick="openReceiptModal('${order.docId}')" class="text-xs font-semibold px-4 py-1.5 rounded-lg border transition hover:bg-gray-50" style="color:#000080; border-color:#000080;">🧾 Receipt</button>
        <button onclick="revertToConfirmed('${order.docId}')" class="text-xs font-bold px-3 py-1.5 rounded-lg bg-blue-100 hover:bg-blue-200 text-blue-700 transition">↩ Revert to Confirmed</button>
      `;
    } else if (status === "cancelled") {
      actions = `
        <button onclick="revertToPending('${order.docId}')" class="text-xs font-bold px-3 py-1.5 rounded-lg bg-yellow-100 hover:bg-yellow-200 text-yellow-700 transition">↩ Reactivate to Pending</button>
      `;
    }

    return `
      <div class="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div class="flex items-start justify-between gap-3 p-4 border-b border-gray-50">
          <div class="min-w-0">
            <div class="flex items-center gap-2 flex-wrap">
              <p class="font-black text-gray-900 text-sm">Order #${order.docId.slice(-6).toUpperCase()}</p>
              <span class="text-[10px] font-bold px-2 py-0.5 rounded-full border ${statusColor} capitalize">${status}</span>
            </div>
            <p class="text-xs text-gray-400 mt-0.5">${date}</p>
            ${paidLine}
          </div>
          <p class="font-black text-gray-900 flex-shrink-0">₦${total.toLocaleString()}</p>
        </div>

        <div class="p-4 grid sm:grid-cols-2 gap-4">
          <!-- Customer info -->
          <div>
            <p class="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-2">Customer</p>
            <p class="text-sm font-semibold text-gray-800">${escapeHtml(order.customerName || "—")}</p>
            <p class="text-xs text-gray-500 mt-0.5">📞 ${escapeHtml(order.customerPhone || "—")}</p>
            <p class="text-xs text-gray-500 mt-0.5">✉️ ${escapeHtml(order.customerEmail || "—")}</p>
            <p class="text-xs text-gray-500 mt-0.5">🏠 ${escapeHtml(order.deliveryAddress || "—")}</p>
          </div>

          <!-- Items -->
          <div>
            <p class="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-2">Items (${order.items?.length || 0})</p>
            <div>${items}</div>
          </div>
        </div>

        <!-- Status action buttons -->
        <div class="px-4 pb-4 flex items-center gap-2 flex-wrap">
          ${actions}
        </div>
      </div>
    `;
  }).join("");
}

// Generic order-status writer. firestoreFields/localFields/deleteFields keep
// their original names for minimal diff, even though this now writes to
// Supabase — firestoreFields values are plain ISO date strings or numbers
// now (no more FieldValue sentinels), and deleteFields set the column to
// null instead of removing it (Postgres has no concept of a "missing" field).
const _ORDER_FIELD_MAP = { completedAt: "completed_at", confirmedAt: "confirmed_at", amountPaid: "amount_paid" };

async function updateOrderStatus(docId, newStatus, opts = {}) {
  const { firestoreFields = {}, localFields = {}, deleteFields = [] } = opts;
  const payload = { status: newStatus };
  for (const [key, val] of Object.entries(firestoreFields)) {
    payload[_ORDER_FIELD_MAP[key] || key] = val;
  }
  deleteFields.forEach(f => { payload[_ORDER_FIELD_MAP[f] || f] = null; });

  try {
    const { error } = await sb.from("orders").update(payload).eq("id", docId);
    if (error) throw error;

    const order = allOrders.find(o => o.docId === docId);
    if (order) {
      order.status = newStatus;
      Object.assign(order, localFields);
      deleteFields.forEach(f => { delete order[f]; });
    }

    updateStats();
    renderAdminOrders();
    showAdminToast("✅", `Order marked as ${newStatus}`);
  } catch (e) {
    showAdminToast("❌", "Failed to update: " + e.message);
  }
}

function markCompleted(docId) {
  const now = new Date();
  updateOrderStatus(docId, "completed", {
    firestoreFields: { completedAt: now.toISOString() },
    localFields: { completedAt: { toDate: () => now } }
  });
}

function revertToPending(docId) {
  updateOrderStatus(docId, "pending", {
    deleteFields: ["amountPaid", "confirmedAt", "completedAt"]
  });
}

function revertToConfirmed(docId) {
  updateOrderStatus(docId, "confirmed", {
    deleteFields: ["completedAt"]
  });
}

function cancelOrder(docId) {
  if (!confirm("Cancel this order?")) return;
  updateOrderStatus(docId, "cancelled");
}

// ============================================================
// CONFIRM PAYMENT MODAL
// ============================================================
let _confirmOrderDocId = null;

function openConfirmOrderModal(docId) {
  const order = allOrders.find(o => o.docId === docId);
  if (!order) return;
  _confirmOrderDocId = docId;

  const total = Number(order.finalTotal ?? order.total ?? 0);
  document.getElementById("confirmOrderIdText").textContent = "#" + docId.slice(-6).toUpperCase();
  document.getElementById("confirmOrderTotalText").textContent = "₦" + total.toLocaleString();

  const amountInput = document.getElementById("confirmAmountPaidInput");
  if (amountInput) amountInput.value = total;

  const modal = document.getElementById("confirmOrderModal");
  modal.classList.remove("hidden");
  modal.classList.add("flex");
  document.body.classList.add("modal-open");
}

function closeConfirmOrderModal() {
  const modal = document.getElementById("confirmOrderModal");
  modal.classList.add("hidden");
  modal.classList.remove("flex");
  document.body.classList.remove("modal-open");
  _confirmOrderDocId = null;
}

function submitConfirmOrder() {
  const docId = _confirmOrderDocId;
  if (!docId) return;

  const amountInput = document.getElementById("confirmAmountPaidInput");
  const amountPaid = Number(amountInput?.value);
  if (!amountPaid || amountPaid <= 0) {
    showAdminToast("❌", "Enter a valid amount paid");
    return;
  }

  const now = new Date();
  updateOrderStatus(docId, "confirmed", {
    firestoreFields: { amountPaid, confirmedAt: now.toISOString() },
    localFields: { amountPaid, confirmedAt: { toDate: () => now } }
  });
  closeConfirmOrderModal();
}

// ============================================================
// PAYMENT RECEIPT — build, preview, download, share
// ============================================================
let _receiptOrderDocId = null;

// Compact base64 copy of the Campus Bulkmart leaf logo, embedded directly so the
// receipt/stamp renders correctly regardless of what's deployed alongside the site.
const CBM_STAMP_LOGO_BASE64 = "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";

// Circular double-ring "stamp" mark used both as the seal in the receipt and, faded
// right down, as a full-page watermark. `opacity`/`size` let the same builder serve
// both jobs.
function buildStampSVG(size, opacity, textColor) {
  const cx = size / 2, cy = size / 2;
  const outerR = size * 0.47;
  const innerR = size * 0.41;
  const textR  = size * 0.44;
  const logoSize = size * 0.42;
  const logoOffset = cx - logoSize / 2;

  return `
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" style="opacity:${opacity};">
      <defs>
        <path id="stampRing${size}" d="M ${cx},${cy} m -${textR},0 a ${textR},${textR} 0 1,1 ${textR * 2},0 a ${textR},${textR} 0 1,1 -${textR * 2},0" />
      </defs>
      <circle cx="${cx}" cy="${cy}" r="${outerR}" fill="none" stroke="${textColor}" stroke-width="${size * 0.014}" />
      <circle cx="${cx}" cy="${cy}" r="${innerR}" fill="none" stroke="${textColor}" stroke-width="${size * 0.014}" />
      <text font-family="Outfit, sans-serif" font-weight="900" font-size="${size * 0.078}" fill="${textColor}" letter-spacing="${size * 0.012}">
        <textPath href="#stampRing${size}" startOffset="1%">CBM • VERIFIED • CAMPUS BULKMART •</textPath>
      </text>
      <image href="data:image/png;base64,${CBM_STAMP_LOGO_BASE64}" xlink:href="data:image/png;base64,${CBM_STAMP_LOGO_BASE64}" x="${logoOffset}" y="${logoOffset}" width="${logoSize}" height="${logoSize}" />
    </svg>
  `;
}

function buildReceiptHTML(order) {
  const orderIdShort = order.docId.slice(-6).toUpperCase();
  const amountPaid = Number(order.amountPaid ?? order.finalTotal ?? order.total ?? 0);
  const confirmedDate = order.confirmedAt?.toDate
    ? order.confirmedAt.toDate().toLocaleString("en-NG", { day:"numeric", month:"short", year:"numeric", hour:"2-digit", minute:"2-digit" })
    : "—";

  const items = (order.items || []).map(i => `
    <div style="display:flex; justify-content:space-between; font-size:13px; color:#374151; padding:7px 0; border-bottom:1px solid #f3f4f6;">
      <span>${escapeHtml(i.name)} × ${i.qty || 1}</span>
      <span style="font-weight:700;">₦${((i.price || 0) * (i.qty || 1)).toLocaleString()}</span>
    </div>`).join("");

  return `
    <div style="position:relative; width:600px; background:#ffffff; font-family:'Montserrat',sans-serif; overflow:hidden;">
      <!-- Faint full-page watermark stamp, sits behind everything -->
      <div style="position:absolute; top:50%; left:50%; transform:translate(-50%,-50%) rotate(-8deg); z-index:0; pointer-events:none;">
        ${buildStampSVG(460, 0.05, "#3B592D")}
      </div>

      <div style="position:relative; z-index:1; padding:40px; box-sizing:border-box;">
        <div style="text-align:center; margin-bottom:28px;">
          <p style="font-family:'Outfit',sans-serif; font-weight:900; font-size:26px; color:#000080; margin:0;">Campus Bulkmart</p>
          <p style="font-size:12px; letter-spacing:0.1em; text-transform:uppercase; color:#6b7280; margin:4px 0 0;">Payment Receipt</p>
        </div>

        <div style="border-top:2px solid #000080; border-bottom:2px solid #000080; padding:16px 0; margin-bottom:24px; display:flex; justify-content:space-between; font-size:13px;">
          <div>
            <p style="margin:0; color:#9ca3af;">Order ID</p>
            <p style="margin:2px 0 0; font-weight:800; color:#111827;">#${orderIdShort}</p>
          </div>
          <div style="text-align:right;">
            <p style="margin:0; color:#9ca3af;">Date Confirmed</p>
            <p style="margin:2px 0 0; font-weight:800; color:#111827;">${confirmedDate}</p>
          </div>
        </div>

        <p style="font-size:11px; color:#9ca3af; text-transform:uppercase; letter-spacing:0.08em; margin:0 0 4px;">Billed To</p>
        <p style="font-size:15px; font-weight:700; color:#111827; margin:0 0 22px;">${escapeHtml(order.customerName || "Customer")}</p>

        <p style="font-size:11px; color:#9ca3af; text-transform:uppercase; letter-spacing:0.08em; margin:0 0 8px;">Order Contents</p>
        <div style="margin-bottom:22px;">${items}</div>

        <div style="background:#f4f4f4; border-radius:14px; padding:18px 20px; display:flex; justify-content:space-between; align-items:center; margin-bottom:30px;">
          <span style="font-size:14px; font-weight:700; color:#374151;">Amount Paid</span>
          <span style="font-size:22px; font-weight:900; color:#000080;">₦${amountPaid.toLocaleString()}</span>
        </div>

        <div style="text-align:center;">
          <div style="display:inline-block; transform:rotate(-8deg);">
            ${buildStampSVG(120, 0.92, "#3B592D")}
          </div>
          <p style="font-size:11px; color:#9ca3af; margin-top:12px;">Thank you for shopping with Campus Bulkmart 💙</p>
        </div>
      </div>
    </div>
  `;
}

function openReceiptModal(docId) {
  const order = allOrders.find(o => o.docId === docId);
  if (!order) return;
  _receiptOrderDocId = docId;

  const html = buildReceiptHTML(order);

  // True-size hidden copy — this is what html2canvas actually captures.
  const captureEl = document.getElementById("receiptCaptureContainer");
  if (captureEl) captureEl.innerHTML = html;

  // Visible, scaled-to-fit copy for the modal preview.
  const previewWrap = document.getElementById("receiptPreviewContainer");
  previewWrap.innerHTML = html;
  requestAnimationFrame(() => {
    const inner = previewWrap.firstElementChild;
    if (!inner) return;
    const wrapWidth = previewWrap.clientWidth || 600;
    const scale = Math.min(1, wrapWidth / 600);
    const naturalHeight = inner.offsetHeight;
    inner.style.transform = `scale(${scale})`;
    inner.style.transformOrigin = "top left";
    previewWrap.style.height = (naturalHeight * scale) + "px";
  });

  const modal = document.getElementById("receiptModal");
  modal.classList.remove("hidden");
  modal.classList.add("flex");
  document.body.classList.add("modal-open");

  const shareBtn = document.getElementById("receiptShareBtn");
  if (shareBtn) {
    let supportsFiles = false;
    try {
      supportsFiles = !!(navigator.canShare && navigator.canShare({ files: [new File([""], "test.png", { type: "image/png" })] }));
    } catch (e) { supportsFiles = false; }
    shareBtn.textContent = supportsFiles ? "📤 Send to Customer" : "💬 Open WhatsApp Chat";
  }
}

function closeReceiptModal() {
  const modal = document.getElementById("receiptModal");
  modal.classList.add("hidden");
  modal.classList.remove("flex");
  document.body.classList.remove("modal-open");
  _receiptOrderDocId = null;
}

async function captureReceiptCanvas() {
  const el = document.getElementById("receiptCaptureContainer")?.firstElementChild;
  if (!el || typeof html2canvas !== "function") return null;
  return await html2canvas(el, { scale: 2, backgroundColor: "#ffffff" });
}

async function downloadReceipt() {
  const btn = document.getElementById("receiptDownloadBtn");
  const order = allOrders.find(o => o.docId === _receiptOrderDocId);
  if (!order) return;
  const originalText = btn ? btn.textContent : "";
  if (btn) { btn.disabled = true; btn.textContent = "Generating…"; }

  try {
    const canvas = await captureReceiptCanvas();
    if (!canvas) throw new Error("Could not generate image");
    const orderIdShort = order.docId.slice(-6).toUpperCase();
    const link = document.createElement("a");
    link.download = `CBM-Receipt-${orderIdShort}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
    showAdminToast("✅", "Receipt downloaded");
  } catch (e) {
    showAdminToast("❌", "Could not generate receipt: " + e.message);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = originalText; }
  }
}

async function shareReceipt() {
  const btn = document.getElementById("receiptShareBtn");
  const order = allOrders.find(o => o.docId === _receiptOrderDocId);
  if (!order) return;
  if (btn) btn.disabled = true;

  try {
    const orderIdShort = order.docId.slice(-6).toUpperCase();
    const canvas = await captureReceiptCanvas();
    if (!canvas) throw new Error("Could not generate image");

    const blob = await new Promise(res => canvas.toBlob(res, "image/png"));
    const fileName = `CBM-Receipt-${orderIdShort}.png`;
    const captionText = `Payment receipt for Order #${orderIdShort} — Campus Bulkmart. Thank you for your order!`;
    const file = new File([blob], fileName, { type: "image/png" });
    const canShareFiles = !!(navigator.canShare && navigator.canShare({ files: [file] }));

    if (canShareFiles) {
      await navigator.share({ files: [file], text: captionText });
      showAdminToast("✅", "Receipt ready to send");
    } else {
      // Fallback for browsers without file-sharing support: download the image,
      // then open a WhatsApp chat with the caption pre-filled so it's a one-drag
      // attach instead of a fully manual process.
      const link = document.createElement("a");
      link.download = fileName;
      link.href = canvas.toDataURL("image/png");
      link.click();
      const phoneDigits = (order.customerPhone || "").replace(/[^\d]/g, "");
      const waUrl = phoneDigits
        ? `https://wa.me/${phoneDigits}?text=${encodeURIComponent(captionText)}`
        : `https://wa.me/?text=${encodeURIComponent(captionText)}`;
      window.open(waUrl, "_blank");
      showAdminToast("ℹ️", "Image downloaded — attach it in the WhatsApp chat that just opened");
    }
  } catch (e) {
    if (e.name !== "AbortError") { // user closed the native share sheet — not a real error
      showAdminToast("❌", "Could not share receipt: " + e.message);
    }
  } finally {
    if (btn) btn.disabled = false;
  }
}

// ============================================================
// UTILS
// ============================================================
function escapeHtml(str) {
  if (!str) return "";
  return str.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;");
}

function escapeForAttr(str) {
  if (!str) return "";
  return str.replace(/'/g, "\\'").replace(/"/g, "&quot;");
}

// ============================================================
// MOBILE SEARCH FULLSCREEN
// ============================================================
function openAdminSearchSheet() {
  var overlay = document.getElementById("adminSearchOverlay");
  var input   = document.getElementById("adminSheetInput");
  if (!overlay) return;

  overlay.style.display = "flex";
  if (input) {
    input.value = "";
    setTimeout(function(){ input.focus(); }, 50);
  }
  handleAdminSheetSearch("");
}

function closeAdminSearchSheet() {
  var overlay = document.getElementById("adminSearchOverlay");
  if (overlay) overlay.style.display = "none";
  renderAdminProducts();
}

function handleAdminSheetSearch(value) {
  var clearBtn = document.getElementById("adminSheetClearBtn");
  if (clearBtn) clearBtn.style.display = value.trim() ? "block" : "none";
  renderAdminSheetResults(value.trim());

  // Update trigger badge
  var badge = document.getElementById("adminSearchTriggerBadge");
  var label = document.getElementById("adminSearchTriggerLabel");
  if (value.trim()) {
    if (badge) { badge.textContent = value.trim(); badge.style.display = "inline-block"; }
    if (label) { label.style.color = "#1a1a1a"; label.textContent = "Searching:"; }
  } else {
    if (badge) badge.style.display = "none";
    if (label) { label.style.color = "#9ca3af"; label.textContent = "Search products e.g. rice, soap…"; }
  }
  adminProductSearchQuery = value.trim();
}

function clearAdminSheetSearch() {
  var input = document.getElementById("adminSheetInput");
  if (input) { input.value = ""; input.focus(); }
  handleAdminSheetSearch("");
}

function renderAdminSheetResults(query) {
  var resultsEl = document.getElementById("adminSheetResults");
  var defaultEl = document.getElementById("adminSheetDefault");
  var emptyEl   = document.getElementById("adminSheetEmpty");
  if (!resultsEl) return;

  if (!query) {
    resultsEl.style.display = "none";
    if (emptyEl) emptyEl.style.display = "none";
    if (defaultEl) defaultEl.style.display = "block";
    return;
  }

  var q = query.toLowerCase();
  var filtered = allProducts.filter(function(p) {
    return p.name.toLowerCase().includes(q) ||
      (p.desc || "").toLowerCase().includes(q) ||
      (p.category || "").toLowerCase().replace(/-/g, " ").includes(q);
  });

  if (defaultEl) defaultEl.style.display = "none";

  if (filtered.length === 0) {
    resultsEl.style.display = "none";
    if (emptyEl) emptyEl.style.display = "block";
    return;
  }

  if (emptyEl) emptyEl.style.display = "none";
  resultsEl.style.display = "block";
  resultsEl.innerHTML = "";
  filtered.forEach(function(p) {
    var div = document.createElement("div");
    div.style.cssText = "display:flex;align-items:center;gap:12px;padding:14px 16px;border-bottom:1px solid #f3f4f6;cursor:pointer;";
    div.addEventListener("click", (function(pid) {
      return function() { closeAdminSearchSheet(); setTimeout(function(){ openAdminPreviewModal(pid); }, 200); };
    })(p.id));

    var img = document.createElement("img");
    img.src = p.image || "";
    img.alt = p.name;
    img.style.cssText = "width:48px;height:48px;border-radius:12px;object-fit:cover;flex-shrink:0;background:#f3f4f6;";
    img.onerror = function(){ this.src = "https://placehold.co/80x80/e5e7eb/9ca3af?text=?"; };

    var info = document.createElement("div");
    info.style.cssText = "flex:1;min-width:0;";

    var name = document.createElement("p");
    name.textContent = p.name;
    name.style.cssText = "font-weight:600;color:#1f2937;font-size:14px;margin:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";

    var cat = document.createElement("p");
    cat.textContent = (p.category || "").replace(/-/g, " ") + (p.isTopPick ? " · ⚡ Top Pick" : "");
    cat.style.cssText = "font-size:12px;color:#9ca3af;margin:3px 0 0;text-transform:capitalize;";

    var price = document.createElement("p");
    price.textContent = "₦" + Number(p.price || 0).toLocaleString();
    price.style.cssText = "font-weight:900;font-size:14px;color:#000080;flex-shrink:0;margin:0;";

    info.appendChild(name);
    info.appendChild(cat);
    div.appendChild(img);
    div.appendChild(info);
    div.appendChild(price);
    resultsEl.appendChild(div);
  });
}
// Enter key to save edit/add product modals
document.addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  const editModal = document.getElementById("editModal");
  if (editModal && !editModal.classList.contains("hidden")) {
    saveEditProduct();
    return;
  }
  const addModal = document.getElementById("addProductModal");
  if (addModal && !addModal.classList.contains("hidden")) {
    document.querySelector("#addProductModal button[onclick*='addProduct']")?.click();
  }
});
// ============================================================
// CLONE PRODUCT
// ============================================================
function cloneProduct(productId) {
  const p = allProducts.find(x => x.id === productId);
  if (!p) return;

  // Switch to add product tab and pre-fill fields
  const btn = document.querySelector('.tab-btn[onclick*="add-product"]');
  switchTab("add-product", btn);

  setTimeout(() => {
    const nameEl = document.getElementById("newName");
    const catEl  = document.getElementById("newCategory");
    const priceEl = document.getElementById("newPrice");
    const descEl  = document.getElementById("newDesc");
    const imageEl = document.getElementById("newImage");
    const topPickEl = document.getElementById("newIsTopPick");
    const groupEl = document.getElementById("newAllowGroupOrder");

    if (nameEl)   nameEl.value   = "Copy of " + (p.name || "");
    if (catEl)    catEl.value    = p.category || "";
    if (priceEl)  priceEl.value  = p.price || "";
    if (descEl)   descEl.value   = p.desc || "";
    if (imageEl)  imageEl.value  = p.image || "";
    if (topPickEl) topPickEl.checked = !!p.isTopPick;
    if (groupEl)  groupEl.checked = p.allowGroupOrder !== false;

    showAdminToast("⧉", "Product cloned — edit details and save");
  }, 120);
}

// ============================================================
// MARKET LIST (Wholesale Shopping Manifest)
// ============================================================
let marketListData = { aggregated: [], byRoom: [] };

function generateMarketList() {
  // Anything not yet delivered (completed) or cancelled still needs to be bought/packed —
  // that includes both unconfirmed "pending" orders and paid "confirmed" ones.
  const openOrders = allOrders.filter(o => o.status === "pending" || o.status === "confirmed");

  if (openOrders.length === 0) {
    showAdminToast("ℹ️", "No open orders to aggregate");
    return;
  }

  // Look up each order item's matching product by name so we can pull its cost price
  // (what you actually pay at the market) and market name (what to call/ask for it
  // when shopping — orders only ever store the customer-facing name + selling price).
  const productByName = {};
  allProducts.forEach(p => { productByName[(p.name || "").trim().toLowerCase()] = p; });

  // Aggregate items across all open orders
  const itemMap = {};
  openOrders.forEach(order => {
    (order.items || []).forEach(item => {
      const key = item.name;
      if (!itemMap[key]) {
        const product = productByName[(item.name || "").trim().toLowerCase()];
        const hasCostPrice = product && product.costPrice != null && product.costPrice !== "";
        itemMap[key] = {
          name: item.name,
          qty: 0,
          unitPrice: item.price,
          // Cost price is what you pay at the market — falls back to the selling
          // price if the admin hasn't set one for this product yet.
          costPrice: hasCostPrice ? Number(product.costPrice) : item.price,
          hasCostPrice: !!hasCostPrice,
          marketName: (product && product.marketName) ? product.marketName : item.name
        };
      }
      itemMap[key].qty += (item.qty || 1);
    });
  });

  marketListData.aggregated = Object.values(itemMap).sort((a, b) => b.qty - a.qty);

  // Build Pack & Sort: group by delivery address (hostel block/room)
  const roomMap = {};
  openOrders.forEach(order => {
    const addr = order.deliveryAddress || "Unknown Location";
    const customer = order.customerName || order.customerEmail || "Unknown";
    if (!roomMap[addr]) roomMap[addr] = { address: addr, orders: [] };
    roomMap[addr].orders.push({
      customer,
      orderId: order.docId.slice(-6).toUpperCase(),
      items: (order.items || []).map(item => {
        const product = productByName[(item.name || "").trim().toLowerCase()];
        return {
          ...item,
          marketName: (product && product.marketName) ? product.marketName : item.name
        };
      })
    });
  });

  marketListData.byRoom = Object.values(roomMap).sort((a, b) => a.address.localeCompare(b.address));

  // Render
  renderMarketBuyList();
  renderMarketPackList();

  const panel = document.getElementById("marketListPanel");
  const subtitle = document.getElementById("marketListSubtitle");
  panel.classList.remove("hidden");
  subtitle.textContent = `${openOrders.length} open order${openOrders.length !== 1 ? 's' : ''} · ${marketListData.aggregated.length} unique item${marketListData.aggregated.length !== 1 ? 's' : ''}`;

  panel.scrollIntoView({ behavior: "smooth", block: "start" });
  showAdminToast("🛒", `Market list generated — ${marketListData.aggregated.length} items`);
}

function renderMarketBuyList() {
  const el = document.getElementById("marketBuyList");
  if (!el) return;

  if (marketListData.aggregated.length === 0) {
    el.innerHTML = '<p class="text-gray-400 text-sm">No items found.</p>';
    return;
  }

  const grandTotal = marketListData.aggregated.reduce((sum, item) => sum + (item.costPrice * item.qty), 0);

  el.innerHTML = marketListData.aggregated.map((item, i) => `
    <div class="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-3 gap-3">
      <div class="flex items-center gap-3 min-w-0">
        <span class="w-7 h-7 rounded-full flex items-center justify-center text-xs font-black text-white flex-shrink-0" style="background:#000080;">${i + 1}</span>
        <div class="min-w-0">
          <p class="font-semibold text-gray-800 text-sm truncate">${escapeHtml(item.marketName)}</p>
          ${item.marketName !== item.name ? `<p class="text-[10px] text-gray-400 truncate">sold as: ${escapeHtml(item.name)}</p>` : ""}
        </div>
      </div>
      <div class="flex items-center gap-3 flex-shrink-0 text-right">
        <div>
          <p class="font-black text-lg text-gray-900 leading-none">${item.qty}×</p>
          <p class="text-[10px] text-gray-400 mt-0.5">₦${Number(item.costPrice || 0).toLocaleString()} ea${item.hasCostPrice ? "" : " (selling price)"}</p>
        </div>
        <p class="font-black text-sm text-gray-900 w-20">₦${Number(item.costPrice * item.qty).toLocaleString()}</p>
      </div>
    </div>
  `).join("") + `
    <div class="flex items-center justify-between px-4 py-3 mt-1 rounded-xl text-white font-black text-sm" style="background:#000080;">
      <span>Estimated Total</span>
      <span>₦${Number(grandTotal).toLocaleString()}</span>
    </div>
  `;
}

// Builds one printable page of the buy list — same visual language as the payment
// receipt, kept plain (no watermark) since this is a working shopping list, not a
// customer-facing document.
function buildMarketListPageHTML(items, startIndex, pageNum, totalPages, generatedDate, grandTotal) {
  const rows = items.map((item, i) => `
    <div style="display:flex; align-items:center; justify-content:space-between; padding:10px 0; border-bottom:1px solid #f3f4f6; gap:10px;">
      <div style="display:flex; align-items:center; gap:10px; min-width:0;">
        <span style="width:22px; height:22px; border-radius:50%; background:#000080; color:#fff; font-size:11px; font-weight:800; display:inline-flex; align-items:center; justify-content:center; flex-shrink:0;">${startIndex + i + 1}</span>
        <div style="min-width:0;">
          <p style="font-size:13px; font-weight:600; color:#111827; margin:0;">${escapeHtml(item.marketName)}</p>
          ${item.marketName !== item.name ? `<p style="font-size:10px; color:#9ca3af; margin:1px 0 0;">sold as: ${escapeHtml(item.name)}</p>` : ""}
        </div>
      </div>
      <div style="text-align:right; flex-shrink:0;">
        <div><span style="font-size:15px; font-weight:900; color:#000080;">${item.qty}×</span>
        <span style="font-size:11px; color:#9ca3af; margin-left:8px;">₦${Number(item.costPrice || 0).toLocaleString()} ea${item.hasCostPrice ? "" : " (selling price)"}</span></div>
        <p style="font-size:12px; font-weight:800; color:#111827; margin:2px 0 0;">₦${Number(item.costPrice * item.qty).toLocaleString()}</p>
      </div>
    </div>
  `).join("");

  const pageLabel = totalPages > 1 ? `Page ${pageNum} of ${totalPages}` : "Market Buy List";
  const totalRow = grandTotal != null ? `
      <div style="display:flex; justify-content:space-between; align-items:center; background:#000080; color:#fff; border-radius:10px; padding:12px 16px; margin-top:16px; font-weight:900; font-size:14px;">
        <span>Estimated Total</span>
        <span>₦${Number(grandTotal).toLocaleString()}</span>
      </div>` : "";

  return `
    <div style="width:600px; background:#ffffff; font-family:'Montserrat',sans-serif; padding:40px; box-sizing:border-box;">
      <div style="text-align:center; margin-bottom:24px;">
        <p style="font-family:'Outfit',sans-serif; font-weight:900; font-size:24px; color:#000080; margin:0;">Campus Bulkmart</p>
        <p style="font-size:12px; letter-spacing:0.1em; text-transform:uppercase; color:#6b7280; margin:4px 0 0;">Market Buy List</p>
      </div>
      <div style="border-top:2px solid #000080; border-bottom:2px solid #000080; padding:14px 0; margin-bottom:20px; display:flex; justify-content:space-between; font-size:12px;">
        <span style="color:#9ca3af;">Generated ${generatedDate}</span>
        <span style="font-weight:800; color:#111827;">${pageLabel}</span>
      </div>
      <div>${rows}</div>
      ${totalRow}
      <p style="font-size:11px; color:#9ca3af; text-align:center; margin-top:24px;">${items.length} item${items.length !== 1 ? 's' : ''} on this page</p>
    </div>
  `;
}

// Downloads the current Buy View as one or more PNGs. Splits into multiple pages
// automatically once the list is long enough that a single image would get unwieldy —
// so a 12-item list is one image, a 60-item list becomes 3 images, and so on.
async function downloadMarketBuyList() {
  const btn = document.getElementById("marketListPrintBtn");
  const items = marketListData.aggregated;

  if (!items || items.length === 0) {
    showAdminToast("ℹ️", "Nothing to print yet — generate the list first");
    return;
  }

  const originalText = btn ? btn.textContent : "";
  if (btn) { btn.disabled = true; btn.textContent = "Generating…"; }

  try {
    const ITEMS_PER_PAGE = 22; // comfortably fits one 600px-wide page without feeling cramped
    const totalPages = Math.ceil(items.length / ITEMS_PER_PAGE);
    const generatedDate = new Date().toLocaleString("en-NG", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
    const grandTotal = items.reduce((sum, item) => sum + (item.costPrice * item.qty), 0);
    const captureEl = document.getElementById("receiptCaptureContainer"); // reused — not in use at the same time as the receipt modal

    for (let page = 0; page < totalPages; page++) {
      const startIndex = page * ITEMS_PER_PAGE;
      const pageItems = items.slice(startIndex, startIndex + ITEMS_PER_PAGE);
      const isLastPage = page === totalPages - 1;
      captureEl.innerHTML = buildMarketListPageHTML(pageItems, startIndex, page + 1, totalPages, generatedDate, isLastPage ? grandTotal : null);

      // let the browser lay the template out before we snapshot it
      await new Promise(r => requestAnimationFrame(r));

      const canvas = await html2canvas(captureEl.firstElementChild, { scale: 2, backgroundColor: "#ffffff" });
      const fileName = totalPages > 1
        ? `CBM-MarketList-Page${page + 1}-of-${totalPages}.png`
        : `CBM-MarketList.png`;
      const link = document.createElement("a");
      link.download = fileName;
      link.href = canvas.toDataURL("image/png");
      link.click();

      // Small gap between downloads — back-to-back auto-downloads can otherwise get
      // blocked by the browser's multi-download prompt.
      if (page < totalPages - 1) await new Promise(r => setTimeout(r, 400));
    }

    showAdminToast("✅", totalPages > 1 ? `Downloaded ${totalPages} pages` : "Market list downloaded");
  } catch (e) {
    showAdminToast("❌", "Could not generate market list: " + e.message);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = originalText; }
  }
}

function renderMarketPackList() {
  const el = document.getElementById("marketPackList");
  if (!el) return;

  if (marketListData.byRoom.length === 0) {
    el.innerHTML = '<p class="text-gray-400 text-sm">No delivery data found.</p>';
    return;
  }

  el.innerHTML = marketListData.byRoom.map(room => `
    <div class="bg-gray-50 rounded-xl overflow-hidden">
      <div class="px-4 py-2.5 font-bold text-sm text-white flex items-center gap-2" style="background:#000080;">
        <span>🏠</span>
        <span>${escapeHtml(room.address)}</span>
        <span class="ml-auto text-xs font-normal opacity-75">${room.orders.length} order${room.orders.length !== 1 ? 's' : ''}</span>
      </div>
      ${room.orders.map(o => `
        <div class="px-4 py-3 border-b border-gray-100 last:border-0">
          <div class="flex items-center justify-between mb-2">
            <p class="font-semibold text-gray-800 text-xs">${escapeHtml(o.customer)}</p>
            <span class="text-[10px] font-bold text-gray-400">Order #${o.orderId}</span>
          </div>
          ${o.items.map(i => `
            <div class="flex justify-between items-start text-xs text-gray-600 py-0.5 gap-2">
              <span class="min-w-0">
                <span class="block truncate">${escapeHtml(i.marketName || i.name)}</span>
                ${i.marketName && i.marketName !== i.name ? `<span class="block text-[9px] text-gray-400 truncate">sold as: ${escapeHtml(i.name)}</span>` : ""}
              </span>
              <span class="font-bold text-gray-800 flex-shrink-0">×${i.qty || 1}</span>
            </div>
          `).join("")}
        </div>
      `).join("")}
    </div>
  `).join("");
}

function toggleMarketView(view) {
  const buyView  = document.getElementById("marketBuyView");
  const packView = document.getElementById("marketPackView");
  const btnBuy   = document.getElementById("btnBuyView");
  const btnPack  = document.getElementById("btnPackView");

  if (view === "buy") {
    buyView.classList.remove("hidden");
    packView.classList.add("hidden");
    btnBuy.style.background = "#000080"; btnBuy.classList.add("text-white"); btnBuy.classList.remove("text-gray-600");
    btnPack.style.background = ""; btnPack.classList.add("bg-gray-100","text-gray-600"); btnPack.classList.remove("text-white");
  } else {
    packView.classList.remove("hidden");
    buyView.classList.add("hidden");
    btnPack.style.background = "#000080"; btnPack.classList.add("text-white"); btnPack.classList.remove("text-gray-600","bg-gray-100");
    btnBuy.style.background = ""; btnBuy.classList.add("bg-gray-100","text-gray-600"); btnBuy.classList.remove("text-white");
  }
}

function closeMarketList() {
  document.getElementById("marketListPanel")?.classList.add("hidden");
}

// ============================================================
// USERS & ORDER HISTORY LOOKUP
// ============================================================
let userSearchDebounce = null;

function handleUserSearch(value) {
  clearTimeout(userSearchDebounce);
  if (!value.trim()) return;
  userSearchDebounce = setTimeout(() => {
    if (value.includes("@")) searchUser();
  }, 600);
}

async function searchUser() {
  const emailRaw = document.getElementById("userEmailSearch")?.value.trim();
  if (!emailRaw) return;

  const resultArea = document.getElementById("userSearchResult");
  resultArea.innerHTML = `
    <div class="flex justify-center py-10">
      <div class="text-center">
        <div class="spinner mx-auto mb-3"></div>
        <p class="text-gray-400 text-sm">Searching for ${escapeHtml(emailRaw)}…</p>
      </div>
    </div>`;

  try {
    // Query users table
    const { data: userRows, error: userErr } = await sb.from("users").select("*").eq("email", emailRaw).limit(1);
    if (userErr) throw userErr;

    let userData = null;
    if (userRows && userRows.length > 0) {
      const row = userRows[0];
      const d = row.created_at ? new Date(row.created_at) : null;
      userData = {
        id: row.uid,
        username: row.username,
        displayName: row.display_name,
        email: row.email,
        walletBalance: row.wallet_balance,
        role: row.role,
        createdAt: d ? { toDate: () => d } : null
      };
    }

    // Query orders by email
    const { data: orderRows, error: orderErr } = await sb.from("orders").select("*").eq("customer_email", emailRaw).order("created_at", { ascending: false });
    if (orderErr) throw orderErr;

    const orders = (orderRows || []).map(_mapOrderRow);

    renderUserProfile(emailRaw, userData, orders);
  } catch (e) {
    resultArea.innerHTML = `
      <div class="bg-red-50 border border-red-100 rounded-2xl p-5 text-sm text-red-600">
        ❌ Query failed: ${escapeHtml(e.message)}<br>
        <span class="text-xs text-red-400">Ensure your Supabase RLS policies allow admin reads on the users and orders tables.</span>
      </div>`;
  }
}

function renderUserProfile(email, userData, orders) {
  const resultArea = document.getElementById("userSearchResult");

  const statusColors = {
    pending:   "bg-yellow-50 text-yellow-700 border-yellow-200",
    confirmed: "bg-blue-50 text-blue-700 border-blue-200",
    completed: "bg-green-50 text-green-700 border-green-200",
    cancelled: "bg-red-50 text-red-600 border-red-200"
  };

  const orderCards = orders.length === 0
    ? '<p class="text-gray-400 text-sm text-center py-8">No orders found for this email.</p>'
    : orders.map(order => {
        const date = order.createdAt?.toDate
          ? order.createdAt.toDate().toLocaleString("en-NG", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
          : "—";
        const statusColor = statusColors[order.status] || statusColors.pending;
        const isGroup = order.orderType === "group" || order.isGroupOrder;
        const subtotal = (order.items || []).reduce((sum, i) => sum + ((i.price || 0) * (i.qty || 1)), 0);
        const deliveryFee = Number(order.deliveryFee || 0);
        const total = Number(order.finalTotal ?? order.total ?? (subtotal + deliveryFee));

        return `
          <div class="border border-gray-100 rounded-2xl overflow-hidden">
            <div class="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-100">
              <div class="flex items-center gap-2 flex-wrap">
                <p class="font-bold text-gray-800 text-sm">Order #${order.docId.slice(-6).toUpperCase()}</p>
                <span class="text-[10px] font-bold px-2 py-0.5 rounded-full border ${statusColor} capitalize">${order.status || 'pending'}</span>
                ${isGroup ? '<span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200">👥 Group Order</span>' : '<span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 border border-gray-200">👤 Individual</span>'}
              </div>
              <p class="text-xs text-gray-400 flex-shrink-0">${date}</p>
            </div>
            <div class="px-4 py-3">
              <div class="space-y-1 mb-3">
                ${(order.items || []).map(i => `
                  <div class="flex justify-between text-xs text-gray-600">
                    <span>${escapeHtml(i.name)} <span class="text-gray-400">×${i.qty || 1}</span></span>
                    <span class="font-semibold">₦${((i.price || 0) * (i.qty || 1)).toLocaleString()}</span>
                  </div>
                `).join("")}
              </div>
              <div class="border-t border-gray-100 pt-2 space-y-0.5">
                <div class="flex justify-between text-xs text-gray-400">
                  <span>Subtotal</span><span>₦${subtotal.toLocaleString()}</span>
                </div>
                <div class="flex justify-between text-xs text-gray-400">
                  <span>Delivery Fee</span><span>₦${deliveryFee.toLocaleString()}</span>
                </div>
                <div class="flex justify-between text-sm font-black text-gray-900 pt-1">
                  <span>Total Paid</span><span>₦${total.toLocaleString()}</span>
                </div>
              </div>
            </div>
          </div>
        `;
      }).join("");

  const displayName = userData?.displayName || userData?.name || email.split("@")[0];
  const joinDate = userData?.createdAt?.toDate
    ? userData.createdAt.toDate().toLocaleDateString("en-NG", { day: "numeric", month: "long", year: "numeric" })
    : "—";

  resultArea.innerHTML = `
    <div class="space-y-4">
      <!-- User card -->
      <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex items-center gap-4">
        <div class="w-14 h-14 rounded-full flex items-center justify-center text-2xl font-black text-white flex-shrink-0" style="background:#000080;">
          ${displayName.charAt(0).toUpperCase()}
        </div>
        <div class="min-w-0">
          <p class="font-black text-gray-900 text-lg leading-tight">${escapeHtml(displayName)}</p>
          <p class="text-sm text-gray-500 mt-0.5">${escapeHtml(email)}</p>
          <p class="text-xs text-gray-400 mt-1">Joined: ${joinDate} · ${orders.length} order${orders.length !== 1 ? 's' : ''}</p>
        </div>
      </div>

      <!-- Order timeline -->
      <div>
        <p class="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">Order History (newest first)</p>
        <div class="space-y-3">${orderCards}</div>
      </div>
    </div>
  `;
}

// ============================================================
// CSV BULK IMPORT
// ============================================================
let csvParsedRows = [];
let csvColumnFlags = {};

// ============================================================
// CSV IMPORT — MATCH DETECTION
// Decides whether a CSV row is the SAME product as one already in Firestore,
// even if its name changed a bit, so a re-upload updates the existing product
// instead of creating a duplicate.
//
// Rule: compare the row against every existing product across whichever of
// these four signals were actually present as columns in the uploaded CSV —
// id, name, desc, cost price. If at least 3 of the available signals match
// (or ALL of them, when fewer than 3 columns are available), it's the same
// product. This means a plain CSV with no id/cost-price column (just
// name/category/price/desc) requires BOTH name and desc to match — slightly
// stricter than the old "name only" rule, on purpose, so a coincidental same
// name doesn't silently overwrite an unrelated product.
// ============================================================
function findMatchingProduct(row) {
  const available = ["name", "desc"];
  if (csvColumnFlags.hasId)        available.push("id");
  if (csvColumnFlags.hasCostPrice) available.push("costPrice");
  const required = Math.min(3, available.length);

  const normName = (row.name || "").trim().toLowerCase();
  const normDesc = (row.desc || "").trim().toLowerCase();
  const rowCost  = (row.costPrice === undefined || row.costPrice === null) ? null : Number(row.costPrice);

  let best = null, bestScore = 0;
  allProducts.forEach(p => {
    let score = 0;
    if (available.includes("name") && (p.name || "").trim().toLowerCase() === normName) score++;
    if (available.includes("desc") && (p.desc || "").trim().toLowerCase() === normDesc) score++;
    if (available.includes("id") && row.id && row.id === p.id) score++;
    if (available.includes("costPrice")) {
      const pCost = (p.costPrice === undefined || p.costPrice === null || p.costPrice === "") ? null : Number(p.costPrice);
      if (pCost === rowCost) score++; // both unset also counts as a match
    }
    if (score > bestScore) { bestScore = score; best = p; }
  });

  return (best && bestScore >= required) ? { product: best, score: bestScore, required } : null;
}

// ============================================================
// PRODUCT CSV — DOWNLOAD BLANK TEMPLATE (for bulk import)
// Columns match exactly what parseCsv() below expects.
// ============================================================
function downloadProductCsvTemplate() {
  const csv = [
    "name,category,price,desc,image,isTopPick,allowGroupOrder,variants,costprice,marketname",
    "Premium Rice Bag (Mini Lot),groceries,4500,High-grade parboiled rice in a convenient mini-lot,https://example.com/rice.jpg,true,true,,4000,Rice (half crate)",
    "Exams Success Stationery Bundle,stationeries,1000,Complete exam-prep set with pens and rulers,https://example.com/stationery.jpg,false,true,,700,Stationery bundle pack",
    "Nail Tech Custom Setup,hostel-services,3500,Professional on-campus nail extension and polishing,https://example.com/nails.jpg,false,false,,,",
    "Sample Product With Variants,groceries,,A product sold in multiple sizes,https://example.com/sample.jpg,false,true,\"500g:3000/1kg:5500\",,",
  ].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url; a.download = "product_import_template.csv";
  a.click(); URL.revokeObjectURL(url);
}

// ============================================================
// PRODUCT CSV — EXPORT CURRENT PRODUCT LIST
// Downloads every product currently loaded in the admin panel in the
// same column format as the import template, so it can be edited and
// re-imported (merge mode) or just kept as a backup/reference.
// ============================================================
function exportProductsCsv() {
  if (allProducts.length === 0) {
    showAdminToast("❌", "No products to export yet");
    return;
  }

  const escapeCsvField = (val) => {
    const str = String(val ?? "");
    return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
  };

  // "id" is included here (export of existing products) but deliberately NOT in
  // downloadProductCsvTemplate() — new products don't have an id yet. On re-import,
  // a matching id is the strongest possible signal that a row is the same product.
  const rows = [["id", "name", "category", "price", "desc", "image", "isTopPick", "allowGroupOrder", "variants", "costprice", "marketname"]];

  allProducts.forEach(p => {
    const variantsStr = Array.isArray(p.variants) && p.variants.length > 0
      ? p.variants.map(v => `${v.name}:${v.price}`).join("/")
      : "";
    rows.push([
      p.id || "",
      p.name || "",
      p.category || "",
      p.price ?? "",
      p.desc || "",
      p.image || "",
      p.isTopPick ? "true" : "false",
      p.allowGroupOrder === false ? "false" : "true",
      variantsStr,
      p.costPrice ?? "",
      p.marketName || ""
    ]);
  });

  const csv = rows.map(row => row.map(escapeCsvField).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url; a.download = `campus_bulkmart_products_${new Date().toISOString().slice(0,10)}.csv`;
  a.click(); URL.revokeObjectURL(url);
  showAdminToast("✅", `Exported ${allProducts.length} products`);
}

function handleCsvDrop(event) {
  event.preventDefault();
  const dropZone = document.getElementById("csvDropZone");
  dropZone.classList.remove("border-blue-400", "bg-blue-50");
  const file = event.dataTransfer.files[0];
  if (file) handleCsvFile(file);
}

function handleCsvFile(file) {
  if (!file || !file.name.endsWith(".csv")) {
    showAdminToast("❌", "Please upload a .csv file");
    return;
  }

  const reader = new FileReader();
  reader.onload = async (e) => {
    const text = e.target.result;
    await parseCsv(text);
  };
  reader.readAsText(file);
}

function parseCsv(text) {
  return (async () => {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) {
    showAdminToast("❌", "CSV file appears empty");
    return;
  }

  const headers = lines[0].split(",").map(h => h.trim().toLowerCase().replace(/[^a-z]/g, ""));
  const required = ["name", "category", "price", "desc"];
  const missing = required.filter(r => !headers.includes(r));
  if (missing.length > 0) {
    showAdminToast("❌", `Missing columns: ${missing.join(", ")}`);
    return;
  }

  // Fetch categories fresh rather than trusting allCategories, which may
  // not have finished loading yet if the admin drops a CSV in right after
  // the page loads — this was causing valid categories (e.g. "toiletries")
  // to fail validation with a false "unknown category" error.
  let currentCategories = allCategories;
  try {
    const { data, error } = await sb.from("categories").select("slug");
    if (!error && data) currentCategories = data.map(c => ({ slug: c.slug }));
  } catch (e) { /* fall back to whatever allCategories already has */ }

  const VALID_CATEGORIES = ["groceries", "stationeries", "hostel-services", ...currentCategories.map(c => c.slug)];
  const idx = (key) => headers.indexOf(key);

  // isTopPick and allowGroupOrder columns are optional — only read if present
  const hasTopPick     = idx("istoppick") >= 0;
  const hasGroupOrder  = idx("allowgrouporder") >= 0;
  const hasImage       = idx("image") >= 0;
  const hasVariants    = idx("variants") >= 0;
  const hasCostPrice   = idx("costprice") >= 0;
  const hasMarketName  = idx("marketname") >= 0;
  const hasId          = idx("id") >= 0;

  // Stored globally so executeCsvImport() knows exactly which columns were actually
  // present in this upload — needed so it only ever touches fields the admin
  // explicitly included, never fields a column-less row would otherwise default.
  csvColumnFlags = { hasTopPick, hasGroupOrder, hasImage, hasVariants, hasCostPrice, hasMarketName, hasId };

  csvParsedRows = [];
  const errors = [];

  lines.slice(1).forEach((line, i) => {
    // Handle quoted fields
    const cols = line.match(/(".*?"|[^,]+|(?<=,)(?=,)|^(?=,)|(?<=,)$)/g) || line.split(",");
    const clean = cols.map(c => (c || "").replace(/^"|"$/g, "").trim());

    // Guard against column drift: an unquoted comma inside a field (most often
    // "desc") splits into an extra column and silently shifts every later
    // column (isTopPick, allowGroupOrder, variants...) to the right, so a
    // product can end up reading a neighboring column's value. If the field
    // count doesn't match the header count, refuse the row instead of
    // importing it with misaligned data.
    if (clean.length !== headers.length) {
      errors.push(`Row ${i + 2}: has ${clean.length} fields but the header has ${headers.length} — check for a comma inside "desc" (or another field) that isn't wrapped in quotes`);
      return;
    }

    const name     = clean[idx("name")] || "";
    const category = (clean[idx("category")] || "").toLowerCase().trim();
    const priceRaw = clean[idx("price")] || "";
    const desc     = clean[idx("desc")] || "";
    const image    = hasImage ? (clean[idx("image")] || "") : "";
    const variantsRaw = hasVariants ? (clean[idx("variants")] || "") : "";
    const costPriceRaw = hasCostPrice  ? (clean[idx("costprice")]  || "") : "";
    const marketName    = hasMarketName ? (clean[idx("marketname")] || "") : "";
    const idRaw          = hasId ? (clean[idx("id")] || "").trim() : "";

    // Parse variants: "500g:3000/1kg:6000" → [{name:"500g", price:3000}, ...]
    let parsedVariants = [];
    if (variantsRaw.trim()) {
      parsedVariants = variantsRaw.split("/").map(v => {
        const parts = v.trim().split(":");
        const vName  = (parts[0] || "").trim();
        const vPrice = parseFloat(parts[1]);
        return vName && !isNaN(vPrice) && vPrice > 0 ? { name: vName, price: vPrice } : null;
      }).filter(Boolean);
    }

    // isTopPick: if column exists, "true" = true; anything else (blank, "false") = false
    const isTopPickRaw   = hasTopPick    ? (clean[idx("istoppick")]      || "") : "";
    const allowGroupRaw  = hasGroupOrder ? (clean[idx("allowgrouporder")] || "") : "";

    if (!name) { errors.push(`Row ${i + 2}: missing name`); return; }
    const price = parseFloat(priceRaw);
    if (isNaN(price) || price <= 0) { errors.push(`Row ${i + 2}: invalid price "${priceRaw}"`); return; }

    // Normalise category — map old/renamed values gracefully.
    // NOTE: "toiletries" used to be folded into "groceries" here, back
    // before toiletries existed as its own category. It's a real,
    // standalone category now (confirmed in your categories collection),
    // so it was removed from this map — leaving it in silently rewrote
    // every toiletries CSV row into groceries.
    const catMap = {
      "school-essentials": "stationeries",
      "schoolessentials":  "stationeries",
      "stationery":        "stationeries",
      "snacks":            "groceries",
      "services":          "hostel-services",
    };
    const normCat = catMap[category] || category;
    if (!VALID_CATEGORIES.includes(normCat)) {
      errors.push(`Row ${i + 2}: unknown category "${category}" — add it first in Admin → Categories, then use its exact slug (${VALID_CATEGORIES.join(", ")})`);
      return;
    }

    // Cost price is optional (what you pay at the market). Blank is fine; if
    // something's there it must be a valid non-negative number.
    let costPrice = null;
    if (costPriceRaw.trim() !== "") {
      const parsedCost = parseFloat(costPriceRaw);
      if (isNaN(parsedCost) || parsedCost < 0) {
        errors.push(`Row ${i + 2}: invalid cost price "${costPriceRaw}"`);
        return;
      }
      costPrice = parsedCost;
    }

    const parsedRow = {
      id: idRaw || null,
      name,
      category: normCat,
      price,
      desc,
      image: image || "https://placehold.co/400x400/e5e7eb/9ca3af?text=Product",
      isTopPick:       isTopPickRaw.toLowerCase()  === "true",
      // Group order defaults to allowed — only explicit "false" in the column turns it off
      allowGroupOrder: allowGroupRaw.trim() === "" ? true : allowGroupRaw.toLowerCase() !== "false",
      variants: parsedVariants,
      costPrice,
      marketName: marketName.trim()
    };

    // Figure out — right now, for preview purposes — whether this row will UPDATE an
    // existing product or CREATE a new one, using the same matching rule executeCsvImport()
    // uses at save time. See findMatchingProduct() for the rule itself.
    const match = findMatchingProduct(parsedRow);
    parsedRow.matchedId = match ? match.product.id : null;
    parsedRow.matchAction = match ? "update" : "create";

    csvParsedRows.push(parsedRow);
  });

  const errEl = document.getElementById("csvImportError");
  if (errors.length > 0) {
    errEl.textContent = errors.slice(0, 3).join(" | ") + (errors.length > 3 ? ` (+${errors.length - 3} more)` : "");
    errEl.classList.remove("hidden");
  } else {
    errEl.classList.add("hidden");
  }

  renderCsvPreview();
  })();
}

function renderCsvPreview() {
  const area = document.getElementById("csvPreviewArea");
  const label = document.getElementById("csvPreviewLabel");
  const tbody = document.getElementById("csvPreviewBody");

  if (csvParsedRows.length === 0) {
    area.classList.add("hidden");
    return;
  }

  const updateCount = csvParsedRows.filter(r => r.matchAction === "update").length;
  const createCount = csvParsedRows.length - updateCount;
  label.textContent = `${csvParsedRows.length} product${csvParsedRows.length !== 1 ? 's' : ''} ready — ${createCount} new, ${updateCount} update${updateCount !== 1 ? 's' : ''}`;
  tbody.innerHTML = csvParsedRows.slice(0, 20).map(row => `
    <tr class="border-b border-gray-50">
      <td class="px-3 py-2">${row.matchAction === "update" ? '<span class="text-blue-600 font-semibold">🔄 Update</span>' : '<span class="text-green-600 font-semibold">🆕 New</span>'}</td>
      <td class="px-3 py-2 text-gray-800 font-medium max-w-[180px] truncate">${escapeHtml(row.name)}</td>
      <td class="px-3 py-2 text-gray-500 capitalize">${row.category.replace(/-/g, " ")}</td>
      <td class="px-3 py-2 font-bold text-gray-800">₦${row.price.toLocaleString()}</td>
      <td class="px-3 py-2 text-gray-500">${row.costPrice != null ? "₦" + row.costPrice.toLocaleString() : "—"}</td>
      <td class="px-3 py-2">${row.isTopPick ? "⚡" : "—"}</td>
      <td class="px-3 py-2">${row.allowGroupOrder ? "✓" : "—"}</td>
    </tr>
  `).join("");

  if (csvParsedRows.length > 20) {
    tbody.innerHTML += `<tr><td colspan="7" class="px-3 py-2 text-gray-400 text-center">…and ${csvParsedRows.length - 20} more</td></tr>`;
  }

  area.classList.remove("hidden");
}

// ============================================================
// CSV IMPORT — MATCHED ROWS GET A PARTIAL UPDATE, NOT A FULL OVERWRITE
// Only fields whose column was actually present in the uploaded CSV, AND whose
// value actually differs from what's currently saved, get touched. Everything
// else on the existing product (including columns the CSV simply didn't have)
// is left exactly as it is.
// ============================================================
function buildProductDiff(row, product) {
  const diff = {};

  // Always-present columns (name/category/price/desc are required on every CSV)
  const trimmedName = row.name.trim();
  if (trimmedName !== (product.name || "").trim())         diff.name = trimmedName;
  if (row.category !== product.category)                   diff.category = row.category;
  if (row.price !== product.price)                          diff.price = row.price;
  if (row.desc !== (product.desc || ""))                    diff.desc = row.desc;

  // Optional columns — only ever considered if that column existed in the CSV
  if (csvColumnFlags.hasImage && row.image && row.image !== (product.image || ""))
    diff.image = row.image;

  if (csvColumnFlags.hasVariants) {
    const rowVariantsStr = JSON.stringify(row.variants || []);
    const prodVariantsStr = JSON.stringify(product.variants || []);
    if (rowVariantsStr !== prodVariantsStr) diff.variants = row.variants || [];
  }

  if (csvColumnFlags.hasTopPick && row.isTopPick !== !!product.isTopPick)
    diff.isTopPick = row.isTopPick;

  if (csvColumnFlags.hasGroupOrder && row.allowGroupOrder !== (product.allowGroupOrder !== false))
    diff.allowGroupOrder = row.allowGroupOrder;

  if (csvColumnFlags.hasCostPrice) {
    const prodCost = (product.costPrice === undefined || product.costPrice === null || product.costPrice === "") ? null : Number(product.costPrice);
    if (row.costPrice !== prodCost) diff.costPrice = row.costPrice;
  }

  if (csvColumnFlags.hasMarketName && row.marketName !== (product.marketName || ""))
    diff.marketName = row.marketName;

  return diff;
}

const PLACEHOLDER_IMAGE = "https://placehold.co/400x400/e5e7eb/9ca3af?text=Product";

async function executeCsvImport() {
  if (csvParsedRows.length === 0) return;

  const btn = document.getElementById("csvImportBtn");
  btn.disabled = true;

  try {
    btn.textContent = "Saving to Supabase...";
    let created = 0, updated = 0, unchanged = 0;
    const total  = csvParsedRows.length;

    for (let i = 0; i < total; i++) {
      const row = csvParsedRows[i];
      btn.textContent = "Saving to Supabase... (" + (i + 1) + "/" + total + ")";

      if (row.matchAction === "update" && row.matchedId) {
        const product = allProducts.find(p => p.id === row.matchedId);
        if (!product) {
          // Product vanished since preview was rendered — fall through and create fresh.
          row.matchAction = "create";
        } else {
          const diff = buildProductDiff(row, product);
          if (Object.keys(diff).length === 0) {
            unchanged++;
            continue;
          }
          const { error: updErr } = await sb.from("products").update(_toProductRow(diff)).eq("id", row.matchedId);
          if (updErr) throw updErr;
          Object.assign(product, diff); // keep local state in sync
          updated++;
          continue;
        }
      }

      // CREATE — no matching product found (see findMatchingProduct())
      const newId = (crypto.randomUUID ? crypto.randomUUID() : `prod_${Date.now()}_${i}_${Math.random().toString(36).slice(2)}`);
      const newProductData = {
        name: row.name.trim(),
        category: row.category,
        price: row.price,
        desc: row.desc,
        image: (row.image && row.image.trim() && !row.image.includes("placehold.co"))
          ? row.image
          : PLACEHOLDER_IMAGE,
        variants: row.variants || [],
        costPrice: row.costPrice ?? null,
        marketName: row.marketName || "",
        isTopPick: !!row.isTopPick,
        allowGroupOrder: row.allowGroupOrder !== false,
        isHidden: false
      };
      const { error: insErr } = await sb.from("products").insert({ id: newId, ..._toProductRow(newProductData) });
      if (insErr) throw insErr;
      allProducts.push({ id: newId, ...newProductData });
      created++;
    }

    const parts = [];
    if (created)   parts.push(`${created} new`);
    if (updated)   parts.push(`${updated} updated`);
    if (unchanged) parts.push(`${unchanged} unchanged`);
    showAdminToast("✅", `Import done — ${parts.join(", ")}`);
    clearCsvImport();
    loadAllProducts();

  } catch (e) {
    showAdminToast("❌", "Import failed: " + e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = "⚡ Import All";
  }
}


function clearCsvImport() {
  csvParsedRows = [];
  csvColumnFlags = {};
  const area = document.getElementById("csvPreviewArea");
  const fileInput = document.getElementById("csvFileInput");
  const errEl = document.getElementById("csvImportError");
  if (area) area.classList.add("hidden");
  if (fileInput) fileInput.value = "";
  if (errEl) errEl.classList.add("hidden");
}


// ============================================================
// CLEAN DUPLICATES — deletes all but one copy of each product name
// ============================================================
async function cleanDuplicates() {
  const btn = document.getElementById("cleanDuplicatesBtn");
  if (!btn) return;
  btn.disabled = true;
  btn.textContent = "Scanning Supabase...";

  try {
    const { data, error } = await sb.from("products").select("id, name");
    if (error) throw error;

    const byName = {};
    (data || []).forEach(row => {
      const name = (row.name || "").trim().toLowerCase();
      if (!byName[name]) byName[name] = [];
      byName[name].push(row.id);
    });

    // Collect all ids to delete (keep the first, delete the rest)
    const toDelete = [];
    Object.values(byName).forEach(ids => {
      if (ids.length > 1) toDelete.push(...ids.slice(1));
    });

    if (toDelete.length === 0) {
      showAdminToast("✅", "No duplicates found — Supabase is clean!");
      btn.disabled = false;
      btn.textContent = "🧹 Clean Duplicates";
      return;
    }

    btn.textContent = "Deleting " + toDelete.length + " duplicates...";

    // Delete in chunks of 500 ids per request
    for (let i = 0; i < toDelete.length; i += 500) {
      const chunk = toDelete.slice(i, i + 500);
      const { error: delErr } = await sb.from("products").delete().in("id", chunk);
      if (delErr) throw delErr;
    }

    showAdminToast("✅", toDelete.length + " duplicate products removed!");
    loadAllProducts();
  } catch (e) {
    showAdminToast("❌", "Cleanup failed: " + e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = "🧹 Clean Duplicates";
  }
}