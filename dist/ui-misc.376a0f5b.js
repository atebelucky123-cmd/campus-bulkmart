// ============================================================
// ui-misc.js — split from the original script.js (see split-plan notes)
// Toast, scroll-to-top, keyboard shortcuts, page init (DOMContentLoaded). Loads LAST.
// ============================================================

// TOAST
// ============================================================
let toastTimer;
function showToast(icon, msg) {
  const toast = document.getElementById("toast");
  if (!toast) return;
  document.getElementById("toastIcon").textContent = icon;
  document.getElementById("toastMsg").textContent = msg;
  toast.classList.remove("hidden");
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.classList.add("hidden"); toast.classList.remove("show"); }, 3000);
}

// ============================================================
// SCROLL TO TOP
// ============================================================
window.addEventListener("scroll", () => {
  const topBtn = document.getElementById("topBtn");
  if (topBtn) topBtn.classList.toggle("hidden", window.scrollY < 300);
  topBtn?.classList.toggle("flex", window.scrollY >= 300);
});

// ============================================================
// KEYBOARD SHORTCUTS
// ============================================================
document.addEventListener("keydown", e => {
  if (e.key !== "Enter") return;
  const authModal = document.getElementById("authModal");
  if (authModal && !authModal.classList.contains("hidden")) handleAuth();
});

// ============================================================
// INIT
// ============================================================
document.addEventListener("DOMContentLoaded", () => {
  restoreCartFromStorage();
  setOrderMode("individual");

  // Load products immediately — works if Firestore rules allow public reads.
  loadProductsFromFirestore();
  loadCustomCategories();

  // Safety net: if products still empty after auth resolves
  // (meaning the anonymous read was blocked by Firestore rules), retry.
  auth.onAuthStateChanged(() => {
    setTimeout(() => {
      if (PRODUCTS.length === 0) {
        console.warn("[CampusBulkmart] Products still empty after auth — retrying Firestore load.");
        loadProductsFromFirestore();
      }
    }, 4000);
  });
});