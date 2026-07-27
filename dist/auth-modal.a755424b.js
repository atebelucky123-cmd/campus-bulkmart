// ============================================================
// SHARED AUTH MODAL — used on dashboard, reviews, order-history, my-reviews
//
// Guards (`if (typeof X === "undefined")`) prevent this file from
// clobbering script.js's versions of these functions on pages that load
// both files (desktop.html, mobile.html, order-history.html). On pages
// that only load auth-modal.js (dashboard, wallet, reviews, my-reviews),
// this file defines everything itself.
// ============================================================

// isSignUpState must be declared with `var` (not `let`) here too:
// some pages (dashboard, wallet, reviews, my-reviews) load ONLY this
// file, not script.js, so it can't rely on script.js having declared it.
// `var` redeclarations are harmless and just merge into one variable,
// so this stays safe even on pages that load both files.
var isSignUpState = (typeof isSignUpState !== "undefined") ? isSignUpState : false;

// ============================================================
// AUTH LOADING OVERLAY
// (Always safe to define — script.js doesn't define these)
// ============================================================
function showAuthLoader(msg) {
  let overlay = document.getElementById("authLoadingOverlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "authLoadingOverlay";
    overlay.style.cssText = `
      position:fixed; inset:0; z-index:9999;
      background:rgba(0,0,0,0.6);
      backdrop-filter:blur(6px);
      display:flex; flex-direction:column;
      align-items:center; justify-content:center;
      gap:16px; animation:authOverlayIn 0.2s ease;
    `;
    overlay.innerHTML = `
      <style>
        @keyframes authOverlayIn { from{opacity:0} to{opacity:1} }
        @keyframes authSpin { to { transform: rotate(360deg); } }
        .auth-spinner {
          width:52px; height:52px; border-radius:50%;
          border:4px solid rgba(255,255,255,0.2);
          border-top-color:#fff;
          animation: authSpin 0.75s linear infinite;
        }
      </style>
      <div class="auth-spinner"></div>
      <p id="authLoaderMsg" style="color:#fff; font-size:14px; font-weight:600; font-family:Inter,sans-serif; letter-spacing:0.01em;">Signing in…</p>
    `;
    document.body.appendChild(overlay);
  }
  const msgEl = overlay.querySelector("#authLoaderMsg");
  if (msgEl) msgEl.textContent = msg || "Signing in…";
  overlay.style.display = "flex";
}

function hideAuthLoader() {
  const overlay = document.getElementById("authLoadingOverlay");
  if (overlay) overlay.style.display = "none";
}

// ============================================================
// MODAL OPEN / CLOSE — guarded: script.js defines these on index.html
// ============================================================
if (typeof openAuthModal === "undefined") {
  function openAuthModal() {
    document.getElementById("authModal").classList.remove("hidden");
    document.getElementById("authModal").classList.add("flex");
    // Re-sync checkbox + button states every time the modal opens,
    // in case DOMContentLoaded already fired before the modal was shown.
    var cb = document.getElementById("policyCheckbox");
    if (cb) {
      try {
        if (localStorage.getItem("cbm_policy_accepted") === "1") cb.checked = true;
      } catch(e) {}
      updateAuthBtnState();
    }
  }
}

if (typeof closeAuthModal === "undefined") {
  function closeAuthModal() {
    document.getElementById("authModal").classList.add("hidden");
    document.getElementById("authModal").classList.remove("flex");
    const errEl = document.getElementById("authError");
    if (errEl) errEl.classList.add("hidden");
  }
}

if (typeof toggleAuthMode === "undefined") {
  function toggleAuthMode() {
    isSignUpState = !isSignUpState;
    const title          = document.getElementById("authTitle");
    const subtitle       = document.getElementById("authSubtitle");
    const signUpFields   = document.getElementById("signUpFields");
    const confirmWrapper = document.getElementById("confirmPasswordWrapper");
    const submitBtn      = document.getElementById("authSubmitBtn");
    const toggleText     = document.getElementById("authToggleText");
    const toggleBtn      = document.getElementById("authToggleBtn");

    if (isSignUpState) {
      title.textContent      = "Create Account";
      subtitle.textContent   = "Join Campus Bulkmart today";
      signUpFields.classList.remove("hidden");
      confirmWrapper.classList.remove("hidden");
      submitBtn.textContent  = "Create Account";
      toggleText.textContent = "Already have an account?";
      toggleBtn.textContent  = "Sign In";
    } else {
      title.textContent      = "Welcome Back";
      subtitle.textContent   = "Sign in to your account";
      signUpFields.classList.add("hidden");
      confirmWrapper.classList.add("hidden");
      submitBtn.textContent  = "Sign In";
      toggleText.textContent = "Don't have an account?";
      toggleBtn.textContent  = "Sign Up";
    }
  }
}

// ============================================================
// PASSWORD VISIBILITY TOGGLE
// Applies to both the Sign In and Sign Up password fields
// (authPassword + authConfirmPassword). The eye icon only shows up
// once the user has typed at least one character, and toggles the
// field between masked and plain text.
// (Always safe to define — script.js doesn't define these.)
// ============================================================
function initPasswordToggle(inputId) {
  const input = document.getElementById(inputId);
  if (!input || input.dataset.pwToggleReady) return;
  input.dataset.pwToggleReady = "1";

  const wrapper = input.parentElement;
  const btn = wrapper ? wrapper.querySelector(".auth-pw-toggle") : null;
  if (!btn) return;
  const eyeIcon    = btn.querySelector(".icon-eye");
  const eyeOffIcon = btn.querySelector(".icon-eye-off");

  input.addEventListener("input", () => {
    btn.classList.toggle("hidden", input.value.length === 0);
  });

  btn.addEventListener("click", () => {
    const willShow = input.type === "password";
    input.type = willShow ? "text" : "password";
    eyeIcon?.classList.toggle("hidden", willShow);
    eyeOffIcon?.classList.toggle("hidden", !willShow);
    input.focus();
  });
}

function initAllAuthPasswordToggles() {
  initPasswordToggle("authPassword");
  initPasswordToggle("authConfirmPassword");
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initAllAuthPasswordToggles);
} else {
  initAllAuthPasswordToggles();
}

// ============================================================
// GOOGLE SIGN-IN — guarded: script.js has the canonical version on index.html
//
// Strategy: popup first (fast, stays on page).
// If blocked → redirect fallback.
// onAuthStateChanged is the ONLY place that closes the modal / updates UI.
// ============================================================
if (typeof handleGoogleSignIn === "undefined") {
  function handleGoogleSignIn() {
    const errEl = document.getElementById("authError");
    const policyCb = document.getElementById("policyCheckbox");
    if (policyCb && !policyCb.checked) {
      if (errEl) { errEl.textContent = "Please accept the Privacy Policy and Refund & Return Policy to continue."; errEl.classList.remove("hidden"); }
      return;
    }

    const provider = new firebase.auth.GoogleAuthProvider();
    provider.addScope("email");
    provider.addScope("profile");
    provider.setCustomParameters({ prompt: "select_account" });

    const googleBtn = document.querySelector('[onclick="handleGoogleSignIn()"]');

    if (googleBtn) { googleBtn.disabled = true; googleBtn.style.opacity = "0.6"; }
    showAuthLoader("Connecting to Google…");

    auth.signInWithPopup(provider)
      .then(() => {
        // ✅ Don't close modal or update UI here.
        // onAuthStateChanged fires next and is the single source of truth.
        if (googleBtn) { googleBtn.disabled = false; googleBtn.style.opacity = ""; }
      })
      .catch(err => {
        hideAuthLoader();
        if (googleBtn) { googleBtn.disabled = false; googleBtn.style.opacity = ""; }

        // User closed the popup themselves — silent, no error shown
        if (err.code === "auth/popup-closed-by-user" || err.code === "auth/cancelled-popup-request") return;

        // Popup was blocked by the browser — fall back to redirect
        if (err.code === "auth/popup-blocked") {
          showAuthLoader("Redirecting to Google…");
          auth.signInWithRedirect(provider).catch(redirectErr => {
            hideAuthLoader();
            if (errEl) {
              errEl.textContent = redirectErr.message.replace("Firebase: ", "");
              errEl.classList.remove("hidden");
            }
          });
          return;
        }

        // Any other real error — show it
        if (errEl) {
          errEl.textContent = err.message.replace("Firebase: ", "");
          errEl.classList.remove("hidden");
        }
      });
  }
}

// ============================================================
// REDIRECT RESULT HANDLER
// Runs on every page load. If the user returned from a Google redirect,
// onAuthStateChanged will fire automatically — we just suppress any
// noise errors here.
// ============================================================
function _handleRedirectResult() {
  if (typeof auth === "undefined") return;
  auth.getRedirectResult()
    .then(result => {
      if (result && result.user) {
        // onAuthStateChanged will handle modal close + UI update
        console.info("[Auth] Redirect sign-in resolved for:", result.user.email);
      }
    })
    .catch(err => {
      if (!err || err.code === "auth/user-cancelled" || err.code === "auth/no-auth-event") return;
      console.warn("[Auth] Redirect result error:", err.code, err.message);
    });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", _handleRedirectResult);
} else {
  setTimeout(_handleRedirectResult, 0);
}

// ============================================================
// EMAIL DOMAIN TYPO DETECTION — guarded: script.js defines the
// canonical version on pages that also load it.
// ============================================================
if (typeof findEmailDomainTypo === "undefined") {
  // NOTE: deliberately namespaced (not POPULAR_EMAIL_DOMAINS) — script.js
  // declares that name with `const` on pages that load both files, and a
  // `var` here would collide with it and throw a page-breaking SyntaxError
  // at parse time (the typeof guard above can't prevent that, since var
  // redeclaration vs. const is a compile-time error, not a runtime one).
  var _AUTH_MODAL_EMAIL_DOMAINS = ["gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "icloud.com", "live.com", "aol.com", "protonmail.com"];

  var _levenshtein = function(a, b) {
    const m = a.length, n = b.length;
    const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        dp[i][j] = a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
    return dp[m][n];
  };

  var findEmailDomainTypo = function(email) {
    const atIndex = email.lastIndexOf("@");
    if (atIndex === -1) return null;
    const domain = email.slice(atIndex + 1).toLowerCase();
    if (_AUTH_MODAL_EMAIL_DOMAINS.includes(domain)) return null;

    let closest = null, closestDist = Infinity;
    for (const d of _AUTH_MODAL_EMAIL_DOMAINS) {
      const dist = _levenshtein(domain, d);
      if (dist < closestDist) { closestDist = dist; closest = d; }
    }
    if (closest && closestDist > 0 && closestDist <= 2 && domain.length >= 4) return closest;
    return null;
  };
}

// ============================================================
// EMAIL/PASSWORD AUTH — guarded: script.js has the canonical version
// ============================================================
if (typeof handleAuth === "undefined") {
  async function handleAuth() {
    const email    = document.getElementById("authEmail").value.trim();
    const password = document.getElementById("authPassword").value;
    const errEl    = document.getElementById("authError");
    if (errEl) errEl.classList.add("hidden");

    const policyCb = document.getElementById("policyCheckbox");
    if (policyCb && !policyCb.checked) {
      if (errEl) { errEl.textContent = "Please accept the Privacy Policy and Refund & Return Policy to continue."; errEl.classList.remove("hidden"); }
      return;
    }

    if (!email || !password) {
      if (errEl) { errEl.textContent = "Please enter email and password."; errEl.classList.remove("hidden"); }
      return;
    }

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(email)) {
      if (errEl) { errEl.textContent = "Please enter a valid email address."; errEl.classList.remove("hidden"); }
      return;
    }

    let username, name;
    if (isSignUpState) {
      username = document.getElementById("authUsername")?.value.trim();
      name     = document.getElementById("authDisplayName")?.value.trim();
      const confirmPass = document.getElementById("authConfirmPassword")?.value;

      if (!username || !name) {
        if (errEl) { errEl.textContent = "Please enter your username and full name."; errEl.classList.remove("hidden"); }
        return;
      }
      if (password.length < 6) {
        if (errEl) { errEl.textContent = "Password must be at least 6 characters."; errEl.classList.remove("hidden"); }
        return;
      }
      if (password !== confirmPass) {
        if (errEl) { errEl.textContent = "Passwords do not match."; errEl.classList.remove("hidden"); }
        return;
      }
      const suggestedDomain = findEmailDomainTypo(email);
      if (suggestedDomain) {
        const localPart = email.slice(0, email.lastIndexOf("@"));
        if (errEl) { errEl.textContent = `Did you mean ${localPart}@${suggestedDomain}?`; errEl.classList.remove("hidden"); }
        return;
      }
    }

    const submitBtn = document.getElementById("authSubmitBtn");
    if (submitBtn) { submitBtn.disabled = true; submitBtn.style.opacity = "0.6"; }
    showAuthLoader(isSignUpState ? "Creating your account…" : "Signing in…");

    try {
      if (isSignUpState) {
        const cred = await auth.createUserWithEmailAndPassword(email, password);
        await cred.user.updateProfile({ displayName: name });
        if (typeof sb !== "undefined") {
          await sb.from("users").insert({
            uid: cred.user.uid,
            username,
            display_name: name,
            email
            // wallet_balance and role intentionally omitted — Postgres
            // column defaults (0 and 'customer') apply automatically
          });
        }
        // ✅ Don't close modal here — onAuthStateChanged handles it
      } else {
        await auth.signInWithEmailAndPassword(email, password);
        // ✅ Don't close modal here — onAuthStateChanged handles it
      }
    } catch (err) {
      hideAuthLoader();
      if (errEl) {
        errEl.textContent = err.message.replace("Firebase: ", "");
        errEl.classList.remove("hidden");
      }
    } finally {
      if (submitBtn) { submitBtn.disabled = false; submitBtn.style.opacity = ""; }
    }
  }
}

// ============================================================
// onAuthStateChanged for pages that don't load script.js
// (dashboard, reviews, order-history, my-reviews)
// Guarded so it only runs once even if both files are somehow loaded.
// ============================================================
if (typeof _authModalListenerRegistered === "undefined") {
  var _authModalListenerRegistered = true;

  // Only wire up if the full script.js auth listener isn't already present.
  // script.js sets `currentUser` via its own onAuthStateChanged, so we check that.
  if (typeof currentUser === "undefined") {
    if (typeof auth !== "undefined") {
      auth.onAuthStateChanged(user => {
        // Close loader + modal on any successful sign-in
        if (user) {
          hideAuthLoader();
          closeAuthModal();
          if (typeof loadUserUI === "function") loadUserUI(user);
        }
      });
    } else {
      // auth not ready yet — wait for DOMContentLoaded
      document.addEventListener("DOMContentLoaded", () => {
        if (typeof auth !== "undefined") {
          auth.onAuthStateChanged(user => {
            if (user) {
              hideAuthLoader();
              closeAuthModal();
              if (typeof loadUserUI === "function") loadUserUI(user);
            }
          });
        }
      });
    }
  }
}

// Close modal when clicking backdrop
document.addEventListener("DOMContentLoaded", () => {
  const modal = document.getElementById("authModal");
  if (modal) {
    modal.addEventListener("click", e => {
      if (e.target === modal) closeAuthModal();
    });
  }
});

// ============================================================
// POLICY CONSENT SYSTEM
// - Checkbox state gated: both Google + Email buttons are visually
//   disabled until the policy is accepted.
// - Acceptance is persisted in localStorage so it stays ticked
//   across sessions.
// - Policy modal shows Privacy Policy or Refund & Return Policy.
// ============================================================

var _currentPolicyTab = "privacy";

var _policyContent = {
  privacy: {
    title: "Privacy Policy",
    effectiveDate: "June 1, 2026",
    sections: [
      {
        heading: "1. Information We Collect",
        body: "We collect personal information that you voluntarily provide when you place an order, initialize a checkout, or contact us. This includes: <strong>Personal Identifiers</strong> (name, phone number, email address), <strong>Delivery Information</strong> (hostel name, room number, campus delivery location), and <strong>Order History</strong> (grocery items you purchase or intend to purchase)."
      },
      {
        heading: "2. Payment Data & Processing",
        body: "<strong>Online Payments (Paystack):</strong> We do not store your card details on our servers. All transactions are handled by Paystack, a certified third-party gateway. <strong>WhatsApp Payments:</strong> When you pay via WhatsApp, we collect your transaction receipt and order details to manually verify and fulfill your order."
      },
      {
        heading: "3. How We Use Your Information",
        body: "We use your data solely to: process and deliver your orders; calculate tiered delivery fees; communicate with you via SMS, phone, or WhatsApp about order updates; and comply with legal requirements from our payment processors."
      },
      {
        heading: "4. Data Sharing & Third Parties",
        body: "We do not sell or rent your personal information. We only share data with: <strong>Delivery Personnel</strong> (your name, phone, and location — only to fulfill your delivery) and <strong>Paystack</strong> (transaction details for payment authorization)."
      },
      {
        heading: "5. Data Security",
        body: "We implement Firebase database security rules and strict technical measures to protect your personal information from unauthorized access."
      },
      {
        heading: "6. Contact Us",
        body: "📧 <a href='mailto:atebelucky123@gmail.com' style='color:#000080;font-weight:600;'>atebelucky123@gmail.com</a><br>📱 <a href='https://wa.me/2349169618353' style='color:#000080;font-weight:600;'>+2349169618353</a>"
      }
    ]
  },
  refund: {
    title: "Refund & Return Policy",
    effectiveDate: "June 1, 2026",
    sections: [
      {
        heading: "1. Eligibility for Refunds & Replacements",
        body: "We offer refunds or replacements for: <strong>Damaged/Spoiled Goods</strong> — items that arrive damaged, broken, or spoiled; <strong>Incorrect Orders</strong> — items that don't match what you ordered; <strong>Missing Items</strong> — items you paid for that were omitted from your delivery."
      },
      {
        heading: "2. Reporting Window",
        body: "All complaints must be reported <strong>within 24 hours</strong> of receiving your delivery. Contact us via WhatsApp or email with your Order Number (or full name) and a clear photo of the damaged or incorrect item."
      },
      {
        heading: "3. Processing of Refunds",
        body: "<strong>Paystack Payments:</strong> Approved refunds are reversed to your original card/account via Paystack within 3–7 business days. <strong>WhatsApp/Manual Payments:</strong> Refunds are sent via direct bank transfer within 24–48 hours, or credited as a store voucher — your choice."
      },
      {
        heading: "4. Non-Refundable Situations",
        body: "We cannot issue refunds if: the delivery address was incorrect or unreachable after repeated contact attempts, or the complaint is made after the 24-hour reporting window."
      },
      {
        heading: "5. Contact Channels",
        body: "📧 <a href='mailto:atebelucky123@gmail.com' style='color:#000080;font-weight:600;'>atebelucky123@gmail.com</a><br>📱 <a href='https://wa.me/2349169618353' style='color:#000080;font-weight:600;'>+2349169618353</a>"
      }
    ]
  }
};

function _renderPolicyBody(tab) {
  var data = _policyContent[tab];
  if (!data) return;
  var html = '<p style="font-size:11px;color:#9ca3af;margin:0 0 16px;">Effective Date: ' + data.effectiveDate + '</p>';
  data.sections.forEach(function(s) {
    html += '<div style="margin-bottom:18px;">';
    html += '<h4 style="font-size:13px;font-weight:700;color:#111827;margin:0 0 6px;">' + s.heading + '</h4>';
    html += '<p style="margin:0;font-size:13px;color:#4b5563;line-height:1.7;">' + s.body + '</p>';
    html += '</div>';
  });
  var bodyEl = document.getElementById("policyBody");
  if (bodyEl) bodyEl.innerHTML = html;
}

function switchPolicyTab(tab) {
  _currentPolicyTab = tab;
  _renderPolicyBody(tab);
  var tabPrivacy = document.getElementById("policyTabPrivacy");
  var tabRefund  = document.getElementById("policyTabRefund");
  if (!tabPrivacy || !tabRefund) return;
  if (tab === "privacy") {
    tabPrivacy.style.background = "#000080"; tabPrivacy.style.color = "#fff"; tabPrivacy.style.border = "none";
    tabRefund.style.background  = "#fff";    tabRefund.style.color  = "#6b7280"; tabRefund.style.border = "1px solid #e5e7eb";
  } else {
    tabRefund.style.background  = "#000080"; tabRefund.style.color  = "#fff"; tabRefund.style.border = "none";
    tabPrivacy.style.background = "#fff";    tabPrivacy.style.color = "#6b7280"; tabPrivacy.style.border = "1px solid #e5e7eb";
  }
}

function openPolicyModal(tab) {
  var m = document.getElementById("policyModal");
  if (!m) {
    // Fallback: navigate to about.html if no inline modal exists on this page
    window.location.href = "about.html#policies?tab=" + (tab || "privacy");
    return;
  }
  m.classList.remove("hidden");
  m.classList.add("flex");
  switchPolicyTab(tab || "privacy");
}

function closePolicyModal() {
  var m = document.getElementById("policyModal");
  if (m) { m.classList.add("hidden"); m.classList.remove("flex"); }
}

function acceptPolicyFromModal() {
  // Tick the checkbox and persist
  var cb = document.getElementById("policyCheckbox");
  if (cb) cb.checked = true;
  try { localStorage.setItem("cbm_policy_accepted", "1"); } catch(e) {}
  updateAuthBtnState();
  closePolicyModal();
}

function updateAuthBtnState() {
  var cb        = document.getElementById("policyCheckbox");
  var submitBtn = document.getElementById("authSubmitBtn");
  var googleBtn = document.getElementById("googleSignInBtn");
  var accepted  = cb && cb.checked;

  if (submitBtn) {
    submitBtn.disabled      = !accepted;
    submitBtn.style.opacity = accepted ? "" : "0.45";
    submitBtn.style.cursor  = accepted ? "pointer" : "not-allowed";
  }
  if (googleBtn) {
    googleBtn.disabled      = !accepted;
    googleBtn.style.opacity = accepted ? "" : "0.45";
    googleBtn.style.cursor  = accepted ? "pointer" : "not-allowed";
  }
}

// On DOM ready: restore persisted consent + set initial button states
document.addEventListener("DOMContentLoaded", function() {
  var cb = document.getElementById("policyCheckbox");
  if (!cb) return;
  try {
    if (localStorage.getItem("cbm_policy_accepted") === "1") {
      cb.checked = true;
    }
  } catch(e) {}
  updateAuthBtnState();
});