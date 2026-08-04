// ============================================================
// verifyAdmin.js — middleware protecting admin-only backend routes.
//
// Expects header:  Authorization: Bearer <Firebase ID token>
//
// Verifies the token is genuine (signed by Firebase, not expired,
// not tampered with) AND belongs to the one admin account — same
// ADMIN_UID the frontend already checks in config.js before showing
// the admin link. Never trust a UID that just arrives in a request
// body/header unverified; it has to come out of a cryptographically
// verified token.
// ============================================================

const { admin } = require("./firebaseAdmin");

// Same value as ADMIN_UID in the frontend's config.js — keep these in sync.
const ADMIN_UID = "aq0QC7De1GNIOYVH7qtCDwBEH1I2";

async function verifyAdmin(req, res, next) {
  const header = req.headers.authorization || "";
  const token  = header.startsWith("Bearer ") ? header.slice(7).trim() : null;

  if (!token) {
    return res.status(401).json({ success: false, error: "Missing authorization token." });
  }

  try {
    const decoded = await admin.auth().verifyIdToken(token);
    if (decoded.uid !== ADMIN_UID) {
      return res.status(403).json({ success: false, error: "Not authorized." });
    }
    req.adminUid = decoded.uid;
    next();
  } catch (err) {
    console.error("[verifyAdmin] Token verification failed:", err.message);
    return res.status(401).json({ success: false, error: "Invalid or expired token." });
  }
}

module.exports = { verifyAdmin, ADMIN_UID };
