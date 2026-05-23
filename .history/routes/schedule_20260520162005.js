// routes/schedule.js
// Schedule management — fully user-scoped.
// Fixed: every document now has a userId field so users
// only ever see and modify their own schedule events.

const express  = require("express");
const router   = express.Router();
const { requireAuth } = require("../middleware/auth");
const { db, FieldValue } = require("../config/firebaseAdmin");
const chrono   = require("chrono-node");

// ── Helper: get the user-scoped schedules collection ─────────────────────────
// All queries filter by userId — no user can see another's events.
const schedulesRef = () => db.collection("schedules");
const userSchedules = (uid) => schedulesRef().where("userId", "==", uid);

// ── VIEW schedule ─────────────────────────────────────────────────────────────
// POST /api/schedule/view  (or trigger via /api/schedule with view intent)
async function viewSchedule(uid, res) {
  const snap = await userSchedules(uid).orderBy("createdAt", "desc").get();
  if (snap.empty) return res.json({ message: "Your schedule is empty." });

  const list = snap.docs
    .map((d) => {
      const e = d.data();
      return `• ${e.task} — ${e.time !== "unspecified" ? e.time : ""} ${e.date !== "unspecified" ? `on ${e.date}` : ""}`.trim();
    })
    .join("\n");

  return res.json({ message: `Here are your upcoming events:\n\n${list}` });
}

// ── ADD event ─────────────────────────────────────────────────────────────────
async function addEvent(uid, prompt, res) {
  // Use chrono-node for smarter date/time parsing
  const parsed    = chrono.parse(prompt)?.[0];
  const parsedDate = parsed?.start?.date();

  const taskMatch = prompt.match(/remind me to (.+?)(?:\s+at\s+|\s+on\s+|$)/i)
    || prompt.match(/(?:add|schedule|set)\s+(.+?)(?:\s+at\s+|\s+on\s+|$)/i);

  const task = taskMatch?.[1]?.trim() || prompt.replace(/remind me to|add|schedule/gi, "").trim();
  if (!task) return res.json({ message: "I couldn't figure out what to schedule. Try saying 'Remind me to call Mom at 3pm tomorrow.'" });

  const time = parsedDate
    ? parsedDate.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
    : prompt.match(/at ([0-9]{1,2}(?::[0-9]{2})?\s?(?:am|pm)?)/i)?.[1] || "unspecified";

  const date = parsedDate
    ? parsedDate.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })
    : prompt.match(/\b(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i)?.[1] || "unspecified";

  await schedulesRef().add({
    userId:     uid,                          // ← scoped to this user
    task:       task.slice(0, 200),
    task_lower: task.toLowerCase().slice(0, 200),
    time,
    date,
    createdAt:  FieldValue.serverTimestamp(),
  });

  return res.json({ message: `Got it! I've added "${task}"${time !== "unspecified" ? ` at ${time}` : ""}${date !== "unspecified" ? ` on ${date}` : ""} to your schedule.` });
}

// ── POST /api/schedule ────────────────────────────────────────────────────────
router.post("/", requireAuth, async (req, res) => {
  const { prompt } = req.body;
  if (!prompt) return res.status(400).json({ error: "Prompt is required" });

  try {
    const isView = /what'?s? (on )?my schedule|show (my )?schedule|list (my )?schedule|what do i have/i.test(prompt);
    if (isView) return viewSchedule(req.uid, res);
    return addEvent(req.uid, prompt, res);
  } catch (err) {
    console.error("Schedule route error:", err?.message);
    return res.status(500).json({ error: "Schedule operation failed" });
  }
});

// ── POST /api/schedule/delete ────────────────────────────────────────────────
router.post("/delete", requireAuth, async (req, res) => {
  const { prompt, id } = req.body;
  const uid = req.uid;

  try {
    // Direct delete by Firestore document ID
    if (id) {
      const docRef = schedulesRef().doc(id);
      const snap   = await docRef.get();

      // Security: make sure the event belongs to this user
      if (!snap.exists || snap.data().userId !== uid) {
        return res.status(404).json({ message: "Event not found." });
      }

      await docRef.delete();
      return res.json({ message: "Event deleted." });
    }

    if (!prompt) return res.status(400).json({ error: "Prompt or id is required" });

    // Fuzzy delete by keyword — only searches THIS user's events
    const snap = await userSchedules(uid).get();
    const events = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

    const keyword = prompt
      .toLowerCase()
      .replace(/^(delete|remove)\s*/i, "")
      .trim();

    const matches = events.filter((e) => e.task_lower?.includes(keyword));

    if (matches.length === 0) {
      return res.json({ message: `I couldn't find any events matching "${keyword}".` });
    }

    if (matches.length === 1) {
      await schedulesRef().doc(matches[0].id).delete();
      return res.json({ message: `Deleted "${matches[0].task}".` });
    }

    // Multiple matches — ask user to pick
    const list = matches
      .map((e, i) => `${i + 1}. ${e.task}${e.time !== "unspecified" ? ` at ${e.time}` : ""}${e.date !== "unspecified" ? ` on ${e.date}` : ""}`)
      .join("\n");

    return res.json({
      message:  `I found ${matches.length} matches:\n\n${list}\n\nWhich one do you want to delete? Say the number.`,
      options:  matches.map((e) => ({ id: e.id, task: e.task, time: e.time, date: e.date })),
    });

  } catch (err) {
    console.error("Schedule delete error:", err?.message);
    return res.status(500).json({ error: "Delete operation failed" });
  }
});

module.exports = router;