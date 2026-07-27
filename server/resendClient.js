// ============================================================
// lib/resendClient.js — sends the waitlist confirmation email
// ============================================================

const { Resend } = require("resend");

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "Campus Bulkmart <onboarding@resend.dev>";

if (!RESEND_API_KEY) {
  console.warn("[Resend] Missing RESEND_API_KEY env var — confirmation emails will fail to send.");
}

const resend = new Resend(RESEND_API_KEY);

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
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: toEmail,
      subject,
      html,
    });

    if (error) {
      console.error("[Resend] send failed:", error);
      return { success: false, error };
    }

    return { success: true, id: data?.id };
  } catch (err) {
    console.error("[Resend] send threw:", err);
    return { success: false, error: err };
  }
}

function buildWaitlistEmailHtml(position, alreadyOnList) {
  const headline = alreadyOnList
    ? `You're still #${position} on the list`
    : `You're #${position} on the waitlist!`;

  const body = alreadyOnList
    ? "Looks like you'd already signed up — no worries, you're still locked in. We'll email you the moment we launch."
    : "Thanks for signing up early. We'll email you the moment Campus Bulkmart opens for LASU students — groceries, stationeries, and hostel services, delivered straight to your door.";

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
      <p style="font-size: 14px; color: #6b7280; line-height: 1.6; margin: 0;">${body}</p>
    </div>
    <p style="text-align: center; font-size: 12px; color: #9ca3af; margin-top: 24px; line-height: 1.6;">
      LASU Students Only &middot; Student-Run &amp; Trusted<br>
      You're getting this because you joined the Campus Bulkmart waitlist.
    </p>
  </div>
  `;
}

module.exports = { sendWaitlistEmail };
