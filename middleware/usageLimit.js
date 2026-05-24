// middleware/usageLimit.js
// Checks daily message usage for free tier users.
// Pro users bypass this entirely.
// FREE_DAILY_LIMIT env var controls the limit (default 15).

const { db, FieldValue } = require("../config/firebaseAdmin");

const FREE_LIMIT = parseInt(process.env.FREE_DAILY_LIMIT || "15", 10);

function getTodayKey() {
  return new Date().toISOString().split("T")[0]; // YYYY-MM-DD
}

async function checkUsageLimit(req, res, next) {
  try {
    const uid = req.uid;
    if (!uid) return next();

    const userSnap = await db.collection("users").doc(uid).get();
    const userData = userSnap.data() || {};

    // Pro users bypass limit completely
    if (userData.plan === "pro") return next();

    const today    = getTodayKey();
    const usageRef = db.collection("users").doc(uid)
                       .collection("usage").doc(today);
    const usageSnap = await usageRef.get();
    const count     = usageSnap.exists ? (usageSnap.data().count || 0) : 0;

    // Attach usage info to request for response headers
    req.usageCount = count;
    req.usageLimit = FREE_LIMIT;

    if (count >= FREE_LIMIT) {
      return res.status(429).json({
        error:       "daily_limit_reached",
        message:     "You have reached your daily limit of " + FREE_LIMIT + " messages.",
        count:       count,
        limit:       FREE_LIMIT,
        resetsAt:    "midnight",
        upgradeUrl:  "https://hello-allie.app/upgrade",
      });
    }

    // Increment usage count
    await usageRef.set(
      { count: FieldValue.increment(1), date: today, updatedAt: FieldValue.serverTimestamp() },
      { merge: true }
    );

    next();
  } catch (err) {
    console.error("Usage limit check error:", err && err.message);
    next(); // Don't block on error
  }
}

async function getUsageCount(uid) {
  try {
    const today    = getTodayKey();
    const snap     = await db.collection("users").doc(uid)
                             .collection("usage").doc(today).get();
    return snap.exists ? (snap.data().count || 0) : 0;
  } catch { return 0; }
}

async function upgradeToPro(uid) {
  await db.collection("users").doc(uid).update({
    plan:          "pro",
    upgradedAt:    FieldValue.serverTimestamp(),
    "stats.plan":  "pro",
  });
}

module.exports = { checkUsageLimit, getUsageCount, upgradeToPro, FREE_LIMIT };