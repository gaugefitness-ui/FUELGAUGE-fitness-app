const express = require("express");
const router = express.Router();
const { body, validationResult } = require("express-validator");
const { Payment, User } = require("../models");
const { requireAuth } = require("../middleware/auth");
const esewa = require("../services/esewa");
const khalti = require("../services/khalti");

const PLAN_PRICES = { basic: 2000, premium: 5000 }; // NPR

/* ====================== PUBLIC: Payment info ====================== */
router.get("/info", (req, res) => {
  res.json({
    prices: PLAN_PRICES,
    currency: "NPR",
    methods: {
      esewa: {
        name: "eSewa",
        configured: esewa.isConfigured(),
        note: "Pay via eSewa app. You'll be redirected to complete payment.",
      },
      khalti: {
        name: "Khalti",
        configured: khalti.isConfigured(),
        note: "Pay via Khalti app, wallet, or bank transfer.",
      },
      bank: {
        name: "Bank Transfer",
        configured: true,
        bankName: process.env.BANK_NAME || "Nabil Bank",
        accountName: process.env.BANK_ACCOUNT_NAME || "FUELGAUGE Fitness Pvt. Ltd.",
        accountNumber: process.env.BANK_ACCOUNT_NUMBER || "01234567890123",
        note: "Transfer the exact amount, then submit reference number for verification.",
      },
    },
  });
});

/* ====================== eSewa: Initiate payment ====================== */
router.post("/esewa/initiate", requireAuth, async (req, res) => {
  try {
    if (!esewa.isConfigured()) {
      return res.status(503).json({ error: "eSewa payment not configured yet. Please use another method." });
    }

    const { plan } = req.body;
    if (!plan || !PLAN_PRICES[plan]) {
      return res.status(400).json({ error: "Invalid plan selected." });
    }

    const amount = PLAN_PRICES[plan];
    const productId = esewa.generateProductId(req.userId, plan);

    // Record the pending payment
    await Payment.create({
      userId: req.userId,
      plan,
      amount,
      method: "esewa",
      reference: productId,
      status: "pending",
    });

    const paymentUrl = esewa.createPaymentUrl({
      amount,
      productId,
      productName: `FUELGAUGE ${plan.charAt(0).toUpperCase() + plan.slice(1)} Plan`,
    });

    res.json({ success: true, paymentUrl, productId });
  } catch (err) {
    console.error("eSewa initiate error:", err.message);
    res.status(500).json({ error: "Failed to initiate eSewa payment." });
  }
});

/* ====================== eSewa: Callback/Verify ====================== */
router.get("/esewa/callback", async (req, res) => {
  try {
    const { refId, oid, amt } = req.query;
    if (!refId || !oid) {
      return res.redirect("/?payment=failed");
    }

    const amount = parseFloat(amt);
    const verification = await esewa.verifyPayment({
      productId: oid,
      refId,
      amount,
    });

    if (verification.verified) {
      // Find and update the payment record
      const payment = await Payment.findOne({ reference: oid, method: "esewa" });
      if (payment) {
        payment.status = "approved";
        payment.reference = refId;
        await payment.save();

        // Activate the user's plan
        const user = await User.findById(payment.userId);
        if (user) {
          const expires = new Date();
          expires.setDate(expires.getDate() + 30);
          user.plan = payment.plan;
          if (payment.plan === "premium") {
            user.planExpiresAt = expires;
          }
          user.premium = true;
          user.premiumPlan = payment.plan;
          user.premiumExpires = expires;
          await user.save();
        }
      }
      return res.redirect("/?payment=success&method=esewa");
    } else {
      return res.redirect("/?payment=failed&reason=" + encodeURIComponent(verification.error || "verification_failed"));
    }
  } catch (err) {
    console.error("eSewa callback error:", err.message);
    return res.redirect("/?payment=failed");
  }
});

/* ====================== Khalti: Initiate payment ====================== */
router.post("/khalti/initiate", requireAuth, async (req, res) => {
  try {
    if (!khalti.isConfigured()) {
      return res.status(503).json({ error: "Khalti payment not configured yet. Please use another method." });
    }

    const { plan } = req.body;
    if (!plan || !PLAN_PRICES[plan]) {
      return res.status(400).json({ error: "Invalid plan selected." });
    }

    const amount = PLAN_PRICES[plan];
    const productId = khalti.generateProductId(req.userId, plan);

    // Record the pending payment
    await Payment.create({
      userId: req.userId,
      plan,
      amount,
      method: "khalti",
      reference: productId,
      status: "pending",
    });

    const result = await khalti.initiatePayment({
      amount,
      productId,
      userId: req.userId,
      plan,
    });

    if (result.success) {
      res.json({ success: true, paymentUrl: result.paymentUrl, token: result.token });
    } else {
      res.status(400).json({ error: result.error });
    }
  } catch (err) {
    console.error("Khalti initiate error:", err.message);
    res.status(500).json({ error: "Failed to initiate Khalti payment." });
  }
});

/* ====================== Khalti: Verify payment ====================== */
router.post("/khalti/verify", requireAuth, async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) {
      return res.status(400).json({ error: "Payment token required." });
    }

    const verification = await khalti.verifyPayment({ token });

    if (verification.verified) {
      const { productId, amount } = verification.data;

      // Find and update the payment record
      const payment = await Payment.findOne({ reference: productId, method: "khalti" });
      if (payment) {
        payment.status = "approved";
        payment.reference = token;
        await payment.save();

        // Activate the user's plan
        const user = await User.findById(payment.userId);
        if (user) {
          const expires = new Date();
          expires.setDate(expires.getDate() + 30);
          user.plan = payment.plan;
          if (payment.plan === "premium") {
            user.planExpiresAt = expires;
          }
          user.premium = true;
          user.premiumPlan = payment.plan;
          user.premiumExpires = expires;
          await user.save();
        }
      }

      res.json({ success: true, message: "Payment verified and plan activated." });
    } else {
      res.status(400).json({ error: verification.error || "Payment verification failed." });
    }
  } catch (err) {
    console.error("Khalti verify error:", err.message);
    res.status(500).json({ error: "Failed to verify Khalti payment." });
  }
});

/* ====================== Manual: Bank transfer submission ====================== */
router.post("/submit", requireAuth, [
  body("plan").isIn(["basic", "premium"]),
  body("reference").trim().isLength({ min: 3, max: 100 }),
  body("payerName").optional().trim().isLength({ max: 100 }),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: "Invalid input.", details: errors.array() });
    }

    const { plan, reference, payerName } = req.body;
    const amount = PLAN_PRICES[plan];

    const payment = await Payment.create({
      userId: req.userId,
      plan,
      amount,
      method: "bank",
      reference: reference.trim(),
      payerName: (payerName || "").trim(),
      status: "pending", // Admin must approve
    });

    res.json({
      success: true,
      message: "Payment proof submitted. Your plan will be activated after admin verification.",
      paymentId: payment._id,
    });
  } catch (err) {
    console.error("Bank payment submit error:", err.message);
    res.status(500).json({ error: "Failed to record payment." });
  }
});

/* ====================== Manual: Activate via admin grant ====================== */
router.post("/admin-activate", requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user || !user.admin) {
      return res.status(403).json({ error: "Admin access required." });
    }

    const { targetEmail, plan } = req.body;
    if (!targetEmail || !plan || !PLAN_PRICES[plan]) {
      return res.status(400).json({ error: "Invalid email or plan." });
    }

    const target = await User.findOne({ email: targetEmail.toLowerCase() });
    if (!target) {
      return res.status(404).json({ error: "User not found." });
    }

    const expires = new Date();
    expires.setDate(expires.getDate() + 30);
    target.plan = plan;
    if (plan === "premium") {
      target.planExpiresAt = expires;
    }
    target.premium = true;
    target.premiumPlan = plan;
    target.premiumExpires = expires;
    await target.save();

    res.json({ success: true, message: `${plan} plan activated for ${targetEmail}` });
  } catch (err) {
    console.error("Admin activate error:", err.message);
    res.status(500).json({ error: "Failed to activate plan." });
  }
});

/* ====================== User: Payment history ====================== */
router.get("/history", requireAuth, async (req, res) => {
  try {
    const payments = await Payment.find({ userId: req.userId })
      .sort({ createdAt: -1 })
      .limit(20)
      .select("-__v");
    res.json(payments);
  } catch (err) {
    res.status(500).json({ error: "Failed to load payment history." });
  }
});

/* ====================== Admin: List pending payments ====================== */
router.get("/admin/pending", requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user || !user.admin) {
      return res.status(403).json({ error: "Admin access required." });
    }

    const payments = await Payment.find({ status: "pending" })
      .sort({ createdAt: -1 })
      .populate("userId", "email name")
      .select("-__v");
    res.json(payments);
  } catch (err) {
    res.status(500).json({ error: "Failed to load pending payments." });
  }
});

/* ====================== Admin: Approve/reject payment ====================== */
router.post("/admin/process", requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user || !user.admin) {
      return res.status(403).json({ error: "Admin access required." });
    }

    const { paymentId, action } = req.body; // action: "approve" or "reject"
    if (!paymentId || !["approve", "reject"].includes(action)) {
      return res.status(400).json({ error: "Invalid paymentId or action." });
    }

    const payment = await Payment.findById(paymentId);
    if (!payment) {
      return res.status(404).json({ error: "Payment not found." });
    }

    if (action === "approve") {
      payment.status = "approved";
      await payment.save();

      // Activate the user's plan
      const targetUser = await User.findById(payment.userId);
      if (targetUser) {
        const expires = new Date();
        expires.setDate(expires.getDate() + 30);
        targetUser.plan = payment.plan;
        if (payment.plan === "premium") {
          targetUser.planExpiresAt = expires;
        }
        targetUser.premium = true;
        targetUser.premiumPlan = payment.plan;
        targetUser.premiumExpires = expires;
        await targetUser.save();
      }

      res.json({ success: true, message: "Payment approved and plan activated." });
    } else {
      payment.status = "rejected";
      await payment.save();
      res.json({ success: true, message: "Payment rejected." });
    }
  } catch (err) {
    console.error("Admin process payment error:", err.message);
    res.status(500).json({ error: "Failed to process payment." });
  }
});

module.exports = router;
