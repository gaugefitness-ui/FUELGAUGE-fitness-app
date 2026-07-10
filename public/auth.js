const IS_CAPACITOR_AUTH = window.location.protocol === "capacitor:" || (window.location.protocol === "https:" && window.location.hostname === "localhost");
const AUTH_BASE = IS_CAPACITOR_AUTH ? (document.querySelector('meta[name="api-server"]')?.content || "https://fuelgauge-zhjo.onrender.com") : "";
const AUTH_API = AUTH_BASE + "/api/auth";
const GOOGLE_CLIENT_ID = "728908685736-6a9oqmkt0482402smb4aq1dn74bsn4pl.apps.googleusercontent.com";

function showAuthError(msg) {
  const box = document.getElementById("auth-error");
  if (!box) return;
  box.textContent = msg;
  box.style.display = "block";
}
function hideAuthError() {
  const box = document.getElementById("auth-error");
  if (box) box.style.display = "none";
}

async function authPost(path, body) {
  const res = await fetch(AUTH_API + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Something went wrong.");
  return data;
}

function saveSession(data) {
  localStorage.setItem("fg_token", data.token);
  localStorage.setItem("fg_user", JSON.stringify({ email: data.email, name: data.name, avatar: data.avatar, admin: data.admin }));
}

function showToast(msg) {
  let toast = document.getElementById("toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "toast";
    toast.className = "toast";
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 3000);
}

function initGoogleSignIn() {
  // Redirect-based flow — no popup needed
  document.querySelectorAll("#google-login-btn, #google-register-btn").forEach(container => {
    if (!container) return;
    container.innerHTML = '<button class="google-signin-btn" type="button" style="width:100%;padding:14px 16px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);border-radius:14px;color:#fff;font-size:14px;font-family:Inter,sans-serif;font-weight:500;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:10px;transition:all .25s;"><svg width="20" height="20" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg> Continue with Google</button>';
    const btn = container.querySelector("button");
    btn.addEventListener("click", () => {
      window.location.href = AUTH_API.replace("/auth", "") + "/auth/google/start";
    });
  });
}

function initAuthPage(mode) {
  if (localStorage.getItem("fg_token")) {
    window.location.href = "/";
    return;
  }

  if (mode === "login") {
    const loginCard = document.querySelector(".auth-card");
    const pendingEmail = sessionStorage.getItem("pendingVerifyEmail");

    document.getElementById("lg-submit").addEventListener("click", async () => {
      hideAuthError();
      const email = document.getElementById("lg-email").value.trim();
      const password = document.getElementById("lg-password").value;
      if (!email || !password) { showAuthError("Enter your email and password."); return; }
      try {
        const data = await authPost("/login", { email, password });
        saveSession(data);
        window.location.href = "/";
      } catch (err) {
        if (err.message.includes("not verified")) {
          showAuthError("Email not verified. Sending a new code...");
          try {
            await authPost("/resend", { email });
            sessionStorage.setItem("pendingVerifyEmail", email);
            showVerifyUI(loginCard, email);
          } catch (e2) {
            showAuthError(err.message);
          }
        } else {
          showAuthError(err.message);
        }
      }
    });

    document.getElementById("lg-password").addEventListener("keydown", e => {
      if (e.key === "Enter") document.getElementById("lg-submit").click();
    });

    if (pendingEmail) {
      sessionStorage.removeItem("pendingVerifyEmail");
      showVerifyUI(loginCard, pendingEmail);
    }
  }

  if (mode === "register") {
    document.getElementById("rg-submit").addEventListener("click", async () => {
      hideAuthError();
      const name = document.getElementById("rg-name").value.trim();
      const email = document.getElementById("rg-email").value.trim();
      const password = document.getElementById("rg-password").value;
      if (!name || !email || !password) { showAuthError("Fill in all fields."); return; }
      if (password.length < 6) { showAuthError("Password must be at least 6 characters."); return; }
      try {
        const regData = await authPost("/register", { name, email, password });
        const regCard = document.querySelector(".auth-card");
        showVerifyUI(regCard, email);
        if (regData.emailWarning) {
          showAuthError(regData.message);
        } else {
          showToast("Verification code sent to " + email);
        }
      } catch (err) {
        showAuthError(err.message);
      }
    });
    document.getElementById("rg-password").addEventListener("keydown", e => {
      if (e.key === "Enter") document.getElementById("rg-submit").click();
    });
  }

  // Initialize Google Sign-In after a short delay to let GSI script load
  setTimeout(initGoogleSignIn, 500);
}

function showVerifyUI(card, email) {
  card.innerHTML = `
    <h2>Verify your email</h2>
    <p class="smallnote">We sent a 6-digit code to <b>${email}</b></p>
    <div id="auth-error" class="auth-error" style="display:none;"></div>
    <label>Verification code</label>
    <input id="vf-code" type="text" inputmode="numeric" placeholder="000000" maxlength="6" autocomplete="one-time-code" style="text-align:center;font-size:24px;letter-spacing:8px;font-family:var(--mono);">
    <button class="btn btn-primary" id="vf-submit" style="margin-top:6px;">Verify</button>
    <p class="auth-switch" style="margin-top:12px;">
      Didn't get it? <a href="#" id="vf-resend">Resend code</a>
    </p>
    <p class="auth-switch"><a href="/login.html">Back to login</a></p>
  `;

  document.getElementById("vf-submit").addEventListener("click", async () => {
    hideAuthError();
    const code = document.getElementById("vf-code").value.trim();
    if (!code || code.length !== 6) { showAuthError("Enter the 6-digit code."); return; }
    try {
      await authPost("/verify", { email, code });
      showToast("Email verified! Logging in...");
      const pw = sessionStorage.getItem("pendingVerifyPassword") || "";
      sessionStorage.removeItem("pendingVerifyPassword");
      if (pw) {
        try {
          const data = await authPost("/login", { email, password: pw });
          saveSession(data);
          window.location.href = "/";
          return;
        } catch (_) {}
      }
      window.location.href = "/login.html";
    } catch (err) {
      showAuthError(err.message);
    }
  });

  document.getElementById("vf-code").addEventListener("keydown", e => {
    if (e.key === "Enter") document.getElementById("vf-submit").click();
  });

  document.getElementById("vf-resend").addEventListener("click", async (e) => {
    e.preventDefault();
    hideAuthError();
    try {
      const resendData = await authPost("/resend", { email });
      if (resendData.emailWarning) {
        showAuthError(resendData.message);
      } else {
        showToast("New code sent to " + email);
      }
    } catch (err) {
      showAuthError(err.message);
    }
  });
}
