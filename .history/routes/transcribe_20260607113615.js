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

const upload = multer({
  dest:   "uploads/",
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

    const language = (req.body?.language || "en").toLowerCase();

    // Rename to .mp3 so Whisper recognizes the format
    fs.renameSync(originalPath, renamedPath);

    const text = await transcribeAudio(
      fs.createReadStream(renamedPath),
      language
    );

    cleanup();
    return res.json({ text });

  } catch (err) {
    cleanup(); // Always clean up even on error
    console.error("Transcription error:", err?.message || err);
    return res.status(500).json({ error: "Failed to transcribe audio" });
  }
});

module.exports = router;