// ============================================================
// lib/brevoClient.js — sends the waitlist confirmation email via Brevo
//
// Uses Brevo's transactional email API directly (no SDK dependency needed —
// Node's built-in fetch is enough). Docs: https://developers.brevo.com/reference/sendtransacemail
// ============================================================

const BREVO_API_KEY = process.env.BREVO_API_KEY;
const FROM_EMAIL = process.env.BREVO_FROM_EMAIL || "";
const FROM_NAME = process.env.BREVO_FROM_NAME || "Campus Bulkmart";

// The "waitlist" list in Brevo (Contacts → Lists → waitlist).
// List ID stays stable even if the list gets renamed later — it's tied
// to the list's internal id, not its display name.
const WAITLIST_LIST_ID = 2;

if (!BREVO_API_KEY) {
  console.warn("[Brevo] Missing BREVO_API_KEY env var — confirmation emails will fail to send.");
}
if (!FROM_EMAIL) {
  console.warn("[Brevo] Missing BREVO_FROM_EMAIL env var — confirmation emails will fail to send.");
}

/**
 * Adds (or updates) a contact in the Brevo "waitlist" list.
 * Uses updateEnabled: true so a repeat signup just gets re-added to the
 * list instead of erroring on "contact already exists" — same
 * already-on-list case waitlist.js already handles for the DB row.
 * @param {string} email
 * @param {string} source - where they signed up (hero_form, waitlist_modal, etc.)
 */
async function syncContactToBrevo(email, source) {
  try {
    const response = await fetch("https://api.brevo.com/v3/contacts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": BREVO_API_KEY,
      },
      body: JSON.stringify({
        email,
        listIds: [WAITLIST_LIST_ID],
        updateEnabled: true,
        attributes: { SOURCE: source || "unknown" },
      }),
    });

    // Brevo returns 204 No Content on a successful update-existing-contact
    // call, and 201 Created on a brand new contact — both are success.
    if (response.status !== 201 && response.status !== 204) {
      const data = await response.json().catch(() => ({}));
      console.error("[Brevo] contact sync failed:", response.status, data);
      return { success: false, error: data };
    }

    return { success: true };
  } catch (err) {
    console.error("[Brevo] contact sync threw:", err);
    return { success: false, error: err };
  }
}

/**
 * Sends the "you're #X on the waitlist" confirmation email.
 * @param {string} toEmail
 * @param {number} position
 * @param {boolean} alreadyOnList - true if this person had already signed up before
 */
async function sendWaitlistEmail(toEmail, position, alreadyOnList) {
  const subject = alreadyOnList
    ? "You're already on the Campus Bulkmart waitlist"
    : "You're on the Campus Bulkmart waitlist! 🎉";

  const html = buildWaitlistEmailHtml(position, alreadyOnList);

  try {
    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": BREVO_API_KEY,
      },
      body: JSON.stringify({
        sender: { name: FROM_NAME, email: FROM_EMAIL },
        to: [{ email: toEmail }],
        subject,
        htmlContent: html,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("[Brevo] send failed:", data);
      return { success: false, error: data };
    }

    return { success: true, id: data?.messageId };
  } catch (err) {
    console.error("[Brevo] send threw:", err);
    return { success: false, error: err };
  }
}

function buildWaitlistEmailHtml(position, alreadyOnList) {
  const headline = alreadyOnList
    ? `You're still #${position} on the list`
    : `You're #${position} on the waitlist!`;

  const body = alreadyOnList
    ? "Looks like you'd already signed up — no worries, you're still locked in and eligible for launch discounts. Stay tuned, we'll email you the exact launch date soon."
    : "You've been added to the Campus Bulkmart waitlist and you're eligible for discount offers at launch. Stay tuned for more updates — we'll email you as soon as we have a launch date, and again the moment we open.";

  return `
  <div style="font-family: Arial, Helvetica, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; background: #FAF9F6;">
    <div style="text-align: center; margin-bottom: 24px;">
      <span style="font-size: 20px; font-weight: 900; color: #000080;">Campus Bulkmart</span>
    </div>
    <div style="background: #ffffff; border-radius: 16px; padding: 32px 24px; text-align: center; box-shadow: 0 4px 20px rgba(0,0,128,0.08);">
      <div style="display: inline-block; background: rgba(0,0,128,0.08); color: #000080; font-weight: 800; font-size: 32px; width: 72px; height: 72px; line-height: 72px; border-radius: 50%; margin-bottom: 20px;">
        #${position}
      </div>
      <h1 style="font-size: 20px; color: #1A1A1A; margin: 0 0 12px;">${headline}</h1>
      <p style="font-size: 14px; color: #6b7280; line-height: 1.6; margin: 0 0 18px;">${body}</p>
      <span style="display: inline-block; background: rgba(59,89,45,0.1); color: #3B592D; font-weight: 700; font-size: 12px; padding: 8px 16px; border-radius: 999px;">
        🎁 Eligible for launch discounts
      </span>
    </div>
    <p style="text-align: center; font-size: 12px; color: #9ca3af; margin-top: 24px; line-height: 1.6;">
      LASU Students Only &middot; Student-Run &amp; Trusted<br>
      You're getting this because you joined the Campus Bulkmart waitlist.<br>
      Add this address to your contacts so future updates land straight in your inbox.
    </p>
  </div>
  `;
}

module.exports = { sendWaitlistEmail, syncContactToBrevo };
