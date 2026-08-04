// ============================================================
// admin-products-form.js — split from the original admin.js (see split-plan notes)
// Add product, price list manager, edit product modal, delete product, hide/show toggle, clone product.
// ============================================================

// ============================================================
// CLOUDINARY DELIVERY OPTIMIZATION (Phase 3)
// See products.js for the full explanation — same helper, duplicated
// here since the admin panel and storefront don't share JS scope.
// ============================================================
function cbmImg(url, w, h) {
  if (!url || !url.includes("res.cloudinary.com") || !url.includes("/upload/")) return url || "";
  const size = h ? `w_${w},h_${h},c_fill` : `w_${w},c_limit`;
  return url.replace("/upload/", `/upload/f_auto,q_auto,${size}/`);
}

// ============================================================
// CLOUDINARY IMAGE UPLOADER
// Replaces the old "paste an image URL" inputs. Each dropzone
// wraps a hidden <input id="{baseId}"> that still holds the final
// image URL — every existing `.value.trim()` read elsewhere in
// this file (add/edit product, add/edit service) works unchanged.
//
// Uses an UNSIGNED Cloudinary upload preset, so this uploads
// directly from the browser with no backend involved.
// ============================================================
const CLOUDINARY_CLOUD_NAME = "dhfhkm4dv";
const CLOUDINARY_UPLOAD_PRESET = "campusbulkmart";
const CLOUDINARY_MAX_FILE_MB = 8;

const _cbmUploaders = {}; // baseId -> { initialized: bool }

function cbmToggleUploader(baseId) {
  const wrapper = document.getElementById(`${baseId}_wrapper`);
  const chevron = document.getElementById(`${baseId}_chevron`);
  if (!wrapper) return;
  wrapper.classList.toggle("hidden");
  chevron?.classList.toggle("expanded");
}

function _cbmUpdateTrigger(baseId, imageUrl) {
  const thumb = document.getElementById(`${baseId}_thumb`);
  const triggerIcon = document.getElementById(`${baseId}_triggerIcon`);
  const triggerText = document.getElementById(`${baseId}_triggerText`);
  if (imageUrl) {
    if (thumb) { thumb.src = cbmImg(imageUrl, 80, 80); thumb.classList.remove("hidden"); }
    triggerIcon?.classList.add("hidden");
    if (triggerText) triggerText.textContent = "Change Image";
  } else {
    thumb?.classList.add("hidden");
    triggerIcon?.classList.remove("hidden");
    if (triggerText) triggerText.textContent = "Add Image";
  }
}

function initImageUploader(baseId) {
  if (_cbmUploaders[baseId]?.initialized) return; // don't double-wire listeners
  const dropzone = document.getElementById(`${baseId}_dropzone`);
  const fileInput = document.getElementById(`${baseId}_file`);
  if (!dropzone || !fileInput) return;

  const openPicker = () => fileInput.click();
  dropzone.addEventListener("click", openPicker);

  fileInput.addEventListener("change", () => {
    if (fileInput.files && fileInput.files[0]) {
      _cbmHandleFile(baseId, fileInput.files[0]);
    }
  });

  ["dragenter", "dragover"].forEach(evt => {
    dropzone.addEventListener(evt, e => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.add("drag-over");
    });
  });
  ["dragleave", "drop"].forEach(evt => {
    dropzone.addEventListener(evt, e => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.remove("drag-over");
    });
  });
  dropzone.addEventListener("drop", e => {
    const file = e.dataTransfer?.files?.[0];
    if (file) _cbmHandleFile(baseId, file);
  });

  _cbmUploaders[baseId] = { initialized: true };
}

// Call when opening/resetting a form. existingUrl prefills the preview
// (Edit forms); leave blank for a fresh Add form.
function resetImageUploader(baseId, existingUrl = "", collapse = true) {
  const hiddenInput = document.getElementById(baseId);
  const dropzone = document.getElementById(`${baseId}_dropzone`);
  const placeholder = document.getElementById(`${baseId}_placeholder`);
  const preview = document.getElementById(`${baseId}_preview`);
  const previewImg = document.getElementById(`${baseId}_previewImg`);
  const uploading = document.getElementById(`${baseId}_uploading`);
  const errorEl = document.getElementById(`${baseId}_error`);
  const wrapper = document.getElementById(`${baseId}_wrapper`);
  const chevron = document.getElementById(`${baseId}_chevron`);
  if (!hiddenInput || !dropzone) return;

  hiddenInput.value = existingUrl || "";
  uploading?.classList.add("hidden");
  errorEl?.classList.add("hidden");
  dropzone.classList.remove("has-error");

  if (existingUrl) {
    placeholder?.classList.add("hidden");
    preview?.classList.remove("hidden");
    if (previewImg) previewImg.src = cbmImg(existingUrl, 400);
  } else {
    preview?.classList.add("hidden");
    placeholder?.classList.remove("hidden");
  }

  _cbmUpdateTrigger(baseId, existingUrl);

  // Collapsed by default when a form opens/resets — the whole point of
  // the redesign is the card stays compact until the admin actually
  // wants to look at or change the image. Skipped when collapse=false
  // (e.g. removing an image mid-interaction shouldn't snap shut on them).
  if (collapse) {
    wrapper?.classList.add("hidden");
    chevron?.classList.remove("expanded");
  }
}

function cbmRemoveImage(baseId, event) {
  event?.stopPropagation(); // don't trigger the dropzone's own click-to-browse
  resetImageUploader(baseId, "", /* collapse */ false);
}

function _cbmShowError(baseId, message) {
  const dropzone = document.getElementById(`${baseId}_dropzone`);
  const errorEl = document.getElementById(`${baseId}_error`);
  dropzone?.classList.add("has-error");
  if (errorEl) { errorEl.textContent = message; errorEl.classList.remove("hidden"); }
}

async function _cbmHandleFile(baseId, file) {
  const dropzone = document.getElementById(`${baseId}_dropzone`);
  const placeholder = document.getElementById(`${baseId}_placeholder`);
  const preview = document.getElementById(`${baseId}_preview`);
  const previewImg = document.getElementById(`${baseId}_previewImg`);
  const uploading = document.getElementById(`${baseId}_uploading`);
  const errorEl = document.getElementById(`${baseId}_error`);
  const hiddenInput = document.getElementById(baseId);

  errorEl?.classList.add("hidden");
  dropzone?.classList.remove("has-error");

  if (!file.type.startsWith("image/")) {
    _cbmShowError(baseId, "Please choose an image file.");
    return;
  }
  if (file.size > CLOUDINARY_MAX_FILE_MB * 1024 * 1024) {
    _cbmShowError(baseId, `Image is too large — max ${CLOUDINARY_MAX_FILE_MB}MB.`);
    return;
  }

  // Instant local preview, before the upload even starts
  const localUrl = URL.createObjectURL(file);
  placeholder?.classList.add("hidden");
  preview?.classList.remove("hidden");
  if (previewImg) previewImg.src = localUrl;
  uploading?.classList.remove("hidden");

  try {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);

    const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`, {
      method: "POST",
      body: formData
    });
    const data = await res.json();
    if (!res.ok || !data.secure_url) {
      throw new Error(data.error?.message || "Upload failed");
    }

    // Swap the local blob preview for the real, permanent Cloudinary URL.
    // NOTE: only the preview display gets the cbmImg() sizing treatment —
    // the value actually saved to Supabase (hiddenInput) stays the raw
    // URL, so every other place this image is displayed (storefront card,
    // admin table row, product modal) can apply its own appropriate size.
    if (previewImg) previewImg.src = cbmImg(data.secure_url, 400);
    if (hiddenInput) hiddenInput.value = data.secure_url;
    _cbmUpdateTrigger(baseId, data.secure_url);
  } catch (err) {
    console.error("[Cloudinary] Upload failed:", err);
    _cbmShowError(baseId, "Upload failed — check your connection and try again.");
    // Revert to empty state so a bad upload can't be silently saved
    resetImageUploader(baseId, "");
  } finally {
    uploading?.classList.add("hidden");
  }
}

// Wire up all 4 dropzones once the page is ready. They're always present
// in the DOM (Add Product / Add Service forms are inline, not modals that
// get created fresh each time), so a single init pass covers everything.
document.addEventListener("DOMContentLoaded", () => {
  ["newImage", "editImage", "svcImage", "editSvcImage"].forEach(initImageUploader);
});

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
    ["svcName","svcDesc"].forEach(id => { const el = document.getElementById(id); if (el) el.value = ""; });
    resetImageUploader("svcImage", "");
    document.getElementById("svcIsTopPick").checked = false;
    document.getElementById("svcAllowGroupOrder").checked = false;

    updateStats();
    showAdminToast("success", "Service added! Now add its price list from the Services tab.");
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
  resetImageUploader("editSvcImage", svc.image || "");
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
    showAdminToast("success", "Service updated!");
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
    showAdminToast("success", "Price list saved!");
  } catch (e) {
    showAdminToast("error", "Failed to save: " + e.message);
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
  showAdminToast("success", "CSV applied to builder — review and save when ready.");
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
    ["newName","newDesc","newCostPrice","newMarketName"].forEach(id => { const el = document.getElementById(id); if(el) el.value = ""; });
    resetImageUploader("newImage", "");
    document.getElementById("newCategory").value = "";
    document.getElementById("newPrice").value = "";
    document.getElementById("newIsTopPick").checked = false;
    document.getElementById("newAllowGroupOrder").checked = true;
    clearVariantRows("new");

    updateStats();
    showAdminToast("success", "Product added to store!");

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
  resetImageUploader("editImage", p.image || "");
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
    showAdminToast("success", "Product updated!");
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
    showAdminToast(currentlyHidden ? "eye" : "eye-off", currentlyHidden ? "Product is now visible" : "Product hidden from customers");
  } catch (e) {
    showAdminToast("error", "Failed to update visibility: " + e.message);
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
    showAdminToast("trash", "Product deleted");
  } catch (e) {
    // If it's a local product not in Supabase, just remove from local state
    allProducts = allProducts.filter(p => p.id !== productId);
    updateStats();
    renderAdminProducts();
    showAdminToast("trash", "Product removed");
  }
}

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
    const topPickEl = document.getElementById("newIsTopPick");
    const groupEl = document.getElementById("newAllowGroupOrder");

    if (nameEl)   nameEl.value   = "Copy of " + (p.name || "");
    if (catEl)    catEl.value    = p.category || "";
    if (priceEl)  priceEl.value  = p.price || "";
    if (descEl)   descEl.value   = p.desc || "";
    resetImageUploader("newImage", p.image || "");
    if (topPickEl) topPickEl.checked = !!p.isTopPick;
    if (groupEl)  groupEl.checked = p.allowGroupOrder !== false;

    showAdminToast("clone", "Product cloned — edit details and save");
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
    showAdminToast("info", "No open orders to aggregate");
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
  showAdminToast("cart", `Market list generated — ${marketListData.aggregated.length} items`);
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
    showAdminToast("info", "Nothing to print yet — generate the list first");
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

    showAdminToast("success", totalPages > 1 ? `Downloaded ${totalPages} pages` : "Market list downloaded");
  } catch (e) {
    showAdminToast("error", "Could not generate market list: " + e.message);
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
