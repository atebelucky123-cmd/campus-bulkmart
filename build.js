// ============================================================
// build.js — Campus Bulkmart Auto Cache-Busting Build Script
// Usage: node build.js
// What it does:
//   1. Hashes every JS/CSS asset
//   2. Copies them to dist/ with the hash in the filename
//   3. Rewrites all HTML files to reference the hashed filenames
//   4. Copies all other files (HTML, images, etc.) to dist/
// ============================================================

const fs   = require("fs");
const path = require("path");
const crypto = require("crypto");

const SRC  = path.join(__dirname, "src");
const DIST = path.join(__dirname, "dist");

// ── Assets that get hashed ──────────────────────────────────
const HASHABLE = [
  "config.js",
  "cart-checkout.js",
  "products.js",
  "auth.js",
  "ui-misc.js",
  "admin-core.js",
  "admin-categories.js",
  "admin-products-table.js",
  "admin-reviews.js",
  "admin-products-form.js",
  "admin-orders.js",
  "admin-csv-import.js",
  "wallet.js",
  "auth-modal.js",
  "style.css",
  "admin.css",
  "tailwind.output.css",
];

// ── HTML files that reference those assets ──────────────────
const HTML_FILES = [
  "index.html",
  "desktop.html",
  "mobile.html",
  "admin.html",
  "admin-desktop.html",
  "admin-mobile.html",
  "dashboard.html",
  "faqs.html",
  "my-reviews.html",
  "order-history.html",
  "reviews.html",
  "wallet.html",
  "about.html",
  "products.html",
  "products-desktop.html",
  "products-mobile.html",
  "404.html",
];

// ── Helpers ─────────────────────────────────────────────────
function md5(filePath) {
  const buf = fs.readFileSync(filePath);
  return crypto.createHash("md5").update(buf).digest("hex").slice(0, 8);
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function cleanDist() {
  if (fs.existsSync(DIST)) fs.rmSync(DIST, { recursive: true, force: true });
  ensureDir(DIST);
}

// ── Main build ───────────────────────────────────────────────
function build() {
  console.log("\n🔨  Campus Bulkmart Build starting...\n");
  cleanDist();

  // Step 1: Hash each asset and record the mapping
  // e.g.  script.js  →  script.a1b2c3d4.js
  const assetMap = {}; // original filename → hashed filename

  for (const file of HASHABLE) {
    const srcPath = path.join(SRC, file);
    if (!fs.existsSync(srcPath)) {
      console.warn(`  ⚠️  Skipping (not found): ${file}`);
      continue;
    }
    const hash = md5(srcPath);
    const ext  = path.extname(file);           // ".js" or ".css"
    const base = path.basename(file, ext);     // "script", "style", etc.
    const hashedName = `${base}.${hash}${ext}`; // "script.a1b2c3d4.js"

    fs.copyFileSync(srcPath, path.join(DIST, hashedName));
    assetMap[file] = hashedName;
    console.log(`  ✅  ${file}  →  ${hashedName}`);
  }

  // Step 2: Process HTML files — rewrite asset references, then copy to dist/
  console.log("");
  for (const file of HTML_FILES) {
    const srcPath = path.join(SRC, file);
    if (!fs.existsSync(srcPath)) {
      console.warn(`  ⚠️  Skipping HTML (not found): ${file}`);
      continue;
    }
    let html = fs.readFileSync(srcPath, "utf8");

    // Replace every known asset reference with its hashed version
    // Handles: src="script.js", href="style.css", src="script.js?v=2", etc.
    for (const [original, hashed] of Object.entries(assetMap)) {
      // Match the filename with or without an existing ?v=... query string
      const escaped = original.replace(".", "\\.");
      const regex = new RegExp(`(src|href)=["']${escaped}(?:\\?[^"']*)?["']`, "g");
      html = html.replace(regex, (_, attr) => `${attr}="${hashed}"`);
    }

    fs.writeFileSync(path.join(DIST, file), html, "utf8");
    console.log(`  📄  ${file}  (asset refs rewritten)`);
  }

  // Step 3: Copy all other files from src/ to dist/ as-is
  // (logo.png, any other assets not in HASHABLE or HTML_FILES)
  console.log("");
  const knownFiles = new Set([...HASHABLE, ...HTML_FILES]);
  const allSrc = fs.readdirSync(SRC);

  for (const file of allSrc) {
    if (knownFiles.has(file)) continue; // already handled
    const srcPath  = path.join(SRC, file);
    const distPath = path.join(DIST, file);
    const stat = fs.statSync(srcPath);
    if (stat.isFile()) {
      fs.copyFileSync(srcPath, distPath);
      console.log(`  📁  ${file}  (copied as-is)`);
    }
  }

  console.log("\n✨  Build complete! Files are in ./dist\n");
  console.log("   Deploy with:  firebase deploy\n");
}

build();