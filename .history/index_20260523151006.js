// index.js — Allie Backend Entry Point
require("dotenv").config();
const express = require("express");
const cors = require("cors");

const smartRoute     = require("./routes/smart");
const transcribeRoute = require("./routes/transcribe");
const scheduleRoute  = require("./routes/schedule");

const app  = express();
const PORT = process.env.PORT || 5000;

// ── CORS ──────────────────────────────────────────────────────────────────────
// In production set ALLOWED_ORIGIN in your .env to your app's domain.
// During dev it accepts everything.
const allowedOrigin = process.env.ALLOWED_ORIGIN || "*";
app.use(cors(allowedOrigin === "*" ? {} : { origin: allowedOrigin }));

// ── BODY PARSING ──────────────────────────────────────────────────────────────
app.use(express.json({ limit: "2mb" }));

// ── HEALTH CHECK ─────────────────────────────────────────────────────────────
app.get("/health", (_req, res) => res.json({ status: "ok", ts: Date.now() }));

// Quick check to confirm which APIs are configured
app.get("/api/status", (_req, res) => {
  res.json({
    openai:        !!process.env.OPENAI_API_KEY,
    openweather:   !!process.env.OPENWEATHER_API_KEY,
    gnews:         !!process.env.GNEWS_API_KEY,
    tavily:        !!process.env.TAVILY_API_KEY,
    elevenlabs:    !!process.env.ELEVENLABS_API_KEY,
    rapidapi:      !!process.env.RAPIDAPI_KEY,
    ipgeolocation: !!process.env.IPGEOLOCATION_API_KEY,
    firebase:      !!process.env.FIREBASE_PROJECT_ID,
  });
});

// ── ROUTES ────────────────────────────────────────────────────────────────────
app.use("/api/smart",    smartRoute);
app.use("/api/transcribe", transcribeRoute);
app.use("/api/schedule", scheduleRoute);

// ── 404 FALLBACK ──────────────────────────────────────────────────────────────
app.use((_req, res) => res.status(404).json({ error: "Not found" }));

// ── GLOBAL ERROR HANDLER ──────────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error("Unhandled error:", err?.message || err);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(PORT, () => console.log(`✅ Allie backend running on port ${PORT}`));