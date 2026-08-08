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
  // ── Footer additions (Phase 6C) — brings the tagline blurb, the
  // copyright line, and Quick Links into the same schema so every page's
  // footer is driven by one record instead of five separately hardcoded copies.
  footerTagline: "Your campus superstore. LASUCOM's favourite delivery platform.",
  footerCopyright: "© 2025 Campus Bulkmart. All rights reserved.",
  footerQuickLinks: [
    { label: "FAQs", url: "faqs.html" },
    { label: "Reviews", url: "reviews.html" },
    { label: "About Us", url: "about.html" },
    { label: "Privacy Policy", url: "about.html#policies?tab=privacy" }
  ],
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
  // ── FAQs (Phase 6A) ──
  // Seeded 1:1 from the hardcoded array in faqs.html so nothing visually
  // changes until Phase 7A wires faqs.html to fetch from here instead.
  // `order` drives sort order in the admin FAQ manager (Phase 7A) and here.
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
  // ── Privacy / Refund & Return policies (Phase 6B) ──
  // Seeded from about.html's _aboutPolicyContent — confirmed canonical over
  // auth-modal.js's version, which had drifted to different wording for the
  // same sections. auth-modal.js gets pointed at this shared source in 7B.
  // Structure is a superset of about.html's bare {h,b} pairs (adds
  // title/effectiveDate) since auth-modal.js already needed those and this
  // avoids maintaining two schemas for the same content.
  policies: {
    privacy: {
      title: "Privacy Policy",
      effectiveDate: "June 1, 2026",
      sections: [
        { heading: "1. Information We Collect", body: "We collect personal information you voluntarily provide: your name, phone number, email address, hostel/room details, and order history." },
        { heading: "2. Payment Data & Processing", body: "Online payments are handled securely by Paystack — we never store your card details on our servers. WhatsApp payments are verified manually using the receipt you share with us." },
        { heading: "3. How We Use Your Information", body: "Your data is used only to process and deliver your orders, calculate delivery fees, communicate order updates, and comply with payment processor requirements." },
        { heading: "4. Data Sharing & Third Parties", body: "We do not sell your data. Information is shared only with our delivery team (to fulfill your order) and Paystack (to process online payments)." },
        { heading: "5. Data Security", body: "We use Firebase security rules and strict technical measures to protect your personal information from unauthorized access." },
        { heading: "6. Contact Us", body: "📧 <a href=\"mailto:atebelucky123@gmail.com\" style=\"color:#000080;font-weight:600;\">atebelucky123@gmail.com</a> &nbsp;·&nbsp; 📱 <a href=\"https://wa.me/2349169618353\" style=\"color:#000080;font-weight:600;\">+2349169618353</a>" }
      ]
    },
    refund: {
      title: "Refund & Return Policy",
      effectiveDate: "June 1, 2026",
      sections: [
        { heading: "1. Eligibility for Refunds & Replacements", body: "We offer refunds or replacements for: items that arrive damaged or spoiled; incorrect items delivered; or items paid for but missing from your package." },
        { heading: "2. Reporting Window", body: "All claims must be submitted within <strong>24 hours</strong> of delivery. Contact us via WhatsApp or email with your order number and a clear photo of the issue." },
        { heading: "3. Processing of Refunds", body: "<strong>Paystack payments:</strong> reversed to your card within 3–7 business days. <strong>WhatsApp/manual payments:</strong> direct bank transfer within 24–48 hours, or store voucher credit — your choice." },
        { heading: "4. Non-Refundable Situations", body: "Refunds are not available if the delivery address was incorrect or unreachable, or if the claim is made after the 24-hour window." },
        { heading: "5. Contact Channels", body: "📧 <a href=\"mailto:atebelucky123@gmail.com\" style=\"color:#000080;font-weight:600;\">atebelucky123@gmail.com</a> &nbsp;·&nbsp; 📱 <a href=\"https://wa.me/2349169618353\" style=\"color:#000080;font-weight:600;\">+2349169618353</a>" }
      ]
    }
  }
};

const FOOTER_SOCIAL_META = [
  { key: "footerInstagram", label: "Instagram", glyph: "IG" },
  { key: "footerTiktok",    label: "TikTok",    glyph: "TT" },
  { key: "footerTwitter",   label: "X / Twitter", glyph: "X" },
  { key: "footerFacebook",  label: "Facebook",  glyph: "f" }
];

// ============================================================
// LOCATIONIQ ATTRIBUTION (Phase 2b)
// Required by LocationIQ's free-tier terms wherever their geocoding
// data is used on the site (delivery-fee address lookup, Phase 2c+).
// Fixed text/link, not admin-editable via siteContent — so it's
// injected directly here rather than added to SITE_CONTENT_DEFAULTS.
// Injected via JS right after the footer copyright line on every
// page, since applySiteContent() already runs there on every page
// load — no per-page HTML edits needed to get it site-wide.
// ============================================================
function _injectLocationIQFooterAttribution() {
  document.querySelectorAll(".js-footer-copyright").forEach(el => {
    // Guard against double-injection if applySiteContent ever re-runs
    // on the same page (e.g. a live settings refresh).
    if (el.parentElement?.querySelector(".js-locationiq-attribution")) return;
    const attribution = document.createElement("p");
    attribution.className = "js-locationiq-attribution";
    attribution.style.cssText = "font-size:11px;color:#9ca3af;margin-top:4px;";
    attribution.innerHTML = 'Search by <a href="https://locationiq.com" target="_blank" rel="noopener" style="color:#9ca3af;text-decoration:underline;">LocationIQ.com</a>';
    el.insertAdjacentElement("afterend", attribution);
  });
}

// ============================================================
// Live site-content cache — set once loadSiteContent() resolves.
// Exists so code that runs AFTER initial page load (e.g. a policy
// tab-switch handler in 7B) can still read the loaded values,
// not just whatever was present at DOMContentLoaded time.
// ============================================================
let _siteContentCache = null;

function getSiteContentValue(key) {
  const live = _siteContentCache && _siteContentCache[key];
  return live !== undefined && live !== null ? live : SITE_CONTENT_DEFAULTS[key];
}

function applySiteContent(content) {
  _siteContentCache = content || {};
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

  const fTagline   = c.footerTagline || SITE_CONTENT_DEFAULTS.footerTagline;
  const fCopyright = c.footerCopyright || SITE_CONTENT_DEFAULTS.footerCopyright;
  const fLinks      = (Array.isArray(c.footerQuickLinks) && c.footerQuickLinks.length) ? c.footerQuickLinks : SITE_CONTENT_DEFAULTS.footerQuickLinks;

  document.querySelectorAll(".js-footer-tagline").forEach(el => el.textContent = fTagline);
  document.querySelectorAll(".js-footer-copyright").forEach(el => el.textContent = fCopyright);
  _injectLocationIQFooterAttribution();
  document.querySelectorAll(".js-footer-quicklinks").forEach(container => {
    container.innerHTML = fLinks.map(l => {
      const cls = container.dataset.linkClass || "";
      return `<a href="${l.url}" class="${cls}">${l.label}</a>`;
    }).join("");
  });

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

  // ── FAQs (Phase 6A schema/renderer — faqs.html wiring is Phase 7A) ──
  renderFaqLists(Array.isArray(c.faqs) && c.faqs.length ? c.faqs : SITE_CONTENT_DEFAULTS.faqs);
}

// Renders into any .js-faq-list container found on the page. Safe to call
// with multiple containers on one page — each gets its own open/close state
// via data attributes rather than global ids, so there's no ans_i/arrow_i
// collision risk like the old per-page inline script had.
function renderFaqLists(faqs) {
  const containers = document.querySelectorAll(".js-faq-list");
  if (!containers.length) return;

  const sorted = [...faqs].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  containers.forEach(container => {
    container.innerHTML = sorted.map((f, i) => `
      <div class="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <button type="button" class="js-faq-toggle w-full flex items-center justify-between px-5 py-4 text-left gap-4" data-faq-index="${i}">
          <span class="font-semibold text-gray-800 text-sm">${f.question}</span>
          <svg class="js-faq-arrow faq-arrow w-5 h-5 flex-shrink-0" style="color:#000080;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
          </svg>
        </button>
        <div class="js-faq-answer faq-answer" data-faq-index="${i}">
          <p class="text-sm leading-relaxed px-5 pb-5" style="color:#3B592D;">${f.answer}</p>
        </div>
      </div>
    `).join("");

    if (!container.dataset.faqDelegated) {
      container.dataset.faqDelegated = "1";
      container.addEventListener("click", e => {
        const btn = e.target.closest(".js-faq-toggle");
        if (!btn || !container.contains(btn)) return;
        const idx = btn.dataset.faqIndex;
        const answer = container.querySelector(`.js-faq-answer[data-faq-index="${idx}"]`);
        const arrow  = btn.querySelector(".js-faq-arrow");
        const isOpen = answer.classList.contains("open");

        container.querySelectorAll(".js-faq-answer").forEach(el => el.classList.remove("open"));
        container.querySelectorAll(".js-faq-arrow").forEach(el => el.classList.remove("rotated"));

        if (!isOpen) {
          answer.classList.add("open");
          arrow.classList.add("rotated");
        }
      });
    }
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
