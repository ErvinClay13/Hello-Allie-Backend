// services/elevenlabs.js
const axios = require("axios");

const DEFAULT_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || "21m00Tcm4TlvDq8ikWAM";

// Updated model name — eleven_turbo_v2 was renamed to eleven_turbo_v2_5
// eleven_flash_v2_5 is the fastest and cheapest option
const ELEVENLABS_MODEL = "eleven_flash_v2_5";

async function textToSpeech(text, voiceId) {
  voiceId = voiceId || DEFAULT_VOICE_ID;

  if (!process.env.ELEVENLABS_API_KEY) {
    console.log("ElevenLabs: No API key set");
    return null;
  }

  try {
    console.log("ElevenLabs: Calling TTS, voiceId:", voiceId, "model:", ELEVENLABS_MODEL);

    const response = await axios.post(
      "https://api.elevenlabs.io/v1/text-to-speech/" + voiceId,
      {
        text:           text.slice(0, 1000),
        model_id:       ELEVENLABS_MODEL,
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      },
      {
        headers: {
          "xi-api-key":   process.env.ELEVENLABS_API_KEY,
          "Content-Type": "application/json",
          "Accept":       "audio/mpeg",
        },
        responseType: "arraybuffer",
        timeout:      15000,
      }
    );

    console.log("ElevenLabs: Success, audio bytes:", response.data.byteLength);
    const base64Audio = Buffer.from(response.data).toString("base64");
    return base64Audio;

  } catch (err) {
    const status  = err?.response?.status;
    const errData = err?.response?.data
      ? Buffer.from(err.response.data).toString("utf8").slice(0, 200)
      : err?.message;
    console.error("ElevenLabs TTS error - status:", status, "data:", errData);
    return null;
  }
}

module.exports = { textToSpeech };