// ============================================================
// index.js — Campus Bulkmart backend entry point
// ============================================================

require("dotenv").config();

const express = require("express");
const cors = require("cors");

const waitlistRoutes = require("./waitlist");
const geocodeRoutes = require("./geocode"); // Phase 2d — /api/geocode-address
const deliveryQuoteRoutes = require("./delivery-quote"); // Phase 3 — /api/delivery-quote
const addressAutocompleteRoutes = require("./address-autocomplete"); // standalone — /api/address-autocomplete

const app = express();
const PORT = process.env.PORT || 3000;

// ── CORS ──
// Only allow requests from your own frontend(s), listed in ALLOWED_ORIGINS.
const allowedOrigins = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map(o => o.trim())
  .filter(Boolean);

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (curl, server-to-server, Postman)
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    console.warn(`[CORS] Blocked request from origin: ${origin}`);
    return callback(new Error("Not allowed by CORS"));
  },
}));

app.use(express.json());

// ── Routes ──
app.get("/", (req, res) => {
  res.json({ status: "ok", service: "campus-bulkmart-api" });
});

app.use("/api", waitlistRoutes);
app.use("/api", geocodeRoutes); // Phase 2d — used by admin origin/landmark editor and Phase 3 checkout's address verification
app.use("/api", deliveryQuoteRoutes); // Phase 3 — /api/delivery-quote, checkout's fee calculation
app.use("/api", addressAutocompleteRoutes); // standalone, built ahead of Phase 4b — typeahead suggestions, not yet wired into any page

// Future payment routes will get mounted here once the redesign happens,
// e.g. app.use("/api", paymentRoutes);

app.listen(PORT, () => {
  console.log(`[Server] Campus Bulkmart API running on port ${PORT}`);
});
