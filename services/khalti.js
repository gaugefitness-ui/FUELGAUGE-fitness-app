/**
 * Khalti Payment Gateway Integration
 *
 * Setup:
 *   1. Register at https://khalti.com/merchant for sandbox
 *   2. Register at https://khalti.com/merchant for production
 *   3. Set KHALTI_PUBLIC_KEY and KHALTI_SECRET_KEY in .env
 *   4. Set KHALTI_ENV to "sandbox" or "production"
 *
 * Khalti API Docs: https://docs.khalti.com
 */

const https = require("https");
const http = require("http");

const KHALTI_PUBLIC_KEY = process.env.KHALTI_PUBLIC_KEY || "";
const KHALTI_SECRET_KEY = process.env.KHALTI_SECRET_KEY || "";
const KHALTI_ENV = process.env.KHALTI_ENV || "sandbox";

const BASE_URLS = {
  sandbox: "https://a.khalti.com",
  production: "https://khalti.com",
};

const API_URLS = {
  init: {
    sandbox: "https://a.khalti.com/api/v2/epayment/initiate/",
    production: "https://a.khalti.com/api/v2/epayment/initiate/",
  },
  lookup: {
    sandbox: "https://a.khalti.com/api/v2/epayment/lookup/",
    production: "https://a.khalti.com/api/v2/epayment/lookup/",
  },
};

function makeRequest(url, data, headers = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const body = JSON.stringify(data);

    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || (urlObj.protocol === "https:" ? 443 : 80),
      path: urlObj.pathname,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
        ...headers,
      },
    };

    const transport = urlObj.protocol === "https:" ? https : http;

    const req = transport.request(options, (res) => {
      let responseData = "";
      res.on("data", (chunk) => { responseData += chunk; });
      res.on("end", () => {
        try {
          resolve(JSON.parse(responseData));
        } catch (e) {
          resolve(null);
        }
      });
    });

    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

/**
 * Initiate Khalti payment
 * Returns the payment URL the user should be redirected to
 */
async function initiatePayment({ amount, productId, userId, plan }) {
  if (!KHALTI_SECRET_KEY) {
    return { success: false, error: "Khalti not configured" };
  }

  const amountInPaisa = Math.round(amount * 100); // Khalti expects amount in paisa

  const payload = {
    amount: amountInPaisa,
    product_identity: productId,
    product_name: `FUELGAUGE ${plan.charAt(0).toUpperCase() + plan.slice(1)} Plan`,
    product_url: process.env.APP_URL || "http://localhost:3000",
    amount_breakdown: [],
    product_details: [
      { key: "plan", value: plan },
      { key: "user", value: userId.toString() },
    ],
    merchant_metadata: {
      userId: userId.toString(),
      plan: plan,
    },
  };

  try {
    const result = await makeRequest(
      API_URLS.init[KHALTI_ENV],
      payload,
      {
        "Authorization": `Key ${KHALTI_SECRET_KEY}`,
      }
    );

    if (result && result.payment_url) {
      return {
        success: true,
        paymentUrl: result.payment_url,
        token: result.token,
      };
    }

    return { success: false, error: result?.error_message || "Failed to initiate payment", data: result };
  } catch (err) {
    console.error("Khalti initiation error:", err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Verify Khalti payment after completion
 */
async function verifyPayment({ token }) {
  if (!KHALTI_SECRET_KEY) {
    return { verified: false, error: "Khalti not configured" };
  }

  try {
    const result = await makeRequest(
      API_URLS.lookup[KHALTI_ENV],
      { token: token },
      {
        "Authorization": `Key ${KHALTI_SECRET_KEY}`,
      }
    );

    if (result && result.state && result.state.name === "Complete") {
      return {
        verified: true,
        data: {
          amount: result.amount / 100, // Convert paisa to rupees
          productId: result.product_identity,
          token: result.token,
          mobile: result.mobile,
          name: result.name,
        },
      };
    }

    return { verified: false, error: "Payment not complete", data: result };
  } catch (err) {
    console.error("Khalti verification error:", err.message);
    return { verified: false, error: err.message };
  }
}

/**
 * Generate a unique product identity for Khalti
 */
function generateProductId(userId, plan) {
  const timestamp = Date.now();
  const random = require("crypto").randomBytes(4).toString("hex");
  return `FG-${userId}-${plan}-${timestamp}-${random}`;
}

module.exports = {
  initiatePayment,
  verifyPayment,
  generateProductId,
  isConfigured: () => Boolean(KHALTI_PUBLIC_KEY && KHALTI_SECRET_KEY),
};
