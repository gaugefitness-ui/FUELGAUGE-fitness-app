const IS_CAPACITOR_AUTH = window.location.protocol === "capacitor:" || (window.location.protocol === "https:" && window.location.hostname === "localhost");
const AUTH_BASE = IS_CAPACITOR_AUTH ? (document.querySelector('meta[name="api-server"]')?.content || "https://fuelgauge-zhjo.onrender.com") : "";
const AUTH_API = AUTH_BASE + "/api/auth";

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
