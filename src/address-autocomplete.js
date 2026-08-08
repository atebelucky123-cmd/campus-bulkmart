// ============================================================
// address-autocomplete.js — Standalone, reusable frontend module.
//
// Not wired into any specific page yet (per Lucky's request — build
// and verify this in isolation first, decide placement afterward).
// Attaches a debounced-typing dropdown of real address suggestions
// (via server/address-autocomplete.js's GET /api/address-autocomplete)
// to any text input, plus a "Not here? Pick a landmark instead"
// trigger at the bottom of the dropdown — matching the three-tier
// fallback chain: autocomplete suggestions -> landmark picker ->
// WhatsApp fallback.
//
// USAGE:
//   initAddressAutocomplete(document.getElementById("someAddressInput"), {
//     onSelect: (suggestion) => { ... },   // {lat, lon, displayPlace, displayAddress, displayName}
//     onNotHere: () => { ... },            // customer clicked "Not here?"
//     onNetworkError: (err) => { ... },    // optional — request itself failed
//   });
//
// Does NOT touch checkout state, saved addresses, or any existing
// verify/landmark/WhatsApp logic — purely: type -> show suggestions
// -> report back what was picked (or that they want the landmark
// fallback instead). The caller decides what happens next.
// ============================================================

const AUTOCOMPLETE_BACKEND_URL = "https://campus-bulkmart.onrender.com";
const DEBOUNCE_MS = 350;
const MIN_QUERY_LENGTH = 3; // matches server/address-autocomplete.js's own floor

/**
 * @param {HTMLInputElement} inputEl
 * @param {object} options
 * @param {(suggestion: {lat:number, lon:number, displayPlace:string, displayAddress:string, displayName:string}) => void} options.onSelect
 * @param {() => void} [options.onNotHere]
 * @param {(error: string) => void} [options.onNetworkError]
 */
function initAddressAutocomplete(inputEl, options = {}) {
  if (!inputEl) {
    console.warn("[AddressAutocomplete] No input element provided.");
    return;
  }

  const { onSelect, onNotHere, onNetworkError } = options;

  // Dropdown is created once, positioned relative to the input's
  // parent — caller's CSS needs the parent to allow an absolutely-
  // positioned child; this sets position:relative on it only if
  // nothing's already specified, so it won't clobber existing layout.
  const dropdown = document.createElement("div");
  dropdown.className = "js-address-autocomplete-dropdown";
  dropdown.style.cssText = `
    position: absolute;
    left: 0; right: 0; top: 100%;
    margin-top: 4px;
    background: #fff;
    border: 1px solid #e5e7eb;
    border-radius: 12px;
    box-shadow: 0 8px 24px rgba(0,0,0,0.12);
    max-height: 280px;
    overflow-y: auto;
    z-index: 60;
    display: none;
  `;

  const parent = inputEl.parentElement;
  if (parent && getComputedStyle(parent).position === "static") {
    parent.style.position = "relative";
  }
  parent.appendChild(dropdown);

  let debounceTimer = null;
  let currentRequestId = 0; // guards against a slow earlier request overwriting a newer one

  function hideDropdown() {
    dropdown.style.display = "none";
    dropdown.innerHTML = "";
  }

  function renderSuggestions(suggestions) {
    dropdown.innerHTML = "";

    if (suggestions.length === 0) {
      const empty = document.createElement("div");
      empty.style.cssText = "padding: 12px 14px; font-size: 13px; color: #9ca3af;";
      empty.textContent = "No matches yet — keep typing, or:";
      dropdown.appendChild(empty);
    } else {
      suggestions.forEach(suggestion => {
        const item = document.createElement("div");
        item.style.cssText = "padding: 10px 14px; cursor: pointer; border-bottom: 1px solid #f3f4f6; font-size: 13px;";
        item.onmouseenter = () => { item.style.background = "#f9fafb"; };
        item.onmouseleave = () => { item.style.background = "#fff"; };

        const place = document.createElement("div");
        place.style.cssText = "font-weight: 600; color: #1f2937;";
        place.textContent = suggestion.displayPlace || suggestion.displayName;

        const address = document.createElement("div");
        address.style.cssText = "color: #9ca3af; font-size: 11px; margin-top: 2px;";
        address.textContent = suggestion.displayAddress || "";

        item.appendChild(place);
        if (suggestion.displayAddress) item.appendChild(address);

        item.addEventListener("click", () => {
          inputEl.value = suggestion.displayName || suggestion.displayPlace;
          hideDropdown();
          if (typeof onSelect === "function") onSelect(suggestion);
        });

        dropdown.appendChild(item);
      });
    }

    // "Not here?" always shown, whether or not there were suggestions —
    // covers both "none of these match" and "nothing found at all".
    const notHere = document.createElement("div");
    notHere.style.cssText = "padding: 10px 14px; cursor: pointer; font-size: 12px; font-weight: 700; color: #000080;";
    notHere.textContent = "📍 Not here? Pick a landmark instead";
    notHere.onmouseenter = () => { notHere.style.background = "#f9fafb"; };
    notHere.onmouseleave = () => { notHere.style.background = "#fff"; };
    notHere.addEventListener("click", () => {
      hideDropdown();
      if (typeof onNotHere === "function") onNotHere();
    });
    dropdown.appendChild(notHere);

    dropdown.style.display = "block";
  }

  async function fetchSuggestions(query) {
    const requestId = ++currentRequestId;
    try {
      const res = await fetch(`${AUTOCOMPLETE_BACKEND_URL}/api/address-autocomplete?q=${encodeURIComponent(query)}`);
      const data = await res.json();

      // A slower, older request finally resolved after a newer one —
      // discard it rather than overwrite what's now on screen.
      if (requestId !== currentRequestId) return;

      if (!data.success) {
        hideDropdown();
        if (typeof onNetworkError === "function") onNetworkError(data.error || "Autocomplete request failed.");
        return;
      }

      renderSuggestions(data.suggestions || []);
    } catch (err) {
      if (requestId !== currentRequestId) return;
      hideDropdown();
      if (typeof onNetworkError === "function") onNetworkError(err.message);
    }
  }

  inputEl.addEventListener("input", () => {
    const query = inputEl.value.trim();
    clearTimeout(debounceTimer);

    if (query.length < MIN_QUERY_LENGTH) {
      hideDropdown();
      return;
    }

    debounceTimer = setTimeout(() => fetchSuggestions(query), DEBOUNCE_MS);
  });

  // Clicking elsewhere closes the dropdown — but not a click inside
  // it, which would otherwise close it before the item's own click
  // handler (above) gets a chance to fire.
  document.addEventListener("click", e => {
    if (e.target !== inputEl && !dropdown.contains(e.target)) hideDropdown();
  });

  inputEl.addEventListener("keydown", e => {
    if (e.key === "Escape") hideDropdown();
  });
}
