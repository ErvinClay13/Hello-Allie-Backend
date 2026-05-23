// services/memory.js
// Handles everything related to Allie "remembering" the user.
// Reads/writes the users/{uid} document in Firestore.
// The user profile is injected into every GPT prompt so Allie
// always knows who she's talking to.

const { db, FieldValue } = require("../config/firebaseAdmin");

// ── READ USER PROFILE ─────────────────────────────────────────────────────────
// Returns the user's Firestore profile. Used to personalize every response.
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
// Called once after the user completes onboarding.
// Adds name, goal, and defaultPersonality to their profile.
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

// ── UPDATE LAST SEEN ──────────────────────────────────────────────────────────
async function touchLastSeen(uid) {
  try {
    await db.collection("users").doc(uid).update({
      lastSeenAt: FieldValue.serverTimestamp(),
    });
  } catch {
    // Silently ignore — not critical
  }
}

// ── INCREMENT MESSAGE STATS ───────────────────────────────────────────────────
async function incrementMessageStats(uid) {
  try {
    await db.collection("users").doc(uid).update({
      "stats.totalMessages": FieldValue.increment(1),
      lastSeenAt:            FieldValue.serverTimestamp(),
    });
  } catch {
    // Silently ignore
  }
}

// ── SAVE CONVERSATION SUMMARY ─────────────────────────────────────────────────
// Saves an auto-generated summary to the chat document.
// This becomes part of Allie's "memory" for future sessions.
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

// ── GET RECENT SUMMARIES ──────────────────────────────────────────────────────
// Fetches the last N chat summaries for a user to inject into the system prompt
// as long-term memory context ("I remember we talked about X last time...")
async function getRecentSummaries(uid, limit = 3) {
  try {
    const snap = await db
      .collection("chats")
      .where("ownerId", "==", uid)
      .where("summary", "!=", null)
      .orderBy("summary")           // Firestore requires ordering by inequality field
      .orderBy("updatedAt", "desc")
      .limit(limit)
      .get();

    return snap.docs
      .map((d) => d.data().summary)
      .filter(Boolean)
      .join(" | ");
  } catch {
    return ""; // Non-critical, don't break the request
  }
}

// ── FETCH CHAT HISTORY ────────────────────────────────────────────────────────
// Gets the last N messages from a chat for GPT context.
// Matches existing Firestore structure: chats/{chatId}/messages
async function getChatHistory(chatId, limit = 20) {
  try {
    const snap = await db
      .collection("chats")
      .doc(chatId)
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
// Saves Allie's reply to Firestore and updates the chat header.
async function writeAssistantReply(chatId, text, uid) {
  const batch = db.batch();

  const msgRef = db.collection("chats").doc(chatId).collection("messages").doc();
  batch.set(msgRef, {
    role:      "assistant",
    content:   text,
    userId:    "assistant",
    timestamp: FieldValue.serverTimestamp(),
  });

  const chatRef = db.collection("chats").doc(chatId);
  batch.update(chatRef, {
    lastMessage: text,
    updatedAt:   FieldValue.serverTimestamp(),
  });

  await batch.commit();

  // Non-blocking stats update
  if (uid) incrementMessageStats(uid).catch(() => {});
}

module.exports = {
  getUserProfile,
  saveOnboardingProfile,
  touchLastSeen,
  incrementMessageStats,
  saveConversationSummary,
  getRecentSummaries,
  getChatHistory,
  writeAssistantReply,
};