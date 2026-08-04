// ============================================================
// wallet.js — Campus Bulkmart Wallet Module (Paystack Redirect Flow)
// Backend: https://lhbm-api.onrender.com
// ============================================================

const BACKEND_URL = "https://campus-bulkmart.onrender.com";

// ============================================================
// BOOTSTRAP — runs when page loads
// ============================================================
document.addEventListener("DOMContentLoaded", () => {
  // If user just returned from Paystack payment page, verify it
  const params = new URLSearchParams(window.location.search);
  if (params.get("verify") === "true" && params.get("reference")) {
    verifyPayment(params.get("reference"));
    // Clean the URL so refresh doesn't re-trigger verification
    window.history.replaceState({}, "", "wallet.html");
  }
});

// ============================================================
// STEP 1 — INITIATE DEPOSIT
// Called when user clicks "Deposit" button
// ============================================================
async function initiateDeposit(amount) {
  const depositBtn  = document.getElementById("depositBtn");
  const errorEl     = document.getElementById("depositInputError");

  // Clear previous errors
  errorEl.classList.add("hidden");
  errorEl.textContent = "";

  // Validate amount
  const parsed = parseFloat(amount);
  if (!parsed || isNaN(parsed) || parsed < 100) {
    errorEl.textContent = "Please enter a valid amount (minimum ₦100).";
    errorEl.classList.remove("hidden");
    return;
  }

  // Get current user
  const user = firebase.auth().currentUser;
  if (!user) {
    errorEl.textContent = "Session expired. Please log in again.";
    errorEl.classList.remove("hidden");
    return;
  }

  // Lock button
  depositBtn.disabled = true;
  showLoadingOverlay();

  try {
    // Call backend to create Paystack payment session
    const response = await fetch(`${BACKEND_URL}/api/initiate-payment`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        uid:    user.uid,
        email:  user.email,
        amount: parsed,
      }),
    });

    const data = await response.json();

    if (!response.ok || !data.authorization_url) {
      throw new Error(data.error || "Could not start payment.");
    }

    // Show the checkout block with a "Pay Now" link
    renderPaystackCheckout(parsed, data.authorization_url, data.reference);

    // Clear the input
    document.getElementById("depositAmountInput").value = "";

  } catch (err) {
    console.error("[Wallet] initiate-payment failed:", err);
    errorEl.textContent = err.message || "Payment could not be started. Try again.";
    errorEl.classList.remove("hidden");
  } finally {
    depositBtn.disabled = false;
    hideLoadingOverlay();
  }
}

// ============================================================
// STEP 2 — RENDER PAYSTACK CHECKOUT BLOCK
// Shows a "Pay Now" button that sends user to Paystack
// ============================================================
function renderPaystackCheckout(amount, authUrl, reference) {
  const container = document.getElementById("depositCheckoutContainer");
  if (!container) return;

  container.innerHTML = `
    <div class="checkout-box" id="active-checkout-box">

      <div class="checkout-header">
        <span class="checkout-badge">Payment Ready</span>
        <button class="checkout-dismiss" onclick="clearActiveCheckout()" title="Dismiss">✕</button>
      </div>

      <p class="checkout-amount-label">Amount to pay</p>
      <p class="checkout-amount">₦${formatCurrency(amount)}</p>

      <div class="checkout-account-box" style="text-align:center; padding: 1rem;">
        <p style="font-size:0.85rem; color:#6b7280; margin-bottom:0.75rem; line-height:1.5;">
          You'll be taken to Paystack's secure payment page.<br>
          After paying, you'll be brought back automatically.
        </p>
        <a
          href="${authUrl}"
          style="display:inline-block; background:#000080; color:#fff; font-weight:700;
                 padding:0.75rem 2rem; border-radius:0.625rem; text-decoration:none;
                 font-size:1rem; transition:opacity 0.15s;"
          onmouseover="this.style.opacity='0.85'"
          onmouseout="this.style.opacity='1'"
        >
          Pay Now →
        </a>
      </div>

      <p class="checkout-assurance">
        🔒 Your wallet will be credited automatically within seconds of payment confirmation.
      </p>

    </div>
  `;
}

// ============================================================
// STEP 3 — VERIFY PAYMENT (called on return from Paystack)
// ============================================================
async function verifyPayment(reference) {
  // Show a verifying banner at the top of the page
  showWalletError("⏳ Verifying your payment, please wait…", "#d1fae5", "#065f46");

  try {
    const response = await fetch(
      `${BACKEND_URL}/api/verify-payment?reference=${reference}`
    );
    const data = await response.json();

    if (data.success) {
      showWalletError(
        `✅ Payment confirmed! ₦${formatCurrency(data.amount)} has been added to your wallet.`,
        "#d1fae5", "#065f46"
      );
    } else {
      showWalletError(
        "⚠️ Payment could not be confirmed. If you were charged, contact support.",
        "#fef2f2", "#b91c1c"
      );
    }
  } catch (err) {
    console.error("[Wallet] verify-payment failed:", err);
    showWalletError(
      "⚠️ Could not verify payment. Please refresh or contact support.",
      "#fef2f2", "#b91c1c"
    );
  }
}

// ============================================================
// CLEAR CHECKOUT BLOCK
// ============================================================
function clearActiveCheckout() {
  const container = document.getElementById("depositCheckoutContainer");
  if (container) container.innerHTML = "";
}

// ============================================================
// UI HELPERS
// ============================================================

/** Shows a banner at the top of the wallet with custom colors */
function showWalletError(message, bg = "#fef2f2", color = "#b91c1c") {
  const el = document.getElementById("walletErrorBanner");
  if (!el) return;
  el.textContent = message;
  el.style.background = bg;
  el.style.color = color;
  el.style.borderColor = color;
  el.classList.remove("hidden");
  // Only auto-hide error messages, not success ones
  if (bg === "#fef2f2") {
    setTimeout(() => el.classList.add("hidden"), 7000);
  } else {
    setTimeout(() => el.classList.add("hidden"), 10000);
  }
}

/** Formats a number as Nigerian currency string */
function formatCurrency(amount) {
  return Number(amount).toLocaleString("en-NG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// ============================================================
// ENTER KEY SUPPORT
// ============================================================
document.addEventListener("DOMContentLoaded", () => {
  const depositInput = document.getElementById("depositAmountInput");
  if (depositInput) {
    depositInput.addEventListener("keydown", e => {
      if (e.key === "Enter") {
        e.preventDefault();
        initiateDeposit(depositInput.value);
      }
    });
  }
});
