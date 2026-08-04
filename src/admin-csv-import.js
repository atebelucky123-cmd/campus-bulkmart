// ============================================================
// admin-csv-import.js — split from the original admin.js (see split-plan notes)
// Bulk CSV import (parsing, validation, preview, save).
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
    "name,category,price,desc,isTopPick,allowGroupOrder,variants,costprice,marketname",
    "Premium Rice Bag (Mini Lot),groceries,4500,High-grade parboiled rice in a convenient mini-lot,true,true,,4000,Rice (half crate)",
    "Exams Success Stationery Bundle,stationeries,1000,Complete exam-prep set with pens and rulers,false,true,,700,Stationery bundle pack",
    "Nail Tech Custom Setup,hostel-services,3500,Professional on-campus nail extension and polishing,false,false,,,",
    "Sample Product With Variants,groceries,,A product sold in multiple sizes,false,true,\"500g:3000/1kg:5500\",,",
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
    showAdminToast("error", "No products to export yet");
    return;
  }

  const escapeCsvField = (val) => {
    const str = String(val ?? "");
    return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
  };

  // "id" is included here (export of existing products) but deliberately NOT in
  // downloadProductCsvTemplate() — new products don't have an id yet. On re-import,
  // a matching id is the strongest possible signal that a row is the same product.
  const rows = [["id", "name", "category", "price", "desc", "isTopPick", "allowGroupOrder", "variants", "costprice", "marketname"]];

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
  showAdminToast("success", `Exported ${allProducts.length} products`);
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
    showAdminToast("error", "Please upload a .csv file");
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
    showAdminToast("error", "CSV file appears empty");
    return;
  }

  const headers = lines[0].split(",").map(h => h.trim().toLowerCase().replace(/[^a-z]/g, ""));
  const required = ["name", "category", "price", "desc"];
  const missing = required.filter(r => !headers.includes(r));
  if (missing.length > 0) {
    showAdminToast("error", `Missing columns: ${missing.join(", ")}`);
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
  const hasVariants    = idx("variants") >= 0;
  const hasCostPrice   = idx("costprice") >= 0;
  const hasMarketName  = idx("marketname") >= 0;
  const hasId          = idx("id") >= 0;

  // Stored globally so executeCsvImport() knows exactly which columns were actually
  // present in this upload — needed so it only ever touches fields the admin
  // explicitly included, never fields a column-less row would otherwise default.
  // NOTE: image is deliberately excluded — CSV can no longer set or touch a
  // product's image at all. Images are managed exclusively through the
  // Cloudinary drag-and-drop uploader on each product's Add/Edit form now,
  // never via a pasted URL. This closes off the legal/reliability risk of
  // hotlinking third-party images through bulk import.
  csvColumnFlags = { hasTopPick, hasGroupOrder, hasVariants, hasCostPrice, hasMarketName, hasId };

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
      <td class="px-3 py-2">${row.matchAction === "update" ? '<span class="text-blue-600 font-semibold inline-flex items-center gap-1"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>Update</span>' : '<span class="text-green-600 font-semibold inline-flex items-center gap-1"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>New</span>'}</td>
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

  // Optional columns — only ever considered if that column existed in the CSV.
  // NOTE: image is deliberately never diffed here — CSV updates can never
  // change a product's existing image, on purpose. See the note in
  // parseCsv() above for why.

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
        // CSV can never set a real image — every product created via bulk
        // import starts with the placeholder and gets a real photo uploaded
        // afterward through the product's Edit form (Cloudinary uploader).
        image: PLACEHOLDER_IMAGE,
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
    showAdminToast("success", `Import done — ${parts.join(", ")}`);
    clearCsvImport();
    loadAllProducts();

  } catch (e) {
    showAdminToast("error", "Import failed: " + e.message);
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
  const originalHTML = btn.innerHTML;
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
      showAdminToast("success", "No duplicates found — Supabase is clean!");
      btn.disabled = false;
      btn.innerHTML = originalHTML;
      return;
    }

    btn.textContent = "Deleting " + toDelete.length + " duplicates...";

    // Delete in chunks of 500 ids per request
    for (let i = 0; i < toDelete.length; i += 500) {
      const chunk = toDelete.slice(i, i + 500);
      const { error: delErr } = await sb.from("products").delete().in("id", chunk);
      if (delErr) throw delErr;
    }

    showAdminToast("success", toDelete.length + " duplicate products removed!");
    loadAllProducts();
  } catch (e) {
    showAdminToast("error", "Cleanup failed: " + e.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalHTML;
  }
}