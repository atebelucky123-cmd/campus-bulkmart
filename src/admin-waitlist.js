// ============================================================
// admin-waitlist.js — Waitlist tab (coming-soon signups)
// Calls the backend's admin-only GET /api/waitlist route (see
// Phase 3: server/waitlist.js + server/verifyAdmin.js), sending
// the currently signed-in admin's Firebase ID token as a Bearer
// header. The backend re-verifies that token server-side — this
// file never assumes access, it just asks and shows whatever
// comes back (including a clear error if access is refused).
// ============================================================

const WAITLIST_BACKEND_URL = "https://campus-bulkmart.onrender.com";

let allWaitlistEntries = [];

async function loadWaitlist() {
  const loading   = document.getElementById("waitlistLoadingState");
  const errorEl   = document.getElementById("waitlistError");
  const tableWrap = document.getElementById("waitlistTableWrap");
  const emptyEl   = document.getElementById("waitlistEmpty");

  loading?.classList.remove("hidden");
  errorEl?.classList.add("hidden");
  tableWrap?.classList.add("hidden");
  emptyEl?.classList.add("hidden");

  try {
    const user = firebase.auth().currentUser;
    if (!user) throw new Error("Not signed in.");
    const token = await user.getIdToken();

    const response = await fetch(`${WAITLIST_BACKEND_URL}/api/waitlist`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.error || `Request failed (${response.status})`);
    }

    allWaitlistEntries = data.entries || [];
    renderWaitlist();
  } catch (e) {
    console.error("[Waitlist] Failed to load:", e);
    loading?.classList.add("hidden");
    if (errorEl) {
      errorEl.textContent = "Couldn't load the waitlist: " + e.message;
      errorEl.classList.remove("hidden");
    }
  }
}

// ============================================================
// RENDER
// ============================================================
function renderWaitlist() {
  const loading    = document.getElementById("waitlistLoadingState");
  const tableWrap  = document.getElementById("waitlistTableWrap");
  const emptyEl    = document.getElementById("waitlistEmpty");
  const tbody      = document.getElementById("waitlistTableBody");
  const countBadge = document.getElementById("waitlistCountBadge");
  const navBadge   = document.getElementById("waitlistNavBadge");

  loading?.classList.add("hidden");

  if (countBadge) {
    countBadge.textContent = allWaitlistEntries.length ? `(${allWaitlistEntries.length})` : "";
  }
  if (navBadge) {
    if (allWaitlistEntries.length > 0) {
      navBadge.textContent = allWaitlistEntries.length;
      navBadge.classList.remove("hidden");
    } else {
      navBadge.classList.add("hidden");
    }
  }

  if (allWaitlistEntries.length === 0) {
    tableWrap?.classList.add("hidden");
    emptyEl?.classList.remove("hidden");
    return;
  }

  emptyEl?.classList.add("hidden");
  tableWrap?.classList.remove("hidden");

  if (tbody) {
    tbody.innerHTML = allWaitlistEntries.map(entry => {
      const date = entry.created_at
        ? new Date(entry.created_at).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" })
        : "—";
      return `
        <tr class="border-b border-gray-50 last:border-0">
          <td class="py-3 px-4 font-bold text-gray-400">#${entry.id}</td>
          <td class="py-3 px-4 font-semibold text-gray-800">${escapeHtml(entry.email || "")}</td>
          <td class="py-3 px-4 text-gray-500 capitalize">${escapeHtml(entry.source || "unknown")}</td>
          <td class="py-3 px-4 text-gray-400">${date}</td>
        </tr>
      `;
    }).join("");
  }
}

// ============================================================
// CSV EXPORT — client-side, no extra backend round trip since the
// data's already loaded. Useful as a manual backup/export even
// though signups also auto-sync to Brevo (Phase 5).
// ============================================================
function exportWaitlistCsv() {
  if (!allWaitlistEntries.length) {
    showAdminToast("info", "Nothing to export yet.");
    return;
  }

  const header = ["position", "email", "source", "joined_at"];
  const rows = allWaitlistEntries.map(e => [
    e.id,
    e.email || "",
    e.source || "unknown",
    e.created_at || ""
  ]);

  const csv = [header, ...rows]
    .map(row => row.map(field => `"${String(field).replace(/"/g, '""')}"`).join(","))
    .join("\r\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url;
  a.download = `campus-bulkmart-waitlist-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  showAdminToast("success", `Exported ${allWaitlistEntries.length} signups`);
}

// ============================================================
