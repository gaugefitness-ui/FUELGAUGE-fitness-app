const jwt = require("jsonwebtoken");
const { User } = require("../models");

const JWT_SECRET = process.env.JWT_SECRET || "dev-only-insecure-secret-change-me";

function signToken(user) {
  return jwt.sign({ uid: user._id.toString() }, JWT_SECRET, { expiresIn: "30d" });
}

/* Requires a valid Bearer token. Attaches req.userId and req.user. */
async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: "Not logged in." });
    const payload = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(payload.uid);
    if (!user) return res.status(401).json({ error: "Account no longer exists." });

    // Auto-downgrade if a premium plan has expired
    if (user.plan === "premium" && user.planExpiresAt && user.planExpiresAt < new Date()) {
      user.plan = "basic";
      user.planExpiresAt = null;
      await user.save();
    }

    req.userId = user._id;
    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Session expired, please log in again." });
  }
}

/* Use after requireAuth. Blocks basic-plan users from premium-only features. */
function requirePremium(req, res, next) {
  if (!req.user || req.user.plan !== "premium") {
    return res.status(403).json({ error: "This feature is part of the Premium plan.", upgradeRequired: true });
  }
  next();
}

module.exports = { signToken, requireAuth, requirePremium, JWT_SECRET };
