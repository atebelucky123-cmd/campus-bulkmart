// ============================================================
// firebaseAdmin.js — server-side Firebase Admin SDK init.
// Used ONLY to verify ID tokens sent from the admin panel on
// protected routes (see verifyAdmin.js). No client-side code
// ever imports this — the service account key must never reach
// the frontend or get committed to git.
// ============================================================

const admin = require("firebase-admin");

const projectId   = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
// Render (and most host dashboards) can't store real newlines in an env
// var, so the private key gets pasted with literal "\n" sequences —
// this converts them back to actual newlines before use.
const privateKey  = (process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n");

if (!projectId || !clientEmail || !privateKey) {
  console.warn(
    "[FirebaseAdmin] Missing FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / " +
    "FIREBASE_PRIVATE_KEY env vars — admin-only routes will reject every request " +
    "until these are set."
  );
}

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
  });
}

module.exports = { admin };
