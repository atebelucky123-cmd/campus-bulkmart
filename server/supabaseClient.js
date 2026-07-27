// ============================================================
// lib/supabaseClient.js — server-side Supabase client
// Uses the service_role key, which bypasses Row Level Security.
// This file must NEVER be imported into any frontend code.
// ============================================================

const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.warn(
    "[Supabase] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars — " +
    "waitlist requests will fail until these are set."
  );
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

module.exports = { supabase };
