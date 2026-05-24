// services/elevenlabs.js
// Powered by OpenAI TTS using gpt-4o-mini-tts model.
// Supports all voices including newer ones: marin, coral, sage, ash, ballad, verse, cedar
// Uses existing OPENAI_API_KEY — no extra keys needed.

const axios = require("axios");

const DEFAULT_VOICE = process.env.TTS_VOICE || "marin";
const TTS_MODEL     = "gpt-4o-mini-tts"; // supports all new voices including marin

async function textToSpeech(text) {
  if (!process.env.OPENAI_API_KEY) {
    console.log("TTS: No OpenAI API key set");
    return null;
  }

  try {
    console.log("TTS: Calling OpenAI TTS, voice:", DEFAULT_VOICE, "model:", TTS_MODEL);

    const response = await axios.post(
      "https://api.openai.com/v1/audio/speech",
      {
        model: TTS_MODEL,
        input: text.slice(0, 4096),
        voice: DEFAULT_VOICE,
      },
      {
        headers: {
          "Authorization": "Bearer " + process.env.OPENAI_API_KEY,
          "Content-Type":  "application/json",
        },
        responseType: "arraybuffer",
        timeout:      15000,
      }
    );

    console.log("TTS: Success, audio bytes:", response.data.byteLength);
    return Buffer.from(response.data).toString("base64");

  } catch (err) {
    const status  = err?.response?.status;
    const errData = err?.response?.data
      ? Buffer.from(err.response.data).toString("utf8").slice(0, 200)
      : err?.message;
    console.error("TTS error - status:", status, "data:", errData);
    return null;
  }
}

module.exports = { textToSpeech };git 