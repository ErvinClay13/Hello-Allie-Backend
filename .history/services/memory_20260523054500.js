// services/memory.js
// Everything related to Allie "remembering" the user.
// Three layers of memory:
//   1. User profile — name, goal, personality, persistent facts
//   2. Long-term memories — things the user explicitly tells Allie to remember
//   3. Conversation summaries — auto-generated after sessions

const { db, FieldValue } = require("../config/firebaseAdmin");

// ── READ USER PROFILE ─────────────────────────────────────────────────────────
async function getUserProfile(uid) {
  try {
    const snap = await db.collection("users").doc(uid).get();
    return snap.exists ? snap.data() : null;
  } catch (err) {
    console.error("getUserProfile error:", err?.message);
    return null;
  }
}

// ── SAVE ONBOARDING DATA ──────────────────────────────────────────────────────
async function saveOnboardingProfile(uid, { displayName, goal, defaultPersonality }) {
  await db.collection("users").doc(uid).set(
    {
      displayName:        displayName || "",
      goal:               goal || "",
      defaultPersonality: defaultPersonality || "friendly",
      onboardingComplete: true,
      updatedAt:          FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

// ── LONG-TERM MEMORIES ────────────────────────────────────────────────────────
// Stored in users/{uid}/memories subcollection.
// Each memory is a short fact string: "has a dog named Max"
// Allie detects memory commands in conversation and saves them here.

async function getMemories(uid) {
  try {
    const snap = await db
      .collection("users").doc(uid)
      .collection("memories")
      .orderBy("createdAt", "desc")
      .limit(20)
      .get();
    return snap.docs.map((d) => d.data().fact).filter(Boolean);
  } catch {
    return [];
  }
}

async function saveMemory(uid, fact) {
  if (!uid || !fact?.trim()) return;
  try {
    // Check for duplicates — don't save the same fact twice
    const existing = await db
      .collection("users").doc(uid)
      .collection("memories")
      .where("fact", "==", fact.trim())
      .limit(1)
      .get();
    if (!existing.empty) return;

    await db.collection("users").doc(uid).collection("memories").add({
      fact:      fact.trim().slice(0, 300),
      createdAt: FieldValue.serverTimestamp(),
    });
  } catch (err) {
    console.error("saveMemory error:", err?.message);
  }
}

async function deleteMemory(uid, fact) {
  if (!uid || !fact?.trim()) return;
  try {
    const snap = await db
      .collection("users").doc(uid)
      .collection("memories")
      .where("fact", "==", fact.trim())
      .limit(1)
      .get();
    if (!snap.empty) await snap.docs[0].ref.delete();
  } catch (err) {
    console.error("deleteMemory error:", err?.message);
  }
}

// ── DETECT MEMORY COMMANDS ────────────────────────────────────────────────────
// Detects phrases like "remember that I...", "don't forget I...",
// "forget that I..." and returns the fact to save or delete.
function detectMemoryCommand(text) {
  const t = text.trim();

  // Forget / delete memory
  const forgetMatch = t.match(
    /^(?:forget|stop remembering|don'?t remember)\s+(?:that\s+)?(.+)/i
  );
  if (forgetMatch) return { action: "delete", fact: forgetMatch[1].trim() };

  // Save memory
  const rememberMatch = t.match(
    /^(?:remember\s+(?:that\s+)?|don'?t forget\s+(?:that\s+)?|note that\s+|save\s+(?:that\s+)?)(.+)/i
  );
  if (rememberMatch) return { action: "save", fact: rememberMatch[1].trim() };

  return null;
}

// ── BUILD MEMORY CONTEXT STRING ───────────────────────────────────────────────
// Formats all memories into a string for injection into the system prompt.
function buildMemoryContext(memories, recentSummaries) {
  const parts = [];
  if (memories.length > 0) {
    parts.push(`Things you know about this user: ${memories.map((m) => `• ${m}`).join(" ")}`);
  }
  if (recentSummaries) {
    parts.push(`Recent conversation context: ${recentSummaries}`);
  }
  return parts.join("\n");
}

// ── UPDATE LAST SEEN + STATS ──────────────────────────────────────────────────
async function touchLastSeen(uid) {
  try {
    await db.collection("users").doc(uid).update({ lastSeenAt: FieldValue.serverTimestamp() });
  } catch { /* ignore */ }
}

async function incrementMessageStats(uid) {
  try {
    await db.collection("users").doc(uid).update({
      "stats.totalMessages": FieldValue.increment(1),
      lastSeenAt:            FieldValue.serverTimestamp(),
    });
  } catch { /* ignore */ }
}

// ── CONVERSATION SUMMARIES ────────────────────────────────────────────────────
async function saveConversationSummary(chatId, summary) {
  if (!summary || !chatId) return;
  try {
    await db.collection("chats").doc(chatId).set(
      { summary, summarizedAt: FieldValue.serverTimestamp() },
      { merge: true }
    );
  } catch (err) {
    console.error("saveConversationSummary error:", err?.message);
  }
}

async function getRecentSummaries(uid, limit = 3) {
  try {
    const snap = await db
      .collection("chats")
      .where("ownerId", "==", uid)
      .where("summary", "!=", null)
      .orderBy("summary")
      .orderBy("updatedAt", "desc")
      .limit(limit)
      .get();
    return snap.docs.map((d) => d.data().summary).filter(Boolean).join(" | ");
  } catch {
    return "";
  }
}

// ── CHAT HISTORY ──────────────────────────────────────────────────────────────
async function getChatHistory(chatId, limit = 20) {
  try {
    const snap = await db
      .collection("chats").doc(chatId)
      .collection("messages")
      .orderBy("timestamp", "asc")
      .limitToLast(limit)
      .get();
    return snap.docs.map((d) => d.data());
  } catch (err) {
    console.error("getChatHistory error:", err?.message);
    return [];
  }
}

// ── WRITE ASSISTANT REPLY ─────────────────────────────────────────────────────
async function writeAssistantReply(chatId, text, uid) {
  const batch   = db.batch();
  const msgRef  = db.collection("chats").doc(chatId).collection("messages").doc();
  batch.set(msgRef, {
    role: "assistant", content: text, userId: "assistant",
    timestamp: FieldValue.serverTimestamp(),
  });
  const chatRef = db.collection("chats").doc(chatId);
  batch.update(chatRef, { lastMessage: text, updatedAt: FieldValue.serverTimestamp() });
  await batch.commit();
  if (uid) incrementMessageStats(uid).catch(() => {});
}

module.exports = {
  getUserProfile,
  saveOnboardingProfile,
  getMemories,
  saveMemory,
  deleteMemory,
  detectMemoryCommand,
  buildMemoryContext,
  touchLastSeen,
  incrementMessageStats,
  saveConversationSummary,
  getRecentSummaries,
  getChatHistory,
  writeAssistantReply,
};