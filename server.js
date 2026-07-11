require("express-async-errors");
require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const path = require("path");
const helmet = require("helmet");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const rateLimit = require("express-rate-limit");
const apiRoutes = require("./routes/api");
const { User } = require("./models");

const app = express();
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://gaugefitness_db_user:%60test@cluster0.hw3noe1.mongodb.net/fuelgauge?retryWrites=true&w=majority";

app.set("trust proxy", 1);

app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));

app.use(cors({
  origin: function (origin, callback) { callback(null, true); },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later." },
});
app.use(globalLimiter);

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false, limit: "1mb" }));

app.post("/api/_bare-test", (req, res) => {
  res.json({ ok: true, body: req.body, method: req.method });
});

app.use("/api", apiRoutes);

app.use(express.static(path.join(__dirname, "public")));

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.use((err, req, res, next) => {
  console.error("Unhandled error:", err.message, err.stack);
  res.status(500).json({ error: "Internal server error" });
});

mongoose.connect(MONGO_URI)
  .then(async () => {
    console.log("Connected to MongoDB");

    if (process.env.EMAIL_USER) {
      try {
        const nodemailer = require("nodemailer");
        const testTransporter = nodemailer.createTransport({
          service: "gmail",
          auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
        });
        await testTransporter.verify();
        console.log("Email transporter verified");
      } catch (err) {
        console.error("Email transporter failed:", err.message);
      }
    }

    try {
      const adminEmail = "gaugefitness@gmail.com";
      const adminPass = "98@David";
      let admin = await User.findOne({ email: adminEmail });
      if (!admin) {
        const hash = await bcrypt.hash(adminPass, 10);
        admin = await User.create({
          email: adminEmail, name: "FUELGAUGE Admin",
          verified: true, admin: true, password: hash,
        });
        console.log("Admin created:", adminEmail);
      } else if (!admin.admin) {
        admin.admin = true;
        await admin.save();
        console.log("Promoted to admin:", adminEmail);
      }
      await User.updateMany({ email: { $ne: adminEmail }, admin: true }, { $set: { admin: false } });
    } catch (err) {
      console.error("Admin seed error:", err.message);
    }

    app.listen(PORT, () => console.log(`FUELGAUGE running on port ${PORT}`));
  })
  .catch(err => {
    console.error("MongoDB error:", err.message);
    process.exit(1);
  });
