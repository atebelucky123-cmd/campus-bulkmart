// ============================================================
// index.js — Campus Bulkmart backend entry point
// ============================================================

require("dotenv").config();

const express = require("express");
const cors = require("cors");
const rateLimit = require("express-rate-limit");

const waitlistRoutes = require("./routes/waitlist");

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

// ── Rate limiting ──
// Basic protection against someone hammering the endpoint directly
// (the honeypot handles bots that go through the actual form).
const waitlistLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: "Too many attempts. Please try again later." },
});

// ── Routes ──
app.get("/", (req, res) => {
  res.json({ status: "ok", service: "campus-bulkmart-api" });
});

app.use("/api", waitlistLimiter, waitlistRoutes);

// Future payment routes will get mounted here once the redesign happens,
// e.g. app.use("/api", paymentRoutes);

app.listen(PORT, () => {
  console.log(`[Server] Campus Bulkmart API running on port ${PORT}`);
});
