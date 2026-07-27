// ============================================================
// products.js — split from the original script.js (see split-plan notes)
// Product/category loading + caching, top-picks carousel, product rendering, product modal, reviews, search.
// ============================================================

// TOP PICKS CAROUSEL
// ============================================================
function renderTopPicksCarousel() {
  const section = document.getElementById("topPicksSection");
  if (!section) return;

  const topPicks = PRODUCTS.filter(p => p.isTopPick);
  if (topPicks.length === 0) {
    section.closest(".top-picks-wrapper")?.classList.add("hidden");
    return;
  }

  section.closest(".top-picks-wrapper")?.classList.remove("hidden");
  section.innerHTML = topPicks.map(p => `
    <div class="flex-shrink-0 w-40 sm:w-48 cursor-pointer group" onclick="openProductModal('${p.id}')">
      <div class="relative overflow-hidden rounded-2xl bg-gray-100 shadow-sm" style="height:140px;">
        <img src="${p.image || ''}" alt="${p.name}"
          class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          onerror="this.src='https://placehold.co/200x140/e5e7eb/9ca3af?text=?'" loading="lazy">
        <div class="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent"></div>
        <span class="absolute top-2 left-2 text-white text-[9px] font-bold px-2 py-0.5 rounded-full" style="background:#000080;">⚡ TOP PICK</span>
        <div class="absolute bottom-0 left-0 right-0 p-2">
          <p class="text-white font-bold text-xs leading-tight line-clamp-2">${p.name}</p>
          <p class="text-white/80 font-black text-xs mt-0.5">₦${Number(p.price).toLocaleString()}</p>
        </div>
      </div>
    </div>
  `).join("");
}

// ============================================================
// PRODUCT RENDERING
// ============================================================
function getFilteredProducts() {
  return PRODUCTS.filter(p => {
    if (p.isHidden === true) return false;
    // "all" is used by products.html (the full catalog page) — every other
    // page keeps using "top-picks" as its default curated view.
    const matchCat = currentCategory === "all"
      ? true
      : currentCategory === "top-picks"
        ? p.isTopPick === true
        : p.category === currentCategory;
    const matchSearch = !searchQuery ||
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.desc || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.category || "").toLowerCase().includes(searchQuery.toLowerCase());
    return matchCat && matchSearch;
  });
}

function getProductQty(id) { return productQtyMap[id] || 1; }

function changeProductQty(id, delta, event) {
  if (event) event.stopPropagation();
  productQtyMap[id] = Math.max(1, getProductQty(id) + delta);
  const el = document.getElementById(`qty-display-${id}`);
  if (el) el.value = productQtyMap[id];
  updateCardPrice(id);
}

function setProductQtyFromInput(id, value, event) {
  if (event) event.stopPropagation();
  const parsed = parseInt(value);
  productQtyMap[id] = isNaN(parsed) || parsed < 1 ? 1 : parsed;
  updateCardPrice(id);
}

// Recompute the price shown on a product card (unit price × current qty)
// whenever the qty stepper/input changes. Uses the data-unit-price stored
// on the price element so we don't need to re-look-up the product.
function updateCardPrice(id) {
  const priceEl = document.getElementById(`card-price-${id}`);
  if (!priceEl) return;
  const unitPrice = parseFloat(priceEl.dataset.unitPrice);
  if (isNaN(unitPrice)) return;
  const qty = getProductQty(id);
  priceEl.textContent = `₦${Number(unitPrice * qty).toLocaleString()}`;
}

// ── Variant selection (hostel services) ──────────────────────
function selectVariant(productId, variantIdx, event) {
  if (event) event.stopPropagation();
  variantSelectionMap[productId] = variantIdx;

  // Update pills UI
  const card = event?.target?.closest('.product-card');
  if (card) {
    card.querySelectorAll('.variant-pill').forEach((pill, i) => {
      pill.classList.toggle('selected', i === variantIdx);
    });
  }

  // Update price display on card
  const p = PRODUCTS.find(x => x.id === productId);
  if (p && Array.isArray(p.variants)) {
    const priceEl = document.getElementById(`card-price-${productId}`);
    if (priceEl) {
      const v = p.variants[variantIdx];
      priceEl.textContent = `₦${Number(v.price).toLocaleString()}`;
    }
  }
}

function adjVariantQty(productId, variantIdx, delta) {
  const input = document.getElementById(`vqty-${productId}-${variantIdx}`);
  if (!input) return;
  input.value = Math.max(1, (parseInt(input.value) || 1) + delta);
  updateModalVariantPrice(productId, variantIdx);
}

// Recalculates the "Selected:" price shown in the variant modal —
// unit price of the selected variant × the qty entered for that variant.
function updateModalVariantPrice(productId, variantIdx) {
  const p = PRODUCTS.find(x => x.id === productId);
  if (!p || !Array.isArray(p.variants)) return;

  const idx = variantIdx ?? (variantSelectionMap[productId] ?? 0);
  const variant = p.variants[idx];
  if (!variant) return;

  const qtyInput = document.getElementById(`vqty-${productId}-${idx}`);
  const qty = Math.max(1, parseInt(qtyInput?.value) || 1);

  const priceEl = document.getElementById(`modal-variant-price-${productId}`);
  if (priceEl) {
    priceEl.textContent = `₦${Number(variant.price * qty).toLocaleString()}`;
  }
}

function addVariantToCart(productId) {
  const p = PRODUCTS.find(x => x.id === productId);
  if (!p || !Array.isArray(p.variants)) return;

  const idx = variantSelectionMap[productId] ?? 0;
  const variant = p.variants[idx];
  if (!variant) return;

  // Block the add outright if we're in Group Order mode and this product
  // has group ordering disabled — a toast-only warning let it into the cart anyway.
  if (orderMode === "group" && p.allowGroupOrder === false) {
    showToast("⚠️", `${p.name} isn't available for Group Orders`);
    return;
  }

  // Read qty from the per-variant input in the modal
  const cartKey = `${productId}__v${idx}`;
  const qtyInput = document.getElementById(`vqty-${productId}-${idx}`);
  const addQty = Math.max(1, parseInt(qtyInput?.value) || 1);
  const existing = cart.find(x => x.cartKey === cartKey);
  if (existing) {
    existing.qty += addQty;
  } else {
    cart.push({
      ...p,
      cartKey,
      id: cartKey,
      name: `${p.name} — ${variant.name}`,
      price: variant.price,
      qty: addQty
    });
  }
  updateCartUI();
  saveCartToStorage();
  showToast("🛒", `${p.name} (${variant.name}) × ${addQty} added!`);
}

function renderProducts() {
  const grid = document.getElementById("productGrid");
  const empty = document.getElementById("emptyState");
  if (!grid) return;

  const filtered = getFilteredProducts();

  if (filtered.length === 0) {
    grid.innerHTML = "";
    empty?.classList.remove("hidden");
    return;
  }
  empty?.classList.add("hidden");

  grid.innerHTML = filtered.map(p => {
    // ── Service card (hostel-services with variantGroups) ──
    if (p.isService || p.category === "hostel-services") {
      const sp = (() => {
        const groups = p.variantGroups || [];
        const prices = [];
        groups.forEach(g => (g.items || []).forEach(it => { if (it.price != null && it.price > 0) prices.push(it.price); }));
        return prices.length ? Math.min(...prices) : null;
      })();
      const priceLabel = sp ? `from ₦${Number(sp).toLocaleString()}` : (p.price && p.price > 0 ? `from ₦${Number(p.price).toLocaleString()}` : "Price on request");
      return `
      <div class="product-card bg-white rounded-2xl overflow-hidden border border-gray-100 shadow-sm cursor-pointer" onclick="openServiceModal('${p.id}')">
        <div class="product-img-wrap">
          <img src="${p.image || ''}" alt="${p.name}" class="product-img" loading="lazy"
            onerror="this.src='https://placehold.co/400x400/e5e7eb/9ca3af?text=Service'">
          <span class="absolute top-2 left-2 text-white text-[10px] font-bold px-2 py-0.5 rounded-full" style="background:#000080;">🛎 SERVICE</span>
          ${p.isTopPick ? '<span class="absolute bottom-2 left-2 text-white text-[10px] font-bold px-2 py-0.5 rounded-full" style="background:#000080;">⚡ Top Pick</span>' : ''}
        </div>
        <div class="card-body p-3 sm:p-4">
          <div class="card-text">
            <p class="text-[10px] sm:text-xs font-semibold uppercase tracking-wide mb-1" style="color:#000080;">Hostel Service</p>
            <h3 class="font-bold text-gray-800 text-xs sm:text-sm leading-tight line-clamp-2 mb-1">${p.name}</h3>
            <p class="text-gray-400 text-[10px] sm:text-xs line-clamp-2 mb-2">${p.desc || ''}</p>
          </div>
          <div>
            <span class="font-black text-gray-900 text-xs sm:text-sm">${priceLabel}</span>
            <button onclick="event.stopPropagation(); openServiceModal('${p.id}')"
              class="w-full text-white text-xs font-bold py-1.5 rounded-lg transition mt-2" style="background:#007BFF;">
              View Price List
            </button>
          </div>
        </div>
      </div>`;
    }

    const qty = getProductQty(p.id);
    const hasVariants = Array.isArray(p.variants) && p.variants.length > 0;

    // Initialise selected variant state if not already set
    if (hasVariants && !variantSelectionMap[p.id]) {
      variantSelectionMap[p.id] = 0; // default to first variant
    }

    const selectedVariantIdx = hasVariants ? (variantSelectionMap[p.id] || 0) : null;
    const selectedVariant    = hasVariants ? p.variants[selectedVariantIdx] : null;
    const displayPrice       = hasVariants ? selectedVariant.price : p.price;

    // Group order eligibility (defaults to true unless the admin explicitly disabled it)
    const groupOrderAllowed = p.allowGroupOrder !== false;

    // CTA area: variant products get "View Product" button; normal get qty+add
    const ctaHTML = hasVariants ? `
      <button onclick="event.stopPropagation(); openProductModal('${p.id}')"
        class="w-full text-white text-xs font-bold py-2 rounded-lg transition flex items-center justify-center gap-1.5" style="background:#007BFF;">
        <svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
        View Product
      </button>` : `
      <div class="qty-row" onclick="event.stopPropagation()">
        <button onclick="changeProductQty('${p.id}', -1, event)" class="qty-btn">−</button>
        <input id="qty-display-${p.id}" type="text" inputmode="numeric" pattern="[0-9]*"
          value="${qty}" onclick="event.stopPropagation()"
          onchange="setProductQtyFromInput('${p.id}', this.value, event)"
          oninput="setProductQtyFromInput('${p.id}', this.value, event)"
          class="qty-input" />
        <button onclick="changeProductQty('${p.id}', 1, event)" class="qty-btn">+</button>
      </div>
      <button onclick="event.stopPropagation(); addToCartWithQty('${p.id}')"
        class="w-full text-white text-xs font-bold py-1.5 rounded-lg transition" style="background:#007BFF;">
        + Add to Cart
      </button>`;

    return `
    <div class="product-card bg-white rounded-2xl overflow-hidden border border-gray-100 shadow-sm cursor-pointer" onclick="openProductModal('${p.id}')">
      <div class="product-img-wrap">
        <img src="${p.image || ''}" alt="${p.name}" class="product-img" loading="lazy"
          onerror="this.src='https://placehold.co/400x400/e5e7eb/9ca3af?text=Product'">
        ${p.isTopPick ? '<span class="absolute top-2 left-2 text-white text-[10px] font-bold px-2 py-0.5 rounded-full" style="background:#000080;">⚡ Top Pick</span>' : ''}
        ${!hasVariants && p.stock && p.stock <= 5 ? `<span class="absolute top-2 right-2 bg-red-500 text-white text-[9px] font-bold px-2 py-0.5 rounded-full">Only ${p.stock} left</span>` : ''}
      </div>
      <div class="card-body p-3 sm:p-4">
        <div class="card-text">
          <p class="text-[10px] sm:text-xs font-semibold uppercase tracking-wide mb-1" style="color:#000080;">${(p.category || '').replace(/-/g, ' ')}</p>
          <h3 class="font-bold text-gray-800 text-xs sm:text-sm leading-tight line-clamp-2 mb-1">${p.name}</h3>
          <p class="text-gray-400 text-[10px] sm:text-xs line-clamp-2 mb-2">${p.desc || ''}</p>
        </div>
        <div>
          <div class="flex items-center justify-between mb-2">
            <span class="font-black text-gray-900 text-xs sm:text-sm" id="card-price-${p.id}" data-unit-price="${displayPrice}">
              ${hasVariants ? `From ₦${Number(displayPrice).toLocaleString()}` : `₦${Number(displayPrice * qty).toLocaleString()}`}
            </span>
          </div>
          ${groupOrderAllowed ? '<p class="text-[9px] sm:text-[10px] font-bold mb-1.5" style="color:#3B592D;">🤝 Group Order Available</p>' : ''}
          ${ctaHTML}
        </div>
      </div>
    </div>
  `}).join("");
}

function setCategory(cat) {
  currentCategory = cat;
  document.querySelectorAll(".category-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.cat === cat);
  });
  // Show skeleton shimmer briefly on every category switch
  const grid = document.getElementById("productGrid");
  if (grid) {
    grid.innerHTML = Array(8).fill(0).map(() => `
      <div class="bg-white rounded-2xl overflow-hidden border border-gray-100 shadow-sm animate-pulse">
        <div class="bg-gray-200 h-44"></div>
        <div class="p-3 space-y-2">
          <div class="bg-gray-200 h-3 rounded w-1/3"></div>
          <div class="bg-gray-200 h-4 rounded w-full"></div>
          <div class="bg-gray-200 h-3 rounded w-2/3"></div>
          <div class="bg-gray-200 h-8 rounded-lg w-full mt-2"></div>
        </div>
      </div>
    `).join("");
  }
  setTimeout(() => renderProducts(), 350);
}

// ============================================================
// PRODUCT MODAL
// ============================================================
function openProductModal(id) {
  document.removeEventListener("keydown", _modalEnterHandler);
  document.addEventListener("keydown", _modalEnterHandler);
  const p = PRODUCTS.find(x => x.id === id);
  if (!p) return;

  const modal = document.getElementById("productModal");
  const content = document.getElementById("productModalContent");

  content.innerHTML = `
    <div class="bg-white overflow-hidden rounded-t-3xl" style="height:120px;">
      <img src="${p.image || ''}" alt="${p.name}" class="w-full h-full object-contain"
        onerror="this.src='https://placehold.co/600x400/e5e7eb/9ca3af?text=Product'">
    </div>
    <div class="p-4">
      <div class="flex flex-wrap gap-2 mb-2">
        ${p.isTopPick ? '<span class="inline-block text-xs font-bold px-3 py-1 rounded-full" style="background:#eff6ff;color:#000080;">⚡ Top Pick</span>' : ''}
        ${(p.allowGroupOrder !== false) ? '<span class="inline-block text-xs font-bold px-3 py-1 rounded-full" style="background:#f0f4ec;color:#3B592D;">🤝 Group Order Available</span>' : ''}
      </div>
      <p class="text-xs font-semibold uppercase tracking-wide mb-1" style="color:#000080;">${(p.category || '').replace(/-/g, ' ')}</p>
      <h2 class="font-black text-lg text-gray-900 mb-1">${p.name}</h2>
      <p class="text-gray-500 text-sm mb-3 line-clamp-2">${p.desc || ''}</p>

      ${Array.isArray(p.variants) && p.variants.length > 0 ? `
        <!-- VARIANT SELECTOR with per-variant qty -->
        <div class="mb-4">
          <p class="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Select Option</p>
          <div class="space-y-2" id="modal-variants-${p.id}">
            ${p.variants.map((v, i) => `
              <div class="flex items-center gap-2 p-3 border-2 rounded-xl cursor-pointer transition modal-variant-row ${i === (variantSelectionMap[p.id] ?? 0) ? 'border-blue-800 bg-blue-50' : 'border-gray-100'}"
                onclick="selectModalVariant('${p.id}', ${i})" style="user-select:none;">
                <div class="w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${i === (variantSelectionMap[p.id] ?? 0) ? 'border-blue-800' : 'border-gray-300'}">
                  ${i === (variantSelectionMap[p.id] ?? 0) ? '<div class="w-2 h-2 rounded-full" style="background:#000080;"></div>' : ''}
                </div>
                <span class="text-sm font-semibold text-gray-800 flex-1">${v.name}</span>
                <span class="font-black text-sm flex-shrink-0" style="color:#000080;">₦${Number(v.price).toLocaleString()}</span>
                <!-- Qty input inline per variant -->
                <div class="flex items-center gap-1 flex-shrink-0 ml-2" onclick="event.stopPropagation()">
                  <button onclick="adjVariantQty('${p.id}',${i},-1)" style="width:20px;height:20px;min-width:20px;min-height:20px;border-radius:50%;background:#000080;color:#fff;border:none;cursor:pointer;font-size:13px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;line-height:1;padding:0;aspect-ratio:1/1;">−</button>
                  <input id="vqty-${p.id}-${i}" type="number" min="1" value="1"
                    onclick="event.stopPropagation()"
                    onchange="this.value=Math.max(1,parseInt(this.value)||1); updateModalVariantPrice('${p.id}', ${i})"
                    oninput="updateModalVariantPrice('${p.id}', ${i})"
                    style="width:26px;height:22px;text-align:center;font-size:11px;font-weight:700;border:1.5px solid #e5e7eb;border-radius:6px;padding:0;outline:none;-moz-appearance:textfield;"
                    onfocus="this.style.borderColor='#000080'" onblur="this.style.borderColor='#e5e7eb'" />
                  <button onclick="adjVariantQty('${p.id}',${i},1)" style="width:20px;height:20px;min-width:20px;min-height:20px;border-radius:50%;background:#000080;color:#fff;border:none;cursor:pointer;font-size:13px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;line-height:1;padding:0;aspect-ratio:1/1;">+</button>
                </div>
              </div>`).join('')}
          </div>
        </div>
        <div class="flex items-center justify-between mb-4">
          <span class="text-sm font-semibold text-gray-600">Selected:</span>
          <span class="font-black text-2xl text-gray-900" id="modal-variant-price-${p.id}">
            ₦${Number(p.variants[variantSelectionMap[p.id] ?? 0].price).toLocaleString()}
          </span>
        </div>
        <button onclick="addVariantToCart('${p.id}'); closeProductModal();"
          class="w-full text-white font-bold py-3 rounded-xl transition text-sm mb-4" style="background:#007BFF;">
          Add to Cart
        </button>
      ` : `
        <!-- NORMAL add-to-cart -->
        <div class="flex items-center justify-between mb-4">
          <span class="font-black text-2xl text-gray-900" id="modal-price-${p.id}" data-unit-price="${p.price}">₦${Number(p.price * getProductQty(p.id)).toLocaleString()}</span>
          ${p.stock && p.stock <= 5 ? `<span class="bg-red-100 text-red-600 text-xs font-bold px-2 py-1 rounded-full">Only ${p.stock} left</span>` : ''}
        </div>
        <div class="flex items-center gap-3 mb-4">
          <span class="text-sm font-semibold text-gray-600">Qty:</span>
          <div class="flex items-center gap-2">
            <button onclick="changeModalQty('${p.id}', -1)"
              class="flex items-center justify-center rounded-full text-white font-bold text-lg transition hover:opacity-80"
              style="width:32px; height:32px; min-width:32px; min-height:32px; aspect-ratio:1/1; background:#000080;">−</button>
            <input id="modal-qty-${p.id}" type="number" min="1" value="${getProductQty(p.id)}"
              onchange="productQtyMap['${p.id}']=Math.max(1,parseInt(this.value)||1); this.value=productQtyMap['${p.id}']; updateModalPrice('${p.id}')"
              class="w-14 text-center text-base font-bold text-gray-800 border border-gray-200 rounded-xl py-1.5 focus:outline-none"
              onfocus="this.style.boxShadow='0 0 0 2px #000080'" onblur="this.style.boxShadow=''" />
            <button onclick="changeModalQty('${p.id}', 1)"
              class="flex items-center justify-center rounded-full text-white font-bold text-lg transition hover:opacity-80"
              style="width:32px; height:32px; min-width:32px; min-height:32px; aspect-ratio:1/1; background:#000080;">+</button>
          </div>
        </div>
        <button onclick="addToCartWithQty('${p.id}'); closeProductModal();"
          class="w-full text-white font-bold py-3 rounded-xl transition text-sm mb-4" style="background:#007BFF;">
          Add to Cart
        </button>
      `}

      <div class="mt-2 border-t border-gray-100 pt-4">
        <h3 class="font-bold text-gray-800 mb-3">Reviews</h3>
        <div id="modalReviews_${p.id}" class="space-y-3 mb-4">
          <p class="text-gray-400 text-sm">Loading reviews...</p>
        </div>
        <div id="reviewFormArea_${p.id}">
          <p class="text-sm text-gray-400 text-center py-2">Checking sign-in status...</p>
        </div>
      </div>
    </div>
  `;

  modal.classList.remove("hidden");
  modal.classList.add("flex");
  loadProductReviews(p.id);
  renderModalReviewForm(p.id);
}

function changeModalQty(id, delta) {
  const el = document.getElementById(`modal-qty-${id}`);
  const current = parseInt(el?.value) || 1;
  const newVal = Math.max(1, current + delta);
  productQtyMap[id] = newVal;
  if (el) el.value = newVal;
  updateModalPrice(id);
}

// Recompute the price shown in the product modal (unit price × current qty)
// whenever the qty stepper/input changes.
function updateModalPrice(id) {
  const priceEl = document.getElementById(`modal-price-${id}`);
  if (!priceEl) return;
  const unitPrice = parseFloat(priceEl.dataset.unitPrice);
  if (isNaN(unitPrice)) return;
  const qty = getProductQty(id);
  priceEl.textContent = `₦${Number(unitPrice * qty).toLocaleString()}`;
}

function selectModalVariant(productId, variantIdx) {
  variantSelectionMap[productId] = variantIdx;
  const p = PRODUCTS.find(x => x.id === productId);
  if (!p || !Array.isArray(p.variants)) return;

  // Update radio rows
  const rows = document.querySelectorAll(`#modal-variants-${productId} .modal-variant-row`);
  rows.forEach((row, i) => {
    const isSelected = i === variantIdx;
    row.classList.toggle('border-blue-800', isSelected);
    row.classList.toggle('bg-blue-50', isSelected);
    row.classList.toggle('border-gray-100', !isSelected);
    // Update radio dot
    const dot = row.querySelector('.w-4');
    if (dot) {
      dot.classList.toggle('border-blue-800', isSelected);
      dot.classList.toggle('border-gray-300', !isSelected);
      dot.innerHTML = isSelected ? '<div class="w-2 h-2 rounded-full" style="background:#000080;"></div>' : '';
    }
  });

  // Update price display (unit price × qty for the newly-selected variant)
  updateModalVariantPrice(productId, variantIdx);
}


// Enter key handler for product modal
function _modalEnterHandler(e) {
  if (e.key !== "Enter") return;
  const modal = document.getElementById("productModal");
  if (!modal || modal.classList.contains("hidden")) return;
  // Don't fire if user is typing in a textarea or input (review box, qty)
  const tag = document.activeElement?.tagName;
  if (tag === "TEXTAREA") return;
  // Find the visible add-to-cart / variant button and click it
  const addBtn = modal.querySelector("button[onclick*='addToCartWithQty'], button[onclick*='addVariantToCart']");
  if (addBtn) { e.preventDefault(); addBtn.click(); }
}
function closeProductModal() {
  document.getElementById("productModal").classList.add("hidden");
  document.removeEventListener("keydown", _modalEnterHandler);
  document.getElementById("productModal").classList.remove("flex");
  closeAllReviewsModal();
}

// ============================================================
// SERVICE MODAL — view price list & book via WhatsApp
// ============================================================
let _activeServiceSelection = null; // { groupName, itemName, price, priceLabel }

function openServiceModal(productId) {
  const p = allProducts.find(x => x.id === productId);
  if (!p) return;
  _activeServiceSelection = null;

  const modal = document.getElementById("serviceModal");
  if (!modal) return;

  // Header
  document.getElementById("svcModalImg").src = p.image || "";
  document.getElementById("svcModalImg").onerror = function(){ this.src="https://placehold.co/600x300/e5e7eb/9ca3af?text=Service"; };
  document.getElementById("svcModalName").textContent = p.name;
  document.getElementById("svcModalDesc").textContent = p.desc || "";

  // Build rate card
  const body = document.getElementById("svcModalBody");
  const groups = p.variantGroups || [];
  if (groups.length === 0) {
    body.innerHTML = `<div class="text-center py-10 text-gray-400 text-sm">
      <div class="text-4xl mb-3">💬</div>
      <p>Price list coming soon. <a href="https://wa.me/2349169618353" class="font-bold underline" style="color:#000080;">Contact us on WhatsApp</a>.</p>
    </div>`;
  } else {
    body.innerHTML = groups.map((g, gi) => `
      <div class="mb-5">
        <p class="text-[10px] font-black uppercase tracking-widest mb-2 pb-1 border-b border-gray-100" style="color:#000080;">${escapeHtml(g.groupName || 'Options')}</p>
        <div class="space-y-2">
          ${(g.items || []).map((it, ii) => {
            const isDM = it.price == null || it.priceLabel === "DM for price";
            const priceText = isDM ? `<span class="italic text-gray-400 text-xs">DM for price</span>` : `<span class="font-black text-gray-900 text-sm">₦${Number(it.price).toLocaleString()}</span>`;
            const hasDesc = it.description && it.description.trim();
            return `
            <div class="svc-item-row border border-gray-100 rounded-xl px-4 py-3 cursor-pointer transition hover:border-blue-200"
              id="svcItem_${gi}_${ii}"
              onclick="selectServiceItem(${gi}, ${ii}, ${JSON.stringify(g.groupName)}, ${JSON.stringify(it.name)}, ${it.price != null ? it.price : 'null'}, ${isDM})">
              <div class="flex items-center justify-between gap-3">
                <span class="font-semibold text-gray-800 text-sm">${escapeHtml(it.name)}</span>
                ${priceText}
              </div>
              ${hasDesc ? `<button class="text-[10px] text-blue-600 font-semibold mt-1" onclick="event.stopPropagation(); toggleSvcDesc(this)">▸ What's included</button>
              <p class="svc-desc hidden text-xs text-gray-500 mt-1">${escapeHtml(it.description)}</p>` : ''}
            </div>`;
          }).join('')}
        </div>
      </div>
    `).join('');
  }

  updateSvcBottomBar();
  modal.classList.remove("hidden");
  modal.classList.add("flex");
  document.body.classList.add("modal-open");
}

function toggleSvcDesc(btn) {
  const desc = btn.nextElementSibling;
  if (!desc) return;
  const open = !desc.classList.contains("hidden");
  desc.classList.toggle("hidden", open);
  btn.textContent = open ? "▸ What's included" : "▾ What's included";
}

function selectServiceItem(gi, ii, groupName, itemName, price, isDM) {
  document.querySelectorAll(".svc-item-row").forEach(el => {
    el.style.borderColor = "";
    el.style.background = "";
  });
  const row = document.getElementById(`svcItem_${gi}_${ii}`);
  if (row) { row.style.borderColor = "#000080"; row.style.background = "#eff6ff"; }
  _activeServiceSelection = { groupName, itemName, price: isDM ? null : price, isDM };
  updateSvcBottomBar();
}

function updateSvcBottomBar() {
  const label = document.getElementById("svcSelectionLabel");
  const btn = document.getElementById("svcWhatsappBtn");
  if (!label || !btn) return;
  if (!_activeServiceSelection) {
    label.textContent = "Select a tier above";
    btn.disabled = true;
    btn.style.opacity = "0.5";
    btn.textContent = "Order via WhatsApp →";
    return;
  }
  const { itemName, price, isDM } = _activeServiceSelection;
  label.textContent = isDM ? `${itemName} — DM for price` : `${itemName} — ₦${Number(price).toLocaleString()}`;
  btn.disabled = false;
  btn.style.opacity = "1";
  btn.textContent = isDM ? "Enquire via WhatsApp" : "Order via WhatsApp →";
}

function bookServiceWhatsapp() {
  if (!_activeServiceSelection) return;
  const svcName = document.getElementById("svcModalName")?.textContent || "Service";
  const { itemName, price, isDM } = _activeServiceSelection;
  let msg;
  if (isDM) {
    msg = `Hi, I'd like to enquire about ${svcName} — ${itemName}. `;
  } else {
    msg = `Hi, I'd like to book ${svcName} — ${itemName} (₦${Number(price).toLocaleString()}). My hostel room is: `;
  }
  window.open(`https://wa.me/2349169618353?text=${encodeURIComponent(msg)}`, "_blank");
}

function closeServiceModal() {
  const modal = document.getElementById("serviceModal");
  if (modal) { modal.classList.add("hidden"); modal.classList.remove("flex"); }
  document.body.classList.remove("modal-open");
  _activeServiceSelection = null;
}

function escapeHtml(str) {
  if (!str) return "";
  return String(str).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;");
}

function renderModalReviewForm(productId) {
  const area = document.getElementById(`reviewFormArea_${productId}`);
  if (!area) return;
  if (currentUser) {
    area.innerHTML = `
      <div class="bg-gray-50 rounded-2xl p-4">
        <p class="text-sm font-semibold text-gray-700 mb-2">Leave a Review</p>
        <div class="flex gap-1 mb-3" id="starPicker_${productId}">
          ${[1,2,3,4,5].map(i => `<button class="star-btn" data-star="${i}" onclick="selectStar('${productId}', ${i})">☆</button>`).join('')}
        </div>
        <textarea id="reviewText_${productId}" placeholder="Share your experience..."
          class="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none resize-none" rows="3"
          onfocus="this.style.boxShadow='0 0 0 2px #000080'" onblur="this.style.boxShadow=''"></textarea>
        <button onclick="submitReview('${productId}')" class="mt-2 w-full text-white text-sm font-bold py-2 rounded-xl transition" style="background:#007BFF;">Submit Review</button>
      </div>`;
  } else {
    area.innerHTML = `<p class="text-sm text-gray-400 text-center"><button onclick="closeProductModal(); openAuthModal()" class="font-semibold" style="color:#000080;">Sign in</button> to leave a review</p>`;
  }
}

let selectedStars = {};
function selectStar(productId, star) {
  selectedStars[productId] = star;
  document.querySelectorAll(`#starPicker_${productId} .star-btn`).forEach(btn => {
    const s = parseInt(btn.dataset.star);
    btn.textContent = s <= star ? "★" : "☆";
    btn.classList.toggle("selected", s <= star);
  });
}

async function submitReview(productId) {
  if (!currentUser) { openAuthModal(); return; }
  const stars = selectedStars[productId] || 0;
  const textEl = document.getElementById(`reviewText_${productId}`);
  const text = textEl?.value.trim();
  if (!stars || !text) { showToast("⚠️", "Please add a rating and review text"); return; }
  try {
    const { error } = await sb.from("reviews").insert({
      product_id: productId,
      user_id: currentUser.uid,
      user_name: currentUser.displayName || currentUser.email,
      stars, text,
      featured: true
      // created_at: Postgres column default (now()) handles this — no need to set it
    });
    if (error) throw error;
    showToast("✅", "Review submitted!");

    // Clear the form so the same review can't be re-submitted by repeatedly
    // pressing Submit — reset both the textarea and the star picker.
    if (textEl) textEl.value = "";
    delete selectedStars[productId];
    document.querySelectorAll(`#starPicker_${productId} .star-btn`).forEach(btn => {
      btn.textContent = "☆";
      btn.classList.remove("selected");
    });

    loadProductReviews(productId);
  } catch (e) { showToast("❌", "Failed to submit review"); }
}

// Cache of the full (unsliced) review list per product, so "Show more"
// doesn't need a second Firestore round-trip.
const REVIEW_DISPLAY_LIMIT = 5;
let reviewsCache = {};

function renderReviewCardHTML(r) {
  const stars = "★".repeat(r.stars || 0) + "☆".repeat(5 - (r.stars || 0));
  return `<div class="bg-gray-50 rounded-xl p-3">
    <div class="flex items-center gap-2 mb-1">
      <span class="font-semibold text-xs text-gray-700">${escapeHtml(r.userName || 'Anonymous')}</span>
      <span class="text-yellow-500 text-xs">${stars}</span>
    </div>
    <p class="text-gray-600 text-xs">${escapeHtml(r.text)}</p>
  </div>`;
}

function loadProductReviews(productId) {
  const el = document.getElementById(`modalReviews_${productId}`);
  if (!el) return;
  sb.from("reviews").select("*").eq("product_id", productId)
    .then(({ data, error }) => {
      if (error) throw error;
      if (!data || data.length === 0) {
        reviewsCache[productId] = [];
        el.innerHTML = '<p class="text-gray-400 text-xs text-center py-2">No reviews yet — be the first!</p>';
        return;
      }
      const allDocs = data
        .map(row => ({
          userName: row.user_name,
          stars: row.stars,
          text: row.text,
          featured: row.featured,
          rank: row.rank,
          // Shimmed to look like a Firestore Timestamp ({seconds}) so the
          // sort comparator below (a.timestamp?.seconds) needed no changes.
          timestamp: { seconds: row.created_at ? new Date(row.created_at).getTime() / 1000 : 0 }
        }))
        .sort((a, b) => {
          // Featured (admin-ranked) reviews always come first, in rank order.
          if (a.featured && b.featured) return (a.rank || 0) - (b.rank || 0);
          if (a.featured && !b.featured) return -1;
          if (!a.featured && b.featured) return 1;
          // Both unfeatured: newest first.
          return (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0);
        });

      reviewsCache[productId] = allDocs;

      const visible = allDocs.slice(0, REVIEW_DISPLAY_LIMIT);
      el.innerHTML = visible.map(renderReviewCardHTML).join("");

      if (allDocs.length > REVIEW_DISPLAY_LIMIT) {
        el.innerHTML += `<button onclick="openAllReviewsModal('${productId}')"
          class="text-xs font-semibold underline" style="color:#000080;">
          Show all ${allDocs.length} reviews
        </button>`;
      }
    })
    .catch(() => { el.innerHTML = '<p class="text-gray-400 text-xs text-center py-2">No reviews yet — be the first!</p>'; });
}

function openAllReviewsModal(productId) {
  const modal = document.getElementById("allReviewsModal");
  const content = document.getElementById("allReviewsModalContent");
  if (!modal || !content) return;
  const reviews = reviewsCache[productId] || [];
  content.innerHTML = reviews.length
    ? reviews.map(renderReviewCardHTML).join("")
    : '<p class="text-gray-400 text-xs text-center py-4">No reviews yet.</p>';
  modal.classList.remove("hidden");
  modal.classList.add("flex");
}

function closeAllReviewsModal() {
  const modal = document.getElementById("allReviewsModal");
  if (modal) { modal.classList.add("hidden"); modal.classList.remove("flex"); }
}

// ============================================================
// SEARCH
// ============================================================
function isMobile() { return window.innerWidth < 640; }

function openSearchOverlay() {
  const overlay = document.getElementById("searchOverlay");
  if (!overlay) return;
  overlay.classList.remove("hidden");
  document.body.style.overflow = "hidden";
  setTimeout(() => {
    if (!isMobile()) {
      document.getElementById("searchOverlayInput")?.focus();
      document.getElementById("searchPanelDesktop")?.classList.add("panel-open");
    } else {
      // Reset hint + results mode
      document.getElementById("searchKeyboardHint")?.classList.remove("visible");
      document.getElementById("searchPanelMobile")?.classList.remove("results-mode");
      // Focus the input to immediately show keyboard
      const inp = document.getElementById("searchMobileInput");
      if (inp) {
        inp.focus();
        setTimeout(() => inp.focus(), 100);
        setTimeout(() => inp.focus(), 350);
      }
    }
  }, 10);
}

function closeSearchOverlay() {
  document.getElementById("searchPanelDesktop")?.classList.remove("panel-open");
  document.getElementById("searchPanelMobile")?.classList.remove("sheet-open", "results-mode");
  // Blur input so keyboard dismisses
  document.getElementById("searchMobileInput")?.blur();
  setTimeout(() => {
    document.getElementById("searchOverlay")?.classList.add("hidden");
    document.body.style.overflow = "";
    resetSearchResults();
    resetMobileSearchResults();
    hideQueryEcho();
    const catRow = document.getElementById("searchCatRow");
    if (catRow) catRow.style.display = "none";
    document.getElementById("searchKeyboardHint")?.classList.remove("visible");
    const clearBtn = document.getElementById("searchClearBtn");
    if (clearBtn) clearBtn.style.display = "none";
    const mobileClearBtn = document.getElementById("searchMobileClearBtn");
    if (mobileClearBtn) mobileClearBtn.style.display = "none";
    const inp = document.getElementById("searchMobileInput");
    if (inp) inp.value = "";
  }, 280);
}

function clearSearchInput() {
  const input = document.getElementById("searchOverlayInput");
  if (input) { input.value = ""; input.focus(); }
  resetSearchResults(); hideQueryEcho();
  document.getElementById("searchClearBtn").style.display = "none";
}
function clearMobileSearchInput() {
  const input = document.getElementById("searchMobileInput");
  if (input) { input.value = ""; input.focus(); }
  resetMobileSearchResults(); hideQueryEcho();
  document.getElementById("searchMobileClearBtn").style.display = "none";
}
function showQueryEcho(query, resultCount) {
  if (isMobile()) {
    const echo = document.getElementById("searchQueryEchoMobile");
    const text = document.getElementById("searchQueryTextMobile");
    const count = document.getElementById("searchResultCountMobile");
    if (!echo || !text) return;
    echo.style.display = "block"; text.textContent = query;
    if (count) { count.textContent = resultCount + " found"; count.style.display = resultCount > 0 ? "inline-block" : "none"; }
  } else {
    const echo = document.getElementById("searchQueryEchoDesktopInner");
    const text = document.getElementById("searchQueryTextDesktop");
    const count = document.getElementById("searchResultCountDesktop");
    if (!echo || !text) return;
    echo.style.display = "flex"; text.textContent = query;
    if (count) { count.textContent = resultCount + " result" + (resultCount !== 1 ? "s" : ""); count.style.display = resultCount > 0 ? "inline-block" : "none"; }
  }
}
function hideQueryEcho() {
  const m = document.getElementById("searchQueryEchoMobile"); if (m) m.style.display = "none";
  const d = document.getElementById("searchQueryEchoDesktopInner"); if (d) d.style.display = "none";
}
function resetSearchResults() {
  document.getElementById("searchDefault")?.classList.remove("hidden");
  document.getElementById("searchResultsList")?.classList.add("hidden");
  document.getElementById("searchEmpty")?.classList.add("hidden");
}
function resetMobileSearchResults() {
  document.getElementById("searchDefaultMobile")?.classList.remove("hidden");
  document.getElementById("searchResultsListMobile")?.classList.add("hidden");
  document.getElementById("searchEmptyMobile")?.classList.add("hidden");
}
// ============================================================
// CATALOG PAGE — STICKY SEARCH BAR (products.html only)
// Unlike the search overlay above (which has its own independent results
// dropdown), this filters the on-page #productGrid directly by reusing the
// existing searchQuery + getFilteredProducts()/renderProducts() pipeline —
// so it naturally combines with whichever category tab is active.
// ============================================================
let catalogSearchDebounceTimer;
function handleCatalogSearch(query) {
  const clearBtn = document.getElementById("catalogSearchClear");
  if (clearBtn) clearBtn.style.display = query.trim() ? "flex" : "none";
  clearTimeout(catalogSearchDebounceTimer);
  catalogSearchDebounceTimer = setTimeout(() => {
    searchQuery = query.trim();
    renderProducts();
  }, 120);
}
function clearCatalogSearch() {
  const input = document.getElementById("catalogSearchInput");
  if (input) { input.value = ""; input.focus(); }
  const clearBtn = document.getElementById("catalogSearchClear");
  if (clearBtn) clearBtn.style.display = "none";
  searchQuery = "";
  renderProducts();
}

function handleSearchKeydown(e) { if (e.key === "Escape") closeSearchOverlay(); }
function handleSearchInput(query) {
  const clearBtn = document.getElementById("searchClearBtn");
  if (clearBtn) clearBtn.style.display = query.trim() ? "flex" : "none";
  clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(() => { if (!query.trim()) hideQueryEcho(); runSearch(query.trim()); }, 120);
}
function handleMobileSearchInput(query) {
  const clearBtn = document.getElementById("searchMobileClearBtn");
  if (clearBtn) clearBtn.style.display = query.trim() ? "flex" : "none";
  // Show category chips as soon as user starts typing
  const catRow = document.getElementById("searchCatRow");
  if (catRow) catRow.style.display = query.trim() ? "flex" : "none";
  clearTimeout(mobileSearchDebounceTimer);
  mobileSearchDebounceTimer = setTimeout(() => {
    if (!query.trim()) { hideQueryEcho(); resetMobileSearchResults(); return; }
    runMobileSearch(query.trim());
  }, 120);
}
function scoreProduct(p, q) {
  const name = p.name.toLowerCase();
  const desc = (p.desc || "").toLowerCase();
  const cat  = (p.category || "").toLowerCase().replace(/-/g, " ");
  if (name.includes(q)) return 3;       // name match — top priority
  if (cat.includes(q))  return 2;       // category match — second
  if (desc.includes(q)) return 1;       // desc match — last
  return 0;
}
function runSearch(query) {
  const defaultEl = document.getElementById("searchDefault");
  const listEl = document.getElementById("searchResultsList");
  const emptyEl = document.getElementById("searchEmpty");
  const emptyQueryEl = document.getElementById("searchEmptyQuery");
  if (!query) { resetSearchResults(); hideQueryEcho(); return; }
  const q = query.toLowerCase();
  const results = PRODUCTS
    .filter(p => p.isHidden !== true && scoreProduct(p, q) > 0)
    .sort((a, b) => scoreProduct(b, q) - scoreProduct(a, q));
  defaultEl?.classList.add("hidden");
  showQueryEcho(query, results.length);
  if (results.length === 0) {
    listEl?.classList.add("hidden"); emptyEl?.classList.remove("hidden");
    if (emptyQueryEl) emptyQueryEl.textContent = `No products matching "${query}"`;
    return;
  }
  emptyEl?.classList.add("hidden"); listEl?.classList.remove("hidden");
  listEl.innerHTML = buildResultsHTML(results, query);
}
function runMobileSearch(query) {
  const defaultEl = document.getElementById("searchDefaultMobile");
  const listEl = document.getElementById("searchResultsListMobile");
  const emptyEl = document.getElementById("searchEmptyMobile");
  const emptyQueryEl = document.getElementById("searchEmptyQueryMobile");
  if (!query) { resetMobileSearchResults(); hideQueryEcho(); return; }
  const q = query.toLowerCase();
  const results = PRODUCTS
    .filter(p => p.isHidden !== true && scoreProduct(p, q) > 0)
    .sort((a, b) => scoreProduct(b, q) - scoreProduct(a, q));
  defaultEl?.classList.add("hidden");
  showQueryEcho(query, results.length);
  if (results.length === 0) {
    listEl?.classList.add("hidden"); emptyEl?.classList.remove("hidden");
    if (emptyQueryEl) emptyQueryEl.textContent = `No products matching "${query}"`;
    return;
  }
  emptyEl?.classList.add("hidden"); listEl?.classList.remove("hidden");
  listEl.innerHTML = buildResultsHTML(results, query);
}
function buildResultsHTML(results, query) {
  return results.map(p => {
    const highlightedName = highlightMatch(p.name, query);
    const categoryLabel = (p.category || "").replace(/-/g, " ");
    return `
      <div class="search-result-item flex items-center gap-3 px-4 py-3 hover:bg-blue-50 cursor-pointer transition group"
           onclick="selectSearchResult('${p.id}')">
        <div class="w-12 h-12 sm:w-14 sm:h-14 rounded-xl overflow-hidden flex-shrink-0 bg-gray-100">
          <img src="${p.image || ''}" alt="${p.name}"
            class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
            onerror="this.src='https://placehold.co/56x56/e5e7eb/9ca3af?text=?'">
        </div>
        <div class="flex-1 min-w-0">
          <p class="text-[10px] font-semibold uppercase tracking-wide mb-0.5" style="color:#000080;">${categoryLabel}</p>
          <p class="text-sm font-bold text-gray-800 leading-tight line-clamp-1">${highlightedName}</p>
          <p class="text-xs text-gray-400 line-clamp-1 mt-0.5">${p.desc || ''}</p>
        </div>
        <div class="flex-shrink-0 text-right">
          <p class="text-sm font-black text-gray-900">₦${Number(p.price).toLocaleString()}</p>
          <svg class="w-4 h-4 text-gray-300 ml-auto mt-1 group-hover:text-blue-600 transition" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"/>
          </svg>
        </div>
      </div>`;
  }).join("");
}
function highlightMatch(text, query) {
  if (!query) return text;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text.replace(new RegExp(`(${escaped})`, "gi"), '<mark style="background:#dbeafe;color:#1d4ed8;border-radius:2px;padding:0 1px;">$1</mark>');
}
function selectSearchResult(productId) {
  closeSearchOverlay();
  setTimeout(() => openProductModal(productId), 350);
}

// ============================================================
