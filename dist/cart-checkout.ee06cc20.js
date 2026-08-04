// ============================================================
// cart-checkout.js — split from the original script.js (see split-plan notes)
// Cart persistence, delivery fee calc, order mode toggle, cart logic, checkout (WhatsApp + vault RPC).
// ============================================================

// CART PERSISTENCE
// ============================================================
const CART_STORAGE_KEY = "lasu_bulkmart_cart_v2";

function saveCartToStorage() {
  try { localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart)); } catch (e) {}
}

function restoreCartFromStorage() {
  try {
    const saved = localStorage.getItem(CART_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) cart = parsed;
    }
  } catch (e) { cart = []; }
}

function clearCartStorage() {
  try { localStorage.removeItem(CART_STORAGE_KEY); } catch (e) {}
}

// ============================================================
// LOCAL CACHE — products & categories
// Avoids re-downloading the whole catalog on every single page
// visit, which is what was burning through the Firestore free
// quota (each visit = 1 read per product + 1 per category).
//
// TTL default: 10 minutes. After that, the next visit fetches
// fresh data from Firestore and re-caches it.
//
// DEV / TESTING NOTES:
//   • A normal hard refresh (Ctrl+Shift+R) does NOT clear this —
//     hard refresh only bypasses the browser's file cache
//     (script.js, css, images), not localStorage.
//   • To force-fetch fresh data while testing changes you just
//     made in the admin panel / Firestore console, either:
//       1) load the page with ?freshdata=1 in the URL, or
//       2) open DevTools console and run: clearProductCache()
// ============================================================
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const PRODUCTS_CACHE_KEY = "cbm_products_cache_v1";
const CATEGORIES_CACHE_KEY = "cbm_categories_cache_v1";

function _forceFreshData() {
  try {
    return new URLSearchParams(window.location.search).get("freshdata") === "1";
  } catch (e) {
    return false;
  }
}

function _readCache(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.data) || typeof parsed.savedAt !== "number") return null;
    if (Date.now() - parsed.savedAt > CACHE_TTL_MS) return null; // expired
    return parsed.data;
  } catch (e) {
    return null;
  }
}

function _writeCache(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify({ data, savedAt: Date.now() }));
  } catch (e) {
    // localStorage full or unavailable — fail silently, just means no caching this time
  }
}

/** Console helper — run clearProductCache() in DevTools to force a fresh Firestore fetch. */
function clearProductCache() {
  try {
    localStorage.removeItem(PRODUCTS_CACHE_KEY);
    localStorage.removeItem(CATEGORIES_CACHE_KEY);
    console.log("[Cache] Cleared. Reload the page to fetch fresh data from Firestore.");
  } catch (e) {
    console.warn("[Cache] Could not clear cache:", e.message);
  }
}
window.clearProductCache = clearProductCache;

// ============================================================
// LOAD PRODUCTS FROM SUPABASE (cached, with TTL)
// Supabase columns are snake_case; mapped back to the same
// camelCase shape the rest of this file already expects, so
// renderProducts/renderTopPicksCarousel/etc. needed zero changes.
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

function loadProductsFromFirestore() {
  if (!_forceFreshData()) {
    const cached = _readCache(PRODUCTS_CACHE_KEY);
    if (cached) {
      PRODUCTS = cached;
      renderTopPicksCarousel();
      renderProducts();
      return;
    }
  }

  showProductSkeleton();
  sb.from("products").select("*")
    .then(({ data, error }) => {
      if (error) throw error;
      PRODUCTS = (data || []).map(_mapProductRow);
      _writeCache(PRODUCTS_CACHE_KEY, PRODUCTS);
      hideProductSkeleton();
      renderTopPicksCarousel();
      renderProducts();
    })
    .catch(err => {
      console.error("Supabase load error:", err);
      hideProductSkeleton();
      const grid = document.getElementById("productGrid");
      if (grid) {
        grid.innerHTML = `<div class="col-span-full text-center py-16 text-gray-400">
          <div class="text-4xl mb-3">📶</div>
          <p class="font-semibold">Couldn't load products</p>
          <p class="text-sm mt-1">Check your connection and refresh the page</p>
          <button onclick="location.reload()" class="mt-4 px-5 py-2 rounded-xl text-white text-sm font-bold" style="background:#000080;">Retry</button>
        </div>`;
      }
    });
}

// ============================================================
// CUSTOM CATEGORIES (admin-created, from Supabase "categories" table)
// The 3 built-in tabs (Groceries, Stationeries, Hostel Services) stay
// hardcoded in the HTML. Anything the admin adds gets appended after them.
// Cached the same way as products (see cache block above).
// ============================================================
function loadCustomCategories() {
  if (!_forceFreshData()) {
    const cached = _readCache(CATEGORIES_CACHE_KEY);
    if (cached) {
      CUSTOM_CATEGORIES = cached;
      renderCustomCategoryTabs();
      return;
    }
  }

  sb.from("categories").select("*").order("sort_order", { ascending: true })
    .then(({ data, error }) => {
      if (error) throw error;
      CUSTOM_CATEGORIES = (data || []).map(row => ({
        id: row.id,
        name: row.name,
        slug: row.slug,
        emoji: row.emoji,
        createdAt: row.created_at
      }));
      _writeCache(CATEGORIES_CACHE_KEY, CUSTOM_CATEGORIES);
      renderCustomCategoryTabs();
    })
    .catch(err => {
      console.warn("[Categories] Could not load custom categories:", err.message);
    });
}

function renderCustomCategoryTabs() {
  const row = document.getElementById("categoryRow");
  if (!row) return;

  // Remove any previously-injected custom tabs before re-rendering
  row.querySelectorAll(".category-btn-custom").forEach(el => el.remove());

  // The 3 "built-in" tabs (Top Picks, Groceries, Stationeries, Hostel
  // Services) are hardcoded directly in the HTML — but they ALSO exist
  // as real rows in the categories table (same in the old Firestore
  // data). Without this filter, they'd render twice: once from the
  // HTML, once from this dynamic list.
  const BUILT_IN_SLUGS = new Set(["top-picks", "groceries", "stationeries", "hostel-services"]);

  CUSTOM_CATEGORIES
    .filter(cat => !BUILT_IN_SLUGS.has(cat.slug))
    .forEach(cat => {
      const btn = document.createElement("button");
      btn.className = "category-btn category-btn-custom flex-shrink-0 px-3 sm:px-5 py-2 rounded-full text-xs sm:text-sm font-semibold border-2 transition whitespace-nowrap";
      btn.dataset.cat = cat.slug;
      btn.setAttribute("onclick", `setCategory('${cat.slug}')`);
      btn.textContent = `${cat.emoji || "🏷️"} ${cat.name}`;
      row.appendChild(btn);
    });
}

function showProductSkeleton() {
  const grid = document.getElementById("productGrid");
  const topPicksSection = document.getElementById("topPicksSection");
  if (topPicksSection) {
    topPicksSection.innerHTML = `<div class="flex gap-3 overflow-x-auto pb-2">
      ${[1,2,3,4].map(() => `<div class="flex-shrink-0 w-40 h-52 bg-gray-200 rounded-2xl animate-pulse"></div>`).join("")}
    </div>`;
  }
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
}

function hideProductSkeleton() {
  const grid = document.getElementById("productGrid");
  if (grid) grid.innerHTML = "";
}

// ============================================================
// DELIVERY FEE CALCULATOR
// ============================================================
function calculateDeliveryFee(cartSubtotal, mode) {
  if (mode === "group") {
    if (cartSubtotal < GROUP_MIN_THRESHOLD) {
      return { fee: null, warning: `Add ₦${(GROUP_MIN_THRESHOLD - cartSubtotal).toLocaleString()} more to unlock group processing` };
    }
    if (cartSubtotal >= 25000) return { fee: 0, label: "FREE (100% Group Discount!)", discount: 3000 };
    if (cartSubtotal >= 15000) return { fee: 1000, label: "₦1,000 (50% Group Discount)", discount: 1000 };
  }

  // Individual mode
  if (cartSubtotal < 2000) return { fee: null, warning: `Minimum order is ₦${MIN_ORDER.toLocaleString()}` };
  if (cartSubtotal >= 25000)               return { fee: 3000, label: "₦3,000" };
  if (cartSubtotal >= 15000)               return { fee: 2000, label: "₦2,000" };
  if (cartSubtotal >= 10000)               return { fee: 1500, label: "₦1,500" };
  if (cartSubtotal >= 9000)                return { fee: 700,  label: "₦700 (Buffer Saver!)" };
  if (cartSubtotal >= 5000)                return { fee: 1000, label: "₦1,000" };
  if (cartSubtotal >= 4500)                return { fee: 500,  label: "₦500 (Buffer Saver!)" };
  if (cartSubtotal >= 3000)                return { fee: 750,  label: "₦750" };
  if (cartSubtotal >= 2000)                return { fee: 500,  label: "₦500" };
  return { fee: null, warning: "Minimum order ₦2,000" };
}

// ============================================================
// ORDER MODE TOGGLE
// ============================================================
function setOrderMode(mode) {
  orderMode = mode;
  const indBtn = document.getElementById("modeIndividual");
  const grpBtn = document.getElementById("modeGroup");
  const groupInfo = document.getElementById("groupOrderInfo");

  if (indBtn && grpBtn) {
    if (mode === "group") {
      indBtn.classList.remove("active-mode");
      grpBtn.classList.add("active-mode");
      groupInfo?.classList.remove("hidden");
    } else {
      grpBtn.classList.remove("active-mode");
      indBtn.classList.add("active-mode");
      groupInfo?.classList.add("hidden");
    }
  }
  updateCartUI();
}

// ============================================================
// CART
// ============================================================
function addToCart(productId) { addToCartWithQty(productId); }

function addToCartWithQty(productId) {
  const p = PRODUCTS.find(x => x.id === productId);
  if (!p) return;

  // Block the add outright if we're in Group Order mode and this product
  // has group ordering disabled — previously this only showed a warning
  // toast but still let the product into the cart.
  if (orderMode === "group" && p.allowGroupOrder === false) {
    showToast("warning", `${p.name} isn't available for Group Orders`);
    return;
  }

  const qty = getProductQty(productId);
  const existing = cart.find(x => x.id === productId);
  if (existing) { existing.qty += qty; } else { cart.push({ ...p, qty }); }
  productQtyMap[productId] = 1;
  const gridQtyEl = document.getElementById(`qty-display-${productId}`);
  if (gridQtyEl) gridQtyEl.value = 1;
  updateCardPrice(productId);
  updateModalPrice(productId);
  updateCartUI();
  saveCartToStorage();
  showToast("cart", `${p.name} added to cart`);
}

function removeFromCart(productId) {
  cart = cart.filter(x => x.id !== productId);
  updateCartUI();
  saveCartToStorage();
}

function updateQty(productId, delta) {
  const item = cart.find(x => x.id === productId);
  if (!item) return;
  item.qty = Math.max(1, item.qty + delta);
  updateCartUI();
  saveCartToStorage();
}

function setCartQty(productId, value) {
  const item = cart.find(x => x.id === productId);
  if (!item) return;
  const parsed = parseInt(value);
  item.qty = isNaN(parsed) || parsed < 1 ? 1 : parsed;
  updateCartUI();
  saveCartToStorage();
}

function clearCart() {
  if (cart.length === 0) return;
  cart = [];
  updateCartUI();
  clearCartStorage();
  showToast("trash", "Cart cleared");
}

function updateCartUI() {
  const cartSubtotal = cart.reduce((sum, item) => sum + item.price * item.qty, 0);
  const count = cart.reduce((sum, item) => sum + item.qty, 0);

  // Update counts
  const countEl = document.getElementById("cartCount");
  const itemCountEl = document.getElementById("cartItemCount");
  if (countEl) countEl.textContent = count;
  if (itemCountEl) itemCountEl.textContent = `${cart.length} item${cart.length !== 1 ? 's' : ''}`;

  const cartItemsEl = document.getElementById("cartItems");
  const emptyCartEl = document.getElementById("emptyCart");
  const cartFooter = document.getElementById("cartFooter");
  const signInPrompt = document.getElementById("signInToCheckout");
  const checkoutForm = document.getElementById("checkoutFormWrapper");

  if (cart.length === 0) {
    if (emptyCartEl) emptyCartEl.classList.remove("hidden");
    if (cartFooter) cartFooter.classList.add("hidden");
    if (cartItemsEl) { cartItemsEl.innerHTML = ''; cartItemsEl.appendChild(emptyCartEl); }
    return;
  }

  if (emptyCartEl) emptyCartEl.classList.add("hidden");
  if (cartFooter) cartFooter.classList.remove("hidden");

  if (currentUser) {
    signInPrompt?.classList.add("hidden");
    checkoutForm?.classList.remove("hidden");
  } else {
    signInPrompt?.classList.remove("hidden");
    checkoutForm?.classList.add("hidden");
  }

  // Render cart items
  if (cartItemsEl) {
    cartItemsEl.innerHTML = cart.map(item => `
      <div class="flex items-center gap-3 bg-gray-50 rounded-xl p-3">
        <img src="${item.image || ''}" alt="${item.name}" class="w-12 h-12 sm:w-14 sm:h-14 object-cover rounded-lg flex-shrink-0"
          onerror="this.src='https://placehold.co/100x100/e5e7eb/9ca3af?text=?'">
        <div class="flex-1 min-w-0">
          <p class="text-xs sm:text-sm font-semibold text-gray-800 line-clamp-2 leading-tight">${item.name}</p>
          ${orderMode === "group" && item.allowGroupOrder === false ? '<p class="text-[10px] font-bold text-red-500 mt-0.5">⚠️ Not available for Group Orders</p>' : ''}
          <p class="font-black text-xs sm:text-sm mt-0.5" style="color:#000080;">₦${(item.price * item.qty).toLocaleString()}</p>
          <div class="flex items-center gap-1.5 mt-1.5">
            <button onclick="updateQty('${item.id}', -1)"
              class="w-6 h-6 border border-gray-200 rounded-full text-gray-600 hover:bg-gray-100 flex items-center justify-center text-xs font-bold transition bg-white">−</button>
            <input type="number" min="1" value="${item.qty}"
              onchange="setCartQty('${item.id}', this.value)"
              class="w-9 text-center text-xs font-bold text-gray-800 border border-gray-200 rounded-lg py-0.5 focus:outline-none" />
            <button onclick="updateQty('${item.id}', 1)"
              class="w-6 h-6 border border-gray-200 rounded-full text-gray-600 hover:bg-gray-100 flex items-center justify-center text-xs font-bold transition bg-white">+</button>
          </div>
        </div>
        <button onclick="removeFromCart('${item.id}')"
          class="flex-shrink-0 w-7 h-7 bg-red-50 hover:bg-red-100 text-red-500 rounded-full flex items-center justify-center transition">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12"/>
          </svg>
        </button>
      </div>
    `).join("");
  }

  // ── Price breakdown with delivery logic ──────────────────
  updatePriceBreakdown(cartSubtotal);
}

function updatePriceBreakdown(cartSubtotal) {
  const breakdownEl = document.getElementById("cartPriceBreakdown");
  const checkoutBtn = document.getElementById("checkoutBtn");
  if (!breakdownEl) return;

  const result = calculateDeliveryFee(cartSubtotal, orderMode);

  // Group order progress bar
  let groupProgressHTML = "";
  if (orderMode === "group") {
    if (result.warning) {
      const needed = GROUP_MIN_THRESHOLD - cartSubtotal;
      const pct = Math.min((cartSubtotal / GROUP_MIN_THRESHOLD) * 100, 100);
      groupProgressHTML = `
        <div class="mb-3">
          <div class="flex justify-between text-xs mb-1">
            <span class="font-semibold text-amber-700">Group threshold progress</span>
            <span class="font-bold text-amber-700">${Math.round(pct)}%</span>
          </div>
          <div class="w-full bg-gray-200 rounded-full h-2.5 overflow-hidden">
            <div class="h-2.5 rounded-full transition-all duration-500" style="width:${pct}%;background:linear-gradient(90deg,#f59e0b,#000080);"></div>
          </div>
          <p class="text-xs text-amber-700 font-semibold mt-1.5 text-center">
            ➕ Add <strong>₦${needed.toLocaleString()}</strong> more to unlock group wholesale!
          </p>
        </div>`;
    } else {
      const nextTier = cartSubtotal < 25000 ? `₦${(25000 - cartSubtotal).toLocaleString()} away from FREE delivery!` : "🎉 FREE delivery unlocked!";
      groupProgressHTML = `
        <div class="mb-3 bg-green-50 border border-green-200 rounded-xl p-2.5">
          <p class="text-xs text-green-700 font-bold text-center">✅ Group wholesale unlocked!</p>
          <p class="text-xs text-green-600 text-center mt-0.5">${nextTier}</p>
        </div>`;
    }
  } else {
    // Individual mode — show next tier hint
    const tiers = [2000, 3000, 4500, 5000, 9000, 10000, 15000, 25000];
    const nextTier = tiers.find(t => t > cartSubtotal);
    if (nextTier) {
      const diff = nextTier - cartSubtotal;
      const nextResult = calculateDeliveryFee(nextTier, "individual");
      const currentResult = calculateDeliveryFee(cartSubtotal, "individual");
      if (currentResult.fee !== null && nextResult.fee !== null && nextResult.fee < currentResult.fee) {
        groupProgressHTML = `
          <div class="mb-3 bg-blue-50 border border-blue-100 rounded-xl p-2.5 text-center">
            <p class="text-[11px] font-semibold" style="color:#000080;">Add ₦${diff.toLocaleString()} more → delivery drops to ${nextResult.label}</p>
          </div>`;
      }
    }
  }

  let breakdownHTML = groupProgressHTML;

  if (result.warning) {
    // Show warning and disabled checkout
    breakdownHTML += `
      <div class="space-y-2 text-sm">
        <div class="flex justify-between">
          <span class="text-gray-500">Subtotal</span>
          <span class="font-semibold text-gray-800">₦${cartSubtotal.toLocaleString()}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-gray-500">Delivery</span>
          <span class="text-gray-400 italic text-xs">—</span>
        </div>
        <div class="border-t pt-2 flex justify-between font-black text-base">
          <span class="text-gray-800">Total</span>
          <span style="color:#000080;">₦${cartSubtotal.toLocaleString()}</span>
        </div>
      </div>`;
    if (checkoutBtn) {
      checkoutBtn.disabled = true;
      checkoutBtn.style.background = "#9ca3af";
      checkoutBtn.style.cursor = "not-allowed";
    }
  } else {
    const deliveryFee = result.fee;
    const finalTotal = cartSubtotal + deliveryFee;
    const hasDiscount = result.discount > 0;

    breakdownHTML += `
      <div class="space-y-2 text-sm">
        <div class="flex justify-between">
          <span class="text-gray-500">Subtotal</span>
          <span class="font-semibold text-gray-800">₦${cartSubtotal.toLocaleString()}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-gray-500">Delivery Fee</span>
          <span class="font-semibold ${deliveryFee === 0 ? 'text-green-600' : 'text-gray-800'}">${result.label}</span>
        </div>
        ${hasDiscount ? `<div class="flex justify-between text-green-600">
          <span class="font-semibold">Group Discount</span>
          <span class="font-bold">−₦${result.discount.toLocaleString()}</span>
        </div>` : ''}
        <div class="border-t pt-2 flex justify-between font-black text-base">
          <span class="text-gray-800">Final Total</span>
          <span style="color:#000080;">₦${finalTotal.toLocaleString()}</span>
        </div>
      </div>`;
    if (checkoutBtn) {
      checkoutBtn.disabled = false;
      checkoutBtn.style.background = "#000080";
      checkoutBtn.style.cursor = "pointer";
    }
  }

  breakdownEl.innerHTML = breakdownHTML;
}

function toggleCart() {
  const overlay = document.getElementById("cartOverlay");
  overlay.classList.toggle("hidden");
}

// ============================================================
// CHECKOUT — Payment Method Modal
// ============================================================

// Stores pending order details while user picks a payment method
let _pendingOrderDetails = null;

function openPaymentModal() { document.getElementById("paymentModal").classList.remove("hidden"); document.getElementById("paymentModal").classList.add("flex"); }
function closePaymentModal() { document.getElementById("paymentModal").classList.add("hidden"); document.getElementById("paymentModal").classList.remove("flex"); document.getElementById("paymentModalError").classList.add("hidden"); document.getElementById("vaultInsufficientNotice")?.classList.add("hidden"); }

async function checkout() {
  if (!currentUser) { showToast("warning", "Please sign in to checkout"); return; }
  if (cart.length === 0) { showToast("warning", "Your cart is empty"); return; }

  const cartSubtotal = cart.reduce((sum, item) => sum + item.price * item.qty, 0);
  const result = calculateDeliveryFee(cartSubtotal, orderMode);

  if (result.warning) { showToast("warning", result.warning); return; }

  const name    = document.getElementById("checkoutName")?.value.trim();
  const phone   = document.getElementById("checkoutPhone")?.value.trim();
  const address = document.getElementById("checkoutAddress")?.value.trim();
  const errEl   = document.getElementById("checkoutError");

  if (!name || !phone || !address) { errEl?.classList.remove("hidden"); return; }
  errEl?.classList.add("hidden");

  const deliveryFee = result.fee;
  const finalTotal  = cartSubtotal + deliveryFee;

  // Save pending order details for whichever payment path the user picks
  _pendingOrderDetails = { name, phone, address, cartSubtotal, deliveryFee, finalTotal, result };

  // Wallet/Vault is switched off admin-side — skip the payment method
  // picker entirely and go straight to the WhatsApp checkout flow.
  if (!walletEnabled) {
    checkoutWhatsApp();
    return;
  }

  // Check vault balance to hint the user
  try {
    const { data, error } = await sb.from("users").select("wallet_balance").eq("uid", currentUser.uid).maybeSingle();
    if (error) throw error;
    const balance = data ? (data.wallet_balance ?? 0) : 0;
    const insufficient = balance < finalTotal;
    document.getElementById("vaultInsufficientNotice")?.classList.toggle("hidden", !insufficient);
    const payVaultBtn = document.getElementById("payVaultBtn");
    if (payVaultBtn) { payVaultBtn.disabled = insufficient; payVaultBtn.style.opacity = insufficient ? "0.5" : "1"; payVaultBtn.style.cursor = insufficient ? "not-allowed" : "pointer"; }
  } catch (e) { /* if check fails, just show both options */ }

  openPaymentModal();
}

// ── Vault payment path ───────────────────────────────────────
async function checkoutVault() {
  if (!_pendingOrderDetails || !currentUser) return;
  const errEl = document.getElementById("paymentModalError");
  errEl?.classList.add("hidden");

  const { name, phone, address, cartSubtotal, deliveryFee, finalTotal, result } = _pendingOrderDetails;

  try {
    // Atomic equivalent of the old Firestore transaction: a single
    // Postgres function (see supabase/functions.sql — checkout_with_wallet)
    // does the balance check, deduction, and order insert together,
    // wrapped in Postgres's own implicit transaction with a row lock.
    const { data, error } = await sb.rpc("checkout_with_wallet", {
      p_uid: currentUser.uid,
      p_amount: finalTotal,
      p_customer_name: name,
      p_customer_email: currentUser.email || "",
      p_customer_phone: phone,
      p_delivery_address: address,
      p_items: cart.map(i => ({ id: i.id, name: i.name, price: i.price, qty: i.qty })),
      p_subtotal: cartSubtotal,
      p_delivery_fee: deliveryFee,
      p_total_discount: result.discount || 0,
      p_order_mode: orderMode
    });

    if (error) throw new Error(error.message);
    const outcome = Array.isArray(data) ? data[0] : data;
    if (!outcome || !outcome.success) {
      throw new Error(outcome?.message === "Insufficient vault balance" ? "Insufficient vault balance" : (outcome?.message || "Payment failed"));
    }

    closePaymentModal();
    clearCart();
    clearCartStorage();
    toggleCart();
    showToast("success", "Order placed! Payment deducted from vault.");
    _pendingOrderDetails = null;

  } catch (err) {
    const msg = err.message === "Insufficient vault balance"
      ? "Your vault balance is too low. Top up on your dashboard."
      : "Payment failed. Please try again.";
    if (errEl) { errEl.textContent = msg; errEl.classList.remove("hidden"); }
  }
}

// ── WhatsApp payment path ────────────────────────────────────
async function checkoutWhatsApp() {
  if (!_pendingOrderDetails || !currentUser) return;
  const { name, phone, address, cartSubtotal, deliveryFee, finalTotal, result } = _pendingOrderDetails;

  let orderText = `*Campus Bulkmart — NEW ORDER*%0A`;
  orderText += `==============================%0A`;
  orderText += `*Order Type:* ${orderMode === "group" ? "🤝 Group Order" : "👤 Individual Order"}%0A`;
  orderText += `*Customer:* ${name}%0A`;
  orderText += `*Phone:* ${phone}%0A`;
  orderText += `*Hostel/Room:* ${address}%0A`;
  orderText += `==============================%0A%0A`;
  orderText += `*ORDER ITEMS:*%0A`;
  cart.forEach((item, i) => { orderText += `${i + 1}. ${item.name} (x${item.qty}) — ₦${(item.price * item.qty).toLocaleString()}%0A`; });
  orderText += `%0A==============================%0A`;
  orderText += `*Subtotal:* ₦${cartSubtotal.toLocaleString()}%0A`;
  orderText += `*Delivery Fee:* ${deliveryFee === 0 ? 'FREE 🎉' : '₦' + deliveryFee.toLocaleString()}%0A`;
  if (result.discount) orderText += `*Group Discount:* −₦${result.discount.toLocaleString()}%0A`;
  orderText += `*FINAL TOTAL:* *₦${finalTotal.toLocaleString()}*%0A`;
  orderText += `==============================`;

  try {
    const { error } = await sb.from("orders").insert({
      user_id: currentUser.uid,
      customer_name: name,
      customer_email: currentUser.email || "",
      customer_phone: phone,
      delivery_address: address,
      items: cart.map(i => ({ id: i.id, name: i.name, price: i.price, qty: i.qty })),
      subtotal: cartSubtotal,
      delivery_fee: deliveryFee,
      total_discount: result.discount || 0,
      final_total: finalTotal,
      order_mode: orderMode,
      payment_method: "whatsapp",
      status: "pending"
      // created_at: Postgres column default (now()) handles this
    });
    if (error) throw error;
  } catch (e) { console.warn("Supabase order save failed:", e.message); }

  closePaymentModal();
  window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${orderText}`, '_blank');
  clearCart();
  clearCartStorage();
  toggleCart();
  showToast("success", "Order sent via WhatsApp!");
  _pendingOrderDetails = null;
}

// ============================================================
