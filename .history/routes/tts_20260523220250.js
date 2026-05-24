// routes/tts.js
// POST /api/tts — converts text to speech via ElevenLabs.
// Returns base64 audio if ElevenLabs key is set,
// otherwise returns { fallback: true } so app uses device TTS.

const express         = require("express");
const router          = express.Router();
const { requireAuth } = require("../middleware/auth");
const { textToSpeech } = require("../services/elevenlabs");

router.post("/", requireAuth, async (req, res) => {
  const { text, voiceId } = req.body || {};
  if (!text?.trim()) return res.status(400).json({ error: "text is required" });

  // If no ElevenLabs key configured — tell app to use device TTS
  if (!process.env.ELEVENLABS_API_KEY) {
    return res.json({ fallback: true });
  }

  try {
    const audio = await textToSpeech(text.trim(), voiceId);
    if (!audio) return res.json({ fallback: true });
    return res.json({ audio }); // base64 mp3
  } catch (err) {
    console.error("TTS route error:", err?.message);
    return res.json({ fallback: true }); // Always fall back, never crash
  }
});

module.exports = router;