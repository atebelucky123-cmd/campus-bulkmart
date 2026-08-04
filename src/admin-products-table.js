// ============================================================
// admin-products-table.js — split from the original admin.js (see split-plan notes)
// Products table rendering, search/filter, product preview modal, mobile search fullscreen.
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
          <img src="${cbmImg(p.image, 80, 80)}" alt="${p.name}"
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
            class="text-xs font-semibold text-purple-700 bg-purple-50 hover:bg-purple-100 px-3 py-1.5 rounded-lg transition flex items-center">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
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
          <img src="${cbmImg(p.image, 100, 100)}" alt="${p.name}"
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
              class="text-xs font-semibold text-purple-700 bg-purple-50 hover:bg-purple-100 px-3 py-1.5 rounded-lg transition flex items-center gap-1">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>Clone
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
      <img src="${cbmImg(p.image, 600)}" alt="${escapeHtml(p.name)}" class="w-full h-full object-cover"
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
          class="flex-1 text-white font-bold py-3 rounded-xl transition text-sm flex items-center justify-center gap-2" style="background:#000080;">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>Edit Product
        </button>
        <button onclick="closeAdminPreviewModal(); confirmDeleteProduct('${p.id}', '${escapeForAttr(p.name)}')"
          class="flex-1 bg-red-50 hover:bg-red-100 text-red-600 font-bold py-3 rounded-xl transition text-sm border border-red-200 flex items-center justify-center gap-2">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>Delete
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
    img.src = cbmImg(p.image, 100, 100);
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
