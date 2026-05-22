// routes/smart.js
// The main AI brain. Handles all chat requests from the app.
// Flow:
//   1. Verify auth token
//   2. Detect intent (weather? NBA? news? general?)
//   3. Fetch live data if needed
//   4. Load user profile + chat history from Firestore
//   5. Build system prompt with all context injected
//   6. Call GPT and return reply
//   7. Save reply to Firestore

const express   = require("express");
const router    = express.Router();
const { requireAuth } = require("../middleware/auth");

const {
  intents, extractCity, detectNBAOffset,
  getCurrentDateTimeContext,
  fetchLocalTime, fetchWeather, fetchNBAScores,
  fetchNews, fetchWikipedia, fetchWebSearch, fetchDadJoke,
} = require("../services/realworld");

const { buildSystemPrompt, generateReply, summarizeConversation } = require("../services/openai");

const {
  getUserProfile,
  getRecentSummaries,
  getChatHistory,
  writeAssistantReply,
  saveConversationSummary,
} = require("../services/memory");

const MAX_USER_LEN = 4000;

// POST /api/smart
router.post("/", requireAuth, async (req, res) => {
  try {
    const uid = req.uid;

    // ── Parse body ──────────────────────────────────────────────────────────
    const {
      chatId,
      message,
      prompt,                        // legacy field name support
      conversationHistory = [],      // legacy in-memory history support
      language    = "en",
      personality,
      mode,                          // legacy field name support
    } = req.body || {};

    const userText = ((message || prompt || "").toString().trim()).slice(0, MAX_USER_LEN);
    if (!userText) return res.status(400).json({ error: "Message cannot be empty" });
    if (!chatId)   return res.status(400).json({ error: "chatId is required" });

    const lang            = language.toLowerCase();
    const personalityKey  = ((personality || mode || "friendly") + "").toLowerCase();

    // ── Always-on date/time context ─────────────────────────────────────────
    const dateTimeContext = getCurrentDateTimeContext();

    // ── Intent detection + live data fetch ──────────────────────────────────
    let realWorldContext = null;

    if (intents.time(userText)) {
      // Return immediately — no GPT needed
      const result = await fetchLocalTime();
      return res.json({ result, chatId });
    }

    if (intents.joke(userText)) {
      const result = await fetchDadJoke();
      return res.json({ result, chatId });
    }

    if (intents.name(userText)) {
      const result = lang === "es"
        ? "Me llamo Allie — Artificial Language Learning & Interaction Engine. ¡Estoy aquí para ayudarte!"
        : "I'm Allie — Artificial Language Learning & Interaction Engine. I'm here to help with whatever you need!";
      return res.json({ result, chatId });
    }

    if (intents.weather(userText)) {
      const city = extractCity(userText);
      if (city) realWorldContext = await fetchWeather(city);
    }

    if (intents.nba(userText)) {
      const offset = detectNBAOffset(userText);
      realWorldContext = await fetchNBAScores(offset);
    }

    if (intents.news(userText)) {
      realWorldContext = await fetchNews();
    }

    // Wikipedia for factual "who is / what is" questions
    if (!realWorldContext && intents.wikipedia(userText)) {
      realWorldContext = await fetchWikipedia(userText);
    }

    // Web search fallback for anything current/recent
    if (!realWorldContext && intents.search(userText)) {
      realWorldContext = await fetchWebSearch(userText);
    }

    // ── Load user profile + memory ──────────────────────────────────────────
    const [userProfile, recentSummaries] = await Promise.all([
      getUserProfile(uid),
      getRecentSummaries(uid, 3),
    ]);

    // Use the user's saved default personality if none sent
    const activePersonality = personalityKey || userProfile?.defaultPersonality || "friendly";

    // Inject recent conversation summaries as long-term memory
    const memoryContext = recentSummaries
      ? `From previous conversations: ${recentSummaries}`
      : null;

    // ── Build system prompt ─────────────────────────────────────────────────
    const system = buildSystemPrompt({
      dateTimeContext,
      userProfile,
      personality: activePersonality,
      language:    lang,
      realWorldContext: [realWorldContext, memoryContext].filter(Boolean).join("\n\n") || null,
    });

    // ── Load chat history from Firestore ────────────────────────────────────
    const historyDocs = await getChatHistory(chatId, 20);
    const historyMsgs = historyDocs.map((m) => ({
      role:    m.role === "assistant" ? "assistant" : "user",
      content: String(m.content || ""),
    }));

    // Merge Firestore history + any legacy in-memory history sent from app
    const legacyMsgs = conversationHistory.map((e) => ({
      role:    e.role === "assistant" ? "assistant" : "user",
      content: String(e.content || ""),
    }));

    const messages = [
      ...historyMsgs,
      ...legacyMsgs,
      { role: "user", content: userText },
    ];

    // ── Generate reply ──────────────────────────────────────────────────────
    const reply = await generateReply({ system, messages });

    // ── Persist to Firestore ────────────────────────────────────────────────
    await writeAssistantReply(chatId, reply, uid);

    // ── Auto-summarize every 10 messages (background, non-blocking) ─────────
    if (historyDocs.length > 0 && historyDocs.length % 10 === 0) {
      const allMsgs = [...messages, { role: "assistant", content: reply }];
      summarizeConversation(allMsgs)
        .then((summary) => saveConversationSummary(chatId, summary))
        .catch(() => {});
    }

    return res.json({ result: reply, chatId });

  } catch (err) {
    console.error("Smart route error:", err?.message || err);
    return res.status(500).json({ error: "Something went wrong. Please try again." });
  }
});

// POST /api/smart/onboarding
// Saves the user's onboarding answers to their Firestore profile.
router.post("/onboarding", requireAuth, async (req, res) => {
  try {
    const { saveOnboardingProfile } = require("../services/memory");
    const { displayName, goal, defaultPersonality } = req.body || {};

    if (!displayName) return res.status(400).json({ error: "Name is required" });

    await saveOnboardingProfile(req.uid, { displayName, goal, defaultPersonality });
    return res.json({ success: true });
  } catch (err) {
    console.error("Onboarding save error:", err?.message);
    return res.status(500).json({ error: "Failed to save profile" });
  }
});

module.exports = router;