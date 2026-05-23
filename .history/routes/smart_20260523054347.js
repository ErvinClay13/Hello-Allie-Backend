// routes/smart.js — AI brain with memory, streaming, and real-world awareness

const express         = require("express");
const router          = express.Router();
const { requireAuth } = require("../middleware/auth");

const {
  intents, extractCity, detectNBAOffset,
  getCurrentDateTimeContext,
  fetchLocalTime, fetchWeather, fetchNBAScores,
  fetchNews, fetchWikipedia, fetchWebSearch, fetchDadJoke,
} = require("../services/realworld");

const {
  buildSystemPrompt, generateReply,
  generateReplyStream, summarizeConversation,
} = require("../services/openai");

const {
  getUserProfile, getMemories, saveMemory, deleteMemory,
  detectMemoryCommand, buildMemoryContext,
  getRecentSummaries, getChatHistory,
  writeAssistantReply, saveConversationSummary,
} = require("../services/memory");

const MAX_USER_LEN = 4000;

// ── POST /api/smart ───────────────────────────────────────────────────────────
router.post("/", requireAuth, async (req, res) => {
  try {
    const uid = req.uid;
    const {
      chatId,
      message, prompt,
      conversationHistory = [],
      language    = "en",
      personality,
      mode,
      stream      = false,   // client sends stream:true to enable streaming
    } = req.body || {};

    const userText       = ((message || prompt || "").toString().trim()).slice(0, MAX_USER_LEN);
    if (!userText)  return res.status(400).json({ error: "Message cannot be empty" });
    if (!chatId)    return res.status(400).json({ error: "chatId is required" });

    const lang           = (language + "").toLowerCase();
    const personalityKey = ((personality || mode || "friendly") + "").toLowerCase();
    const dateTimeCtx    = getCurrentDateTimeContext();

    // ── Memory command detection ─────────────────────────────────────────────
    // Check if user is asking Allie to remember or forget something
    const memoryCmd = detectMemoryCommand(userText);
    if (memoryCmd) {
      if (memoryCmd.action === "save") {
        await saveMemory(uid, memoryCmd.fact);
        const reply = lang === "es"
          ? `¡Anotado! Recordaré que ${memoryCmd.fact}.`
          : `Got it! I'll remember that ${memoryCmd.fact}.`;
        await writeAssistantReply(chatId, reply, uid);
        return res.json({ result: reply, chatId });
      }
      if (memoryCmd.action === "delete") {
        await deleteMemory(uid, memoryCmd.fact);
        const reply = lang === "es"
          ? `Listo, ya no recordaré eso.`
          : `Done, I've forgotten that.`;
        await writeAssistantReply(chatId, reply, uid);
        return res.json({ result: reply, chatId });
      }
    }

    // ── Quick intent shortcuts (no GPT needed) ───────────────────────────────
    if (intents.time(userText)) {
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
        : "I'm Allie — Artificial Language Learning & Interaction Engine. I'm here whenever you need me!";
      return res.json({ result, chatId });
    }

    // ── Real-world data fetch ────────────────────────────────────────────────
    let realWorldContext = null;
    if (intents.weather(userText)) {
      const city = extractCity(userText);
      if (city) realWorldContext = await fetchWeather(city);
    }
    if (intents.nba(userText))      realWorldContext = await fetchNBAScores(detectNBAOffset(userText));
    if (intents.news(userText))     realWorldContext = await fetchNews();
    if (!realWorldContext && intents.wikipedia(userText)) realWorldContext = await fetchWikipedia(userText);
    if (!realWorldContext && intents.search(userText))    realWorldContext = await fetchWebSearch(userText);

    // ── Load all memory layers in parallel ───────────────────────────────────
    const [userProfile, memories, recentSummaries] = await Promise.all([
      getUserProfile(uid),
      getMemories(uid),
      getRecentSummaries(uid, 3),
    ]);

    const activePersonality = personalityKey || userProfile?.defaultPersonality || "friendly";
    const memoryContext     = buildMemoryContext(memories, recentSummaries);

    // ── Build system prompt ──────────────────────────────────────────────────
    const system = buildSystemPrompt({
      dateTimeContext:  dateTimeCtx,
      userProfile,
      personality:      activePersonality,
      language:         lang,
      realWorldContext: [realWorldContext, memoryContext].filter(Boolean).join("\n\n") || null,
    });

    // ── Chat history ─────────────────────────────────────────────────────────
    const historyDocs = await getChatHistory(chatId, 20);
    const messages = [
      ...historyDocs.map((m) => ({
        role:    m.role === "assistant" ? "assistant" : "user",
        content: String(m.content || ""),
      })),
      ...conversationHistory.slice(-6).map((e) => ({
        role:    e.role === "assistant" ? "assistant" : "user",
        content: String(e.content || ""),
      })),
      { role: "user", content: userText },
    ].filter((m) => m.content?.trim());

    // ── Streaming response ────────────────────────────────────────────────────
    if (stream) {
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.flushHeaders();

      let fullReply = "";
      try {
        const streamObj = await generateReplyStream({ system, messages });
        for await (const chunk of streamObj) {
          const token = chunk.choices?.[0]?.delta?.content || "";
          if (token) {
            fullReply += token;
            res.write(`data: ${JSON.stringify({ token })}\n\n`);
          }
        }
      } catch (streamErr) {
        console.error("Stream error:", streamErr?.message);
      }

      res.write(`data: ${JSON.stringify({ done: true, chatId })}\n\n`);
      res.end();

      // Save reply + auto-summarize in background
      if (fullReply) {
        writeAssistantReply(chatId, fullReply, uid).catch(() => {});
        if (historyDocs.length > 0 && historyDocs.length % 10 === 0) {
          const allMsgs = [...messages, { role: "assistant", content: fullReply }];
          summarizeConversation(allMsgs)
            .then((s) => saveConversationSummary(chatId, s))
            .catch(() => {});
        }
      }
      return;
    }

    // ── Standard (non-streaming) response ────────────────────────────────────
    const reply = await generateReply({ system, messages });
    await writeAssistantReply(chatId, reply, uid);

    if (historyDocs.length > 0 && historyDocs.length % 10 === 0) {
      const allMsgs = [...messages, { role: "assistant", content: reply }];
      summarizeConversation(allMsgs)
        .then((s) => saveConversationSummary(chatId, s))
        .catch(() => {});
    }

    return res.json({ result: reply, chatId });

  } catch (err) {
    console.error("Smart route error:", err?.message || err);
    return res.status(500).json({ error: "Smart AI failed" });
  }
});

// ── POST /api/smart/onboarding ────────────────────────────────────────────────
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

// ── GET /api/smart/memories ───────────────────────────────────────────────────
// Lets the frontend show the user what Allie remembers about them
router.get("/memories", requireAuth, async (req, res) => {
  try {
    const memories = await getMemories(req.uid);
    return res.json({ memories });
  } catch (err) {
    return res.status(500).json({ error: "Failed to fetch memories" });
  }
});

// ── DELETE /api/smart/memories ────────────────────────────────────────────────
router.delete("/memories", requireAuth, async (req, res) => {
  try {
    const { fact } = req.body || {};
    if (!fact) return res.status(400).json({ error: "fact is required" });
    await deleteMemory(req.uid, fact);
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: "Failed to delete memory" });
  }
});

module.exports = router;