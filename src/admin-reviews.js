// ============================================================
// admin-reviews.js — split from the original admin.js (see split-plan notes)
// Review row mapping, review grid rendering, feature/rank reviews, delete review.
// ============================================================

// REVIEW ROW MAPPING
// docId (was Firestore doc.id) -> Supabase's uuid "id" column.
// timestamp is shimmed to support BOTH .seconds and .toDate(),
// since both patterns are used in different places in this file.
// ============================================================
function _mapReviewRow(row) {
  const d = row.created_at ? new Date(row.created_at) : null;
  return {
    docId: row.id,
    productId: row.product_id,
    userId: row.user_id,
    userName: row.user_name,
    stars: row.stars,
    text: row.text,
    featured: row.featured,
    rank: row.rank,
    timestamp: d ? { seconds: d.getTime() / 1000, toDate: () => d } : null
  };
}
// Small inline icon set for review-moderation action buttons (SVG, replaces the
// old emoji-string convention — see the Phase 1 icon library in ui-misc.js for
// the toast equivalent). Uses currentColor so each icon inherits its button's
// text color. Rating stars (★/☆ in the `stars` template variable below) are
// intentionally left as characters — out of scope per the exclusion list.
const _reviewIcon = {
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="12" height="12"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
  up: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="12" height="12"><polyline points="18 15 12 9 6 15"/></svg>',
  down: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="12" height="12"><polyline points="6 9 12 15 18 9"/></svg>',
  starOutline: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="11" height="11" style="vertical-align:-1px;"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>'
};

function loadAllReviews() {
  sb.from("reviews").select("*")
    .then(({ data, error }) => {
      if (error) throw error;
      allReviews = (data || []).map(_mapReviewRow);
      // Sort newest first (client-side)
      allReviews.sort((a, b) => {
        const ta = a.timestamp?.seconds || 0;
        const tb = b.timestamp?.seconds || 0;
        return tb - ta;
      });
      updateStats();
      renderAdminReviews();
    })
    .catch(() => {
      allReviews = [];
      renderAdminReviews();
    });
}

// ============================================================
// RENDER REVIEWS GRID
// ============================================================
function renderAdminReviews() {
  const starFilter     = document.getElementById("reviewStarFilter")?.value || "all";
  const featuredOnly   = document.getElementById("reviewFeaturedFilter")?.checked || false;
  const loading        = document.getElementById("reviewLoadingState");
  const grid           = document.getElementById("reviewsGrid");
  const emptyEl        = document.getElementById("reviewsEmpty");

  loading?.classList.add("hidden");

  let filtered = starFilter === "all"
    ? allReviews
    : allReviews.filter(r => String(r.stars) === starFilter);

  if (featuredOnly) filtered = filtered.filter(r => r.featured);

  if (filtered.length === 0) {
    grid?.classList.add("hidden");
    emptyEl?.classList.remove("hidden");
    return;
  }

  grid?.classList.remove("hidden");
  grid?.classList.add("grid");
  emptyEl?.classList.add("hidden");

  // Get product name by id
  function getProductName(pid) {
    const p = allProducts.find(x => x.id === pid);
    return p ? p.name : pid || "Unknown Product";
  }

  // Featured reviews first (ordered by rank ascending), then the rest
  // (already newest-first, since allReviews is sorted that way on load).
  const featured = filtered.filter(r => r.featured).sort((a, b) => (a.rank || 0) - (b.rank || 0));
  const others   = filtered.filter(r => !r.featured);
  const ordered  = [...featured, ...others];

  const minRank = featured.length ? featured[0].rank : null;
  const maxRank = featured.length ? featured[featured.length - 1].rank : null;

  grid.innerHTML = ordered.map(r => {
    const stars  = "★".repeat(r.stars || 0) + "☆".repeat(5 - (r.stars || 0));
    const date   = r.timestamp?.toDate
      ? r.timestamp.toDate().toLocaleDateString("en-NG", { day:"numeric", month:"short", year:"numeric" })
      : "—";
    const isFeatured  = !!r.featured;
    const atTop       = isFeatured && r.rank === minRank;
    const atBottom     = isFeatured && r.rank === maxRank;

    const rankBadge = isFeatured
      ? `<span class="flex-shrink-0 text-[10px] font-black text-white rounded-full w-5 h-5 flex items-center justify-center" style="background:#f59e0b;">${r.rank}</span>`
      : "";

    const featureControls = isFeatured
      ? `
        <button onclick="moveReviewRank('${r.docId}','up')" ${atTop ? "disabled" : ""}
          class="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition ${atTop ? "text-gray-200 cursor-not-allowed" : "bg-gray-50 hover:bg-gray-100 text-gray-600"}">${_reviewIcon.up}</button>
        <button onclick="moveReviewRank('${r.docId}','down')" ${atBottom ? "disabled" : ""}
          class="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition ${atBottom ? "text-gray-200 cursor-not-allowed" : "bg-gray-50 hover:bg-gray-100 text-gray-600"}">${_reviewIcon.down}</button>
        <button onclick="toggleFeatureReview('${r.docId}')"
          class="text-[10px] font-bold px-2 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-600 transition">Unfeature</button>
      `
      : `
        <button onclick="toggleFeatureReview('${r.docId}')"
          class="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-lg bg-gray-50 hover:bg-amber-50 hover:text-amber-600 text-gray-500 transition">${_reviewIcon.starOutline} Feature</button>
      `;

    return `
      <div class="bg-white rounded-2xl border ${isFeatured ? "border-amber-200" : "border-gray-100"} shadow-sm p-4">
        <div class="flex items-start justify-between gap-3 mb-2">
          <div class="min-w-0 flex items-center gap-2">
            ${rankBadge}
            <div class="min-w-0">
              <p class="font-semibold text-gray-800 text-sm line-clamp-1">${escapeHtml(r.userName || "Anonymous")}</p>
              <p class="text-[10px] text-gray-400">${date}</p>
            </div>
          </div>
          <button onclick="confirmDeleteReview('${r.docId}', '${escapeForAttr(r.userName || 'this review')}')"
            class="flex-shrink-0 w-7 h-7 bg-red-50 hover:bg-red-100 text-red-500 rounded-full flex items-center justify-center transition text-xs font-bold">
            ${_reviewIcon.close}
          </button>
        </div>
        <div class="text-yellow-500 text-sm mb-2 tracking-wide">${stars}</div>
        <p class="text-gray-600 text-sm mb-3 line-clamp-3">${escapeHtml(r.text || "")}</p>
        <div class="pt-2 border-t border-gray-50 flex items-center justify-between gap-2">
          <p class="text-[10px] text-gray-400 flex-1 min-w-0 truncate">Product: <span class="font-medium text-gray-600">${escapeHtml(getProductName(r.productId))}</span></p>
          <div class="flex items-center gap-1 flex-shrink-0">${featureControls}</div>
        </div>
      </div>
    `;
  }).join("");
}

// ============================================================
// FEATURE / RANK REVIEWS
// ============================================================
async function toggleFeatureReview(docId) {
  const r = allReviews.find(x => x.docId === docId);
  if (!r) return;

  try {
    if (r.featured) {
      // Unfeature: clear rank, then close the gap for reviews ranked below it
      const oldRank = r.rank;
      const { error } = await sb.from("reviews").update({ featured: false, rank: null }).eq("id", docId);
      if (error) throw error;
      r.featured = false;
      delete r.rank;

      const toShift = allReviews.filter(x => x.featured && x.rank > oldRank);
      if (toShift.length) {
        await Promise.all(toShift.map(x => {
          x.rank -= 1;
          return sb.from("reviews").update({ rank: x.rank }).eq("id", x.docId);
        }));
      }
      showAdminToast("star-outline", "Review unfeatured");
    } else {
      // Feature: put it at the end of the current featured list
      const maxRank = allReviews.reduce((m, x) => (x.featured && x.rank > m ? x.rank : m), 0);
      const newRank = maxRank + 1;
      const { error } = await sb.from("reviews").update({ featured: true, rank: newRank }).eq("id", docId);
      if (error) throw error;
      r.featured = true;
      r.rank = newRank;
      showAdminToast("star-filled", "Review featured");
    }
    renderAdminReviews();
  } catch (e) {
    showAdminToast("error", "Failed to update review: " + e.message);
  }
}

async function moveReviewRank(docId, direction) {
  const r = allReviews.find(x => x.docId === docId);
  if (!r || !r.featured) return;

  const targetRank = direction === "up" ? r.rank - 1 : r.rank + 1;
  const swap = allReviews.find(x => x.featured && x.rank === targetRank);
  if (!swap) return; // already at the top/bottom of the featured list

  try {
    const originalRank = r.rank;
    const [{ error: err1 }, { error: err2 }] = await Promise.all([
      sb.from("reviews").update({ rank: swap.rank }).eq("id", r.docId),
      sb.from("reviews").update({ rank: originalRank }).eq("id", swap.docId)
    ]);
    if (err1 || err2) throw (err1 || err2);

    r.rank = swap.rank;
    swap.rank = originalRank;
    renderAdminReviews();
  } catch (e) {
    showAdminToast("error", "Failed to reorder: " + e.message);
  }
}

// ============================================================
// DELETE REVIEW
// ============================================================
function confirmDeleteReview(docId, reviewerName) {
  const msg = document.getElementById("deleteModalMsg");
  if (msg) msg.textContent = `Review by "${reviewerName}" will be permanently deleted.`;

  pendingDeleteFn = () => executeDeleteReview(docId);

  const btn = document.getElementById("deleteConfirmBtn");
  if (btn) btn.onclick = () => { if(pendingDeleteFn) pendingDeleteFn(); };

  openDeleteModal();
}

async function executeDeleteReview(docId) {
  closeDeleteModal();
  const deleted = allReviews.find(r => r.docId === docId);
  try {
    const { error } = await sb.from("reviews").delete().eq("id", docId);
    if (error) throw error;
    allReviews = allReviews.filter(r => r.docId !== docId);

    // If the deleted review was featured, close the rank gap it left behind
    if (deleted?.featured && deleted.rank != null) {
      const toShift = allReviews.filter(x => x.featured && x.rank > deleted.rank);
      if (toShift.length) {
        await Promise.all(toShift.map(x => {
          x.rank -= 1;
          return sb.from("reviews").update({ rank: x.rank }).eq("id", x.docId);
        }));
      }
    }

    updateStats();
    renderAdminReviews();
    showAdminToast("trash", "Review deleted");
  } catch (e) {
    showAdminToast("error", "Failed to delete review: " + e.message);
  }
}

// ============================================================
