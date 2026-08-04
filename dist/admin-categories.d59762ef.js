// ============================================================
// admin-categories.js — split from the original admin.js (see split-plan notes)
// Category management (add/delete/render category manager + dropdowns).
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
    showAdminToast("success", `"${name}" category added`);
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
    showAdminToast("success", `"${cat.name}" category deleted`);
    loadCategories();
  } catch (e) {
    showAdminToast("error", "Failed to delete category: " + e.message);
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
  showAdminToast("trash", `${deleted} product${deleted > 1 ? 's' : ''} deleted`);
}

// ============================================================
