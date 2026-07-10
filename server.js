require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const path = require("path");
const helmet = require("helmet");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const apiRoutes = require("./routes/api");
const paymentRoutes = require("./routes/payment");

const app = express();
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://gaugefitness_db_user:FuelGauge123%21@cluster0.zbq3j9i.mongodb.net/fuelgauge?retryWrites=true&w=majority";

// --- Security Middleware ---

// Helmet: sets various HTTP security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://accounts.google.com", "https://apis.google.com", "https://securetoken.googleapis.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://fonts.gstatic.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:", "http:"],
      connectSrc: ["'self'", "https://accounts.google.com", "https://oauth2.googleapis.com"],
      frameSrc: ["https://accounts.google.com"],
      childSrc: ["'self'"],
      workerSrc: ["'self'", "blob:"],
      objectSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

// CORS: restrict to your domains in production
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",")
  : ["http://localhost:3000", "http://localhost:8100", "capacitor://localhost", "ionic://localhost", "https://localhost"];

// Also allow the Render domain dynamically
app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin) || (process.env.RENDER_EXTERNAL_URL && origin === process.env.RENDER_EXTERNAL_URL)) {
      callback(null, true);
    } else {
      callback(null, true);
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));

// Rate limiting: global
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later." },
});
app.use(globalLimiter);

// Rate limiting: auth endpoints (stricter)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many auth attempts, please try again later." },
});

// Rate limiting: payment endpoints
const paymentLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many payment attempts, please try again later." },
});

// Body parsing with size limits
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false, limit: "1mb" }));

// Strip unknown HTTP methods
app.use((req, res, next) => {
  const allowed = ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"];
  if (!allowed.includes(req.method)) {
    return res.status(405).json({ error: "Method not allowed" });
  }
  next();
});

// --- Routes ---
app.use("/api", (req, res, next) => {
  if (req.path.startsWith("/auth/")) return authLimiter(req, res, next);
  if (req.path.startsWith("/payment/")) return paymentLimiter(req, res, next);
  next();
}, apiRoutes);

app.use(express.static(path.join(__dirname, "public")));

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Global error handler
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err.message);
  res.status(500).json({ error: "Internal server error" });
});

// --- Start ---
mongoose.connect(MONGO_URI)
  .then(() => {
    console.log("Connected to MongoDB");
    app.listen(PORT, () => console.log(`FUELGAUGE server running on http://localhost:${PORT}`));
  })
  .catch(err => {
    console.error("MongoDB connection error:", err.message);
    process.exit(1);
  });
