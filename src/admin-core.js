// ============================================================
// admin-core.js — split from the original admin.js (see split-plan notes)
// Firebase/Supabase init, row-mapping helpers, shared state, sign out, tab switching, delete-modal/stats/toast/util helpers used everywhere. MUST load first.
// ============================================================

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
    weightScore: row.weight_score,
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
  if ("weightScore" in p) row.weight_score = p.weightScore;
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
    const safeName = String(name).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    badge.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-1px; margin-right:4px;"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>${safeName}`;
    badge.classList.remove("hidden");
  }

  // Load data
  loadAllProducts();
  loadAllReviews();
  loadAllOrders();
  loadWalletSettingAdmin();
  loadCategories();
  loadWaitlist();
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
    showAdminToast(next ? "success" : "pause", `Wallet checkout turned ${next ? "on" : "off"}`);
  } catch (e) {
    console.error("[Admin] Failed to update wallet setting:", e);
    showAdminToast("error", "Could not update wallet setting — check your connection and try again");
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
  // ── Footer additions (Phase 6C) ──
  footerTagline: "Your campus superstore. LASUCOM's favourite delivery platform.",
  footerCopyright: "© 2025 Campus Bulkmart. All rights reserved.",
  footerQuickLinks: [
    { label: "FAQs", url: "faqs.html" },
    { label: "Reviews", url: "reviews.html" },
    { label: "About Us", url: "about.html" },
    { label: "Privacy Policy", url: "about.html#policies?tab=privacy" }
  ],
  aboutHeroTitle: "Our Story",
  aboutHeroSubtitle: "From a simple idea to LASUCOM's most trusted campus delivery platform — here's how Campus Bulkmart was born.",
  aboutOriginParagraph1: "Every LASUCOM student knows the struggle — you're mid-assignment, your data runs out, your toiletries are empty, and the market feels a world away. **Campus Bulkmart** was born from exactly that frustration.",
  aboutOriginParagraph2: "We built a digital procurement platform that acts as your personal campus runner — you browse, you order, we go to the market and deliver straight to your hostel door. No hidden fees, no long waits, no stress.",
  aboutOriginParagraph3: "What started as a simple idea has grown into a full-service campus superstore serving students across all LASUCOM hostels daily.",
  aboutMissionQuote: "Make campus life easier — one delivery at a time.",
  aboutMissionText: "Our mission is simple: eliminate the friction between LASUCOM students and the essentials they need. We believe no student should lose study time to market runs or go without because the market is far.",
  // ── About page — remaining sections (Phase 6C) ──
  aboutStats: [
    { value: "200+", label: "Products Available" },
    { value: "1–2hr", label: "Delivery Turnaround" },
    { value: "₦0", label: "Hidden Fees" },
    { value: "8AM–8PM", label: "Daily Operations" }
  ],
  aboutStepsTitle: "How Campus Bulkmart Works",
  aboutStepsIntro: "We're not a warehouse. We're your on-demand campus procurement team — we find it, buy it, and bring it to you.",
  aboutSteps: [
    { title: "Browse & Order", desc: "Search our catalog and place your order right from your phone." },
    { title: "We Hit the Market", desc: "Our runners head to the nearest market and procure your exact items." },
    { title: "Hostel Delivery", desc: "Your order lands at your hostel door within 1–2 hours. No excuses." },
    { title: "Pay Securely", desc: "Top up your wallet via Paystack or pay on delivery. Zero hassle." }
  ],
  aboutValuesTitle: "Our Mission & Values",
  aboutValues: [
    { title: "Accuracy First", desc: "We procure the exact products you order — genuine, from trusted vendors." },
    { title: "Speed", desc: "Orders processed within 30 minutes. Delivered within 1–2 hours. Every time." },
    { title: "Transparency", desc: "No hidden fees. What you see is what you pay. Full stop." },
    { title: "Student-First", desc: "Every decision is made with one question: does this make life better for LASUCOM students?" }
  ],
  aboutCtaHeading: "Ready to Order?",
  aboutCtaSubtext: "Join hundreds of LASUCOM students already saving time and stress with Campus Bulkmart.",
  // ── FAQs (Phase 6A schema, Phase 7A manager) ──
  faqs: [
    { question: "How does delivery work?", answer: "Once you place an order via WhatsApp, our team processes it within 30 minutes. Delivery to your hostel room typically takes 1–2 hours depending on demand and your location within campus.", order: 1 },
    { question: "What are your delivery hours?", answer: "We operate daily from 8:00 AM to 8:00 PM. Orders placed outside these hours will be fulfilled first thing the next morning.", order: 2 },
    { question: "Do you deliver to all LASUCOM hostels?", answer: "Yes! We deliver to all on-campus hostels and student accommodation facilities within LASUCOM.", order: 3 },
    { question: "Is there a minimum order amount?", answer: "Yes, the minimum order amount is ₦3,000. This helps us cover logistics and keep delivery running smoothly for everyone.", order: 4 },
    { question: "How do I pay for my order?", answer: "We currently accept payment on delivery. After placing your order via WhatsApp, our agent will collect payment when they deliver to your room. Bank transfer options are coming soon.", order: 5 },
    { question: "Can I cancel or modify my order?", answer: "Yes, you can cancel or modify your order by contacting us on WhatsApp within 15 minutes of placing it. After that, cancellations may not be possible as preparation would have already begun.", order: 6 },
    { question: "What if an item I ordered is out of stock?", answer: "We'll notify you immediately via WhatsApp if any item is unavailable and offer a suitable replacement or a full refund for that item.", order: 7 },
    { question: "How do I track my order?", answer: "After placing your order, you'll receive a WhatsApp confirmation with updates. You can also check your Order History page on your dashboard for status updates.", order: 8 },
    { question: "Are the products genuine?", answer: "Absolutely. All products are sourced directly from verified distributors and trusted wholesalers. Quality is our top priority.", order: 9 },
    { question: "Do you offer bulk discounts?", answer: "Yes! For large orders, we offer special bulk pricing. Contact us on WhatsApp to discuss bulk orders for your hostel block or organization.", order: 10 }
  ],
  // ── Policies: Privacy & Refund/Return (Phase 6B schema, Phase 7B manager) ──
  // about.html is the canonical copy — this is the exact text seeded from
  // _aboutPolicyContent. auth-modal.js's policy modal pulls this same
  // siteContent.policies field so both always show identical text instead
  // of two hand-maintained copies drifting apart.
  policies: {
    effectiveDate: "June 1, 2026",
    privacy: [
      { heading: "1. Information We Collect", body: "We collect personal information you voluntarily provide: your name, phone number, email address, hostel/room details, and order history." },
      { heading: "2. Payment Data & Processing", body: "Online payments are handled securely by Paystack — we never store your card details on our servers. WhatsApp payments are verified manually using the receipt you share with us." },
      { heading: "3. How We Use Your Information", body: "Your data is used only to process and deliver your orders, calculate delivery fees, communicate order updates, and comply with payment processor requirements." },
      { heading: "4. Data Sharing & Third Parties", body: "We do not sell your data. Information is shared only with our delivery team (to fulfill your order) and Paystack (to process online payments)." },
      { heading: "5. Data Security", body: "We use Firebase security rules and strict technical measures to protect your personal information from unauthorized access." },
      { heading: "6. Contact Us", body: "📧 <a href=\"mailto:atebelucky123@gmail.com\" style=\"color:#000080;font-weight:600;\">atebelucky123@gmail.com</a> &nbsp;·&nbsp; 📱 <a href=\"https://wa.me/2349169618353\" style=\"color:#000080;font-weight:600;\">+2349169618353</a>" }
    ],
    refund: [
      { heading: "1. Eligibility for Refunds & Replacements", body: "We offer refunds or replacements for: items that arrive damaged or spoiled; incorrect items delivered; or items paid for but missing from your package." },
      { heading: "2. Reporting Window", body: "All claims must be submitted within <strong>24 hours</strong> of delivery. Contact us via WhatsApp or email with your order number and a clear photo of the issue." },
      { heading: "3. Processing of Refunds", body: "<strong>Paystack payments:</strong> reversed to your card within 3–7 business days. <strong>WhatsApp/manual payments:</strong> direct bank transfer within 24–48 hours, or store voucher credit — your choice." },
      { heading: "4. Non-Refundable Situations", body: "Refunds are not available if the delivery address was incorrect or unreachable, or if the claim is made after the 24-hour window." },
      { heading: "5. Contact Channels", body: "📧 <a href=\"mailto:atebelucky123@gmail.com\" style=\"color:#000080;font-weight:600;\">atebelucky123@gmail.com</a> &nbsp;·&nbsp; 📱 <a href=\"https://wa.me/2349169618353\" style=\"color:#000080;font-weight:600;\">+2349169618353</a>" }
    ]
  }
};

let siteContentLoaded = false;
let deliverySettingsLoaded = false;

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

  const ftgEl = document.getElementById("footerTaglineInput");
  const fcpEl = document.getElementById("footerCopyrightInput");
  if (ftgEl) ftgEl.value = c.footerTagline || SITE_CONTENT_DEFAULTS.footerTagline;
  if (fcpEl) fcpEl.value = c.footerCopyright || SITE_CONTENT_DEFAULTS.footerCopyright;

  const qLinks = (Array.isArray(c.footerQuickLinks) && c.footerQuickLinks.length) ? c.footerQuickLinks : SITE_CONTENT_DEFAULTS.footerQuickLinks;
  qLinks.forEach((link, i) => {
    const lblEl = document.getElementById(`footerLink${i + 1}LabelInput`);
    const urlEl = document.getElementById(`footerLink${i + 1}UrlInput`);
    if (lblEl) lblEl.value = link.label;
    if (urlEl) urlEl.value = link.url;
  });

  const stats2 = (Array.isArray(c.aboutStats) && c.aboutStats.length === 4) ? c.aboutStats : SITE_CONTENT_DEFAULTS.aboutStats;
  stats2.forEach((stat, i) => {
    const valEl = document.getElementById(`aboutStat${i + 1}ValueInput`);
    const lblEl = document.getElementById(`aboutStat${i + 1}LabelInput`);
    if (valEl) valEl.value = stat.value;
    if (lblEl) lblEl.value = stat.label;
  });

  const astEl = document.getElementById("aboutStepsTitleInput");
  const asiEl = document.getElementById("aboutStepsIntroInput");
  if (astEl) astEl.value = c.aboutStepsTitle || SITE_CONTENT_DEFAULTS.aboutStepsTitle;
  if (asiEl) asiEl.value = c.aboutStepsIntro || SITE_CONTENT_DEFAULTS.aboutStepsIntro;
  const steps = (Array.isArray(c.aboutSteps) && c.aboutSteps.length === 4) ? c.aboutSteps : SITE_CONTENT_DEFAULTS.aboutSteps;
  steps.forEach((step, i) => {
    const tEl = document.getElementById(`aboutStep${i + 1}TitleInput`);
    const dEl = document.getElementById(`aboutStep${i + 1}DescInput`);
    if (tEl) tEl.value = step.title;
    if (dEl) dEl.value = step.desc;
  });

  const avtEl = document.getElementById("aboutValuesTitleInput");
  if (avtEl) avtEl.value = c.aboutValuesTitle || SITE_CONTENT_DEFAULTS.aboutValuesTitle;
  const values = (Array.isArray(c.aboutValues) && c.aboutValues.length === 4) ? c.aboutValues : SITE_CONTENT_DEFAULTS.aboutValues;
  values.forEach((v, i) => {
    const tEl = document.getElementById(`aboutValue${i + 1}TitleInput`);
    const dEl = document.getElementById(`aboutValue${i + 1}DescInput`);
    if (tEl) tEl.value = v.title;
    if (dEl) dEl.value = v.desc;
  });

  const achEl = document.getElementById("aboutCtaHeadingInput");
  const acsEl = document.getElementById("aboutCtaSubtextInput");
  if (achEl) achEl.value = c.aboutCtaHeading || SITE_CONTENT_DEFAULTS.aboutCtaHeading;
  if (acsEl) acsEl.value = c.aboutCtaSubtext || SITE_CONTENT_DEFAULTS.aboutCtaSubtext;

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
    footerTagline: val("footerTaglineInput") || SITE_CONTENT_DEFAULTS.footerTagline,
    footerCopyright: val("footerCopyrightInput") || SITE_CONTENT_DEFAULTS.footerCopyright,
    footerQuickLinks: [1, 2, 3, 4].map(i => ({
      label: val(`footerLink${i}LabelInput`) || SITE_CONTENT_DEFAULTS.footerQuickLinks[i - 1].label,
      url: val(`footerLink${i}UrlInput`) || SITE_CONTENT_DEFAULTS.footerQuickLinks[i - 1].url
    })),
    aboutHeroTitle: val("aboutHeroTitleInput") || SITE_CONTENT_DEFAULTS.aboutHeroTitle,
    aboutHeroSubtitle: val("aboutHeroSubtitleInput") || SITE_CONTENT_DEFAULTS.aboutHeroSubtitle,
    aboutOriginParagraph1: val("aboutOriginP1Input") || SITE_CONTENT_DEFAULTS.aboutOriginParagraph1,
    aboutOriginParagraph2: val("aboutOriginP2Input") || SITE_CONTENT_DEFAULTS.aboutOriginParagraph2,
    aboutOriginParagraph3: val("aboutOriginP3Input") || SITE_CONTENT_DEFAULTS.aboutOriginParagraph3,
    aboutMissionQuote: val("aboutMissionQuoteInput") || SITE_CONTENT_DEFAULTS.aboutMissionQuote,
    aboutMissionText: val("aboutMissionTextInput") || SITE_CONTENT_DEFAULTS.aboutMissionText,
    aboutStats: [1, 2, 3, 4].map(i => ({
      value: val(`aboutStat${i}ValueInput`) || SITE_CONTENT_DEFAULTS.aboutStats[i - 1].value,
      label: val(`aboutStat${i}LabelInput`) || SITE_CONTENT_DEFAULTS.aboutStats[i - 1].label
    })),
    aboutStepsTitle: val("aboutStepsTitleInput") || SITE_CONTENT_DEFAULTS.aboutStepsTitle,
    aboutStepsIntro: val("aboutStepsIntroInput") || SITE_CONTENT_DEFAULTS.aboutStepsIntro,
    aboutSteps: [1, 2, 3, 4].map(i => ({
      title: val(`aboutStep${i}TitleInput`) || SITE_CONTENT_DEFAULTS.aboutSteps[i - 1].title,
      desc: val(`aboutStep${i}DescInput`) || SITE_CONTENT_DEFAULTS.aboutSteps[i - 1].desc
    })),
    aboutValuesTitle: val("aboutValuesTitleInput") || SITE_CONTENT_DEFAULTS.aboutValuesTitle,
    aboutValues: [1, 2, 3, 4].map(i => ({
      title: val(`aboutValue${i}TitleInput`) || SITE_CONTENT_DEFAULTS.aboutValues[i - 1].title,
      desc: val(`aboutValue${i}DescInput`) || SITE_CONTENT_DEFAULTS.aboutValues[i - 1].desc
    })),
    aboutCtaHeading: val("aboutCtaHeadingInput") || SITE_CONTENT_DEFAULTS.aboutCtaHeading,
    aboutCtaSubtext: val("aboutCtaSubtextInput") || SITE_CONTENT_DEFAULTS.aboutCtaSubtext
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

  const ftgPrev = document.getElementById("footerPreviewTagline");
  const fdPrev = document.getElementById("footerPreviewDisclaimer");
  const fwPrev = document.getElementById("footerPreviewWhatsapp");
  const fePrev = document.getElementById("footerPreviewEmail");
  const fhPrev = document.getElementById("footerPreviewHours");
  const fcpPrev = document.getElementById("footerPreviewCopyright");
  if (ftgPrev) ftgPrev.textContent = c.footerTagline;
  if (fdPrev) fdPrev.textContent = c.footerDisclaimer;
  if (fwPrev) fwPrev.textContent = c.footerWhatsapp;
  if (fePrev) fePrev.textContent = c.footerEmail;
  if (fhPrev) fhPrev.textContent = c.footerHours;
  if (fcpPrev) fcpPrev.textContent = c.footerCopyright;

  const flPrev = document.getElementById("footerPreviewLinks");
  if (flPrev) flPrev.textContent = c.footerQuickLinks.map(l => l.label).join(" · ");

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

  const achPrev = document.getElementById("aboutPreviewCtaHeading");
  const acsPrev = document.getElementById("aboutPreviewCtaSubtext");
  if (achPrev) achPrev.textContent = c.aboutCtaHeading;
  if (acsPrev) acsPrev.textContent = c.aboutCtaSubtext;
}

async function loadSiteContentAdmin() {
  try {
    const value = await getSettingValue("siteContent");
    populateHeroForm(value);
    faqManagerState = (value && Array.isArray(value.faqs) && value.faqs.length) ? value.faqs.map(f => ({ ...f })) : SITE_CONTENT_DEFAULTS.faqs.map(f => ({ ...f }));
    policyManagerState = normalizePolicyManagerState(value && value.policies);
  } catch (e) {
    console.warn("[Admin] Could not load site content, using defaults:", e.message);
    populateHeroForm(null);
    faqManagerState = SITE_CONTENT_DEFAULTS.faqs.map(f => ({ ...f }));
    policyManagerState = normalizePolicyManagerState(null);
  }
  renderFaqManager();
  renderPolicyManager();
  siteContentLoaded = true;
}

async function saveHeroContent() {
  const btn = document.getElementById("heroSaveBtn");
  if (btn) { btn.disabled = true; btn.textContent = "Saving…"; }
  try {
    const content = readHeroFormValues();
    await mergeSettingValue("siteContent", content);
    populateHeroForm(content);
    showAdminToast("success", "Home page content updated");
  } catch (e) {
    console.error("[Admin] Failed to save site content:", e);
    showAdminToast("error", "Could not save changes — check your connection and try again");
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = "💾 Save Changes"; }
  }
}

async function resetHeroContent() {
  if (!confirm("Reset the hero banner, lower banner, footer (including Quick Links), About page text, FAQs, and Policies back to the original default copy? This saves immediately.")) return;
  const btn = document.getElementById("heroResetBtn");
  if (btn) btn.disabled = true;
  try {
    await mergeSettingValue("siteContent", SITE_CONTENT_DEFAULTS);
    populateHeroForm(SITE_CONTENT_DEFAULTS);
    faqManagerState = SITE_CONTENT_DEFAULTS.faqs.map(f => ({ ...f }));
    renderFaqManager();
    policyManagerState = normalizePolicyManagerState(SITE_CONTENT_DEFAULTS.policies);
    renderPolicyManager();
    showAdminToast("success", "Home page content reset to default");
  } catch (e) {
    console.error("[Admin] Failed to reset site content:", e);
    showAdminToast("error", "Could not reset — check your connection and try again");
  } finally {
    if (btn) btn.disabled = false;
  }
}

// ============================================================
// POLICY MANAGER (Phase 7B)
// Same pattern as the FAQ Manager above: a variable-length list per
// tab (privacy / refund), its own state + Save button, saved with
// mergeSettingValue so it never touches hero/footer/about/FAQs.
// This is the single source both about.html and auth-modal.js read
// from, per the Phase 6B "kill the drift" decision.
// ============================================================
let policyManagerState = { effectiveDate: "", privacy: [], refund: [] };
let policyManagerActiveTab = "privacy";

function normalizePolicyManagerState(policies) {
  const p = policies || {};
  const defaults = SITE_CONTENT_DEFAULTS.policies;
  return {
    effectiveDate: p.effectiveDate || defaults.effectiveDate,
    privacy: (Array.isArray(p.privacy) && p.privacy.length) ? p.privacy.map(s => ({ ...s })) : defaults.privacy.map(s => ({ ...s })),
    refund: (Array.isArray(p.refund) && p.refund.length) ? p.refund.map(s => ({ ...s })) : defaults.refund.map(s => ({ ...s }))
  };
}

function switchPolicyManagerTab(tab) {
  policyManagerActiveTab = tab;
  const tp = document.getElementById("policyManagerTabPrivacy");
  const tr = document.getElementById("policyManagerTabRefund");
  if (tp && tr) {
    if (tab === "privacy") {
      tp.style.background = "#000080"; tp.style.color = "#fff"; tp.style.border = "none";
      tr.style.background = "#fff";    tr.style.color = "#6b7280"; tr.style.border = "1px solid #e5e7eb";
    } else {
      tr.style.background = "#000080"; tr.style.color = "#fff"; tr.style.border = "none";
      tp.style.background = "#fff";    tp.style.color = "#6b7280"; tp.style.border = "1px solid #e5e7eb";
    }
  }
  renderPolicyManager();
}

function renderPolicyManager() {
  const dateEl = document.getElementById("policyEffDateInput");
  if (dateEl && document.activeElement !== dateEl) dateEl.value = policyManagerState.effectiveDate;

  const container = document.getElementById("policyManagerList");
  if (!container) return;
  const list = policyManagerState[policyManagerActiveTab] || [];
  if (list.length === 0) {
    container.innerHTML = '<p class="text-sm text-gray-400 text-center py-6">No sections yet — click "+ Add Section" to create one.</p>';
    return;
  }
  container.innerHTML = list.map((s, i) => `
    <div class="admin-card no-lift p-4 mb-3">
      <div class="flex items-start justify-between gap-2 mb-2">
        <span class="text-[11px] font-bold text-gray-400 uppercase tracking-wide pt-2">#${i + 1}</span>
        <div class="flex gap-1">
          <button type="button" onclick="movePolicyManagerItem(${i}, -1)" ${i === 0 ? "disabled" : ""} class="w-7 h-7 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed text-xs" title="Move up">↑</button>
          <button type="button" onclick="movePolicyManagerItem(${i}, 1)" ${i === list.length - 1 ? "disabled" : ""} class="w-7 h-7 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed text-xs" title="Move down">↓</button>
          <button type="button" onclick="removePolicyManagerItem(${i})" class="w-7 h-7 rounded-lg border border-red-200 text-red-500 hover:bg-red-50 text-xs" title="Delete">🗑</button>
        </div>
      </div>
      <label class="block text-[10px] font-semibold text-gray-500 mb-1">Section Heading</label>
      <input type="text" class="admin-input mb-2" value="${(s.heading || "").replace(/"/g, "&quot;")}" oninput="updatePolicyManagerField(${i}, 'heading', this.value)" />
      <label class="block text-[10px] font-semibold text-gray-500 mb-1">Body (basic HTML like &lt;strong&gt; and &lt;a&gt; is allowed)</label>
      <textarea class="admin-input" rows="3" oninput="updatePolicyManagerField(${i}, 'body', this.value)">${s.body || ""}</textarea>
    </div>
  `).join("");
}

function updatePolicyManagerField(i, field, value) {
  const list = policyManagerState[policyManagerActiveTab];
  if (!list || !list[i]) return;
  list[i][field] = value;
}

function addPolicyManagerItem() {
  policyManagerState[policyManagerActiveTab].push({ heading: "", body: "" });
  renderPolicyManager();
}

function removePolicyManagerItem(i) {
  if (!confirm("Delete this section? This doesn't save until you click \"Save Policies\".")) return;
  policyManagerState[policyManagerActiveTab].splice(i, 1);
  renderPolicyManager();
}

function movePolicyManagerItem(i, dir) {
  const list = policyManagerState[policyManagerActiveTab];
  const j = i + dir;
  if (j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
  renderPolicyManager();
}

async function savePolicyManager() {
  const btn = document.getElementById("policySaveBtn");
  const dateEl = document.getElementById("policyEffDateInput");
  const effectiveDate = (dateEl ? dateEl.value.trim() : "") || SITE_CONTENT_DEFAULTS.policies.effectiveDate;

  const cleanTab = tab => (policyManagerState[tab] || [])
    .map(s => ({ heading: (s.heading || "").trim(), body: (s.body || "").trim() }))
    .filter(s => s.heading || s.body);

  const privacy = cleanTab("privacy");
  const refund = cleanTab("refund");
  if (privacy.length === 0 || refund.length === 0) {
    showAdminToast("error", "Both Privacy Policy and Refund & Return need at least one section before saving");
    return;
  }

  const payload = { effectiveDate, privacy, refund };
  if (btn) { btn.disabled = true; btn.textContent = "Saving…"; }
  try {
    await mergeSettingValue("siteContent", { policies: payload });
    policyManagerState = { effectiveDate, privacy: privacy.map(s => ({ ...s })), refund: refund.map(s => ({ ...s })) };
    renderPolicyManager();
    showAdminToast("success", "Policies updated");
  } catch (e) {
    console.error("[Admin] Failed to save policies:", e);
    showAdminToast("error", "Could not save policies — check your connection and try again");
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = "💾 Save Policies"; }
  }
}

// ============================================================
// FAQ MANAGER (Phase 7A)
// FAQs are a variable-length list, unlike the fixed hero/footer/about
// fields above, so they get their own state array + Save button rather
// than living inside readHeroFormValues(). Saved with mergeSettingValue,
// which shallow-merges — so saving FAQs never touches hero/footer/about.
// ============================================================
let faqManagerState = [];

function renderFaqManager() {
  const container = document.getElementById("faqManagerList");
  if (!container) return;
  if (faqManagerState.length === 0) {
    container.innerHTML = '<p class="text-sm text-gray-400 text-center py-6">No FAQs yet — click "+ Add FAQ" to create one.</p>';
    return;
  }
  container.innerHTML = faqManagerState.map((f, i) => `
    <div class="admin-card no-lift p-4 mb-3">
      <div class="flex items-start justify-between gap-2 mb-2">
        <span class="text-[11px] font-bold text-gray-400 uppercase tracking-wide pt-2">#${i + 1}</span>
        <div class="flex gap-1">
          <button type="button" onclick="moveFaqManagerItem(${i}, -1)" ${i === 0 ? "disabled" : ""} class="w-7 h-7 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed text-xs" title="Move up">↑</button>
          <button type="button" onclick="moveFaqManagerItem(${i}, 1)" ${i === faqManagerState.length - 1 ? "disabled" : ""} class="w-7 h-7 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed text-xs" title="Move down">↓</button>
          <button type="button" onclick="removeFaqManagerItem(${i})" class="w-7 h-7 rounded-lg border border-red-200 text-red-500 hover:bg-red-50 text-xs" title="Delete">🗑</button>
        </div>
      </div>
      <label class="block text-[10px] font-semibold text-gray-500 mb-1">Question</label>
      <input type="text" class="admin-input mb-2" value="${(f.question || "").replace(/"/g, "&quot;")}" oninput="updateFaqManagerField(${i}, 'question', this.value)" />
      <label class="block text-[10px] font-semibold text-gray-500 mb-1">Answer</label>
      <textarea class="admin-input" rows="2" oninput="updateFaqManagerField(${i}, 'answer', this.value)">${f.answer || ""}</textarea>
    </div>
  `).join("");
}

function updateFaqManagerField(i, field, value) {
  if (!faqManagerState[i]) return;
  faqManagerState[i][field] = value;
}

function addFaqManagerItem() {
  faqManagerState.push({ question: "", answer: "" });
  renderFaqManager();
}

function removeFaqManagerItem(i) {
  if (!confirm("Delete this FAQ? This doesn't save until you click \"Save FAQs\".")) return;
  faqManagerState.splice(i, 1);
  renderFaqManager();
}

function moveFaqManagerItem(i, dir) {
  const j = i + dir;
  if (j < 0 || j >= faqManagerState.length) return;
  [faqManagerState[i], faqManagerState[j]] = [faqManagerState[j], faqManagerState[i]];
  renderFaqManager();
}

async function saveFaqManager() {
  const btn = document.getElementById("faqSaveBtn");
  const cleaned = faqManagerState
    .map(f => ({ question: (f.question || "").trim(), answer: (f.answer || "").trim() }))
    .filter(f => f.question || f.answer);
  if (cleaned.length === 0) {
    showAdminToast("error", "Add at least one FAQ before saving");
    return;
  }
  const withOrder = cleaned.map((f, i) => ({ ...f, order: i + 1 }));
  if (btn) { btn.disabled = true; btn.textContent = "Saving…"; }
  try {
    await mergeSettingValue("siteContent", { faqs: withOrder });
    faqManagerState = withOrder.map(f => ({ ...f }));
    renderFaqManager();
    showAdminToast("success", "FAQs updated");
  } catch (e) {
    console.error("[Admin] Failed to save FAQs:", e);
    showAdminToast("error", "Could not save FAQs — check your connection and try again");
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = "💾 Save FAQs"; }
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
  if (tabName === "delivery" && !deliverySettingsLoaded) loadDeliverySettingsTab();

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
// Icon library — see ui-misc.js for the full explanation. Duplicated
// here since the admin panel and storefront don't share JS scope.
function _cbmToastIcon(name) {
  const icons = {
    success: '<svg viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="20" height="20"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
    error: '<svg viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="20" height="20"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
    warning: '<svg viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="20" height="20"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    info: '<svg viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="20" height="20"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
    trash: '<svg viewBox="0 0 24 24" fill="none" stroke="#6b7280" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="20" height="20"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
    cart: '<svg viewBox="0 0 24 24" fill="none" stroke="#000080" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="20" height="20"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>',
    pause: '<svg viewBox="0 0 24 24" fill="none" stroke="#6b7280" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="20" height="20"><circle cx="12" cy="12" r="10"/><line x1="10" y1="15" x2="10" y2="9"/><line x1="14" y1="15" x2="14" y2="9"/></svg>',
    eye: '<svg viewBox="0 0 24 24" fill="none" stroke="#000080" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="20" height="20"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>',
    "eye-off": '<svg viewBox="0 0 24 24" fill="none" stroke="#6b7280" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="20" height="20"><path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a21.8 21.8 0 0 1 5.06-6.94M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 11 8 11 8a21.77 21.77 0 0 1-3.22 4.44M14.12 14.12a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>',
    clone: '<svg viewBox="0 0 24 24" fill="none" stroke="#000080" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="20" height="20"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
    "star-outline": '<svg viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="20" height="20"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',
    "star-filled": '<svg viewBox="0 0 24 24" fill="#f59e0b" stroke="#f59e0b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="20" height="20"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',
    signout: '<svg viewBox="0 0 24 24" fill="none" stroke="#000080" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="20" height="20"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>'
  };
  return icons[name] || icons.info;
}

let toastTimer;
function showAdminToast(icon, msg) {
  const toast = document.getElementById("adminToast");
  if (!toast) return;
  document.getElementById("adminToastIcon").innerHTML = _cbmToastIcon(icon);
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
