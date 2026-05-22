// services/openai.js
// All OpenAI interactions live here — chat completions and Whisper.
// Centralizing this means you change the model in ONE place and
// every route picks it up automatically.

const { OpenAI } = require("openai");

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const MODEL      = process.env.OPENAI_MODEL || "gpt-4o-mini";
const MAX_TOKENS = parseInt(process.env.MAX_TOKENS || "600", 10);

// ── PERSONALITY PROMPTS ───────────────────────────────────────────────────────
const personalities = {
  friendly:     "You are warm, kind, encouraging, and always positive.",
  

  // sassy:        "You are sarcastic, witty, and love playful banter. You throw shade but keep it fun.",
  motivational: "You are a high-energy hype coach. Every response fires the user up to take action.",
  humorous:     "You are clever and funny. Every response has a comedic twist or unexpected punchline.",
};

// ── BUILD SYSTEM PROMPT ───────────────────────────────────────────────────────
// Called by the smart route. Injects:
//   - Allie's base identity
//   - Current date/time so she's never "frozen in time"
//   - User's name + goal (from their profile)
//   - Active personality tone
//   - Language instruction
//   - Any real-world context fetched from live APIs
function buildSystemPrompt({ dateTimeContext, userProfile, personality, language, realWorldContext }) {
  const tone   = personalities[personality] || personalities.friendly;
  const lang   = language === "es" ? "Respond entirely in Spanish." : "Respond in clear, natural English.";

  const name   = userProfile?.displayName ? `The user's name is ${userProfile.displayName}.` : "";
  const goal   = userProfile?.goal        ? `They primarily use you for: ${userProfile.goal}.` : "";

  const realWorld = realWorldContext
    ? `\n\nREAL-WORLD CONTEXT (use this to answer accurately):\n${realWorldContext}`
    : "";

  return [
    "You are Allie, short for Artificial Language Learning & Interaction Engine.",
    "You are a voice-first AI companion — keep responses conversational and concise (2-4 sentences max unless asked for more).",
    "Never mention that you have a knowledge cutoff. You have access to real-time information.",
    dateTimeContext,
    name,
    goal,
    tone,
    lang,
    realWorld,
  ]
    .filter(Boolean)
    .join(" ");
}

// ── CHAT COMPLETION ───────────────────────────────────────────────────────────
// Attempts with full context, retries with trimmed context on token errors.
async function generateReply({ system, messages }) {
  const call = async (msgs) => {
    const resp = await openai.chat.completions.create({
      model:       MODEL,
      messages:    [{ role: "system", content: system }, ...msgs],
      temperature: 0.75,
      max_tokens:  MAX_TOKENS,
    });
    return resp.choices?.[0]?.message?.content?.trim() || "…";
  };

  try {
    return await call(messages);
  } catch (err) {
    // If context too long, retry with last 8 messages only
    if (err?.status === 400 || err?.code === "context_length_exceeded") {
      console.warn("Context too long — retrying with trimmed history");
      return await call(messages.slice(-8));
    }
    throw err;
  }
}

// ── WHISPER TRANSCRIPTION ─────────────────────────────────────────────────────
async function transcribeAudio(fileStream, language = "en") {
  const transcription = await openai.audio.transcriptions.create({
    file:     fileStream,
    model:    "whisper-1",
    language: language === "es" ? "es" : "en",
  });
  return transcription.text;
}

// ── CONVERSATION SUMMARY ──────────────────────────────────────────────────────
// Called after a session to auto-generate a short summary saved to Firestore.
// This feeds into the user's memory on future sessions.
async function summarizeConversation(messages) {
  try {
    const transcript = messages
      .filter((m) => m.role !== "system")
      .map((m) => `${m.role === "user" ? "User" : "Allie"}: ${m.content}`)
      .join("\n");

    const resp = await openai.chat.completions.create({
      model:      MODEL,
      messages:   [
        {
          role:    "system",
          content: "You summarize conversations in 1-2 sentences capturing the key topics and any important facts about the user mentioned. Be brief and factual.",
        },
        {
          role:    "user",
          content: `Summarize this conversation:\n\n${transcript.slice(0, 3000)}`,
        },
      ],
      max_tokens:  120,
      temperature: 0.3,
    });
    return resp.choices?.[0]?.message?.content?.trim() || "";
  } catch {
    return "";
  }
}

module.exports = { openai, buildSystemPrompt, generateReply, transcribeAudio, summarizeConversation };