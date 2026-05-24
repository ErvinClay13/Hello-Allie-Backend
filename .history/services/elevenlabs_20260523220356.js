// services/elevenlabs.js
// ElevenLabs TTS — premium voice for Allie.
// Falls back gracefully if no API key is set.
// Returns a base64-encoded audio string the app can play directly.

const axios = require("axios");

// Allie's ElevenLabs voice ID — "Rachel" is warm and natural.
// Change this to any voice ID from your ElevenLabs account.
const DEFAULT_VOICE_ID  = process.env.ELEVENLABS_VOICE_ID || "21m00Tcm4TlvDq8ikWAM";
const ELEVENLABS_MODEL  = "eleven_turbo_v2"; // fastest + cheapest model

async function textToSpeech(text, voiceId = DEFAULT_VOICE_ID) {
  if (!process.env.ELEVENLABS_API_KEY) return null; // Graceful fallback

  try {
    const response = await axios.post(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        text:           text.slice(0, 1000), // ElevenLabs recommends < 1000 chars per call
        model_id:       ELEVENLABS_MODEL,
        voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.4 },
      },
      {
        headers: {
          "xi-api-key":   process.env.ELEVENLABS_API_KEY,
          "Content-Type": "application/json",
          "Accept":       "audio/mpeg",
        },
        responseType: "arraybuffer",
      }
    );

    // Return base64 so the mobile app can play it with expo-av
    const base64Audio = Buffer.from(response.data).toString("base64");
    return base64Audio;
  } catch (err) {
    console.error("ElevenLabs TTS error:", err?.response?.data || err?.message);
    return null; // Fall back to device TTS on error
  }
}

module.exports = { textToSpeech };