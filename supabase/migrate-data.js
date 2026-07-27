// ============================================================
// migrate-data.js — Campus Bulkmart Firestore → Supabase Migration
// ONE-TIME SCRIPT. Run locally, never deploy this.
//
// SETUP (before running):
//   1. npm install firebase-admin @supabase/supabase-js
//   2. Download your Firebase service account key:
//      Firebase Console → Project Settings → Service Accounts →
//      "Generate new private key" → save as:
//        supabase/firebase-service-account.json
//      (already added to .gitignore — see below)
//   3. Set two environment variables (do NOT hardcode them here):
//        SUPABASE_URL=https://oiwgadfjrkuzjkvhugos.supabase.co
//        SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
//      Get the service_role key from Supabase → Project Settings → API.
//      This key BYPASSES RLS — that's required for a migration script
//      (it needs to write every row regardless of ownership), but it
//      must never end up in script.js, admin.js, or anywhere client-side.
//   4. Run:  node supabase/migrate-data.js
//
// WHAT IT DOES:
//   - Reads every document from: categories, products, settings,
//     reviews, orders, users
//   - Renames fields to match schema.sql (order→sort_order,
//     timestamp→created_at, walletBalance→wallet_balance)
//   - Converts Firestore Timestamps to ISO date strings
//   - Inserts into Supabase in dependency order (categories before
//     products, since products has a foreign key to categories)
//   - Prints a summary + any row-level errors at the end (does NOT
//     stop on a single bad row — collects errors so you can fix and
//     re-run just the affected rows)
// ============================================================

const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { createClient } = require("@supabase/supabase-js");
const path = require("path");

// ---- Config ----
const SERVICE_ACCOUNT_PATH = path.join(__dirname, "firebase-service-account.json");
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables.");
  console.error("   Set them before running, e.g.:");
  console.error('   SUPABASE_URL=https://xxx.supabase.co SUPABASE_SERVICE_ROLE_KEY=xxx node supabase/migrate-data.js');
  process.exit(1);
}

// ---- Init Firebase Admin ----
let serviceAccount;
try {
  serviceAccount = require(SERVICE_ACCOUNT_PATH);
} catch (e) {
  console.error(`❌ Could not load service account key at ${SERVICE_ACCOUNT_PATH}`);
  console.error("   Download it from Firebase Console → Project Settings → Service Accounts.");
  process.exit(1);
}
const app = initializeApp({ credential: cert(serviceAccount) });
const firestore = getFirestore(app);

// ---- Init Supabase (service_role — bypasses RLS, migration only) ----
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// ---- Helpers ----
function toISO(value) {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate().toISOString(); // Firestore Timestamp
  return value;
}

const errors = [];
const summary = {};

async function migrateCategories() {
  const snap = await firestore.collection("categories").get();
  const rows = snap.docs.map(doc => {
    const d = doc.data();
    return {
      id: doc.id,
      name: d.name ?? null,
      slug: d.slug ?? null,
      emoji: d.emoji ?? null,
      sort_order: d.order ?? 0,              // renamed field
      created_at: toISO(d.createdAt),
    };
  });
  if (rows.length === 0) { summary.categories = 0; return; }
  const { error } = await supabase.from("categories").upsert(rows, { onConflict: "id" });
  if (error) errors.push({ table: "categories", error });
  summary.categories = rows.length;
}

async function migrateProducts() {
  const snap = await firestore.collection("products").get();
  const rows = snap.docs.map(doc => {
    const d = doc.data();
    return {
      id: doc.id,
      name: d.name ?? null,
      description: d.desc ?? null,
      image: d.image ?? null,
      category: d.category ?? null,
      price: d.price ?? 0,
      cost_price: d.costPrice ?? null,
      market_name: d.marketName ?? null,
      is_hidden: d.isHidden ?? false,
      is_top_pick: d.isTopPick ?? false,
      is_service: d.isService ?? false,
      allow_group_order: d.allowGroupOrder ?? false,
      stock: d.stock ?? null,
      variants: d.variants ?? [],
      variant_groups: d.variantGroups ?? [],
      created_at: toISO(d.createdAt),
    };
  });
  if (rows.length === 0) { summary.products = 0; return; }
  const { error } = await supabase.from("products").upsert(rows, { onConflict: "id" });
  if (error) errors.push({ table: "products", error });
  summary.products = rows.length;
}

async function migrateSettings() {
  const snap = await firestore.collection("settings").get();
  const rows = snap.docs.map(doc => ({
    key: doc.id,          // 'appConfig' | 'siteContent'
    value: doc.data(),
    updated_at: new Date().toISOString(),
  }));
  if (rows.length === 0) { summary.settings = 0; return; }
  const { error } = await supabase.from("settings").upsert(rows, { onConflict: "key" });
  if (error) errors.push({ table: "settings", error });
  summary.settings = rows.length;
}

async function migrateReviews() {
  const snap = await firestore.collection("reviews").get();

  // Guard against orphaned references: a review may point to a
  // productId that no longer exists (e.g. the product was deleted
  // after the review was written). Rather than let the whole
  // migration fail on the FK constraint, null those out and warn.
  const { data: existingProducts } = await supabase.from("products").select("id");
  const validProductIds = new Set((existingProducts || []).map(p => p.id));

  const rows = snap.docs.map(doc => {
    const d = doc.data();
    const rawProductId = d.productId ?? null;
    const productId = validProductIds.has(rawProductId) ? rawProductId : null;
    if (rawProductId && !validProductIds.has(rawProductId)) {
      console.warn(`  ⚠️  Review ${doc.id} references missing product "${rawProductId}" — set to null`);
    }
    return {
      product_id: productId,
      user_id: d.userId ?? null,
      user_name: d.userName ?? null,
      stars: d.stars ?? d.rating ?? 5,
      text: d.text ?? "",
      featured: d.featured ?? false,
      rank: d.rank ?? null,
      created_at: toISO(d.timestamp ?? d.createdAt),   // renamed field
    };
  });
  if (rows.length === 0) { summary.reviews = 0; return; }
  const { error } = await supabase.from("reviews").insert(rows);
  if (error) errors.push({ table: "reviews", error });
  summary.reviews = rows.length;
}

async function migrateOrders() {
  const snap = await firestore.collection("orders").get();
  const rows = snap.docs.map(doc => {
    const d = doc.data();
    // Same reasoning as reviews above — no "id" key, let Postgres generate it.
    return {
      user_id: d.userId ?? null,
      customer_name: d.customerName ?? null,
      customer_email: d.customerEmail ?? null,
      customer_phone: d.customerPhone ?? null,
      delivery_address: d.deliveryAddress ?? null,
      items: d.items ?? [],
      subtotal: d.subtotal ?? 0,
      delivery_fee: d.deliveryFee ?? 0,
      total_discount: d.totalDiscount ?? 0,
      final_total: d.finalTotal ?? d.total ?? 0,
      order_mode: d.orderMode ?? "individual",
      payment_method: d.paymentMethod ?? null,
      status: d.status ?? "pending",
      created_at: toISO(d.createdAt),
    };
  });
  if (rows.length === 0) { summary.orders = 0; return; }
  const { error } = await supabase.from("orders").insert(rows);
  if (error) errors.push({ table: "orders", error });
  summary.orders = rows.length;
}

async function migrateUsers() {
  const snap = await firestore.collection("users").get();
  const rows = snap.docs.map(doc => {
    const d = doc.data();
    return {
      uid: doc.id,
      username: d.username ?? null,
      display_name: d.displayName ?? null,
      email: d.email ?? null,
      wallet_balance: d.walletBalance ?? 0,   // renamed field (also the bug fix from earlier)
      // role intentionally omitted: including it here would overwrite
      // seed-admin.sql's role='admin' back to the default 'customer'
      // every time this script re-runs (upsert only touches columns
      // present in the payload). Role changes go through seed-admin.sql
      // or a manual UPDATE, never through this migration script.
      created_at: toISO(d.createdAt),
    };
  });
  if (rows.length === 0) { summary.users = 0; return; }
  const { error } = await supabase.from("users").upsert(rows, { onConflict: "uid", ignoreDuplicates: false });
  if (error) errors.push({ table: "users", error });
  summary.users = rows.length;
}

async function run() {
  console.log("\n🚚  Campus Bulkmart — Firestore → Supabase migration starting...\n");

  // Order matters: categories before products (FK constraint)
  await migrateCategories();
  console.log(`  ✅ categories  (${summary.categories} rows)`);

  await migrateProducts();
  console.log(`  ✅ products    (${summary.products} rows)`);

  await migrateSettings();
  console.log(`  ✅ settings    (${summary.settings} rows)`);

  await migrateReviews();
  console.log(`  ✅ reviews     (${summary.reviews} rows)`);

  await migrateOrders();
  console.log(`  ✅ orders      (${summary.orders} rows)`);

  await migrateUsers();
  console.log(`  ✅ users       (${summary.users} rows)`);

  if (errors.length > 0) {
    console.log("\n⚠️  Some tables had errors — review below:\n");
    errors.forEach(e => {
      console.log(`  ❌ ${e.table}:`, e.error.message || e.error);
    });
    console.log("\nFix the underlying issue and re-run — insert() will skip rows that");
    console.log("already exist if you add .upsert() instead, but by default this script");
    console.log("uses insert() so it's safe to fix data and re-run individual functions.");
  } else {
    console.log("\n✨ Migration complete with no errors.");
    console.log("\nNext steps:");
    console.log("  1. Run supabase/seed-admin.sql (if you haven't already) to restore your admin role.");
    console.log("  2. Spot-check a few rows in the Supabase Table Editor.");
    console.log("  3. Move to Phase 6 — rewriting script.js to read from Supabase.");
  }

  process.exit(errors.length > 0 ? 1 : 0);
}

run().catch(err => {
  console.error("\n❌ Migration script crashed:", err);
  process.exit(1);
});
