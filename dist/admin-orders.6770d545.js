// ============================================================
// admin-orders.js — split from the original admin.js (see split-plan notes)
// Order row mapping, orders list/status workflow, confirm-payment modal.
// ============================================================

// ORDER ROW MAPPING
// ============================================================
function _mapOrderRow(row) {
  const d = row.created_at ? new Date(row.created_at) : null;
  return {
    docId: row.id,
    userId: row.user_id,
    customerName: row.customer_name,
    customerEmail: row.customer_email,
    customerPhone: row.customer_phone,
    deliveryAddress: row.delivery_address,
    items: row.items || [],
    subtotal: row.subtotal,
    deliveryFee: row.delivery_fee,
    totalDiscount: row.total_discount,
    finalTotal: row.final_total,
    orderMode: row.order_mode,
    paymentMethod: row.payment_method,
    status: row.status,
    amountPaid: row.amount_paid,
    completedAt: row.completed_at,
    confirmedAt: row.confirmed_at,
    createdAt: d ? { seconds: d.getTime() / 1000, toDate: () => d } : null
  };
}

// ============================================================
// ORDERS
// ============================================================
let allOrders = [];

function loadAllOrders() {
  sb.from("orders").select("*").order("created_at", { ascending: false })
    .then(({ data, error }) => {
      if (error) throw error;
      allOrders = (data || []).map(_mapOrderRow);
      updateStats();
      renderAdminOrders();
    })
    .catch(() => {
      allOrders = [];
      renderAdminOrders();
    });
}

function renderAdminOrders() {
  const statusFilter = document.getElementById("orderStatusFilter")?.value || "all";
  const loading      = document.getElementById("orderLoadingState");
  const container    = document.getElementById("ordersContainer");
  const emptyEl      = document.getElementById("ordersEmpty");

  loading?.classList.add("hidden");

  const filtered = statusFilter === "all"
    ? allOrders
    : allOrders.filter(o => o.status === statusFilter);

  if (filtered.length === 0) {
    container?.classList.add("hidden");
    emptyEl?.classList.remove("hidden");
    return;
  }

  emptyEl?.classList.add("hidden");
  container?.classList.remove("hidden");

  const statusColors = {
    pending:   "bg-yellow-50 text-yellow-700 border-yellow-200",
    confirmed: "bg-blue-50 text-blue-700 border-blue-200",
    completed: "bg-green-50 text-green-700 border-green-200",
    cancelled: "bg-red-50 text-red-600 border-red-200"
  };

  container.innerHTML = filtered.map(order => {
    const date = order.createdAt?.toDate
      ? order.createdAt.toDate().toLocaleString("en-NG", { day:"numeric", month:"short", year:"numeric", hour:"2-digit", minute:"2-digit" })
      : "—";

    const status = order.status || "pending";
    const statusColor = statusColors[status] || statusColors.pending;
    // finalTotal is the field actually written at checkout; `total` kept as a fallback for any legacy orders.
    const total = Number(order.finalTotal ?? order.total ?? 0);

    const items = (order.items || []).map(i =>
      `<div class="flex justify-between text-xs text-gray-600 py-1 border-b border-gray-50 last:border-0">
        <span class="flex-1 pr-2">${escapeHtml(i.name)} <span class="text-gray-400">x${i.qty}</span></span>
        <span class="font-semibold text-gray-800 flex-shrink-0">₦${(i.price * i.qty).toLocaleString()}</span>
      </div>`
    ).join("");

    let paidLine = "";
    if (order.amountPaid != null) {
      const confirmedDate = order.confirmedAt?.toDate
        ? order.confirmedAt.toDate().toLocaleString("en-NG", { day:"numeric", month:"short", hour:"2-digit", minute:"2-digit" })
        : "—";
      paidLine = `<p class="text-xs text-green-700 mt-1">💰 Paid ₦${Number(order.amountPaid).toLocaleString()} · confirmed ${confirmedDate}</p>`;
    }

    let actions = "";
    if (status === "pending") {
      actions = `
        <button onclick="openConfirmOrderModal('${order.docId}')" class="text-xs font-bold px-3 py-1.5 rounded-lg text-white transition" style="background:#007BFF;">✅ Confirm Payment</button>
        <button onclick="cancelOrder('${order.docId}')" class="text-xs font-bold px-3 py-1.5 rounded-lg bg-red-100 hover:bg-red-200 text-red-600 transition">✕ Cancel</button>
      `;
    } else if (status === "confirmed") {
      actions = `
        <button onclick="markCompleted('${order.docId}')" class="text-xs font-bold px-3 py-1.5 rounded-lg bg-green-500 hover:bg-green-600 text-white transition">📦 Mark Completed</button>
        <button onclick="openReceiptModal('${order.docId}')" class="text-xs font-semibold px-4 py-1.5 rounded-lg border transition hover:bg-gray-50" style="color:#007BFF; border-color:#007BFF;">🧾 Receipt</button>
        <button onclick="revertToPending('${order.docId}')" class="text-xs font-bold px-3 py-1.5 rounded-lg bg-yellow-100 hover:bg-yellow-200 text-yellow-700 transition">↩ Revert to Pending</button>
        <button onclick="cancelOrder('${order.docId}')" class="text-xs font-bold px-3 py-1.5 rounded-lg bg-red-100 hover:bg-red-200 text-red-600 transition">✕ Cancel</button>
      `;
    } else if (status === "completed") {
      actions = `
        <button onclick="openReceiptModal('${order.docId}')" class="text-xs font-semibold px-4 py-1.5 rounded-lg border transition hover:bg-gray-50" style="color:#007BFF; border-color:#007BFF;">🧾 Receipt</button>
        <button onclick="revertToConfirmed('${order.docId}')" class="text-xs font-bold px-3 py-1.5 rounded-lg bg-blue-100 hover:bg-blue-200 text-blue-700 transition">↩ Revert to Confirmed</button>
      `;
    } else if (status === "cancelled") {
      actions = `
        <button onclick="revertToPending('${order.docId}')" class="text-xs font-bold px-3 py-1.5 rounded-lg bg-yellow-100 hover:bg-yellow-200 text-yellow-700 transition">↩ Reactivate to Pending</button>
      `;
    }

    return `
      <div class="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div class="flex items-start justify-between gap-3 p-4 border-b border-gray-50">
          <div class="min-w-0">
            <div class="flex items-center gap-2 flex-wrap">
              <p class="font-black text-gray-900 text-sm">Order #${order.docId.slice(-6).toUpperCase()}</p>
              <span class="text-[10px] font-bold px-2 py-0.5 rounded-full border ${statusColor} capitalize">${status}</span>
            </div>
            <p class="text-xs text-gray-400 mt-0.5">${date}</p>
            ${paidLine}
          </div>
          <p class="font-black text-gray-900 flex-shrink-0">₦${total.toLocaleString()}</p>
        </div>

        <div class="p-4 grid sm:grid-cols-2 gap-4">
          <!-- Customer info -->
          <div>
            <p class="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-2">Customer</p>
            <p class="text-sm font-semibold text-gray-800">${escapeHtml(order.customerName || "—")}</p>
            <p class="text-xs text-gray-500 mt-0.5">📞 ${escapeHtml(order.customerPhone || "—")}</p>
            <p class="text-xs text-gray-500 mt-0.5">✉️ ${escapeHtml(order.customerEmail || "—")}</p>
            <p class="text-xs text-gray-500 mt-0.5">🏠 ${escapeHtml(order.deliveryAddress || "—")}</p>
          </div>

          <!-- Items -->
          <div>
            <p class="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-2">Items (${order.items?.length || 0})</p>
            <div>${items}</div>
          </div>
        </div>

        <!-- Status action buttons -->
        <div class="px-4 pb-4 flex items-center gap-2 flex-wrap">
          ${actions}
        </div>
      </div>
    `;
  }).join("");
}

// Generic order-status writer. firestoreFields/localFields/deleteFields keep
// their original names for minimal diff, even though this now writes to
// Supabase — firestoreFields values are plain ISO date strings or numbers
// now (no more FieldValue sentinels), and deleteFields set the column to
// null instead of removing it (Postgres has no concept of a "missing" field).
const _ORDER_FIELD_MAP = { completedAt: "completed_at", confirmedAt: "confirmed_at", amountPaid: "amount_paid" };

async function updateOrderStatus(docId, newStatus, opts = {}) {
  const { firestoreFields = {}, localFields = {}, deleteFields = [] } = opts;
  const payload = { status: newStatus };
  for (const [key, val] of Object.entries(firestoreFields)) {
    payload[_ORDER_FIELD_MAP[key] || key] = val;
  }
  deleteFields.forEach(f => { payload[_ORDER_FIELD_MAP[f] || f] = null; });

  try {
    const { error } = await sb.from("orders").update(payload).eq("id", docId);
    if (error) throw error;

    const order = allOrders.find(o => o.docId === docId);
    if (order) {
      order.status = newStatus;
      Object.assign(order, localFields);
      deleteFields.forEach(f => { delete order[f]; });
    }

    updateStats();
    renderAdminOrders();
    showAdminToast("✅", `Order marked as ${newStatus}`);
  } catch (e) {
    showAdminToast("❌", "Failed to update: " + e.message);
  }
}

function markCompleted(docId) {
  const now = new Date();
  updateOrderStatus(docId, "completed", {
    firestoreFields: { completedAt: now.toISOString() },
    localFields: { completedAt: { toDate: () => now } }
  });
}

function revertToPending(docId) {
  updateOrderStatus(docId, "pending", {
    deleteFields: ["amountPaid", "confirmedAt", "completedAt"]
  });
}

function revertToConfirmed(docId) {
  updateOrderStatus(docId, "confirmed", {
    deleteFields: ["completedAt"]
  });
}

function cancelOrder(docId) {
  if (!confirm("Cancel this order?")) return;
  updateOrderStatus(docId, "cancelled");
}

// ============================================================
// CONFIRM PAYMENT MODAL
// ============================================================
let _confirmOrderDocId = null;

function openConfirmOrderModal(docId) {
  const order = allOrders.find(o => o.docId === docId);
  if (!order) return;
  _confirmOrderDocId = docId;

  const total = Number(order.finalTotal ?? order.total ?? 0);
  document.getElementById("confirmOrderIdText").textContent = "#" + docId.slice(-6).toUpperCase();
  document.getElementById("confirmOrderTotalText").textContent = "₦" + total.toLocaleString();

  const amountInput = document.getElementById("confirmAmountPaidInput");
  if (amountInput) amountInput.value = total;

  const modal = document.getElementById("confirmOrderModal");
  modal.classList.remove("hidden");
  modal.classList.add("flex");
  document.body.classList.add("modal-open");
}

function closeConfirmOrderModal() {
  const modal = document.getElementById("confirmOrderModal");
  modal.classList.add("hidden");
  modal.classList.remove("flex");
  document.body.classList.remove("modal-open");
  _confirmOrderDocId = null;
}

function submitConfirmOrder() {
  const docId = _confirmOrderDocId;
  if (!docId) return;

  const amountInput = document.getElementById("confirmAmountPaidInput");
  const amountPaid = Number(amountInput?.value);
  if (!amountPaid || amountPaid <= 0) {
    showAdminToast("❌", "Enter a valid amount paid");
    return;
  }

  const now = new Date();
  updateOrderStatus(docId, "confirmed", {
    firestoreFields: { amountPaid, confirmedAt: now.toISOString() },
    localFields: { amountPaid, confirmedAt: { toDate: () => now } }
  });
  closeConfirmOrderModal();
}

// ============================================================
// PAYMENT RECEIPT — build, preview, download, share
// ============================================================
let _receiptOrderDocId = null;

// Compact base64 copy of the Campus Bulkmart leaf logo, embedded directly so the
// receipt/stamp renders correctly regardless of what's deployed alongside the site.
const CBM_STAMP_LOGO_BASE64 = "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";

// Circular double-ring "stamp" mark used both as the seal in the receipt and, faded
// right down, as a full-page watermark. `opacity`/`size` let the same builder serve
// both jobs.
function buildStampSVG(size, opacity, textColor) {
  const cx = size / 2, cy = size / 2;
  const outerR = size * 0.47;
  const innerR = size * 0.41;
  const textR  = size * 0.44;
  const logoSize = size * 0.42;
  const logoOffset = cx - logoSize / 2;

  return `
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" style="opacity:${opacity};">
      <defs>
        <path id="stampRing${size}" d="M ${cx},${cy} m -${textR},0 a ${textR},${textR} 0 1,1 ${textR * 2},0 a ${textR},${textR} 0 1,1 -${textR * 2},0" />
      </defs>
      <circle cx="${cx}" cy="${cy}" r="${outerR}" fill="none" stroke="${textColor}" stroke-width="${size * 0.014}" />
      <circle cx="${cx}" cy="${cy}" r="${innerR}" fill="none" stroke="${textColor}" stroke-width="${size * 0.014}" />
      <text font-family="Outfit, sans-serif" font-weight="900" font-size="${size * 0.078}" fill="${textColor}" letter-spacing="${size * 0.012}">
        <textPath href="#stampRing${size}" startOffset="1%">CBM • VERIFIED • CAMPUS BULKMART •</textPath>
      </text>
      <image href="data:image/png;base64,${CBM_STAMP_LOGO_BASE64}" xlink:href="data:image/png;base64,${CBM_STAMP_LOGO_BASE64}" x="${logoOffset}" y="${logoOffset}" width="${logoSize}" height="${logoSize}" />
    </svg>
  `;
}

function buildReceiptHTML(order) {
  const orderIdShort = order.docId.slice(-6).toUpperCase();
  const amountPaid = Number(order.amountPaid ?? order.finalTotal ?? order.total ?? 0);
  const confirmedDate = order.confirmedAt?.toDate
    ? order.confirmedAt.toDate().toLocaleString("en-NG", { day:"numeric", month:"short", year:"numeric", hour:"2-digit", minute:"2-digit" })
    : "—";

  const items = (order.items || []).map(i => `
    <div style="display:flex; justify-content:space-between; font-size:13px; color:#374151; padding:7px 0; border-bottom:1px solid #f3f4f6;">
      <span>${escapeHtml(i.name)} × ${i.qty || 1}</span>
      <span style="font-weight:700;">₦${((i.price || 0) * (i.qty || 1)).toLocaleString()}</span>
    </div>`).join("");

  return `
    <div style="position:relative; width:600px; background:#ffffff; font-family:'Montserrat',sans-serif; overflow:hidden;">
      <!-- Faint full-page watermark stamp, sits behind everything -->
      <div style="position:absolute; top:50%; left:50%; transform:translate(-50%,-50%) rotate(-8deg); z-index:0; pointer-events:none;">
        ${buildStampSVG(460, 0.05, "#3B592D")}
      </div>

      <div style="position:relative; z-index:1; padding:40px; box-sizing:border-box;">
        <div style="text-align:center; margin-bottom:28px;">
          <p style="font-family:'Outfit',sans-serif; font-weight:900; font-size:26px; color:#000080; margin:0;">Campus Bulkmart</p>
          <p style="font-size:12px; letter-spacing:0.1em; text-transform:uppercase; color:#6b7280; margin:4px 0 0;">Payment Receipt</p>
        </div>

        <div style="border-top:2px solid #000080; border-bottom:2px solid #000080; padding:16px 0; margin-bottom:24px; display:flex; justify-content:space-between; font-size:13px;">
          <div>
            <p style="margin:0; color:#9ca3af;">Order ID</p>
            <p style="margin:2px 0 0; font-weight:800; color:#111827;">#${orderIdShort}</p>
          </div>
          <div style="text-align:right;">
            <p style="margin:0; color:#9ca3af;">Date Confirmed</p>
            <p style="margin:2px 0 0; font-weight:800; color:#111827;">${confirmedDate}</p>
          </div>
        </div>

        <p style="font-size:11px; color:#9ca3af; text-transform:uppercase; letter-spacing:0.08em; margin:0 0 4px;">Billed To</p>
        <p style="font-size:15px; font-weight:700; color:#111827; margin:0 0 22px;">${escapeHtml(order.customerName || "Customer")}</p>

        <p style="font-size:11px; color:#9ca3af; text-transform:uppercase; letter-spacing:0.08em; margin:0 0 8px;">Order Contents</p>
        <div style="margin-bottom:22px;">${items}</div>

        <div style="background:#f4f4f4; border-radius:14px; padding:18px 20px; display:flex; justify-content:space-between; align-items:center; margin-bottom:30px;">
          <span style="font-size:14px; font-weight:700; color:#374151;">Amount Paid</span>
          <span style="font-size:22px; font-weight:900; color:#000080;">₦${amountPaid.toLocaleString()}</span>
        </div>

        <div style="text-align:center;">
          <div style="display:inline-block; transform:rotate(-8deg);">
            ${buildStampSVG(120, 0.92, "#3B592D")}
          </div>
          <p style="font-size:11px; color:#9ca3af; margin-top:12px;">Thank you for shopping with Campus Bulkmart 💙</p>
        </div>
      </div>
    </div>
  `;
}

function openReceiptModal(docId) {
  const order = allOrders.find(o => o.docId === docId);
  if (!order) return;
  _receiptOrderDocId = docId;

  const html = buildReceiptHTML(order);

  // True-size hidden copy — this is what html2canvas actually captures.
  const captureEl = document.getElementById("receiptCaptureContainer");
  if (captureEl) captureEl.innerHTML = html;

  // Visible, scaled-to-fit copy for the modal preview.
  const previewWrap = document.getElementById("receiptPreviewContainer");
  previewWrap.innerHTML = html;
  requestAnimationFrame(() => {
    const inner = previewWrap.firstElementChild;
    if (!inner) return;
    const wrapWidth = previewWrap.clientWidth || 600;
    const scale = Math.min(1, wrapWidth / 600);
    const naturalHeight = inner.offsetHeight;
    inner.style.transform = `scale(${scale})`;
    inner.style.transformOrigin = "top left";
    previewWrap.style.height = (naturalHeight * scale) + "px";
  });

  const modal = document.getElementById("receiptModal");
  modal.classList.remove("hidden");
  modal.classList.add("flex");
  document.body.classList.add("modal-open");

  const shareBtn = document.getElementById("receiptShareBtn");
  if (shareBtn) {
    let supportsFiles = false;
    try {
      supportsFiles = !!(navigator.canShare && navigator.canShare({ files: [new File([""], "test.png", { type: "image/png" })] }));
    } catch (e) { supportsFiles = false; }
    shareBtn.textContent = supportsFiles ? "📤 Send to Customer" : "💬 Open WhatsApp Chat";
  }
}

function closeReceiptModal() {
  const modal = document.getElementById("receiptModal");
  modal.classList.add("hidden");
  modal.classList.remove("flex");
  document.body.classList.remove("modal-open");
  _receiptOrderDocId = null;
}

async function captureReceiptCanvas() {
  const el = document.getElementById("receiptCaptureContainer")?.firstElementChild;
  if (!el || typeof html2canvas !== "function") return null;
  return await html2canvas(el, { scale: 2, backgroundColor: "#ffffff" });
}

async function downloadReceipt() {
  const btn = document.getElementById("receiptDownloadBtn");
  const order = allOrders.find(o => o.docId === _receiptOrderDocId);
  if (!order) return;
  const originalText = btn ? btn.textContent : "";
  if (btn) { btn.disabled = true; btn.textContent = "Generating…"; }

  try {
    const canvas = await captureReceiptCanvas();
    if (!canvas) throw new Error("Could not generate image");
    const orderIdShort = order.docId.slice(-6).toUpperCase();
    const link = document.createElement("a");
    link.download = `CBM-Receipt-${orderIdShort}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
    showAdminToast("✅", "Receipt downloaded");
  } catch (e) {
    showAdminToast("❌", "Could not generate receipt: " + e.message);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = originalText; }
  }
}

async function shareReceipt() {
  const btn = document.getElementById("receiptShareBtn");
  const order = allOrders.find(o => o.docId === _receiptOrderDocId);
  if (!order) return;
  if (btn) btn.disabled = true;

  try {
    const orderIdShort = order.docId.slice(-6).toUpperCase();
    const canvas = await captureReceiptCanvas();
    if (!canvas) throw new Error("Could not generate image");

    const blob = await new Promise(res => canvas.toBlob(res, "image/png"));
    const fileName = `CBM-Receipt-${orderIdShort}.png`;
    const captionText = `Payment receipt for Order #${orderIdShort} — Campus Bulkmart. Thank you for your order!`;
    const file = new File([blob], fileName, { type: "image/png" });
    const canShareFiles = !!(navigator.canShare && navigator.canShare({ files: [file] }));

    if (canShareFiles) {
      await navigator.share({ files: [file], text: captionText });
      showAdminToast("✅", "Receipt ready to send");
    } else {
      // Fallback for browsers without file-sharing support: download the image,
      // then open a WhatsApp chat with the caption pre-filled so it's a one-drag
      // attach instead of a fully manual process.
      const link = document.createElement("a");
      link.download = fileName;
      link.href = canvas.toDataURL("image/png");
      link.click();
      const phoneDigits = (order.customerPhone || "").replace(/[^\d]/g, "");
      const waUrl = phoneDigits
        ? `https://wa.me/${phoneDigits}?text=${encodeURIComponent(captionText)}`
        : `https://wa.me/?text=${encodeURIComponent(captionText)}`;
      window.open(waUrl, "_blank");
      showAdminToast("ℹ️", "Image downloaded — attach it in the WhatsApp chat that just opened");
    }
  } catch (e) {
    if (e.name !== "AbortError") { // user closed the native share sheet — not a real error
      showAdminToast("❌", "Could not share receipt: " + e.message);
    }
  } finally {
    if (btn) btn.disabled = false;
  }
}

// ============================================================
