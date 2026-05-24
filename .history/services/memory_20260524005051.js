// services/memory.js
const { db, FieldValue } = require("../config/firebaseAdmin");

async function getUserProfile(uid) {
  try {
    var snap = await db.collection("users").doc(uid).get();
    return snap.exists ? snap.data() : null;
  } catch (err) {
    console.error("getUserProfile error:", err && err.message);
    return null;
  }
}

async function saveOnboardingProfile(uid, data) {
  var displayName = data.displayName || "";
  var goal = data.goal || "";
  var defaultPersonality = data.defaultPersonality || "friendly";
  await db.collection("users").doc(uid).set(
    { displayName: displayName, goal: goal, defaultPersonality: defaultPersonality, onboardingComplete: true, updatedAt: FieldValue.serverTimestamp() },
    { merge: true }
  );
}

async function getMemories(uid) {
  try {
    var snap = await db.collection("users").doc(uid).collection("memories")
      .orderBy("createdAt", "desc").limit(20).get();
    return snap.docs.map(function(d) { return d.data().fact; }).filter(Boolean);
  } catch { return []; }
}

async function saveMemory(uid, fact) {
  if (!uid || !fact || !fact.trim()) return;
  try {
    var existing = await db.collection("users").doc(uid).collection("memories")
      .where("fact", "==", fact.trim()).limit(1).get();
    if (!existing.empty) return;
    await db.collection("users").doc(uid).collection("memories").add({
      fact: fact.trim().slice(0, 300), createdAt: FieldValue.serverTimestamp()
    });
  } catch (err) { console.error("saveMemory error:", err && err.message); }
}

async function deleteMemory(uid, fact) {
  if (!uid || !fact || !fact.trim()) return;
  try {
    var snap = await db.collection("users").doc(uid).collection("memories")
      .where("fact", "==", fact.trim()).limit(1).get();
    if (!snap.empty) await snap.docs[0].ref.delete();
  } catch (err) { console.error("deleteMemory error:", err && err.message); }
}

function detectMemoryCommand(text) {
  var t = text.trim();
  var forgetMatch = t.match(/^(?:forget|stop remembering|don'?t remember)\s+(?:that\s+)?(.+)/i);
  if (forgetMatch) return { action: "delete", fact: forgetMatch[1].trim() };
  var rememberMatch = t.match(/^(?:remember\s+(?:that\s+)?|don'?t forget\s+(?:that\s+)?|note that\s+|save\s+(?:that\s+)?)(.+)/i);
  if (rememberMatch) return { action: "save", fact: rememberMatch[1].trim() };
  return null;
}

function buildMemoryContext(memories, recentSummaries) {
  var parts = [];
  if (memories && memories.length > 0) {
    parts.push("Things you know about this user: " + memories.map(function(m) { return "* " + m; }).join(" "));
  }
  if (recentSummaries) {
    parts.push("Recent conversation context: " + recentSummaries);
  }
  return parts.join("\n");
}

async function analyzeCommunicationStyle(uid, messages) {
  if (!uid || !messages || messages.length < 5) return;
  try {
    var userMessages = messages
      .filter(function(m) { return m.role === "user"; })
      .map(function(m) { return m.content; })
      .join(" | ");
    if (!userMessages.trim()) return;

    var { openai } = require("./openai");
    var resp = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You analyze communication style. Respond ONLY with a JSON object, no markdown." },
        { role: "user", content: "Analyze communication style from these messages: " + userMessages + ". Return JSON with: preferredLength ('short','medium','detailed'), tone ('casual','formal','mixed'), usesSlang (boolean), energy ('high','medium','low'), topics (array of up to 5 topics), summary (one sentence on how to communicate with them)." },
      ],
      max_tokens: 200,
      temperature: 0.3,
    });
    var raw = (resp.choices && resp.choices[0] && resp.choices[0].message && resp.choices[0].message.content) || "{}";
    var cleaned = raw.replace(/```json|```/g, "").trim();
    var style = JSON.parse(cleaned);
    await db.collection("users").doc(uid).update({
      communicationStyle: Object.assign({}, style, { lastAnalyzed: new Date().toISOString() }),
    });
    console.log("Communication style updated for:", uid);
  } catch (err) {
    console.error("analyzeCommunicationStyle error:", err && err.message);
  }
}

async function getCommunicationStyleContext(uid) {
  try {
    var snap = await db.collection("users").doc(uid).get();
    if (!snap.exists) return "";
    var style = snap.data() && snap.data().communicationStyle;
    if (!style) return "";
    var parts = [];
    if (style.preferredLength === "short")    parts.push("This user prefers short, concise responses.");
    if (style.preferredLength === "detailed") parts.push("This user enjoys detailed, thorough responses.");
    if (style.tone === "casual")              parts.push("Use casual, relaxed language with them.");
    if (style.tone === "formal")              parts.push("Use professional, formal language.");
    if (style.usesSlang)                      parts.push("They use slang — match their energy.");
    if (style.energy === "high")              parts.push("They communicate with high energy — be enthusiastic.");
    if (style.energy === "low")              parts.push("They communicate calmly — keep a relaxed tone.");
    if (style.topics && style.topics.length)  parts.push("Their main interests: " + style.topics.join(", ") + ".");
    if (style.summary)                        parts.push(style.summary);
    return parts.length ? "Communication style: " + parts.join(" ") : "";
  } catch { return ""; }
}

async function getMoodContext(uid) {
  try {
    var snap = await db.collection("users").doc(uid).collection("moods")
      .orderBy("savedAt", "desc").limit(7).get();
    if (snap.empty) return "";
    var entries = snap.docs.map(function(d) { return Object.assign({ date: d.id }, d.data()); });
    var avg = entries.reduce(function(s, e) { return s + (e.score || 5); }, 0) / entries.length;
    var recent = entries.slice(0, 3).map(function(e) { return e.mood; }).join(", ");
    var trend = avg >= 7 ? "positive" : avg <= 3 ? "low" : "stable";
    return "User mood trend this week: " + trend + " (avg " + avg.toFixed(1) + "/10). Recent moods: " + recent + ".";
  } catch { return ""; }
}

async function touchLastSeen(uid) {
  try { await db.collection("users").doc(uid).update({ lastSeenAt: FieldValue.serverTimestamp() }); } catch {}
}

async function incrementMessageStats(uid) {
  try {
    await db.collection("users").doc(uid).update({
      "stats.totalMessages": FieldValue.increment(1),
      lastSeenAt: FieldValue.serverTimestamp(),
    });
  } catch {}
}

async function saveConversationSummary(chatId, summary) {
  if (!summary || !chatId) return;
  try {
    await db.collection("chats").doc(chatId).set(
      { summary: summary, summarizedAt: FieldValue.serverTimestamp() },
      { merge: true }
    );
  } catch (err) { console.error("saveConversationSummary error:", err && err.message); }
}

async function getRecentSummaries(uid, limit) {
  limit = limit || 3;
  try {
    var snap = await db.collection("chats")
      .where("ownerId", "==", uid)
      .where("summary", "!=", null)
      .orderBy("summary")
      .orderBy("updatedAt", "desc")
      .limit(limit)
      .get();
    return snap.docs.map(function(d) { return d.data().summary; }).filter(Boolean).join(" | ");
  } catch { return ""; }
}

async function getChatHistory(chatId, limit) {
  limit = limit || 20;
  try {
    var snap = await db.collection("chats").doc(chatId).collection("messages")
      .orderBy("timestamp", "asc").limitToLast(limit).get();
    return snap.docs.map(function(d) { return d.data(); });
  } catch (err) {
    console.error("getChatHistory error:", err && err.message);
    return [];
  }
}

async function writeAssistantReply(chatId, text, uid) {
  var batch   = db.batch();
  var msgRef  = db.collection("chats").doc(chatId).collection("messages").doc();
  batch.set(msgRef, { role: "assistant", content: text, userId: "assistant", timestamp: FieldValue.serverTimestamp() });
  var chatRef = db.collection("chats").doc(chatId);
  batch.update(chatRef, { lastMessage: text, updatedAt: FieldValue.serverTimestamp() });
  await batch.commit();
  if (uid) incrementMessageStats(uid).catch(function() {});
}

module.exports = {
  getUserProfile,
  saveOnboardingProfile,
  getMemories,
  saveMemory,
  deleteMemory,
  detectMemoryCommand,
  buildMemoryContext,
  analyzeCommunicationStyle,
  getCommunicationStyleContext,
  getMoodContext,
  touchLastSeen,
  incrementMessageStats,
  saveConversationSummary,
  getRecentSummaries,
  getChatHistory,
  writeAssistantReply,
};