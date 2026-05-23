// middleware/auth.js
// Verifies the Firebase ID token sent in the Authorization header.
// Attach to any route that should require a signed-in user.
//
// Usage in a route file:
//   const { requireAuth } = require("../middleware/auth");
//   router.post("/", requireAuth, handler);
//
// The verified uid is available as req.uid inside the handler.

const { admin } = require("../config/firebaseAdmin");

async function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token  = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: "Missing auth token" });
  }

  try {
    const decoded = await admin.auth().verifyIdToken(token);
    req.uid = decoded.uid;          // available to every downstream handler
    req.email = decoded.email || "";
    next();
  } catch (err) {
    console.warn("Auth token invalid:", err?.message);
    return res.status(401).json({ error: "Invalid or expired auth token" });
  }
}

module.exports = { requireAuth };