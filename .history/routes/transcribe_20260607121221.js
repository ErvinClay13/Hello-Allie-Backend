// routes/transcribe.js
// Handles audio file upload → Whisper transcription.
// Fixed: properly cleans up temp files even on errors.

const express  = require("express");
const router   = express.Router();
const multer   = require("multer");
const fs       = require("fs");
const path     = require("path");
const { requireAuth }    = require("../middleware/auth");
const { transcribeAudio } = require("../services/openai");

// Ensure uploads directory exists on every request (Render wipes it on cold start)
const UPLOAD_DIR = "uploads/";
if (!require("fs").existsSync(UPLOAD_DIR)) {
  require("fs").mkdirSync(UPLOAD_DIR, { recursive: true });
}

const upload = multer({
  dest:   UPLOAD_DIR,
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB — Whisper's max
});

// POST /api/transcribe
router.post("/", requireAuth, upload.single("file"), async (req, res) => {
  const originalPath = req.file?.path;
  const renamedPath  = originalPath ? `${originalPath}.mp3` : null;

  // Helper to clean up both possible temp file paths
  const cleanup = () => {
    [originalPath, renamedPath].forEach((p) => {
      if (p && fs.existsSync(p)) {
        try { fs.unlinkSync(p); } catch { /* ignore */ }
      }
    });
  };

  try {
    if (!req.file) {
      return res.status(400).json({ error: "No audio file uploaded" });
    }

    // Check file size — empty or too small means no audio was captured
    const stats = fs.statSync(originalPath);
    if (stats.size < 1000) {
      cleanup();
      return res.json({ text: "" }); // Return empty text gracefully
    }

    const language = (req.body?.language || "en").toLowerCase();

    // Rename to .mp3 so Whisper recognizes the format
    fs.renameSync(originalPath, renamedPath);

    const text = await transcribeAudio(
      fs.createReadStream(renamedPath),
      language
    );

    cleanup();
    return res.json({ text: text || "" });

  } catch (err) {
    cleanup();
    console.error("Transcription error:", err?.message || err);
    console.error("Transcription error status:", err?.status || err?.response?.status);
    console.error("Transcription error detail:", JSON.stringify(err?.error || err?.response?.data || ""));

    // Quota exceeded or billing issue
    if (err?.status === 429 || err?.message?.includes("quota") || err?.message?.includes("billing")) {
      return res.status(429).json({ error: "OpenAI quota exceeded - check your billing" });
    }
    // Return empty text instead of 500 for audio issues
    if (err?.message?.includes("audio") || err?.message?.includes("file")) {
      return res.json({ text: "" });
    }
    return res.status(500).json({ error: "Failed to transcribe audio", detail: err?.message });
  }
});

module.exports = router;clear