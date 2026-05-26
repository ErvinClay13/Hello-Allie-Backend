// services/openai.js
const { OpenAI } = require("openai");

const openai     = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const MODEL      = process.env.OPENAI_MODEL || "gpt-4o-mini";
const MAX_TOKENS = parseInt(process.env.MAX_TOKENS || "600", 10);

// ── PERSONALITY PROMPTS ───────────────────────────────────────────────────────
const personalities = {
  friendly:     "You are warm, kind, encouraging, and always positive.",
  ghetto:       "You are extremely rude, aggressive, and have a serious attitude problem. You seem angry and irritated with every single response no matter what is asked. You use uncalled-for profanity and curse words in literally every sentence — f*ck, sh*t, damn, hell, ass — dropped naturally and aggressively throughout. You are condescending, dismissive, and act like answering questions is beneath you. You talk like you grew up in the hood and have zero patience for anyone. You still answer the question but with maximum attitude, cursing, and disrespect. Never be polite. Never be nice. Example: If someone asks the weather you say something like: \'Man what the f*ck you asking me for? Go look outside you lazy ass. Fine — it\'s 72 degrees, now leave me alone.\'",
  motivational: "You are a high-energy hype coach. Every response fires the user up to take action.",
  humorous:     "You are clever and funny. Every response has a comedic twist or unexpected punchline.",
};

// ── BUILD SYSTEM PROMPT ───────────────────────────────────────────────────────
function buildSystemPrompt({ dateTimeContext, userProfile, personality, language, realWorldContext }) {
  const tone      = personalities[personality] || personalities.friendly;
  const lang      = language === "es" ? "Respond entirely in Spanish." : "Respond in clear, natural English.";
  const name      = userProfile?.displayName ? `The user's name is ${userProfile.displayName}.` : "";
  const goal      = userProfile?.goal        ? `They primarily use you for: ${userProfile.goal}.` : "";
  const realWorld = realWorldContext
    ? `\n\nREAL-WORLD CONTEXT (use this to answer accurately):\n${realWorldContext}`
    : "";

  return [
    "You are Allie, short for Artificial Language Learning & Interaction Engine.",
    "You are a voice-first AI companion — keep responses conversational and concise (2-4 sentences max unless asked for more).",
    "Never mention that you have a knowledge cutoff. You have access to real-time information.",
    "When asked for prayers, inspirational quotes, Bible verses, or affirmations — craft something genuinely moving, heartfelt, and shareable. These should feel like they came from the soul, not a search engine.",
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
async function generateReply({ system, messages }) {
  const call = async (msgs) => {
    const cleanMsgs = msgs
      .filter((m) => m?.content && typeof m.content === "string" && m.content.trim().length > 0)
      .map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content.trim() }));

    // Higher temperature for ghetto mode — more unpredictable and wild
    const isGhetto  = system.includes("attitude problem");
    const temp      = isGhetto ? 0.95 : 0.75;

    const resp = await openai.chat.completions.create({
      model:       MODEL,
      messages:    [{ role: "system", content: system }, ...cleanMsgs],
      temperature: temp,
      max_tokens:  MAX_TOKENS,
    });
    return resp.choices?.[0]?.message?.content?.trim() || "…";
  };

  try {
    return await call(messages);
  } catch (err) {
    if (err?.status === 400 || err?.code === "context_length_exceeded") {
      console.warn("Context too long — retrying with trimmed history");
      return await call(messages.slice(-8));
    }
    throw err;
  }
}

// ── STREAMING CHAT COMPLETION ─────────────────────────────────────────────────
async function generateReplyStream({ system, messages }) {
  const cleanMsgs = messages
    .filter((m) => m?.content && typeof m.content === "string" && m.content.trim().length > 0)
    .map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content.trim() }));

  return openai.chat.completions.create({
    model:       MODEL,
    messages:    [{ role: "system", content: system }, ...cleanMsgs],
    temperature: 0.75,
    max_tokens:  MAX_TOKENS,
    stream:      true,
  });
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

module.exports = {
  openai,
  buildSystemPrompt,
  generateReply,
  generateReplyStream,
  transcribeAudio,
  summarizeConversation,
};