const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const nodemailer = require("nodemailer");
const { OAuth2Client } = require("google-auth-library");
const foods = require("../data/foods");
const { User, Profile, FoodLogEntry, WeightEntry, WorkoutCompletion, WorkoutPlan, WaterLog, Measurement, WorkoutLog, PersonalRecord } = require("../models");
const { signToken, requireAuth, requirePremium } = require("../middleware/auth");

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID || "", process.env.GOOGLE_CLIENT_SECRET || "");

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER || "",
    pass: process.env.EMAIL_PASS || "",
  },
});

let twilioClient = null;
const VERIFY_SERVICE_SID = "VA7a0d7a48dddeb0c9b65657cd174e4f0f";
if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
  const twilio = require("twilio");
  twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
}

function generateCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

async function sendSMSOTP(phone, code) {
  if (!twilioClient) {
    console.log("Twilio not configured. OTP:", code);
    return { ok: false, skipped: true, code };
  }
  try {
    console.log(`Sending SMS OTP to: ${phone}`);
    const result = await Promise.race([
      twilioClient.verify.v2.services(VERIFY_SERVICE_SID).verifications.create({
        to: phone,
        channel: "sms",
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error("Twilio timeout")), 10000)),
    ]);
    return { ok: true };
  } catch (err) {
    console.error("Twilio SMS error:", err.message);
    console.error("Phone:", phone);
    return { ok: false, error: err.message, code };
  }
}

async function verifySMSOTP(phone, code) {
  if (!twilioClient) {
    return { ok: false, skipped: true };
  }
  try {
    const check = await Promise.race([
      twilioClient.verify.v2.services(VERIFY_SERVICE_SID).verificationChecks.create({
        to: phone,
        code: code,
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error("Twilio timeout")), 10000)),
    ]);
    return { ok: check.status === "approved" };
  } catch (err) {
    console.error("Twilio verify error:", err.message);
    return { ok: false, error: err.message };
  }
}

function computeTarget({ age, sex, height, weight, activity, goal }) {
  const bmr = sex === "male"
    ? 10 * weight + 6.25 * height - 5 * age + 5
    : 10 * weight + 6.25 * height - 5 * age - 161;
  const tdee = bmr * activity;
  const cal = Math.round(tdee + goal);
  const protein = Math.round(weight * 1.8);
  const fat = Math.round((cal * 0.25) / 9);
  const carb = Math.round((cal - protein * 4 - fat * 9) / 4);
  return { cal, protein, carb, fat };
}

/* ---------- Auth: Register ---------- */
router.post("/auth/register", async (req, res) => {
  try {
    const { email, password, name, phone } = req.body;
    if (!email || !password) return res.status(400).json({ error: "Email and password required" });
    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) return res.status(409).json({ error: "Email already registered" });
    const hash = await bcrypt.hash(password, 10);
    const code = generateCode();
    const userCount = await User.countDocuments();
    const user = await User.create({
      email: email.toLowerCase(),
      password: hash,
      name: name || "",
      phone: phone || "",
      verified: false,
      verifyCode: code,
      verifyExpires: new Date(Date.now() + 15 * 60 * 1000),
      admin: false,
    });
    let emailSent = false;
    if (process.env.EMAIL_USER) {
      transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: email,
        subject: "FUELGAUGE - Verify your email",
        html: `<div style="font-family:sans-serif;text-align:center;padding:30px;">
          <h2 style="color:#ff3c1f;">FUELGAUGE</h2>
          <p>Your verification code is:</p>
          <div style="font-size:36px;font-weight:bold;letter-spacing:8px;color:#0d0f14;background:#00e5a0;padding:16px 24px;border-radius:12px;display:inline-block;">${code}</div>
          <p style="color:#666;margin-top:20px;">Code expires in 15 minutes.</p>
        </div>`,
      }).then(() => { emailSent = true; console.log("Verification email sent to:", email); })
        .catch(err => console.error("Email send failed:", err.message));
    }
    if (phone) {
      sendSMSOTP(phone, code).then(waResult => {
        if (waResult.skipped) console.log("SMS not configured. OTP:", code);
      }).catch(err => console.error("SMS OTP failed:", err.message));
    }
    const response = { ok: true, userId: user._id };
    if (emailSent) {
      response.message = "Verification code sent to your email";
    } else if (process.env.EMAIL_USER) {
      response.message = "Account created but email could not be sent. Please use Resend code.";
      response.emailWarning = true;
    } else {
      response.message = "Account created. Email verification is not configured.";
      response.emailWarning = true;
    }
    res.json(response);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ---------- Auth: Verify email ---------- */
router.post("/auth/verify", async (req, res) => {
  try {
    const { email, code } = req.body;
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) return res.status(404).json({ error: "User not found" });
    if (user.verified) return res.json({ ok: true, message: "Already verified" });
    if (user.verifyCode !== code) return res.status(400).json({ error: "Invalid code" });
    if (user.verifyExpires < new Date()) return res.status(400).json({ error: "Code expired" });
    user.verified = true;
    user.verifyCode = undefined;
    user.verifyExpires = undefined;
    await user.save();
    res.json({ ok: true, message: "Email verified" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ---------- Auth: Resend code ---------- */
router.post("/auth/resend", async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) return res.status(404).json({ error: "User not found" });
    if (user.verified) return res.json({ ok: true, message: "Already verified" });
    const code = generateCode();
    user.verifyCode = code;
    user.verifyExpires = new Date(Date.now() + 15 * 60 * 1000);
    await user.save();
    let emailSent = false;
    if (process.env.EMAIL_USER) {
      transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: email,
        subject: "FUELGAUGE - Your verification code",
        html: `<div style="font-family:sans-serif;text-align:center;padding:30px;">
          <h2 style="color:#ff3c1f;">FUELGAUGE</h2>
          <p>Your new verification code is:</p>
          <div style="font-size:36px;font-weight:bold;letter-spacing:8px;color:#0d0f14;background:#00e5a0;padding:16px 24px;border-radius:12px;display:inline-block;">${code}</div>
          <p style="color:#666;margin-top:20px;">Code expires in 15 minutes.</p>
        </div>`,
      }).then(() => { emailSent = true; console.log("Verification email resent to:", email); })
        .catch(err => console.error("Email resend failed:", err.message));
    }
    if (user.phone) {
      sendSMSOTP(user.phone, code).then(waResult => {
        if (waResult.skipped) console.log("SMS not configured. OTP:", code);
      }).catch(err => console.error("SMS OTP resend failed:", err.message));
    }
    const response = { ok: true };
    if (emailSent) {
      response.message = "New code sent to your email";
    } else {
      response.message = "Code regenerated but email could not be sent.";
      response.emailWarning = true;
    }
    res.json(response);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ---------- Auth: Login ---------- */
router.post("/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: "Email and password required" });
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) return res.status(401).json({ error: "Invalid email or password" });
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ error: "Invalid email or password" });
    if (!user.verified) {
      return res.status(403).json({ error: "Email not verified. Please check your inbox for the verification code.", needsVerification: true });
    }
    const token = signToken(user);
    res.json({ ok: true, token, email: user.email, name: user.name, avatar: user.avatar, admin: user.admin });
  } catch (err) {
    console.error("Login error:", err.message, err.stack);
    res.status(500).json({ error: err.message || "Login failed" });
  }
});

/* ---------- Auth: Google Sign-In ---------- */
router.post("/auth/google", async (req, res) => {
  try {
    const { credential } = req.body;
    if (!credential) return res.status(400).json({ error: "Google credential required" });

    // Verify the Google ID token
    let payload;
    try {
      const ticket = await googleClient.verifyIdToken({
        idToken: credential,
        audience: process.env.GOOGLE_CLIENT_ID,
      });
      payload = ticket.getPayload();
    } catch (err) {
      return res.status(401).json({ error: "Invalid Google token" });
    }

    const { sub: googleId, email, name, picture } = payload;

    // Find or create user
    let user = await User.findOne({ email: email.toLowerCase() });
    if (user) {
      // Link Google account if not already linked
      if (!user.googleId) {
        user.googleId = googleId;
        if (picture && !user.avatar) user.avatar = picture;
        await user.save();
      }
    } else {
      // Create new user from Google data
      user = await User.create({
        email: email.toLowerCase(),
        password: await bcrypt.hash("google_" + googleId, 10),
        name: name || "",
        avatar: picture || "",
        verified: true,
        googleId: googleId,
        admin: false,
      });
    }

    const token = signToken(user);
    res.json({
      ok: true,
      token,
      email: user.email,
      name: user.name,
      avatar: user.avatar,
      admin: user.admin,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ---------- Auth: Google Start (server-rendered page for phone browser) ---------- */
router.get("/auth/google/start", (req, res) => {
  const clientId = process.env.GOOGLE_CLIENT_ID || "";
  const host = req.get("host");
  const redirectUri = `https://${host}/api/auth/google/callback`;
  const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=openid+email+profile&access_type=offline`;
  res.redirect(googleAuthUrl);
});

/* ---------- Auth: Google OAuth Callback ---------- */
router.get("/auth/google/callback", async (req, res) => {
  try {
    const { code } = req.query;
    if (!code) {
      return res.send("<p>No code received.</p>");
    }

    // Exchange auth code for tokens — force HTTPS for Render proxy
    const host = req.get("host");
    const redirectUri = `https://${host}/api/auth/google/callback`;
    const { tokens } = await googleClient.getToken({
      code,
      redirect_uri: redirectUri,
    });

    const ticket = await googleClient.verifyIdToken({
      idToken: tokens.id_token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    const { sub: googleId, email, name, picture } = payload;

    // Find or create user
    let user = await User.findOne({ email: email.toLowerCase() });
    if (user) {
      if (!user.googleId) {
        user.googleId = googleId;
        if (picture && !user.avatar) user.avatar = picture;
        await user.save();
      }
    } else {
      user = await User.create({
        email: email.toLowerCase(),
        password: await bcrypt.hash("google_" + googleId, 10),
        name: name || "",
        avatar: picture || "",
        verified: true,
        googleId: googleId,
        admin: false,
      });
    }

    // Return token via HTML that the frontend can read
    const token = signToken(user);
    const userData = { ok: true, token, email: user.email, name: user.name, avatar: user.avatar, admin: user.admin };
    const data = encodeURIComponent(JSON.stringify(userData));
    res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Signing in...</title></head><body>
<script>
var d = JSON.parse(decodeURIComponent('${data}'));
localStorage.setItem('fg_token', d.token);
localStorage.setItem('fg_user', JSON.stringify({email:d.email,name:d.name,avatar:d.avatar,admin:d.admin}));
window.location.href = '/';
</script>
<p>Signing in... <a href="/">Tap here if nothing happens</a></p>
</body></html>`);
  } catch (err) {
    console.error("Google callback error:", err.message);
    res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Error</title></head><body>
<p>Sign-in failed: ${err.message}. <a href="/login.html">Back to login</a></p>
</body></html>`);
  }
});

/* ---------- Food database search ---------- */
router.get("/foods", (req, res) => {
  try {
    const q = (req.query.q || "").toLowerCase().trim();
    const cat = (req.query.cat || "").trim();
    let results = foods;
    if (q) {
      results = foods.filter(f => f.name.toLowerCase().includes(q) || f.category.toLowerCase().includes(q));
    }
    if (cat) {
      results = results.filter(f => f.category === cat);
    }
    res.json(results);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ---------- Profile (JWT protected) ---------- */
router.get("/profile", requireAuth, async (req, res) => {
  try {
    const profile = await Profile.findOne({ userId: req.userId.toString() });
    res.json(profile || null);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post("/profile", requireAuth, async (req, res) => {
  try {
    const { age, sex, height, weight, activity, goal } = req.body;
    const target = computeTarget({ age, sex, height, weight, activity, goal });
    const profile = await Profile.findOneAndUpdate(
      { userId: req.userId.toString() },
      { userId: req.userId.toString(), age, sex, height, weight, activity, goal, target },
      { upsert: true, new: true }
    );
    res.json(profile);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ---------- Food log (JWT protected) ---------- */
router.get("/foodlog", requireAuth, async (req, res) => {
  try {
    const { date } = req.query;
    const entries = await FoodLogEntry.find({ userId: req.userId.toString(), date }).sort({ createdAt: 1 });
    res.json(entries);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post("/foodlog", requireAuth, async (req, res) => {
  try {
    const { date, name, grams, cal, protein, carb, fat } = req.body;
    if (!date || !name) return res.status(400).json({ error: "Date and name required" });
    const entry = await FoodLogEntry.create({ userId: req.userId.toString(), date, name, grams, cal, protein, carb, fat });
    res.json(entry);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete("/foodlog/:id", requireAuth, async (req, res) => {
  try {
    await FoodLogEntry.deleteOne({ _id: req.params.id, userId: req.userId.toString() });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ---------- Weight log (JWT protected) ---------- */
router.get("/weight", requireAuth, async (req, res) => {
  try {
    const entries = await WeightEntry.find({ userId: req.userId.toString() }).sort({ date: 1 });
    res.json(entries);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post("/weight", requireAuth, async (req, res) => {
  try {
    const { date, weight } = req.body;
    if (!date || !weight) return res.status(400).json({ error: "Date and weight required" });
    const entry = await WeightEntry.findOneAndUpdate(
      { userId: req.userId.toString(), date },
      { userId: req.userId.toString(), date, weight },
      { upsert: true, new: true }
    );
    res.json(entry);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ---------- Water tracking (JWT protected) ---------- */
router.get("/water", requireAuth, async (req, res) => {
  try {
    const { date } = req.query;
    if (!date) return res.status(400).json({ error: "Date required" });
    const log = await WaterLog.findOne({ userId: req.userId.toString(), date });
    res.json(log || { glasses: 0, date });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post("/water", requireAuth, async (req, res) => {
  try {
    const { date, glasses } = req.body;
    if (!date) return res.status(400).json({ error: "Date required" });
    const log = await WaterLog.findOneAndUpdate(
      { userId: req.userId.toString(), date },
      { userId: req.userId.toString(), date, glasses },
      { upsert: true, new: true }
    );
    res.json(log);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post("/water/increment", requireAuth, async (req, res) => {
  try {
    const { date } = req.body;
    if (!date) return res.status(400).json({ error: "Date required" });
    const log = await WaterLog.findOneAndUpdate(
      { userId: req.userId.toString(), date },
      { $inc: { glasses: 1 }, $setOnInsert: { userId: req.userId.toString(), date } },
      { upsert: true, new: true }
    );
    res.json(log);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ---------- Body measurements (JWT protected) ---------- */
router.get("/measurements", requireAuth, async (req, res) => {
  try {
    const entries = await Measurement.find({ userId: req.userId.toString() }).sort({ date: 1 });
    res.json(entries);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post("/measurements", requireAuth, async (req, res) => {
  try {
    const { date, chest, waist, hips, biceps, thighs, calves } = req.body;
    if (!date) return res.status(400).json({ error: "Date required" });
    const entry = await Measurement.findOneAndUpdate(
      { userId: req.userId.toString(), date },
      { userId: req.userId.toString(), date, chest, waist, hips, biceps, thighs, calves },
      { upsert: true, new: true }
    );
    res.json(entry);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ---------- Workout plan + completion (JWT protected) ---------- */
router.get("/workouts", requireAuth, async (req, res) => {
  try {
    const plan = await WorkoutPlan.findOne({ userId: req.userId.toString() });
    const completion = await WorkoutCompletion.find({ userId: req.userId.toString(), done: true });
    res.json({
      activePlan: plan ? plan.activePlan : "push-pull-legs",
      completion: completion.map(c => c.key),
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post("/workouts/plan", requireAuth, async (req, res) => {
  try {
    const { activePlan } = req.body;
    const plan = await WorkoutPlan.findOneAndUpdate(
      { userId: req.userId.toString() },
      { userId: req.userId.toString(), activePlan },
      { upsert: true, new: true }
    );
    res.json(plan);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post("/workouts/toggle", requireAuth, async (req, res) => {
  try {
    const { key } = req.body;
    if (!key) return res.status(400).json({ error: "Key required" });
    const existing = await WorkoutCompletion.findOne({ userId: req.userId.toString(), key });
    if (existing) {
      await WorkoutCompletion.deleteOne({ _id: existing._id });
      return res.json({ key, done: false });
    }
    await WorkoutCompletion.create({ userId: req.userId.toString(), key, done: true });
    res.json({ key, done: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ---------- Workout log: track sets/reps/weight (JWT protected) ---------- */
router.get("/workout-log", requireAuth, async (req, res) => {
  try {
    const { date } = req.query;
    const filter = { userId: req.userId.toString() };
    if (date) filter.date = date;
    const logs = await WorkoutLog.find(filter).sort({ createdAt: 1 }).limit(100);
    res.json(logs);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post("/workout-log", requireAuth, async (req, res) => {
  try {
    const { date, planKey, dayIndex, exerciseIndex, exerciseName, sets, reps, weight, duration, completed } = req.body;
    if (!date || !exerciseName) return res.status(400).json({ error: "Date and exercise name required" });
    const log = await WorkoutLog.create({
      userId: req.userId.toString(), date, planKey, dayIndex, exerciseIndex,
      exerciseName, sets, reps, weight, duration, completed,
    });
    res.json(log);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ---------- Personal records (JWT protected) ---------- */
router.get("/records", requireAuth, async (req, res) => {
  try {
    const records = await PersonalRecord.find({ userId: req.userId.toString() }).sort({ date: -1 });
    res.json(records);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post("/records", requireAuth, async (req, res) => {
  try {
    const { exerciseName, weight, reps, date } = req.body;
    if (!exerciseName || !date) return res.status(400).json({ error: "Exercise name and date required" });
    const record = await PersonalRecord.create({
      userId: req.userId.toString(), exerciseName, weight, reps, date,
    });
    res.json(record);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ---------- User profile (JWT protected) ---------- */
router.get("/user", requireAuth, async (req, res) => {
  try {
    const user = req.user;
    res.json({
      email: user.email, name: user.name, phone: user.phone, avatar: user.avatar,
      premium: user.premium, premiumPlan: user.premiumPlan, premiumExpires: user.premiumExpires,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post("/user/update", requireAuth, async (req, res) => {
  try {
    const { name, phone } = req.body;
    const user = req.user;
    if (name !== undefined) user.name = name;
    if (phone !== undefined) user.phone = phone;
    await user.save();
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ---------- Premium subscription ---------- */
const PREMIUM_PLANS = {
  basic:    { label: "Basic",    price: 2000, days: 30, features: ["Exercise plans", "Workout tracking", "Progress charts"] },
  premium:  { label: "Premium",  price: 5000, days: 30, features: ["Everything in Basic", "Detailed diet plans", "Training schedules", "Personalized macros", "Priority support"] },
};

router.get("/premium/plans", (req, res) => {
  res.json(PREMIUM_PLANS);
});

router.get("/premium/status", requireAuth, async (req, res) => {
  try {
    const user = req.user;
    const active = user.premium && user.premiumExpires && user.premiumExpires > new Date();
    res.json({ premium: active, plan: user.premiumPlan, expires: user.premiumExpires });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post("/premium/activate", requireAuth, async (req, res) => {
  try {
    const { planType } = req.body;
    if (!planType || !PREMIUM_PLANS[planType]) return res.status(400).json({ error: "Invalid plan" });
    const plan = PREMIUM_PLANS[planType];
    const user = req.user;
    const startFrom = (user.premium && user.premiumExpires > new Date()) ? user.premiumExpires : new Date();
    user.premium = true;
    user.premiumPlan = planType;
    user.premiumExpires = new Date(startFrom.getTime() + plan.days * 24 * 60 * 60 * 1000);
    user.plan = planType;
    user.planExpiresAt = user.premiumExpires;
    await user.save();
    res.json({ ok: true, premium: true, plan: planType, expires: user.premiumExpires });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ---------- WhatsApp OTP send ---------- */
router.post("/whatsapp/send-otp", async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ error: "Phone number required" });
    const code = generateCode();
    let user = await User.findOne({ phone });
    if (user) {
      user.verifyCode = code;
      user.verifyExpires = new Date(Date.now() + 15 * 60 * 1000);
      await user.save();
    } else {
      const email = phone.replace(/\D/g, "") + "@wa.fuelgauge.app";
      const hash = await bcrypt.hash("wa_" + Date.now(), 10);
      const userCount = await User.countDocuments();
      user = await User.create({
        email,
        password: hash,
        phone,
        verifyCode: code,
        verifyExpires: new Date(Date.now() + 15 * 60 * 1000),
        admin: false,
      });
    }
    sendSMSOTP(phone, code).then(result => {
      if (result.skipped) console.log("SMS not configured. OTP:", code);
    }).catch(err => console.error("SMS OTP failed:", err.message));
    res.json({ ok: true, message: "OTP sent via SMS" });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ---------- Phone OTP verify ---------- */
router.post("/whatsapp/verify", async (req, res) => {
  try {
    const { phone, code } = req.body;
    if (!phone || !code) return res.status(400).json({ error: "Phone and code required" });
    const smsCheck = await verifySMSOTP(phone, code);
    if (!smsCheck.ok && !smsCheck.skipped) {
      return res.status(400).json({ error: "Invalid or expired code" });
    }
    const user = await User.findOne({ phone });
    if (!user) return res.status(404).json({ error: "User not found" });
    if (user.verified) return res.json({ ok: true, email: user.email, admin: user.admin });
    user.verified = true;
    user.verifyCode = undefined;
    user.verifyExpires = undefined;
    await user.save();
    res.json({ ok: true, email: user.email, admin: user.admin });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ---------- Admin: Check admin status ---------- */
router.get("/admin/check", requireAuth, async (req, res) => {
  try {
    res.json({ admin: req.user ? req.user.admin : false });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ---------- Admin: List all users ---------- */
router.get("/admin/users", requireAuth, async (req, res) => {
  try {
    if (!req.user || !req.user.admin) return res.status(403).json({ error: "Admin access required" });
    const users = await User.find({}, { password: 0, verifyCode: 0, verifyExpires: 0 }).sort({ createdAt: -1 });
    res.json(users);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ---------- Admin: Grant/revoke premium ---------- */
router.post("/admin/grant-premium", requireAuth, async (req, res) => {
  try {
    if (!req.user || !req.user.admin) return res.status(403).json({ error: "Admin access required" });
    const { email, planType } = req.body;
    const target = await User.findOne({ email: email.toLowerCase() });
    if (!target) return res.status(404).json({ error: "User not found" });
    if (!planType || !PREMIUM_PLANS[planType]) return res.status(400).json({ error: "Invalid plan type" });
    const plan = PREMIUM_PLANS[planType];
    const startFrom = (target.premium && target.premiumExpires && target.premiumExpires > new Date()) ? target.premiumExpires : new Date();
    target.premium = true;
    target.premiumPlan = planType;
    target.premiumExpires = new Date(startFrom.getTime() + plan.days * 24 * 60 * 60 * 1000);
    target.plan = planType;
    target.planExpiresAt = target.premiumExpires;
    await target.save();
    res.json({ ok: true, message: `Premium (${planType}) granted to ${email}` });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ---------- Admin: Set user plan ---------- */
router.post("/admin/set-plan", requireAuth, async (req, res) => {
  try {
    if (!req.user || !req.user.admin) return res.status(403).json({ error: "Admin access required" });
    const { email, planType } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ error: "User not found" });
    if (planType) {
      user.premium = true;
      user.premiumPlan = planType;
      user.premiumExpires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      user.plan = planType;
      user.planExpiresAt = user.premiumExpires;
    } else {
      user.premium = false;
      user.premiumPlan = "";
      user.premiumExpires = null;
      user.plan = "basic";
      user.planExpiresAt = null;
    }
    await user.save();
    res.json({ ok: true, plan: user.premiumPlan });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ---------- Admin: Revoke premium ---------- */
router.post("/admin/revoke-premium", requireAuth, async (req, res) => {
  try {
    if (!req.user || !req.user.admin) return res.status(403).json({ error: "Admin access required" });
    const { email } = req.body;
    const target = await User.findOne({ email: email.toLowerCase() });
    if (!target) return res.status(404).json({ error: "User not found" });
    target.premium = false;
    target.premiumPlan = "";
    target.premiumExpires = null;
    target.plan = "basic";
    target.planExpiresAt = null;
    await target.save();
    res.json({ ok: true, message: `Premium revoked from ${email}` });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ---------- Admin: Make user admin ---------- */
router.post("/admin/make-admin", requireAuth, async (req, res) => {
  try {
    if (!req.user || !req.user.admin) return res.status(403).json({ error: "Admin access required" });
    const { email } = req.body;
    const target = await User.findOne({ email: email.toLowerCase() });
    if (!target) return res.status(404).json({ error: "User not found" });
    target.admin = true;
    await target.save();
    res.json({ ok: true, message: `${email} is now an admin` });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ---------- Admin: Delete user ---------- */
router.post("/admin/delete-user", requireAuth, async (req, res) => {
  try {
    if (!req.user || !req.user.admin) return res.status(403).json({ error: "Admin access required" });
    const { email } = req.body;
    await User.deleteOne({ email: email.toLowerCase() });
    res.json({ ok: true, message: `User ${email} deleted` });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ---------- Premium: Detailed diet plan ---------- */
router.get("/premium/diet-plan", requireAuth, requirePremium, async (req, res) => {
  try {
    const profile = await Profile.findOne({ userId: req.userId.toString() });
    const cal = profile?.target?.cal || 2000;
    const protein = profile?.target?.protein || 150;
    const carb = profile?.target?.carb || 250;
    const fat = profile?.target?.fat || 65;
    const dietPlan = {
      summary: { cal, protein, carb, fat },
      meals: [
        {
          time: "7:00 AM", name: "Pre-Workout", items: [
            { food: "Black coffee", grams: 250, cal: 5, protein: 0, carb: 0, fat: 0, note: "Boosts metabolism" },
            { food: "Banana", grams: 120, cal: 105, protein: 1.3, carb: 27, fat: 0.4, note: "Quick energy" },
          ]
        },
        {
          time: "8:30 AM", name: "Post-Workout Shake", items: [
            { food: "Whey protein powder", grams: 30, cal: 114, protein: 24, carb: 2, fat: 1.5, note: "Fast-absorbing protein" },
            { food: "Banana", grams: 120, cal: 105, protein: 1.3, carb: 27, fat: 0.4, note: "Glycogen replenishment" },
            { food: "Water", grams: 300, cal: 0, protein: 0, carb: 0, fat: 0, note: "Hydration" },
          ]
        },
        {
          time: "10:00 AM", name: "Breakfast", items: [
            { food: "Oats, dry", grams: 80, cal: 311, protein: 14, carb: 53, fat: 5.6, note: "Complex carbs for sustained energy" },
            { food: "Egg, whole", grams: 150, cal: 233, protein: 20, carb: 1.7, fat: 17, note: "Complete protein source" },
            { food: "Greek yogurt, plain nonfat", grams: 150, cal: 89, protein: 15, carb: 5.4, fat: 0.6, note: "Probiotics + protein" },
          ]
        },
        {
          time: "1:00 PM", name: "Lunch", items: [
            { food: "Chicken breast, cooked", grams: 200, cal: 330, protein: 62, carb: 0, fat: 7.2, note: "Lean protein staple" },
            { food: "Brown rice, cooked", grams: 200, cal: 246, protein: 5.2, carb: 52, fat: 2, note: "Sustained energy release" },
            { food: "Broccoli, cooked", grams: 150, cal: 53, protein: 3.6, carb: 10.5, fat: 0.6, note: "Fiber + micronutrients" },
            { food: "Olive oil", grams: 10, cal: 88, protein: 0, carb: 0, fat: 10, note: "Healthy fats for absorption" },
          ]
        },
        {
          time: "4:00 PM", name: "Snack", items: [
            { food: "Almonds", grams: 30, cal: 173, protein: 6, carb: 6, fat: 15, note: "Healthy fats + vitamin E" },
            { food: "Apple", grams: 180, cal: 94, protein: 0.5, carb: 25, fat: 0.3, note: "Fiber + natural sugars" },
          ]
        },
        {
          time: "7:00 PM", name: "Dinner", items: [
            { food: "Salmon, cooked", grams: 180, cal: 374, protein: 40, carb: 0, fat: 23, note: "Omega-3 fatty acids" },
            { food: "Sweet potato, baked", grams: 200, cal: 180, protein: 4, carb: 42, fat: 0.2, note: "Complex carbs + beta carotene" },
            { food: "Spinach, raw", grams: 100, cal: 23, protein: 2.9, carb: 3.6, fat: 0.4, note: "Iron + folate" },
          ]
        },
        {
          time: "9:30 PM", name: "Before Bed", items: [
            { food: "Cottage cheese, low fat", grams: 150, cal: 129, protein: 17, carb: 6.5, fat: 3.8, note: "Casein protein for overnight recovery" },
          ]
        }
      ]
    };
    res.json(dietPlan);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ---------- Premium: Detailed exercise guide ---------- */
router.get("/premium/exercise-guide/:planKey", requireAuth, requirePremium, async (req, res) => {
  try {
    const guides = {
      "bodybuilding": {
        title: "Bodybuilding Hypertrophy Program",
        description: "4-day split focusing on muscle isolation and progressive overload",
        weeklySchedule: ["Mon: Chest & Biceps", "Tue: Back & Triceps", "Wed: Rest", "Thu: Legs & Shoulders", "Fri: Arms & Abs", "Sat-Sun: Rest"],
        days: [
          { day: "Chest & Biceps", exercises: [
            { n: "Incline Barbell Press", s: "4x8", rest: "90s", tempo: "3-1-2", form: "Retract scapula, arch upper back slightly, bar touches upper chest", warmup: "2 warm-up sets with 50% and 70% weight", tip: "Focus on the stretch at the bottom" },
            { n: "Flat DB Press", s: "3x10", rest: "75s", tempo: "3-1-2", form: "Press up and slightly inward, squeeze at top", warmup: "1 warm-up set", tip: "Keep elbows at 45 degree angle" },
            { n: "Cable Fly", s: "3x12", rest: "60s", tempo: "2-1-3", form: "Slight bend in elbows, squeeze chest at center", warmup: "None needed", tip: "Imagine hugging a tree" },
            { n: "Preacher Curl", s: "3x10", rest: "60s", tempo: "2-1-2", form: "Full extension at bottom, squeeze at top", warmup: "1 light set", tip: "Don't swing the weight" },
            { n: "Hammer Curl", s: "3x12", rest: "60s", tempo: "2-1-2", form: "Keep elbows pinned, alternate arms", warmup: "None", tip: "Targets brachialis for thicker arms" },
          ]},
          { day: "Back & Triceps", exercises: [
            { n: "Weighted Pull-up", s: "4x6", rest: "120s", tempo: "2-1-3", form: "Full dead hang, pull to chest not chin", warmup: "2 bodyweight sets", tip: "Add weight gradually with belt" },
            { n: "T-Bar Row", s: "3x8", rest: "90s", tempo: "2-1-2", form: "Chest supported, pull to lower chest", warmup: "1 warm-up set", tip: "Squeeze shoulder blades together" },
            { n: "Seated Cable Row", s: "3x10", rest: "75s", tempo: "2-1-3", form: "Lean forward slightly, pull to navel", warmup: "None", tip: "Control the negative" },
            { n: "Skull Crusher", s: "3x10", rest: "60s", tempo: "2-1-2", form: "Lower to forehead, extend fully", warmup: "1 light set", tip: "Keep elbows stationary" },
            { n: "Tricep Dip", s: "3x12", rest: "60s", tempo: "2-1-2", form: "Lean forward for chest, upright for triceps", warmup: "None", tip: "Add weight when bodyweight becomes easy" },
          ]},
          { day: "Legs & Shoulders", exercises: [
            { n: "Front Squat", s: "4x6", rest: "120s", tempo: "3-1-2", form: "Elbows high, upright torso, depth below parallel", warmup: "3 progressively heavier sets", tip: "Great for quad development" },
            { n: "Leg Curl", s: "3x10", rest: "75s", tempo: "2-1-3", form: "Squeeze hamstrings at peak contraction", warmup: "1 light set", tip: "Control the negative for 3 seconds" },
            { n: "Leg Extension", s: "3x12", rest: "60s", tempo: "2-1-2", form: "Full extension, squeeze quads at top", warmup: "None", tip: "Great for quad isolation" },
            { n: "Military Press", s: "4x8", rest: "90s", tempo: "2-1-2", form: "Press overhead, lock out at top", warmup: "2 warm-up sets", tip: "Brace core throughout" },
            { n: "Lateral Raise", s: "4x15", rest: "45s", tempo: "2-1-3", form: "Slight bend in elbows, raise to shoulder height", warmup: "None", tip: "Light weight, high reps for medial delt" },
          ]},
          { day: "Arms & Abs", exercises: [
            { n: "Close Grip Bench", s: "3x8", rest: "90s", tempo: "2-1-2", form: "Hands shoulder-width, elbows close to body", warmup: "1 warm-up set", tip: "Best compound tricep builder" },
            { n: "EZ Bar Curl", s: "3x10", rest: "60s", tempo: "2-1-2", form: "Full extension, squeeze at top", warmup: "1 light set", tip: "EZ bar reduces wrist strain" },
            { n: "Overhead Extension", s: "3x12", rest: "60s", tempo: "2-1-3", form: "Full stretch behind head, extend fully", warmup: "None", tip: "Targets long head of tricep" },
            { n: "Concentration Curl", s: "3x12", rest: "60s", tempo: "2-1-2", form: "Brace elbow against inner thigh", warmup: "None", tip: "Maximum bicep peak" },
            { n: "Hanging Leg Raise", s: "3x15", rest: "60s", tempo: "2-1-2", form: "Straight legs, lift to 90 degrees", warmup: "None", tip: "Focus on lower abs" },
          ]},
        ]
      },
      "powerlifting": {
        title: "Powerlifting Strength Program",
        description: "3-day compound-focused program for maximum strength",
        weeklySchedule: ["Mon: Squat Day", "Wed: Bench Day", "Fri: Deadlift Day", "Tue/Thu/Sat/Sun: Rest or light cardio"],
        days: [
          { day: "Squat Day", exercises: [
            { n: "Back Squat", s: "5x3 @85%", rest: "3-5min", tempo: "Controlled", form: "Break at hips and knees simultaneously, depth below parallel", warmup: "Empty bar x10, 50%x5, 70%x3, 80%x2", tip: "Brace hard, push knees out" },
            { n: "Pause Squat", s: "3x5 @70%", rest: "2-3min", tempo: "3sec pause at bottom", form: "Same as competition squat, pause in hole", warmup: "1 set at 60%", tip: "Builds strength out of the hole" },
            { n: "Leg Press", s: "3x10", rest: "90s", tempo: "Controlled", form: "Full range of motion, don't lock knees", warmup: "1 set", tip: "Volume accessory work" },
            { n: "Leg Curl", s: "3x10", rest: "75s", tempo: "Controlled", form: "Full contraction at peak", warmup: "None", tip: "Balance quad-dominant program" },
            { n: "Ab Wheel", s: "3x10", rest: "60s", tempo: "Slow", form: "Full extension, keep core braced", warmup: "None", tip: "Core stability for squats" },
          ]},
          { day: "Bench Day", exercises: [
            { n: "Bench Press", s: "5x3 @85%", rest: "3-5min", tempo: "Controlled", form: "Retract scapula, arch, touch lower chest", warmup: "Empty bar x10, 50%x5, 70%x3, 80%x2", tip: "Leg drive through the whole lift" },
            { n: "Close Grip Bench", s: "3x6 @75%", rest: "2-3min", tempo: "Controlled", form: "Hands shoulder-width, elbows tucked", warmup: "1 set at 65%", tip: "Tricep strength for lockout" },
            { n: "Pause Bench", s: "3x5 @70%", rest: "2min", tempo: "2sec pause on chest", form: "Same as comp bench, pause on chest", warmup: "None", tip: "Builds strength off the chest" },
            { n: "DB Fly", s: "3x12", rest: "60s", tempo: "Slow negative", form: "Slight elbow bend, deep stretch", warmup: "None", tip: "Chest volume and stretch" },
            { n: "Tricep Pushdown", s: "3x12", rest: "60s", tempo: "Controlled", form: "Full extension, squeeze at bottom", warmup: "None", tip: "Lockout assistance" },
          ]},
          { day: "Deadlift Day", exercises: [
            { n: "Deadlift", s: "5x2 @90%", rest: "3-5min", tempo: "Explosive", form: "Hips low, chest up, bar stays close to body", warmup: "Empty bar x10, 50%x5, 70%x3, 80%x2, 85%x1", tip: "Pull the slack out before lifting" },
            { n: "Romanian Deadlift", s: "3x8 @60%", rest: "90s", tempo: "3-1-2", form: "Hinge at hips, slight knee bend, feel hamstring stretch", warmup: "1 set", tip: "Hamstring and glute builder" },
            { n: "Barbell Row", s: "3x8 @70%", rest: "90s", tempo: "Controlled", form: "45-degree torso angle, pull to lower chest", warmup: "1 set", tip: "Back thickness" },
            { n: "Pull-up", s: "3x max", rest: "90s", tempo: "Controlled", form: "Full dead hang, chin over bar", warmup: "None", tip: "Add weight when 12+ reps" },
            { n: "Bicep Curl", s: "3x12", rest: "60s", tempo: "Controlled", form: "Full range, no swinging", warmup: "None", tip: "Arm volume" },
          ]},
        ]
      },
      "calisthenics-pro": {
        title: "Calisthenics Pro Program",
        description: "Advanced bodyweight training for strength and skill",
        weeklySchedule: ["Mon: Upper Push", "Tue: Upper Pull", "Wed: Legs & Core", "Thu: Rest", "Fri: Skills", "Sat-Sun: Rest"],
        days: [
          { day: "Upper Push", exercises: [
            { n: "Muscle-up", s: "5x3", rest: "2-3min", tempo: "Explosive", form: "False grip, pull to waist, transition, press out", warmup: "3x5 pull-ups + 3x5 dips", tip: "Master the false grip first" },
            { n: "Handstand Push-up", s: "4x5", rest: "2min", tempo: "Controlled", form: "Wall-assisted, full range of motion", warmup: "3x30s handstand hold", tip: "Builds shoulder strength" },
            { n: "Ring Dips", s: "3x8", rest: "90s", tempo: "2-1-2", form: "Rings turned out at top, full depth", warmup: "1 set", tip: "Ring stability is key" },
            { n: "Pseudo Planche Push-up", s: "3x8", rest: "90s", tempo: "2-1-2", form: "Hands at waist level, lean forward", warmup: "None", tip: "Builds planche strength" },
            { n: "L-sit Hold", s: "3x30s", rest: "60s", tempo: "Hold", form: "Legs parallel to floor, arms locked", warmup: "None", tip: "Core and hip flexor strength" },
          ]},
          { day: "Upper Pull", exercises: [
            { n: "Weighted Pull-up", s: "5x3", rest: "2-3min", tempo: "Controlled", form: "Full range, pull to chest", warmup: "2x5 bodyweight", tip: "Add weight progressively" },
            { n: "Front Lever Row", s: "3x5", rest: "2min", tempo: "Controlled", form: "Tuck or advanced tuck, row to chest", warmup: "3x10s front lever hold", tip: "Lat strength for advanced skills" },
            { n: "Archer Pull-up", s: "3x6/side", rest: "90s", tempo: "Controlled", form: "One arm straight, pull with other", warmup: "None", tip: "Progression toward one-arm pull-up" },
            { n: "Muscle-up Transition", s: "3x5", rest: "90s", tempo: "Fast transition", form: "Focus on the transition phase only", warmup: "None", tip: "Weak point training" },
            { n: "Hanging Leg Raise", s: "3x12", rest: "60s", tempo: "2-1-2", form: "Straight legs to bar", warmup: "None", tip: "Core strength" },
          ]},
          { day: "Legs & Core", exercises: [
            { n: "Pistol Squat", s: "4x5/side", rest: "90s", tempo: "Controlled", form: "Full depth, non-working leg extended", warmup: "2x5 each leg assisted", tip: "Balance and strength" },
            { n: "Nordic Curl", s: "3x6", rest: "2min", tempo: "Slow negative", form: "Slow 5-second negative, push back up", warmup: "1 set assisted", tip: "Hamstring injury prevention" },
            { n: "Shrimp Squat", s: "3x6/side", rest: "90s", tempo: "Controlled", form: "Grab rear foot, knee touches ground", warmup: "None", tip: "Quad strength and balance" },
            { n: "Dragon Flag", s: "3x8", rest: "90s", tempo: "3-1-2", form: "Full body straight, controlled lowering", warmup: "None", tip: "Advanced core exercise" },
            { n: "Human Flag Hold", s: "3x15s", rest: "90s", tempo: "Hold", form: "Body horizontal, arms locked", warmup: "None", tip: "Full body tension" },
          ]},
        ]
      }
    };
    const guide = guides[req.params.planKey];
    if (!guide) return res.status(404).json({ error: "Guide not found" });
    res.json(guide);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
