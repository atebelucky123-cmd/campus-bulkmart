// ============================================================
// auth.js — split from the original script.js (see split-plan notes)
// Auth state listener, signup/login helpers, email-typo detection.
// ============================================================

// AUTH STATE
// ============================================================
auth.onAuthStateChanged(user => {
  currentUser = user;
  // Single source of truth: always close modal + hide loader when auth state resolves
  if (user) {
    if (typeof hideAuthLoader === "function") hideAuthLoader();
    closeAuthModal();
  }
  const run = () => {
    const authBtn  = document.getElementById("authBtn");
    const userMenu = document.getElementById("userMenu");
    if (user) {
      // Hide Sign In button (works for both class-based and inline-style-based buttons)
      if (authBtn) { authBtn.style.display = "none"; authBtn.classList.add("hidden"); }
      if (userMenu) { userMenu.style.display = ""; userMenu.classList.remove("hidden"); }
      const name = user.displayName || user.email?.split("@")[0] || "User";
      const el = document.getElementById("userNameDisplay");
      const av = document.getElementById("userAvatar");
      if (el) el.textContent = name;
      if (av) av.textContent = name.charAt(0).toUpperCase();
      const nameInput = document.getElementById("checkoutName");
      if (nameInput && !nameInput.value) nameInput.value = user.displayName || "";
      if (user.uid === ADMIN_UID) document.getElementById("adminLink")?.classList.remove("hidden");
      document.getElementById("checkoutFormWrapper")?.classList.remove("hidden");
      document.getElementById("signInToCheckout")?.classList.add("hidden");
      const vaultChip = document.getElementById("homepage-vault-chip");
      if (vaultChip) vaultChip.classList.replace("hidden", "flex");
      applyWalletVisibility();
      updateCartUI();
    } else {
      // Show Sign In button
      if (authBtn) { authBtn.style.display = "flex"; authBtn.classList.remove("hidden"); }
      if (userMenu) { userMenu.style.display = "none"; userMenu.classList.add("hidden"); }
      document.getElementById("checkoutFormWrapper")?.classList.add("hidden");
      if (cart.length > 0) document.getElementById("signInToCheckout")?.classList.remove("hidden");
      const vaultChip = document.getElementById("homepage-vault-chip");
      if (vaultChip) { vaultChip.classList.remove("flex"); vaultChip.classList.add("hidden"); }
    }
  };
  if (document.readyState === "loading") { document.addEventListener("DOMContentLoaded", run); } else { run(); }
});

// ============================================================
// AUTH FUNCTIONS
// ============================================================
function openAuthModal() {
  document.getElementById("authModal").classList.remove("hidden");
  document.getElementById("authModal").classList.add("flex");
  // Restore persisted consent + sync button states every time the modal opens.
  // DOMContentLoaded already fired if the user navigated away and came back,
  // so we must re-run this here to avoid buttons staying disabled.
  var cb = document.getElementById("policyCheckbox");
  if (cb) {
    try {
      if (localStorage.getItem("cbm_policy_accepted") === "1") {
        cb.checked = true;
      }
    } catch(e) {}
    if (typeof updateAuthBtnState === "function") updateAuthBtnState();
  }
}
function closeAuthModal() {
  document.getElementById("authModal").classList.add("hidden");
  document.getElementById("authModal").classList.remove("flex");
  document.getElementById("authError")?.classList.add("hidden");
}
function toggleAuthMode() {
  isSignUpState = !isSignUpState;
  const map = isSignUpState
    ? { title:"Create Account", sub:"Join Campus Bulkmart today", btn:"Create Account", toggle:"Already have an account?", toggleBtn:"Sign In" }
    : { title:"Welcome Back", sub:"Sign in to your account", btn:"Sign In", toggle:"Don't have an account?", toggleBtn:"Sign Up" };
  document.getElementById("authTitle").textContent = map.title;
  document.getElementById("authSubtitle").textContent = map.sub;
  document.getElementById("authSubmitBtn").textContent = map.btn;
  document.getElementById("authToggleText").textContent = map.toggle;
  document.getElementById("authToggleBtn").textContent = map.toggleBtn;
  document.getElementById("signUpFields").classList.toggle("hidden", !isSignUpState);
  document.getElementById("confirmPasswordWrapper").classList.toggle("hidden", !isSignUpState);
}
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
  if (typeof showAuthLoader === "function") showAuthLoader("Connecting to Google…");

  auth.signInWithPopup(provider)
    .then(() => {
      // ✅ Don't close modal or update UI here.
      // onAuthStateChanged fires next and is the single source of truth.
      if (googleBtn) { googleBtn.disabled = false; googleBtn.style.opacity = ""; }
    })
    .catch(err => {
      if (typeof hideAuthLoader === "function") hideAuthLoader();
      if (googleBtn) { googleBtn.disabled = false; googleBtn.style.opacity = ""; }

      // User closed the popup themselves — silent, no error shown
      if (err.code === "auth/popup-closed-by-user" || err.code === "auth/cancelled-popup-request") return;

      // Popup was blocked by the browser — fall back to redirect
      if (err.code === "auth/popup-blocked") {
        if (typeof showAuthLoader === "function") showAuthLoader("Redirecting to Google…");
        auth.signInWithRedirect(provider).catch(redirectErr => {
          if (typeof hideAuthLoader === "function") hideAuthLoader();
          if (errEl) { errEl.textContent = redirectErr.message.replace("Firebase: ", ""); errEl.classList.remove("hidden"); }
        });
        return;
      }

      // Any other real error — show it
      if (errEl) { errEl.textContent = err.message.replace("Firebase: ", ""); errEl.classList.remove("hidden"); }
    });
}
// ============================================================
// EMAIL DOMAIN TYPO DETECTION
// Catches near-misses of popular providers (e.g. "gmail.co",
// "gmial.com") that pass normal format validation but are
// almost certainly typos. Only used at sign-up time — never at
// sign-in, since an existing account may already use one of
// these domains and must still be able to log back in.
// ============================================================
const POPULAR_EMAIL_DOMAINS = ["gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "icloud.com", "live.com", "aol.com", "protonmail.com"];

function _levenshtein(a, b) {
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
}

function findEmailDomainTypo(email) {
  const atIndex = email.lastIndexOf("@");
  if (atIndex === -1) return null;
  const domain = email.slice(atIndex + 1).toLowerCase();
  if (POPULAR_EMAIL_DOMAINS.includes(domain)) return null;

  let closest = null, closestDist = Infinity;
  for (const d of POPULAR_EMAIL_DOMAINS) {
    const dist = _levenshtein(domain, d);
    if (dist < closestDist) { closestDist = dist; closest = d; }
  }
  // Only flag small, likely-typo edit distances — avoids false positives
  // on legitimate but uncommon domains (school/company email, etc.)
  if (closest && closestDist > 0 && closestDist <= 2 && domain.length >= 4) return closest;
  return null;
}

async function handleAuth() {
  const email = document.getElementById("authEmail").value.trim();
  const password = document.getElementById("authPassword").value;
  const errEl = document.getElementById("authError");
  errEl.classList.add("hidden");

  const policyCb = document.getElementById("policyCheckbox");
  if (policyCb && !policyCb.checked) {
    errEl.textContent = "Please accept the Privacy Policy and Refund & Return Policy to continue.";
    errEl.classList.remove("hidden");
    return;
  }

  if (!email || !password) { errEl.textContent = "Please enter email and password."; errEl.classList.remove("hidden"); return; }

  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailPattern.test(email)) { errEl.textContent = "Please enter a valid email address."; errEl.classList.remove("hidden"); return; }

  let username, name;
  if (isSignUpState) {
    username = document.getElementById("authUsername").value.trim();
    name = document.getElementById("authDisplayName").value.trim();
    const confirmPass = document.getElementById("authConfirmPassword").value;
    if (!username || !name) { errEl.textContent = "Please enter your username and full name."; errEl.classList.remove("hidden"); return; }
    if (password.length < 6) { errEl.textContent = "Password must be at least 6 characters."; errEl.classList.remove("hidden"); return; }
    if (password !== confirmPass) { errEl.textContent = "Passwords do not match."; errEl.classList.remove("hidden"); return; }
    const suggestedDomain = findEmailDomainTypo(email);
    if (suggestedDomain) {
      const localPart = email.slice(0, email.lastIndexOf("@"));
      errEl.textContent = `Did you mean ${localPart}@${suggestedDomain}?`;
      errEl.classList.remove("hidden");
      return;
    }
  }

  const submitBtn = document.getElementById("authSubmitBtn");
  if (submitBtn) { submitBtn.disabled = true; submitBtn.style.opacity = "0.6"; }
  if (typeof showAuthLoader === "function") showAuthLoader(isSignUpState ? "Creating your account…" : "Signing in…");
  try {
    if (isSignUpState) {
      const cred = await auth.createUserWithEmailAndPassword(email, password);
      await cred.user.updateProfile({ displayName: name });
      await sb.from("users").insert({ uid: cred.user.uid, username, display_name: name, email });
      // ✅ onAuthStateChanged handles modal close + UI update
      showToast("✅", "Account created! Welcome!");
    } else {
      await auth.signInWithEmailAndPassword(email, password);
      // ✅ onAuthStateChanged handles modal close + UI update
    }
  } catch (err) {
    if (typeof hideAuthLoader === "function") hideAuthLoader();
    errEl.textContent = err.message.replace("Firebase: ", ""); errEl.classList.remove("hidden");
  } finally {
    if (submitBtn) { submitBtn.disabled = false; submitBtn.style.opacity = ""; }
  }
}
async function signOut() {
  await auth.signOut(); toggleUserDropdown(true); showToast("👋", "Signed out successfully");
}
function toggleUserDropdown(forceClose = false) {
  const dropdown = document.getElementById("userDropdown");
  if (!dropdown) return;
  if (forceClose || !dropdown.classList.contains("hidden")) { dropdown.classList.add("hidden"); }
  else { dropdown.classList.remove("hidden"); }
}
document.addEventListener("click", e => {
  const menu = document.getElementById("userMenu");
  const dropdown = document.getElementById("userDropdown");
  if (menu && dropdown && !menu.contains(e.target)) dropdown.classList.add("hidden");
});

// ============================================================
