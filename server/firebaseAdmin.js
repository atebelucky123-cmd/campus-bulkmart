// ============================================================
// firebaseAdmin.js — server-side Firebase Admin SDK init.
// Used ONLY to verify ID tokens sent from the admin panel on
// protected routes (see verifyAdmin.js). No client-side code
// ever imports this — the service account key must never reach
// the frontend or get committed to git.
//
// CREDENTIAL SOURCE — checked in this order:
//   1. A Render "Secret File" containing the ENTIRE downloaded
//      service account JSON, unmodified, mounted at
//      /etc/secrets/firebase-service-account.json (or wherever
//      FIREBASE_SERVICE_ACCOUNT_FILE points). This is the
//      preferred method — pasting the whole file avoids the
//      classic "private key got truncated/mangled by hand" bug
//      that happens when trying to split it into separate env vars.
//   2. Three separate env vars (FIREBASE_PROJECT_ID /
//      FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY) as a fallback,
//      kept for backward compatibility.
// ============================================================

const fs   = require("fs");
const admin = require("firebase-admin");

const SECRET_FILE_PATH = process.env.FIREBASE_SERVICE_ACCOUNT_FILE || "/etc/secrets/firebase-service-account.json";

function loadCredentialFromSecretFile() {
  try {
    if (!fs.existsSync(SECRET_FILE_PATH)) return null;
    const raw = fs.readFileSync(SECRET_FILE_PATH, "utf8");
    return JSON.parse(raw); // JSON.parse handles the \n escapes correctly on its own
  } catch (err) {
    console.error(`[FirebaseAdmin] Found ${SECRET_FILE_PATH} but couldn't parse it as JSON:`, err.message);
    return null;
  }
}

function loadCredentialFromEnvVars() {
  const projectId   = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  // Render (and most host dashboards) can't store real newlines in an env
  // var, so the private key gets pasted with literal "\n" sequences —
  // this converts them back to actual newlines before use.
  const privateKey  = (process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n");

  if (!projectId || !clientEmail || !privateKey) return null;
  return { project_id: projectId, client_email: clientEmail, private_key: privateKey };
}

const serviceAccount = loadCredentialFromSecretFile() || loadCredentialFromEnvVars();

if (!serviceAccount) {
  console.warn(
    `[FirebaseAdmin] No credentials found — checked ${SECRET_FILE_PATH} and the ` +
    "FIREBASE_PROJECT_ID/FIREBASE_CLIENT_EMAIL/FIREBASE_PRIVATE_KEY env vars. " +
    "Admin-only routes will reject every request until one of these is set up."
  );
}

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount || {}),
  });
}

module.exports = { admin };
