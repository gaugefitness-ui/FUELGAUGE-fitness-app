/**
 * eSewa Payment Gateway Integration
 *
 * Setup:
 *   1. Register at https://developer.esewa.com.np for sandbox
 *   2. Register at https://esewa.com.np for production
 *   3. Set ESEWA_MERCHANT_ID and ESEWA_SECRET_KEY in .env
 *   4. Set ESEWA_ENV to "sandbox" or "production"
 *
 * eSewa API Docs: https://developer.esewa.com.np/documentation
 */

const https = require("https");
const crypto = require("crypto");

const ESEWA_MERCHANT_ID = process.env.ESEWA_MERCHANT_ID || "";
const ESEWA_SECRET_KEY = process.env.ESEWA_SECRET_KEY || "";
const ESEWA_ENV = process.env.ESEWA_ENV || "sandbox"; // "sandbox" or "production"

const BASE_URLS = {
  sandbox: "https://uat.esewa.com.np",
  production: "https://esewa.com.np",
};

const API_URLS = {
  sandbox: "https://uat.esewa.com.np/api/epay/transaction",
  production: "https://esewa.com.np/api/epay/transaction/status",
};

/**
 * Create eSewa payment params for redirect
 * Returns the URL the user should be redirected to for payment
 */
function createPaymentUrl({ amount, productId, productName, secretKey }) {
  const merchantId = ESEWA_MERCHANT_ID;
  const secret = secretKey || ESEWA_SECRET_KEY;
  const baseUrl = BASE_URLS[ESEWA_ENV];

  // Generate signature
  const message = `totalAmount=${amount},transactionUuid=${productId},productCode=${merchantId}`;
  const signature = crypto
    .createHmac("sha256", secret)
    .update(message)
    .digest("hex");

  const params = new URLSearchParams({
    amount: amount.toString(),
    taxAmount: "0",
    totalAmount: amount.toString(),
    transactionUuid: productId,
    productCode: merchantId,
    productName: productName || "FUELGAUGE Subscription",
    productDetails: productName || "FUELGAUGE Subscription",
    successUrl: process.env.ESEWA_SUCCESS_URL || `http://localhost:3000/api/payment/esewa/callback`,
    failureUrl: process.env.ESEWA_FAILURE_URL || `http://localhost:3000/api/payment/esewa/callback`,
    signedFieldNames: "totalAmount,transactionUuid,productCode",
    signature: signature,
  });

  return `${baseUrl}/epay/main?${params.toString()}`;
}

/**
 * Verify eSewa payment after callback
 * Called when user returns from eSewa
 */
async function verifyPayment({ productId, refId, amount }) {
  if (!ESEWA_MERCHANT_ID || !ESEWA_SECRET_KEY) {
    return { verified: false, error: "eSewa not configured" };
  }

  const baseUrl = ESEWA_ENV === "production"
    ? "https://esewa.com.np"
    : "https://uat.esewa.com.np";

  const verifyUrl = `${baseUrl}/api/epay/transaction/status?productCode=${ESEWA_MERCHANT_ID}&transactionUuid=${productId}&referenceId=${refId}`;

  try {
    const result = await new Promise((resolve, reject) => {
      https.get(verifyUrl, (res) => {
        let data = "";
        res.on("data", (chunk) => { data += chunk; });
        res.on("end", () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            resolve(null);
          }
        });
      }).on("error", (err) => reject(err));
    });

    if (result && result.status === "COMPLETE" && result.totalAmount === amount) {
      return { verified: true, data: result };
    }
    return { verified: false, error: "Payment not complete or amount mismatch", data: result };
  } catch (err) {
    console.error("eSewa verification error:", err.message);
    return { verified: false, error: err.message };
  }
}

/**
 * Generate a unique product ID for tracking
 */
function generateProductId(userId, plan) {
  const timestamp = Date.now();
  const random = crypto.randomBytes(4).toString("hex");
  return `FG-${userId}-${plan}-${timestamp}-${random}`;
}

module.exports = {
  createPaymentUrl,
  verifyPayment,
  generateProductId,
  isConfigured: () => Boolean(ESEWA_MERCHANT_ID && ESEWA_SECRET_KEY),
};
