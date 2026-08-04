// ============================================================
// routes/waitlist.js — POST /api/waitlist
//
// Flow:
//  1. Honeypot check (silent trap for bots)
//  2. Validate email
//  3. Look up existing signup — if found, return their existing position
//  4. Otherwise insert a new row, Supabase's auto-incrementing id IS the
//     waitlist position
//  5. Send the confirmation email via Resend
//  6. Respond with the position so the frontend can show it
// ============================================================

const express = require("express");
const rateLimit = require("express-rate-limit");
const { supabase } = require("./supabaseClient");
const { sendWaitlistEmail } = require("./brevoClient");
const { verifyAdmin } = require("./verifyAdmin");

const router = express.Router();

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Basic protection against someone hammering the public signup endpoint
// directly (the honeypot handles bots that go through the actual form).
// Scoped to POST only now — the admin GET route below has its own
// protection via verifyAdmin and shouldn't be limited to 8 requests/10min,
// since an admin refreshing the waitlist tab would hit that instantly.
const waitlistPostLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: "Too many attempts. Please try again later." },
});

router.post("/waitlist", waitlistPostLimiter, async (req, res) => {
  try {
    const { email, source, website } = req.body || {};

    // ── Honeypot ──
    // "website" is a hidden field real users never see or fill in. Bots that
    // auto-fill every field they find will trip it. We respond with a fake
    // success so the bot doesn't learn its submission was rejected, but we
    // don't save anything or send an email.
    if (website) {
      console.log("[Waitlist] Honeypot triggered, silently ignoring submission.");
      return res.status(200).json({ success: true, position: 1 });
    }

    // ── Validate email ──
    if (!email || typeof email !== "string" || !EMAIL_REGEX.test(email.trim())) {
      return res.status(400).json({ success: false, error: "Please enter a valid email address." });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // ── Check for existing signup ──
    const { data: existing, error: lookupError } = await supabase
      .from("waitlist")
      .select("id")
      .eq("email", normalizedEmail)
      .maybeSingle();

    if (lookupError) {
      console.error("[Waitlist] lookup failed:", lookupError);
      return res.status(500).json({ success: false, error: "Something went wrong. Please try again." });
    }

    let position;
    let alreadyOnList;

    if (existing) {
      position = existing.id;
      alreadyOnList = true;
    } else {
      const { data: inserted, error: insertError } = await supabase
        .from("waitlist")
        .insert({ email: normalizedEmail, source: source || "unknown" })
        .select("id")
        .single();

      if (insertError) {
        console.error("[Waitlist] insert failed:", insertError);
        return res.status(500).json({ success: false, error: "Something went wrong. Please try again." });
      }

      position = inserted.id;
      alreadyOnList = false;
    }

    // ── Send confirmation email (best-effort — don't fail the request if this fails) ──
    const emailResult = await sendWaitlistEmail(normalizedEmail, position, alreadyOnList);
    if (!emailResult.success) {
      console.warn("[Waitlist] Signup saved but confirmation email failed to send.");
    }

    return res.status(200).json({ success: true, position, alreadyOnList });

  } catch (err) {
    console.error("[Waitlist] unexpected error:", err);
    return res.status(500).json({ success: false, error: "Something went wrong. Please try again." });
  }
});

// ============================================================
// GET /api/waitlist — admin-only, returns every signup.
// Protected by verifyAdmin: requires a valid Firebase ID token for
// the one admin account (Authorization: Bearer <token>). The
// frontend admin panel is what supplies this — see admin-waitlist.js.
// Ordered newest-first so the admin sees recent signups at the top;
// "position" (the id) is still the actual waitlist order.
// ============================================================
router.get("/waitlist", verifyAdmin, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("waitlist")
      .select("id, email, source, created_at")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[Waitlist] admin list fetch failed:", error);
      return res.status(500).json({ success: false, error: "Could not load waitlist." });
    }

    return res.status(200).json({ success: true, count: data.length, entries: data });
  } catch (err) {
    console.error("[Waitlist] admin list unexpected error:", err);
    return res.status(500).json({ success: false, error: "Something went wrong." });
  }
});

module.exports = router;
