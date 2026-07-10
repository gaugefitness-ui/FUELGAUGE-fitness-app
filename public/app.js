const IS_CAPACITOR = window.location.protocol === "capacitor:" || window.location.protocol === "https:" && window.location.hostname === "localhost";
const API_BASE = IS_CAPACITOR ? (document.querySelector('meta[name="api-server"]')?.content || "https://fuelgauge-zhjo.onrender.com") : "";
const API = API_BASE + "/api";

// Handle deep link callback from Google auth (Capacitor)
if (IS_CAPACITOR && window.Capacitor) {
  window.Capacitor.Plugins.App && window.Capacitor.Plugins.App.addListener("appUrlOpen", (event) => {
    const url = event.url || "";
    if (url.includes("fuelgauge://auth")) {
      try {
        const params = new URLSearchParams(new URL(url).search);
        const data = JSON.parse(decodeURIComponent(params.get("data") || "{}"));
        if (data.ok) {
          if (data.token) localStorage.setItem("fg_token", data.token);
          currentUser = { email: data.email, name: data.name, avatar: data.avatar };
          isAdmin = data.admin || false;
          api("/user").then(() => {
            const existing = document.getElementById("auth-root");
            if (existing) existing.remove();
            document.querySelector(".app").style.display = "flex";
            document.querySelector(".bottomnav").style.display = "flex";
            boot();
          });
        }
      } catch(e) { console.error("Deep link parse error:", e); }
    }
  });
}
let profile = null;
let viewingDate = todayStr();
let currentView = "today";
let workoutsState = { activePlan: "push-pull-legs", completion: [] };
let selectedFood = null;
let lastLoc = null;
let currentUser = null;
let isPremium = false;
let currentPlan = "";
let isAdmin = false;
let verifyEmail = "";
let waterGlasses = 0;
let restTimer = null;
let restTimeLeft = 0;
let workoutLogData = [];

const COUNTRIES = [
  {code:"+977",name:"Nepal",flag:"🇳🇵"},
  {code:"+91",name:"India",flag:"🇮🇳"},
  {code:"+1",name:"USA",flag:"🇺🇸"},
  {code:"+44",name:"UK",flag:"🇬🇧"},
  {code:"+61",name:"Australia",flag:"🇦🇺"},
  {code:"+971",name:"UAE",flag:"🇦🇪"},
  {code:"+974",name:"Qatar",flag:"🇶🇦"},
  {code:"+973",name:"Bahrain",flag:"🇧🇭"},
  {code:"+966",name:"Saudi Arabia",flag:"🇸🇦"},
  {code:"+968",name:"Oman",flag:"🇴🇲"},
  {code:"+965",name:"Kuwait",flag:"🇰🇼"},
  {code:"+880",name:"Bangladesh",flag:"🇧🇩"},
  {code:"+94",name:"Sri Lanka",flag:"🇱🇰"},
  {code:"+60",name:"Malaysia",flag:"🇲🇾"},
  {code:"+65",name:"Singapore",flag:"🇸🇬"},
  {code:"+81",name:"Japan",flag:"🇯🇵"},
  {code:"+86",name:"China",flag:"🇨🇳"},
  {code:"+82",name:"South Korea",flag:"🇰🇷"},
  {code:"+49",name:"Germany",flag:"🇩🇪"},
  {code:"+33",name:"France",flag:"🇫🇷"},
  {code:"+39",name:"Italy",flag:"🇮🇹"},
  {code:"+34",name:"Spain",flag:"🇪🇸"},
  {code:"+7",name:"Russia",flag:"🇷🇺"},
  {code:"+55",name:"Brazil",flag:"🇧🇷"},
  {code:"+52",name:"Mexico",flag:"🇲🇽"},
  {code:"+27",name:"South Africa",flag:"🇿🇦"},
  {code:"+234",name:"Nigeria",flag:"🇳🇬"},
  {code:"+254",name:"Kenya",flag:"🇰🇪"},
  {code:"+20",name:"Egypt",flag:"🇪🇬"},
  {code:"+63",name:"Philippines",flag:"🇵🇭"},
  {code:"+66",name:"Thailand",flag:"🇹🇭"},
  {code:"+84",name:"Vietnam",flag:"🇻🇳"},
  {code:"+62",name:"Indonesia",flag:"🇮🇩"},
  {code:"+92",name:"Pakistan",flag:"🇵🇰"},
  {code:"+98",name:"Iran",flag:"🇮🇷"},
];

function phoneInputHTML(id, defaultCode){
  const options = COUNTRIES.map(c =>
    `<option value="${c.code}" ${c.code===defaultCode?"selected":""}>${c.flag} ${c.name} (${c.code})</option>`
  ).join("");
  return `<div style="display:flex;gap:8px;align-items:center;">
    <select id="${id}-code" style="width:auto;min-width:100px;padding:10px 8px;background:var(--panel-raised);color:var(--ink);border:1px solid var(--line);border-radius:10px;font-size:13px;font-family:'JetBrains Mono',monospace;appearance:auto;">${options}</select>
    <input type="tel" id="${id}" placeholder="98765 43210" autocomplete="tel" style="flex:1;">
  </div>`;
}
function getPhoneValue(inputId){
  const code = document.getElementById(inputId+"-code").value;
  const num = document.getElementById(inputId).value.trim().replace(/\D/g,"");
  return code + num;
}

function todayStr(){ return new Date().toISOString().slice(0,10); }

/* ---------- GOOGLE SIGN-IN ---------- */
const GOOGLE_CLIENT_ID = "449230108797-tks2lkji381a7qbf2qk66vmn72nk4st4.apps.googleusercontent.com";
const GOOGLE_BTN_SVG = `<svg width="20" height="20" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg> Continue with Google`;

async function handleGoogleCredential(credential) {
  try {
    const res = await api("/auth/google", {
      method: "POST",
      body: JSON.stringify({ credential }),
    });
    if (res.token) localStorage.setItem("fg_token", res.token);
    currentUser = { email: res.email, name: res.name, avatar: res.avatar };
    isAdmin = res.admin || false;
    const existing = document.getElementById("auth-root");
    if (existing) existing.remove();
    document.querySelector(".app").style.display = "flex";
    document.querySelector(".bottomnav").style.display = "flex";
    boot();
  } catch (e) {
    const msg = e.error || "Google sign-in failed";
    const errEl = document.getElementById("login-error") || document.getElementById("reg-error");
    if (errEl) { errEl.textContent = msg; errEl.classList.add("show"); }
  }
}

function renderGoogleButton(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = `<button class="google-signin-btn" id="${containerId}-btn" type="button">${GOOGLE_BTN_SVG}</button>`;
  const btn = container.querySelector(`#${containerId}-btn`);

  btn.addEventListener("click", async () => {
    btn.disabled = true;
    btn.style.opacity = "0.6";

    if (IS_CAPACITOR) {
      const serverUrl = API_BASE || "http://192.168.1.2:3000";
      const gsiUrl = serverUrl + "/api/auth/google/start";
      try {
        const { Browser } = Capacitor.Plugins;
        await Browser.open({ url: gsiUrl });
      } catch(e) {
        window.open(gsiUrl, "_blank");
      }
      btn.disabled = false;
      btn.style.opacity = "1";
      return;
    }

    btn.disabled = false;
    btn.style.opacity = "1";
  });
}

/* ---------- AUTH SCREENS ---------- */
function showLogin(){
  document.querySelector(".app").style.display="none";
  document.querySelector(".bottomnav").style.display="none";
  const existing = document.getElementById("auth-root");
  if(existing) existing.remove();
  const wrap = document.createElement("div");
  wrap.id = "auth-root";
  wrap.className = "auth-screen";
  wrap.innerHTML = `
    <div class="auth-phone-frame">
    <div class="auth-phone-screen">
    <div class="auth-card">
      <div class="auth-logo"><span class="dot"></span><span>FUELGAUGE</span></div>
      <div class="auth-hero-icons">
        <div class="auth-hero-icon"><svg viewBox="0 0 24 24" fill="none" stroke="var(--neon-red)" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg></div>
        <div class="auth-hero-icon"><svg viewBox="0 0 24 24" fill="none" stroke="var(--teal)" stroke-width="1.5"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg></div>
        <div class="auth-hero-icon"><svg viewBox="0 0 24 24" fill="none" stroke="var(--amber)" stroke-width="1.5"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg></div>
      </div>
      <h2>Welcome back</h2>
      <p class="auth-sub">Sign in to continue your fitness journey</p>
      <div class="auth-error" id="login-error"></div>
      <label>Email address</label>
      <input type="email" id="login-email" placeholder="you@example.com" autocomplete="email">
      <label>Password</label>
      <div style="position:relative;">
        <input type="password" id="login-password" placeholder="Enter password" autocomplete="current-password" style="padding-right:44px;">
        <button class="pw-toggle" id="pw-toggle-login" type="button" style="position:absolute;right:10px;top:50%;transform:translateY(-50%);background:none;border:none;color:var(--ink-dim);cursor:pointer;padding:4px;">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
        </button>
      </div>
      <button class="btn btn-primary" id="login-btn">
        <span>Sign In</span>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-left:8px;vertical-align:middle;"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
      </button>
      <div class="auth-divider"><span>or</span></div>
      <div id="google-login-btn" style="margin-bottom:10px;"></div>
      <div class="auth-switch">Don't have an account? <a id="goto-register">Create one</a></div>
      <div class="auth-features">
        <div class="auth-feature"><span style="color:var(--teal);">&#10003;</span> Track calories & macros</div>
        <div class="auth-feature"><span style="color:var(--teal);">&#10003;</span> Custom workout plans</div>
        <div class="auth-feature"><span style="color:var(--teal);">&#10003;</span> Progress tracking</div>
      </div>
    </div>
    </div>
    </div>`;
  document.body.appendChild(wrap);

  document.getElementById("pw-toggle-login").onclick = ()=>{
    const inp = document.getElementById("login-password");
    inp.type = inp.type==="password" ? "text" : "password";
  };
  document.getElementById("goto-register").onclick = ()=>{ wrap.remove(); showRegister(); };
  renderGoogleButton("google-login-btn");
  document.getElementById("login-btn").onclick = async ()=>{
    const email = document.getElementById("login-email").value.trim();
    const password = document.getElementById("login-password").value;
    const errEl = document.getElementById("login-error");
    if(!email || !password){ errEl.textContent="Fill in all fields"; errEl.classList.add("show"); return; }
    try {
      const res = await api("/auth/login", { method:"POST", body:JSON.stringify({email,password}) });
      if (res.token) localStorage.setItem("fg_token", res.token);
      currentUser = { email: res.email, name: res.name, avatar: res.avatar };
      isAdmin = res.admin || false;
      wrap.remove();
      document.querySelector(".app").style.display="flex";
      document.querySelector(".bottomnav").style.display="flex";
      boot();
    } catch(e){
      const msg = e.error || (e.status===403 ? "Email not verified" : e.status===401 ? "Invalid email or password" : "Connection error");
      errEl.textContent=msg; errEl.classList.add("show");
    }
  };
}

function showRegister(){
  const existing = document.getElementById("auth-root");
  if(existing) existing.remove();
  const wrap = document.createElement("div");
  wrap.id = "auth-root";
  wrap.className = "auth-screen";
  wrap.innerHTML = `
    <div class="auth-phone-frame">
    <div class="auth-phone-screen">
    <div class="auth-card">
      <div class="auth-logo"><span class="dot"></span><span>FUELGAUGE</span></div>
      <div class="auth-hero-icons">
        <div class="auth-hero-icon"><svg viewBox="0 0 24 24" fill="none" stroke="var(--neon-red)" stroke-width="1.5"><path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg></div>
        <div class="auth-hero-icon"><svg viewBox="0 0 24 24" fill="none" stroke="var(--teal)" stroke-width="1.5"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg></div>
        <div class="auth-hero-icon"><svg viewBox="0 0 24 24" fill="none" stroke="var(--amber)" stroke-width="1.5"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg></div>
      </div>
      <h2>Create account</h2>
      <p class="auth-sub">Start your transformation today</p>
      <div class="auth-error" id="reg-error"></div>
      <label>Full name</label>
      <input type="text" id="reg-name" placeholder="John Doe" autocomplete="name">
      <label>Email address</label>
      <input type="email" id="reg-email" placeholder="you@example.com" autocomplete="email">
      <label>Password</label>
      <div style="position:relative;">
        <input type="password" id="reg-password" placeholder="Min 6 characters" autocomplete="new-password" style="padding-right:44px;">
        <button class="pw-toggle" id="pw-toggle-reg" type="button" style="position:absolute;right:10px;top:50%;transform:translateY(-50%);background:none;border:none;color:var(--ink-dim);cursor:pointer;padding:4px;">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
        </button>
      </div>
      <label>Confirm password</label>
      <input type="password" id="reg-password2" placeholder="Repeat password" autocomplete="new-password">
      <button class="btn btn-primary" id="reg-btn">
        <span>Create Account</span>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-left:8px;vertical-align:middle;"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
      </button>
      <div class="auth-divider"><span>or</span></div>
      <div id="google-register-btn" style="margin-bottom:10px;"></div>
      <div class="auth-switch">Already have an account? <a id="goto-login">Sign in</a></div>
    </div>
    </div>
    </div>`;
  document.body.appendChild(wrap);
  document.getElementById("pw-toggle-reg").onclick = ()=>{
    const inp = document.getElementById("reg-password");
    inp.type = inp.type==="password" ? "text" : "password";
  };
  document.getElementById("goto-login").onclick = ()=>{ wrap.remove(); showLogin(); };
  renderGoogleButton("google-register-btn");
  document.getElementById("reg-btn").onclick = async ()=>{
    const name = document.getElementById("reg-name").value.trim();
    const email = document.getElementById("reg-email").value.trim();
    const password = document.getElementById("reg-password").value;
    const password2 = document.getElementById("reg-password2").value;
    const errEl = document.getElementById("reg-error");
    if(!email || !password){ errEl.textContent="Fill in email and password"; errEl.classList.add("show"); return; }
    if(password.length < 6){ errEl.textContent="Password must be at least 6 characters"; errEl.classList.add("show"); return; }
    if(password !== password2){ errEl.textContent="Passwords don't match"; errEl.classList.add("show"); return; }
    try {
      await api("/auth/register", { method:"POST", body:JSON.stringify({email,password,name}) });
      verifyEmail = email;
      wrap.remove();
      showVerify(email);
    } catch(e){
      const msg = e.error || (e.status===409 ? "Email already registered" : "Connection error");
      errEl.textContent=msg; errEl.classList.add("show");
    }
  };
}

function showVerify(email){
  const existing = document.getElementById("auth-root");
  if(existing) existing.remove();
  const wrap = document.createElement("div");
  wrap.id = "auth-root";
  wrap.className = "auth-screen";
  wrap.innerHTML = `
    <div class="auth-phone-frame">
    <div class="auth-phone-screen">
    <div class="auth-card">
      <div class="auth-logo"><span class="dot"></span><span>FUELGAUGE</span></div>
      <div class="verify-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="var(--teal)" stroke-width="1.5" width="48" height="48"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
      </div>
      <h2>Verify your email</h2>
      <p class="auth-sub">We sent a 6-digit code to <b style="color:var(--teal);word-break:break-all;">${email}</b></p>
      <div class="auth-error" id="verify-error"></div>
      <div class="verify-code-wrap" id="code-wrap">
        <input type="tel" maxlength="1" class="code-digit" data-idx="0">
        <input type="tel" maxlength="1" class="code-digit" data-idx="1">
        <input type="tel" maxlength="1" class="code-digit" data-idx="2">
        <input type="tel" maxlength="1" class="code-digit" data-idx="3">
        <input type="tel" maxlength="1" class="code-digit" data-idx="4">
        <input type="tel" maxlength="1" class="code-digit" data-idx="5">
      </div>
      <button class="btn btn-primary" id="verify-btn">Verify Email</button>
      <div class="resend-row">
        <span id="resend-timer" style="color:var(--ink-dim);font-size:12px;">Resend in 30s</span>
        <button class="btn-link" id="resend-btn" style="display:none;">Resend code</button>
      </div>
      <div class="auth-switch"><a id="goto-login2">Back to sign in</a></div>
    </div>
    </div>
    </div>`;
  document.body.appendChild(wrap);
  document.getElementById("goto-login2").onclick = ()=>{ wrap.remove(); showLogin(); };

  let countdown = 30;
  const timerEl = document.getElementById("resend-timer");
  const resendBtn = document.getElementById("resend-btn");
  const timer = setInterval(()=>{
    countdown--;
    if(countdown <= 0){ clearInterval(timer); timerEl.style.display="none"; resendBtn.style.display="inline"; }
    else timerEl.textContent = `Resend in ${countdown}s`;
  }, 1000);

  const digits = wrap.querySelectorAll(".code-digit");
  digits.forEach((input,i)=>{
    input.addEventListener("input", (e)=>{
      if(e.target.value && i < 5) digits[i+1].focus();
      if(e.target.value) input.classList.add("filled");
      else input.classList.remove("filled");
    });
    input.addEventListener("keydown", (e)=>{
      if(e.key==="Backspace" && !e.target.value && i > 0) digits[i-1].focus();
    });
    input.addEventListener("paste", (e)=>{
      e.preventDefault();
      const paste = (e.clipboardData || window.clipboardData).getData("text").replace(/\D/g,"").slice(0,6);
      paste.split("").forEach((ch,j)=>{ if(digits[j]) digits[j].value = ch; });
      if(paste.length > 0) digits[Math.min(paste.length,5)].focus();
    });
  });

  document.getElementById("verify-btn").onclick = async ()=>{
    const code = Array.from(digits).map(d=>d.value).join("");
    const errEl = document.getElementById("verify-error");
    if(code.length !== 6){ errEl.textContent="Enter all 6 digits"; errEl.classList.add("show"); return; }
    try {
      await api("/auth/verify", { method:"POST", body:JSON.stringify({email, code}) });
      toast("Email verified!");
      wrap.remove();
      showLogin();
    } catch(e){
      errEl.textContent="Invalid or expired code"; errEl.classList.add("show");
    }
  };
  resendBtn.onclick = async ()=>{
    try {
      await api("/auth/resend", { method:"POST", body:JSON.stringify({email}) });
      toast("New code sent!");
      countdown = 30; timerEl.style.display=""; resendBtn.style.display="none";
      timerEl.textContent = "Resend in 30s";
      setInterval(()=>{ countdown--; if(countdown<=0){timerEl.style.display="none";resendBtn.style.display="inline";}else timerEl.textContent=`Resend in ${countdown}s`; }, 1000);
    } catch(e){ toast("Failed to resend"); }
  };
  setTimeout(()=>digits[0].focus(), 300);
}

/* ---------- PREMIUM ---------- */
function showPremiumModal(){
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = `
    <div class="modal premium-modal" style="max-height:90vh;overflow-y:auto;">
      <div class="premium-header">
        <div class="premium-crown">
          <svg viewBox="0 0 24 24" fill="var(--amber)" width="36" height="36"><path d="M2 4l3 12h14l3-12-6 7-4-7-4 7-6-7zm3 16h14v2H5v-2z"/></svg>
        </div>
        <h2 style="color:var(--amber);margin-bottom:4px;">Upgrade Your Plan</h2>
        <p style="color:var(--ink-dim);font-size:13px;">Choose a plan that fits your fitness goals</p>
      </div>

      <div class="premium-plans" id="premium-plans" style="display:flex;gap:10px;flex-direction:column;">
        <div class="plan-option selected" data-plan="basic" style="text-align:left;padding:14px;border:2px solid var(--line);border-radius:12px;cursor:pointer;">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <div>
              <div class="plan-name" style="font-size:16px;font-weight:700;">Basic</div>
              <div style="color:var(--ink-dim);font-size:12px;margin-top:4px;">Exercise plans & workout tracking</div>
            </div>
            <div class="plan-price" style="font-size:20px;color:var(--teal);">NPR 2,000<span style="font-size:12px;color:var(--ink-dim);">/mo</span></div>
          </div>
          <ul style="margin-top:8px;padding-left:16px;color:var(--ink-dim);font-size:12px;">
            <li>Exercise plans</li>
            <li>Workout tracking</li>
            <li>Progress charts</li>
          </ul>
        </div>
        <div class="plan-option" data-plan="premium" style="text-align:left;padding:14px;border:2px solid var(--line);border-radius:12px;cursor:pointer;position:relative;">
          <div class="plan-badge" style="position:absolute;top:-8px;right:10px;background:var(--amber);color:#000;font-size:10px;padding:2px 8px;border-radius:8px;">BEST</div>
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <div>
              <div class="plan-name" style="font-size:16px;font-weight:700;">Premium</div>
              <div style="color:var(--ink-dim);font-size:12px;margin-top:4px;">Everything + Diet + Training</div>
            </div>
            <div class="plan-price" style="font-size:20px;color:var(--amber);">NPR 5,000<span style="font-size:12px;color:var(--ink-dim);">/mo</span></div>
          </div>
          <ul style="margin-top:8px;padding-left:16px;color:var(--ink-dim);font-size:12px;">
            <li>Everything in Basic</li>
            <li>Detailed diet plans</li>
            <li>Training schedules</li>
            <li>Personalized macros</li>
            <li>Priority support</li>
          </ul>
        </div>
      </div>

      <div style="margin-top:16px;">
        <h3 style="font-size:14px;margin-bottom:8px;color:var(--ink);">Payment Method</h3>
        <div id="payment-methods" style="display:flex;flex-direction:column;gap:8px;">
          <div class="plan-option selected" data-method="esewa" style="display:flex;align-items:center;gap:10px;padding:12px;border:2px solid var(--teal);border-radius:10px;cursor:pointer;">
            <div style="width:40px;height:40px;background:#60bb46;border-radius:8px;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:900;font-size:14px;">eS</div>
            <div><b style="font-size:13px;">eSewa</b><p style="color:var(--ink-dim);font-size:11px;">Send payment via eSewa app</p></div>
          </div>
          <div class="plan-option" data-method="bank" style="display:flex;align-items:center;gap:10px;padding:12px;border:2px solid var(--line);border-radius:10px;cursor:pointer;">
            <div style="width:40px;height:40px;background:var(--neon-red);border-radius:8px;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:900;font-size:12px;">BANK</div>
            <div><b style="font-size:13px;">Bank Transfer</b><p style="color:var(--ink-dim);font-size:11px;">Transfer to our bank account</p></div>
          </div>
        </div>
      </div>

      <div id="payment-details" style="margin-top:12px;padding:12px;background:var(--panel-raised);border-radius:10px;font-size:12px;">
        <div id="esewa-details">
          <p style="color:var(--teal);font-weight:700;margin-bottom:6px;">eSewa Payment</p>
          <p>eSewa ID: <b>9804322858</b></p>
          <p>Name: <b>FUELGAUGE</b></p>
          <p style="color:var(--ink-dim);margin-top:4px;">Send the exact amount, then click Confirm Payment below.</p>
        </div>
        <div id="bank-details" style="display:none;">
          <p style="color:var(--neon-red);font-weight:700;margin-bottom:6px;">Bank Transfer</p>
          <p>Bank: <b>Nabil Bank</b></p>
          <p>Account Name: <b>FUELGAUGE Fitness Pvt. Ltd.</b></p>
          <p>Account No: <b>01234567890123</b></p>
          <p>Amount: <b id="bank-amount">NPR 2,000</b></p>
          <p style="color:var(--ink-dim);margin-top:4px;">Transfer the exact amount, then click Confirm Payment below.</p>
        </div>
      </div>

      <button class="btn btn-premium" id="premium-activate-btn" style="margin-top:12px;">Confirm Payment & Activate</button>
      <button class="btn btn-ghost" id="premium-cancel" style="margin-top:8px;">Maybe later</button>
    </div>`;
  document.body.appendChild(overlay);

  let selectedPlan = "basic";
  let selectedMethod = "esewa";

  overlay.querySelectorAll("#premium-plans .plan-option").forEach(el=>{
    el.addEventListener("click", ()=>{
      overlay.querySelectorAll("#premium-plans .plan-option").forEach(p=>p.classList.remove("selected"));
      el.classList.add("selected");
      selectedPlan = el.dataset.plan;
    });
  });

  overlay.querySelectorAll("#payment-methods .plan-option").forEach(el=>{
    el.addEventListener("click", ()=>{
      overlay.querySelectorAll("#payment-methods .plan-option").forEach(p=>{p.classList.remove("selected"); p.style.borderColor="var(--line)";});
      el.classList.add("selected"); el.style.borderColor="var(--teal)";
      selectedMethod = el.dataset.method;
      document.getElementById("esewa-details").style.display = selectedMethod==="esewa" ? "" : "none";
      document.getElementById("bank-details").style.display = selectedMethod==="bank" ? "" : "none";
    });
  });

  document.getElementById("premium-cancel").onclick = ()=>overlay.remove();
  document.getElementById("premium-activate-btn").onclick = async ()=>{
    const btn = document.getElementById("premium-activate-btn");
    btn.disabled = true; btn.textContent = "Processing...";
    try {
      await api("/premium/activate", { method:"POST", body:JSON.stringify({planType: selectedPlan}) });
      isPremium = true;
      currentPlan = selectedPlan;
      overlay.remove();
      toast("Premium activated! You now have full access.");
      renderView();
    } catch(e){
      toast("Activation failed. Try again.");
      btn.disabled = false; btn.textContent = "Confirm Payment & Activate";
    }
  };
}

function premiumBadge(){
  if(!isPremium) return "";
  const label = currentPlan === "premium" ? "PREMIUM" : currentPlan === "basic" ? "BASIC" : "PRO";
  const color = currentPlan === "premium" ? "var(--amber)" : "var(--teal)";
  return `<span class="premium-badge" style="background:${color};color:#000;font-size:10px;padding:2px 6px;border-radius:4px;">${label}</span>`;
}

function premiumLock(planKey){
  return `<div class="premium-lock" onclick="showPremiumModal()">
    <svg viewBox="0 0 24 24" fill="none" stroke="var(--amber)" stroke-width="2" width="20" height="20"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
    <span>Upgrade to unlock</span>
  </div>`;
}

const HERO_IMAGES = {
  today: "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=800&h=400&fit=crop&q=85",
  food: "https://images.unsplash.com/photo-1490645935967-10de6ba17061?w=800&h=400&fit=crop&q=85",
  train: "https://images.unsplash.com/photo-1581009146145-b5ef050c2e1e?w=800&h=400&fit=crop&q=85",
  gyms: "https://images.unsplash.com/photo-1540497077202-7c8a3999166f?w=800&h=400&fit=crop&q=85",
  progress: "https://images.unsplash.com/photo-1552674605-db6ffd4facb5?w=800&h=400&fit=crop&q=85",
};

const QUOTES = {
  today: ["Push yourself. No one else is going to do it for you.", "Discipline is choosing between what you want now and what you want most.", "The only bad workout is the one that didn't happen."],
  food: ["You can't out-train a bad diet.", "Fuel the machine, not the craving.", "Eat clean, train dirty."],
  train: ["Sweat is just fat crying.", "The pain you feel today is the strength you feel tomorrow.", "No shortcuts. Just work."],
  gyms: ["Find your zone. Own your space.", "Every rep counts. Every set matters.", "Show up. That's half the battle."],
  progress: ["Progress, not perfection.", "Small steps every day lead to big results.", "Compare yourself to who you were yesterday."],
};

const TRAIN_IMAGES = [
  "https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=400&h=200&fit=crop&q=80",
  "https://images.unsplash.com/photo-1583454110551-21f2fa2afe61?w=400&h=200&fit=crop&q=80",
  "https://images.unsplash.com/photo-1517963879433-6ad2b056d712?w=400&h=200&fit=crop&q=80",
];

const PLANS = {
  "push-pull-legs": { label:"PPL", img: TRAIN_IMAGES[0], premium: false, days:[
    {day:"Push", exercises:[{n:"Bench Press",s:"4x6-8"},{n:"Overhead Press",s:"3x8-10"},{n:"Incline DB Press",s:"3x10"},{n:"Lateral Raise",s:"3x12"},{n:"Tricep Pushdown",s:"3x12"}]},
    {day:"Pull", exercises:[{n:"Deadlift",s:"4x5"},{n:"Pull-up",s:"3x8"},{n:"Barbell Row",s:"3x10"},{n:"Face Pull",s:"3x15"},{n:"Bicep Curl",s:"3x12"}]},
    {day:"Legs", exercises:[{n:"Back Squat",s:"4x6"},{n:"Romanian Deadlift",s:"3x10"},{n:"Leg Press",s:"3x12"},{n:"Calf Raise",s:"4x15"},{n:"Plank",s:"3x45s"}]}
  ]},
  "full-body": { label:"Full Body", img: TRAIN_IMAGES[1], premium: false, days:[
    {day:"Day A", exercises:[{n:"Squat",s:"3x8"},{n:"Bench Press",s:"3x8"},{n:"Barbell Row",s:"3x10"},{n:"Plank",s:"3x40s"}]},
    {day:"Day B", exercises:[{n:"Deadlift",s:"3x6"},{n:"Overhead Press",s:"3x8"},{n:"Lat Pulldown",s:"3x10"},{n:"Side Plank",s:"3x30s"}]}
  ]},
  "cardio": { label:"Cardio", img: TRAIN_IMAGES[2], premium: false, days:[
    {day:"Intervals", exercises:[{n:"Sprint 30s / Walk 90s",s:"8 rounds"},{n:"Cool-down jog",s:"10 min"}]},
    {day:"Steady", exercises:[{n:"Run / Bike",s:"35 min @ moderate"}]},
    {day:"Mobility", exercises:[{n:"Full body stretch flow",s:"20 min"},{n:"Foam rolling",s:"10 min"}]}
  ]},
  "home-bodyweight": { label:"Bodyweight", img: TRAIN_IMAGES[0], premium: false, days:[
    {day:"Upper", exercises:[{n:"Push-up",s:"4x15"},{n:"Pike Push-up",s:"3x10"},{n:"Tricep Dip",s:"3x12"},{n:"Superman",s:"3x15"}]},
    {day:"Lower", exercises:[{n:"Bodyweight Squat",s:"4x20"},{n:"Lunge",s:"3x12/side"},{n:"Glute Bridge",s:"3x15"},{n:"Wall Sit",s:"3x40s"}]}
  ]},
  "bodybuilding": { label:"Bodybuilding", img: "https://images.unsplash.com/photo-1583454110551-21f2fa2afe61?w=400&h=200&fit=crop&q=80", premium: true, days:[
    {day:"Chest & Biceps", exercises:[{n:"Incline Barbell Press",s:"4x8"},{n:"Flat DB Press",s:"3x10"},{n:"Cable Fly",s:"3x12"},{n:"Preacher Curl",s:"3x10"},{n:"Hammer Curl",s:"3x12"}]},
    {day:"Back & Triceps", exercises:[{n:"Weighted Pull-up",s:"4x6"},{n:"T-Bar Row",s:"3x8"},{n:"Seated Cable Row",s:"3x10"},{n:"Skull Crusher",s:"3x10"},{n:"Tricep Dip",s:"3x12"}]},
    {day:"Legs & Shoulders", exercises:[{n:"Front Squat",s:"4x6"},{n:"Leg Curl",s:"3x10"},{n:"Leg Extension",s:"3x12"},{n:"Military Press",s:"4x8"},{n:"Lateral Raise",s:"4x15"}]},
    {day:"Arms & Abs", exercises:[{n:"Close Grip Bench",s:"3x8"},{n:"EZ Bar Curl",s:"3x10"},{n:"Overhead Extension",s:"3x12"},{n:"Concentration Curl",s:"3x12"},{n:"Hanging Leg Raise",s:"3x15"}]}
  ]},
  "powerlifting": { label:"Powerlifting", img: "https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=400&h=200&fit=crop&q=80", premium: true, days:[
    {day:"Squat Day", exercises:[{n:"Back Squat",s:"5x3 @85%"},{n:"Pause Squat",s:"3x5"},{n:"Leg Press",s:"3x10"},{n:"Leg Curl",s:"3x10"},{n:"Ab Wheel",s:"3x10"}]},
    {day:"Bench Day", exercises:[{n:"Bench Press",s:"5x3 @85%"},{n:"Close Grip Bench",s:"3x6"},{n:"Pause Bench",s:"3x5"},{n:"DB Fly",s:"3x12"},{n:"Tricep Pushdown",s:"3x12"}]},
    {day:"Deadlift Day", exercises:[{n:"Deadlift",s:"5x2 @90%"},{n:"Romanian Deadlift",s:"3x8"},{n:"Barbell Row",s:"3x8"},{n:"Pull-up",s:"3x max"},{n:"Bicep Curl",s:"3x12"}]}
  ]},
  "calisthenics-pro": { label:"Calisthenics Pro", img: "https://images.unsplash.com/photo-1517963879433-6ad2b056d712?w=400&h=200&fit=crop&q=80", premium: true, days:[
    {day:"Upper Push", exercises:[{n:"Muscle-up",s:"5x3"},{n:"Handstand Push-up",s:"4x5"},{n:"Ring Dips",s:"3x8"},{n:"Pseudo Planche Push-up",s:"3x8"},{n:"L-sit Hold",s:"3x30s"}]},
    {day:"Upper Pull", exercises:[{n:"Weighted Pull-up",s:"5x3"},{n:"Front Lever Row",s:"3x5"},{n:"Archer Pull-up",s:"3x6/side"},{n:"Muscle-up Transition",s:"3x5"},{n:"Hanging Leg Raise",s:"3x12"}]},
    {day:"Legs & Core", exercises:[{n:"Pistol Squat",s:"4x5/side"},{n:"Nordic Curl",s:"3x6"},{n:"Shrimp Squat",s:"3x6/side"},{n:"Dragon Flag",s:"3x8"},{n:"Human Flag Hold",s:"3x15s"}]}
  ]}
};

const FOOD_IMAGES = {
  Protein: "https://images.unsplash.com/photo-1532550907401-a500c9a57435?w=120&h=80&fit=crop&q=80",
  Grain: "https://images.unsplash.com/photo-1586201375761-83865001e31c?w=120&h=80&fit=crop&q=80",
  Vegetable: "https://images.unsplash.com/photo-1540420773420-3366772f4999?w=120&h=80&fit=crop&q=80",
  Fruit: "https://images.unsplash.com/photo-1619566636858-adf3ef46400b?w=120&h=80&fit=crop&q=80",
  Dairy: "https://images.unsplash.com/photo-1628088062854-d1870b4553da?w=120&h=80&fit=crop&q=80",
  Fat: "https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?w=120&h=80&fit=crop&q=80",
  "Mixed dish": "https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=120&h=80&fit=crop&q=80",
  Drink: "https://images.unsplash.com/photo-1544145945-f90425340c7e?w=120&h=80&fit=crop&q=80",
  Snack: "https://images.unsplash.com/photo-1622398925373-3f91b1e275f5?w=120&h=80&fit=crop&q=80",
  Carb: "https://images.unsplash.com/photo-1586201375761-83865001e31c?w=120&h=80&fit=crop&q=80",
};

/* ---------- API helpers ---------- */
function getToken() { return localStorage.getItem("fg_token"); }

async function api(path, opts = {}) {
  const token = getToken();
  const headers = { "Content-Type": "application/json", ...opts.headers };
  if (token) headers["Authorization"] = "Bearer " + token;
  const res = await fetch(API + path, { ...opts, headers });
  if (res.status === 401) {
    localStorage.removeItem("fg_token");
    localStorage.removeItem("fg_user");
    currentUser = null;
    showLogin();
    throw { status: 401, error: "Session expired" };
  }
  const data = await res.json();
  if (!res.ok) throw { status: res.status, ...data };
  return data;
}

function toast(msg){
  const t = document.getElementById("toast");
  t.textContent = msg; t.classList.add("show");
  setTimeout(()=>t.classList.remove("show"), 1800);
}

function randomQuote(view){
  const q = QUOTES[view] || QUOTES.today;
  return q[Math.floor(Math.random()*q.length)];
}

function setHero(view){
  const hero = document.getElementById("hero");
  hero.className = "hero";
  hero.innerHTML = `
    <img src="${HERO_IMAGES[view]}" alt="${view} hero" loading="lazy">
    <div class="hero-text">
      <div class="quote">${randomQuote(view)}</div>
      <div class="hero-sub">${view === "today" ? "Daily overview" : view === "food" ? "Nutrition tracker" : view === "train" ? "Workout plans" : view === "gyms" ? "Find nearby" : "Your journey"}</div>
    </div>`;
}

/* ---------- Boot ---------- */
async function boot(){
  const token = getToken();
  if(!token && !currentUser){ showLogin(); return; }
  try{
    const [profileRes, premRes, adminRes] = await Promise.all([api("/profile"), api("/premium/status"), api("/admin/check")]);
    profile = profileRes;
    isPremium = premRes.premium;
    currentPlan = premRes.plan || "";
    isAdmin = adminRes.admin;
    if (!currentUser) {
      try { const u = await api("/user"); currentUser = { email: u.email, name: u.name, avatar: u.avatar }; } catch(e) { currentUser = { email: "" }; }
    }
  }catch(e){
    if (e.status === 401) { showLogin(); return; }
    toast("Could not reach server"); return;
  }
  if(!profile){ showOnboarding(); return; }
  try{
    workoutsState = await api("/workouts");
  }catch(e){ /* defaults ok */ }
  renderAll();
}

document.getElementById("prevDay").onclick = ()=> shiftDay(-1);
document.getElementById("nextDay").onclick = ()=> shiftDay(1);
function shiftDay(delta){
  const d = new Date(viewingDate);
  d.setDate(d.getDate()+delta);
  viewingDate = d.toISOString().slice(0,10);
  renderView();
}

function renderAll(){
  document.querySelectorAll(".navbtn").forEach(b=>b.classList.toggle("active", b.dataset.view===currentView));
  updateDayLabel();
  setHero(currentView);
  renderView();
}
function updateDayLabel(){
  const lbl = document.getElementById("dayLabel");
  if(viewingDate === todayStr()) lbl.textContent = "Today";
  else lbl.textContent = new Date(viewingDate).toLocaleDateString(undefined,{month:"short",day:"numeric"});
}

async function renderView(){
  const c = document.getElementById("content");
  try{
  if(currentView==="today") c.innerHTML = await renderToday();
  else if(currentView==="food") c.innerHTML = await renderFood();
  else if(currentView==="train") c.innerHTML = renderTrain();
  else if(currentView==="gyms") c.innerHTML = renderGyms();
  else if(currentView==="progress") c.innerHTML = await renderProgress();
  else if(currentView==="diet"){
    if(!isPremium){
      c.innerHTML = `<div class="card" style="padding:20px;text-align:center;">
        <h3 style="color:var(--amber);">Premium Feature</h3>
        <p style="color:var(--ink-dim);margin:10px 0;">Diet plans are available for Premium subscribers only.</p>
        <button class="btn btn-premium" onclick="showPremiumModal()">Upgrade to Premium - NPR 5,000/mo</button>
      </div>`;
    } else {
      c.innerHTML = await renderDietPlan();
    }
  }
  else if(currentView==="admin") c.innerHTML = await renderAdmin();
  }catch(e){ console.error("renderView error:", e); c.innerHTML = '<div class="card" style="padding:20px;text-align:center;"><h3>Something went wrong</h3><p style="color:var(--ink-dim);">Try restarting the app.</p></div>'; }
  attachHandlers();
  const dietTab = document.getElementById("nav-diet");
  if(dietTab) dietTab.style.display = isPremium ? "" : "none";
  if(isAdmin) document.getElementById("nav-admin").style.display="";
}

/* ---------- ONBOARDING ---------- */
function showOnboarding(){
  document.querySelector(".loading")?.remove();
  document.getElementById("hero").classList.add("hidden");
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = `
    <div class="modal" style="background-image:url('https://images.unsplash.com/photo-1599058945522-28d584b6f0ff?w=500&h=600&fit=crop&q=80');background-size:cover;background-position:center;position:relative;">
      <div style="position:absolute;inset:0;background:rgba(21,24,33,0.92);border-radius:18px;"></div>
      <div style="position:relative;z-index:1;">
      <h2 style="text-align:center;">Set up your engine</h2>
      <p class="smallnote" style="text-align:center;">Calculates your daily calorie & macro targets.</p>
      <div class="grid2">
        <div><label>Age</label><input type="number" id="ob-age" placeholder="28"></div>
        <div><label>Sex</label><select id="ob-sex"><option value="male">Male</option><option value="female">Female</option></select></div>
      </div>
      <div class="grid2">
        <div><label>Height (cm)</label><input type="number" id="ob-height" placeholder="175"></div>
        <div><label>Weight (kg)</label><input type="number" id="ob-weight" placeholder="70"></div>
      </div>
      <label>Activity level</label>
      <select id="ob-activity">
        <option value="1.2">Sedentary</option>
        <option value="1.375">Light (1-3x/week)</option>
        <option value="1.55" selected>Moderate (3-5x/week)</option>
        <option value="1.725">Active (6-7x/week)</option>
        <option value="1.9">Very active</option>
      </select>
      <label>Goal</label>
      <select id="ob-goal">
        <option value="-500">Lose weight</option>
        <option value="0" selected>Maintain weight</option>
        <option value="300">Gain muscle</option>
      </select>
      <button class="btn btn-primary" id="ob-save" style="margin-top:10px;">Calculate & start</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  document.getElementById("ob-save").onclick = async ()=>{
    const body = {
      age: parseFloat(document.getElementById("ob-age").value)||28,
      sex: document.getElementById("ob-sex").value,
      height: parseFloat(document.getElementById("ob-height").value)||175,
      weight: parseFloat(document.getElementById("ob-weight").value)||70,
      activity: parseFloat(document.getElementById("ob-activity").value),
      goal: parseFloat(document.getElementById("ob-goal").value),
    };
    profile = await api("/profile", { method:"POST", body: JSON.stringify(body) });
    await api("/weight", { method:"POST", body: JSON.stringify({ date: todayStr(), weight: body.weight }) });
    overlay.remove();
    document.getElementById("content").innerHTML = "";
    renderAll();
  };
}

/* ---------- TODAY ---------- */
async function dayTotals(date){
  let entries = [];
  try { entries = await api("/foodlog?date=" + date); } catch(e){ entries = []; }
  return entries.reduce((a,e)=>({cal:a.cal+e.cal,protein:a.protein+e.protein,carb:a.carb+e.carb,fat:a.fat+e.fat}), {cal:0,protein:0,carb:0,fat:0});
}

function gaugeSVG(pct){
  const clamped = Math.max(0, Math.min(pct, 1.15));
  const angle = -90 + clamped*180;
  const arcColor = pct > 1 ? "var(--danger)" : pct > 0.85 ? "var(--amber)" : "var(--teal)";
  const glowColor = pct > 1 ? "rgba(255,92,92,0.4)" : pct > 0.85 ? "rgba(255,176,32,0.4)" : "rgba(0,229,160,0.4)";
  return `
  <svg viewBox="0 0 220 130" width="220" height="130">
    <defs>
      <filter id="glow"><feGaussianBlur stdDeviation="3" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    </defs>
    <path d="M 15 115 A 95 95 0 0 1 205 115" fill="none" stroke="#252a38" stroke-width="14" stroke-linecap="round"/>
    <path d="M 15 115 A 95 95 0 0 1 205 115" fill="none" stroke="${arcColor}" stroke-width="14" stroke-linecap="round"
      stroke-dasharray="${Math.min(clamped,1)*298} 298" filter="url(#glow)"/>
    <g transform="rotate(${angle} 110 115)">
      <line x1="110" y1="115" x2="110" y2="35" stroke="var(--cluster)" stroke-width="4" stroke-linecap="round"/>
      <circle cx="110" cy="115" r="7" fill="var(--cluster)"/>
    </g>
  </svg>`;
}

async function renderToday(){
  const t = await dayTotals(viewingDate);
  const target = (profile && profile.target) ? profile.target : {cal:2000,protein:150,carb:250,fat:65};
  const remaining = target.cal - t.cal;
  const pct = t.cal / target.cal;
  const proteinPct = Math.round((t.protein/target.protein)*100);
  const carbPct = Math.round((t.carb/target.carb)*100);
  const fatPct = Math.round((t.fat/target.fat)*100);

  // Load water
  try {
    const w = await api("/water?date=" + viewingDate);
    waterGlasses = w.glasses || 0;
  } catch(e) { waterGlasses = 0; }
  const waterGoal = 8;
  const waterPct = Math.min(Math.round((waterGlasses / waterGoal) * 100), 100);

  return `
  <div class="stats-grid">
    <div class="stat-box stat-red" style="background-image:url('https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=300&h=300&fit=crop&q=85');background-size:cover;background-position:center;">
      <div style="position:absolute;inset:0;background:linear-gradient(135deg,rgba(13,15,20,0.75) 0%,rgba(13,15,20,0.88) 100%);border-radius:14px;"></div>
      <div style="position:relative;z-index:1;">
        <div class="stat-val" style="color:var(--teal);">${t.cal}</div>
        <div class="stat-label">Consumed</div>
      </div>
    </div>
    <div class="stat-box stat-teal" style="background-image:url('https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=300&h=300&fit=crop&q=85');background-size:cover;background-position:center;">
      <div style="position:absolute;inset:0;background:linear-gradient(135deg,rgba(13,15,20,0.75) 0%,rgba(13,15,20,0.88) 100%);border-radius:14px;"></div>
      <div style="position:relative;z-index:1;">
        <div class="stat-val" style="color:${remaining>=0?'var(--ink)':'var(--danger)'};">${Math.abs(remaining)}</div>
        <div class="stat-label">${remaining>=0?"Remaining":"Over"}</div>
      </div>
    </div>
    <div class="stat-box stat-amber" style="background-image:url('https://images.unsplash.com/photo-1547592180-85f173990554?w=300&h=300&fit=crop&q=85');background-size:cover;background-position:center;">
      <div style="position:absolute;inset:0;background:linear-gradient(135deg,rgba(13,15,20,0.75) 0%,rgba(13,15,20,0.88) 100%);border-radius:14px;"></div>
      <div style="position:relative;z-index:1;">
        <div class="stat-val">${target.cal}</div>
        <div class="stat-label">Target</div>
      </div>
    </div>
    <div class="stat-box stat-red" style="background-image:url('https://images.unsplash.com/photo-1526506118085-60ce8714f8c5?w=300&h=300&fit=crop&q=85');background-size:cover;background-position:center;">
      <div style="position:absolute;inset:0;background:linear-gradient(135deg,rgba(13,15,20,0.75) 0%,rgba(13,15,20,0.88) 100%);border-radius:14px;"></div>
      <div style="position:relative;z-index:1;">
        <div class="stat-val">${Math.round(pct*100)}%</div>
        <div class="stat-label">of goal</div>
      </div>
    </div>
  </div>
  <div class="card card-bg" style="background-image:url('https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=800&h=500&fit=crop&q=85');padding:20px;">
    <h3>Calorie gauge</h3>
    <div class="gauge-wrap">
      ${gaugeSVG(pct)}
      <div class="gauge-readout">
        <div class="num">${Math.abs(remaining)}</div>
        <div class="unit">${remaining>=0?"kcal remaining":"kcal over"}</div>
      </div>
      <div class="gauge-sub">
        <div>Consumed<br><b>${t.cal}</b></div>
        <div style="text-align:center;">Target<br><b>${target.cal}</b></div>
        <div style="text-align:right;">Burned (est.)<br><b>0</b></div>
      </div>
    </div>
  </div>
  <div class="card card-bg" style="background-image:url('https://images.unsplash.com/photo-1490818387583-1baba5e638af?w=800&h=500&fit=crop&q=85');padding:20px;">
    <h3>Macros</h3>
    <div class="macrobars">
      ${macroRow("Protein", t.protein, target.protein, "var(--neon-red)", proteinPct)}
      ${macroRow("Carbs", t.carb, target.carb, "var(--teal)", carbPct)}
      ${macroRow("Fat", t.fat, target.fat, "var(--amber)", fatPct)}
    </div>
  </div>
  <div class="card" style="background:linear-gradient(135deg,rgba(0,229,160,0.08),rgba(0,150,200,0.08));border-color:rgba(0,229,160,0.3);padding:18px;">
    <h3 style="color:var(--teal);">Water Intake</h3>
    <div style="display:flex;align-items:center;gap:14px;margin-bottom:12px;">
      <div style="font-family:'Oswald',sans-serif;font-size:32px;font-weight:700;color:var(--teal);">${waterGlasses}</div>
      <div style="font-size:12px;color:var(--ink-dim);">/ ${waterGoal} glasses<br>${waterPct}% of daily goal</div>
    </div>
    <div class="barbg" style="height:10px;margin-bottom:12px;">
      <div class="barfg" style="width:${waterPct}%;background:linear-gradient(90deg,var(--teal),#00b8d4);"></div>
    </div>
    <div style="display:flex;gap:8px;">
      <button class="btn btn-teal" data-action="water-add" style="flex:2;">+ Add Glass</button>
      <button class="btn btn-ghost" data-action="water-reset" style="flex:1;">Reset</button>
    </div>
  </div>
  <div class="card" style="padding:0;overflow:hidden;">
    <div class="card-hero">
      <img src="https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=600&h=300&fit=crop&q=80" alt="workout" loading="lazy">
      <div class="card-hero-badge">TODAY</div>
      <div class="card-hero-label">
        <div class="ch-title">Quick Actions</div>
        <div class="ch-sub">Stay on track</div>
      </div>
    </div>
    <div style="padding:14px;">
      <div class="btn-row" style="margin-bottom:8px;">
        <button class="btn btn-primary" data-action="goto-food">+ Log food</button>
        <button class="btn btn-teal" data-action="goto-train">Today's workout</button>
      </div>
      <button class="btn btn-ghost" data-action="edit-profile">Edit profile & targets</button>
    </div>
  </div>`;
}
function macroRow(label,val,target,color,pct){
  const width = Math.min(pct, 100);
  return `<div class="macrorow">
    <div class="label">${label}</div>
    <div class="barbg"><div class="barfg" style="width:${width}%;background:${color};"></div></div>
    <div class="val">${Math.round(val)}/${target}g</div>
  </div>`;
}

/* ---------- FOOD (with live database search) ---------- */
async function renderFood(){
  let entries = [];
  try { entries = await api("/foodlog?date=" + viewingDate); } catch(e){ entries = []; }
  const t = entries.reduce((a,e)=>({cal:a.cal+e.cal,protein:a.protein+e.protein,carb:a.carb+e.carb,fat:a.fat+e.fat}), {cal:0,protein:0,carb:0,fat:0});

  const categories = ["Protein","Grain","Vegetable","Fruit","Dairy","Fat","Mixed dish","Drink","Snack"];
  const catIcons = categories.map(c => {
    const img = FOOD_IMAGES[c];
    return `<div class="food-cat-chip" data-cat="${c}">
      <img src="${img}" alt="${c}">
      ${c}
    </div>`;
  }).join("");

  const target = profile ? profile.target : {cal:2000,protein:150,carb:250,fat:65};
  const calPct = Math.min(Math.round((t.cal/target.cal)*100),999);

  return `
  <div class="card" style="padding:0;overflow:hidden;">
    <div class="card-hero" style="height:120px;">
      <img src="https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=600&h=250&fit=crop&q=80" alt="food" loading="lazy">
      <div class="card-hero-badge">${calPct}%</div>
      <div class="card-hero-label">
        <div class="ch-title">Food Log</div>
        <div class="ch-sub">${entries.length} items today</div>
      </div>
    </div>
  </div>
  <div class="food-summary">
    <div class="fs-item"><div class="fs-val" style="color:var(--teal);">${Math.round(t.cal)}</div><div class="fs-label">Calories</div></div>
    <div class="fs-item"><div class="fs-val" style="color:var(--neon-red);">${Math.round(t.protein)}g</div><div class="fs-label">Protein</div></div>
    <div class="fs-item"><div class="fs-val" style="color:var(--amber);">${Math.round(t.carb)}g</div><div class="fs-label">Carbs</div></div>
    <div class="fs-item"><div class="fs-val" style="color:#74b9ff;">${Math.round(t.fat)}g</div><div class="fs-label">Fat</div></div>
  </div>
  <div class="card card-bg food-search-card" style="background-image:url('https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=600&h=400&fit=crop&q=80');padding:18px;">
    <h3>Search food database</h3>
    <div class="searchwrap">
      <input id="f-search" placeholder="e.g. chicken breast, rice, apple..." autocomplete="off">
      <div id="f-suggestions"></div>
    </div>
    <div id="f-selected"></div>
    <label>Amount (grams)</label>
    <input id="f-grams" type="number" placeholder="100" value="100">
    <button class="btn btn-primary" data-action="add-food">Add to log</button>
    <div style="margin-top:14px;">
      <label>Quick categories</label>
      <div class="food-cats-grid" id="food-cats">${catIcons}</div>
      <div id="f-cat-results"></div>
    </div>
    <p class="smallnote" style="margin-top:6px;">Or log manually:</p>
    <div class="grid2">
      <input id="f-name-manual" placeholder="Custom food name">
      <input id="f-cal-manual" type="number" placeholder="Calories">
    </div>
    <button class="btn btn-ghost" data-action="add-food-manual">Add custom entry</button>
  </div>
  <div class="card card-bg" style="background-image:url('https://images.unsplash.com/photo-1498837167922-ddd27525d352?w=600&h=400&fit=crop&q=80');padding:18px;">
    <h3>${viewingDate===todayStr()?"Today":viewingDate} — ${Math.round(t.cal)} kcal</h3>
    ${entries.length===0 ? '<div class="empty">No food logged yet. Search above or pick a category to add your first meal.</div>' :
      entries.map(e=>{
        const catImg = FOOD_IMAGES[getCategoryForFood(e.name)] || FOOD_IMAGES["Mixed dish"];
        return `<div class="food-entry-card">
          <div class="fe-left">
            <img class="fe-img" src="${catImg}" alt="">
            <div>
              <div class="fe-name">${escapeHTML(e.name)}${e.grams?` <span style="color:var(--ink-dim);font-size:11px;">(${e.grams}g)</span>`:""}</div>
              <div class="fe-meta">P${Math.round(e.protein)} . C${Math.round(e.carb)} . F${Math.round(e.fat)}</div>
            </div>
          </div>
          <div class="fe-right">
            <div class="fe-cal">${Math.round(e.cal)}<span class="fe-unit"> kcal</span></div>
            <button class="del" data-action="del-food" data-id="${e._id}">x</button>
          </div>
        </div>`;
      }).join("")}
  </div>`;
}

function getCategoryForFood(name){
  const n = name.toLowerCase();
  if(n.includes("chicken")||n.includes("beef")||n.includes("egg")||n.includes("salmon")||n.includes("tuna")||n.includes("shrimp")||n.includes("pork")||n.includes("turkey")||n.includes("tofu")||n.includes("tempeh")||n.includes("paneer")||n.includes("protein")) return "Protein";
  if(n.includes("rice")||n.includes("oats")||n.includes("bread")||n.includes("pasta")||n.includes("quinoa")||n.includes("tortilla")||n.includes("bagel")||n.includes("granola")||n.includes("cereal")||n.includes("chapati")||n.includes("roti")) return "Grain";
  if(n.includes("broccoli")||n.includes("spinach")||n.includes("carrot")||n.includes("tomato")||n.includes("cucumber")||n.includes("pepper")||n.includes("onion")||n.includes("lettuce")||n.includes("mushroom")) return "Vegetable";
  if(n.includes("apple")||n.includes("banana")||n.includes("orange")||n.includes("grape")||n.includes("strawberr")||n.includes("blueberr")||n.includes("mango")||n.includes("pineapple")||n.includes("avocado")) return "Fruit";
  if(n.includes("milk")||n.includes("cheese")||n.includes("yogurt")||n.includes("butter")||n.includes("cottage")) return "Dairy";
  if(n.includes("oil")||n.includes("peanut butter")||n.includes("almond")||n.includes("walnut")||n.includes("cashew")||n.includes("chia")) return "Fat";
  if(n.includes("coffee")||n.includes("tea")||n.includes("juice")||n.includes("soda")||n.includes("beer")) return "Drink";
  if(n.includes("chocolate")||n.includes("chip")||n.includes("popcorn")||n.includes("bar")||n.includes("hummus")) return "Snack";
  return "Mixed dish";
}

let searchTimer = null;
function attachFoodSearch(){
  const input = document.getElementById("f-search");
  if(!input) return;
  input.addEventListener("input", ()=>{
    clearTimeout(searchTimer);
    document.querySelectorAll(".food-cat-chip").forEach(c=>c.classList.remove("active"));
    const q = input.value;
    searchTimer = setTimeout(async ()=>{
      if(!q.trim()){ document.getElementById("f-suggestions").innerHTML = ""; return; }
      const results = await api("/foods?q=" + encodeURIComponent(q));
      results.sort((a,b) => {
        const aMatch = a.name.toLowerCase().startsWith(q.toLowerCase()) ? 0 : 1;
        const bMatch = b.name.toLowerCase().startsWith(q.toLowerCase()) ? 0 : 1;
        return aMatch - bMatch || b.cal - a.cal;
      });
      renderSuggestions(results);
    }, 200);
  });
  input.addEventListener("focus", async ()=>{
    if(!input.value.trim()){
      const all = await api("/foods");
      renderSuggestions(all.slice(0, 30));
    }
  });
}

const CAT_SORT_KEY = {Protein:"protein",Grain:"carb",Vegetable:"protein",Fruit:"carb",Dairy:"protein",Fat:"fat","Mixed dish":"cal",Drink:"cal",Snack:"cal"};
const catColors = {Protein:"#ff6b6b",Grain:"#ffb020",Vegetable:"#00e5a0",Fruit:"#ff9f43",Dairy:"#74b9ff",Fat:"#fdcb6e","Mixed dish":"#a29bfe",Drink:"#55efc4",Snack:"#fd79a8"};

function attachFoodCats(){
  document.querySelectorAll(".food-cat-chip").forEach(chip=>{
    chip.addEventListener("click", async ()=>{
      const cat = chip.dataset.cat;
      document.querySelectorAll(".food-cat-chip").forEach(c=>c.classList.remove("active"));
      chip.classList.add("active");
      try{
        const results = await api("/foods?cat=" + encodeURIComponent(cat));
        const sortKey = CAT_SORT_KEY[cat] || "cal";
        results.sort((a,b) => b[sortKey] - a[sortKey]);
        renderCatResults(results);
        document.getElementById("f-search").value = "";
        const catBox = document.getElementById("f-cat-results");
        if(catBox) catBox.scrollIntoView({behavior:"smooth",block:"nearest"});
      }catch(e){ toast("Failed to load foods"); }
    });
  });
}

function renderCatResults(results){
  const box = document.getElementById("f-cat-results");
  if(!box) return;
  if(!results || results.length===0){ box.innerHTML = ""; return; }
  box.innerHTML = `<div class="cat-results-list">
    ${results.map((f,i)=>`<div class="suggest-item cat-result-item" data-idx="${i}">
      <div class="sg-info">
        <img src="${FOOD_IMAGES[f.category]||FOOD_IMAGES['Mixed dish']}" alt="" style="width:32px;height:24px;border-radius:6px;object-fit:cover;flex-shrink:0;">
        <div style="min-width:0;">
          <div class="sg-name">${escapeHTML(f.name)}</div>
          <div class="sg-cat" style="color:${catColors[f.category]||'var(--teal)'};">${f.category}</div>
        </div>
      </div>
      <div style="text-align:right;flex-shrink:0;">
        <div class="sg-cal">${f.cal} kcal</div>
        <div class="sg-macros">P${Math.round(f.protein)} C${Math.round(f.carb)} F${Math.round(f.fat)}</div>
      </div>
    </div>`).join("")}
  </div>`;
  box.querySelectorAll(".cat-result-item").forEach((el,i)=>{
    el.addEventListener("click", ()=>{
      selectedFood = results[i];
      box.innerHTML = "";
      document.querySelectorAll(".food-cat-chip").forEach(c=>c.classList.remove("active"));
      renderSelectedFood();
      document.getElementById("f-search").scrollIntoView({behavior:"smooth",block:"center"});
    });
  });
}

function renderSuggestions(results){
  const box = document.getElementById("f-suggestions");
  if(!box) return;
  if(results.length===0){ box.innerHTML = ""; return; }
  box.innerHTML = `<div class="suggestlist">
    ${results.map((f,i)=>`<div class="suggest-item" data-idx="${i}">
      <div class="sg-info">
        <img src="${FOOD_IMAGES[f.category]||FOOD_IMAGES['Mixed dish']}" alt="" style="width:32px;height:24px;border-radius:6px;object-fit:cover;flex-shrink:0;">
        <div style="min-width:0;">
          <div class="sg-name">${escapeHTML(f.name)}</div>
          <div class="sg-cat" style="color:${catColors[f.category]||'var(--teal)'};">${f.category}</div>
        </div>
      </div>
      <div style="text-align:right;flex-shrink:0;">
        <div class="sg-cal">${f.cal} kcal</div>
        <div class="sg-macros">P${Math.round(f.protein)} C${Math.round(f.carb)} F${Math.round(f.fat)}</div>
      </div>
    </div>`).join("")}
  </div>`;
  box.querySelectorAll(".suggest-item").forEach((el,i)=>{
    el.addEventListener("click", ()=>{
      selectedFood = results[i];
      document.getElementById("f-search").value = "";
      box.innerHTML = "";
      renderSelectedFood();
    });
  });
}
function renderSelectedFood(){
  const wrap = document.getElementById("f-selected");
  if(!wrap) return;
  if(!selectedFood){ wrap.innerHTML = ""; return; }
  wrap.innerHTML = `<div class="selected-food">
    <span style="display:flex;align-items:center;gap:8px;">
      <img src="${FOOD_IMAGES[selectedFood.category]||FOOD_IMAGES['Mixed dish']}" alt="" style="width:28px;height:20px;border-radius:4px;object-fit:cover;">
      ${escapeHTML(selectedFood.name)} — ${selectedFood.cal} kcal/100g
    </span>
    <span class="clear" data-action="clear-selected">x</span>
  </div>`;
}

/* ---------- TRAIN ---------- */
function renderTrain(){
  const planKey = workoutsState.activePlan;
  const plan = PLANS[planKey];
  const isPlanPremium = plan && plan.premium;
  const canUse = !isPlanPremium || isPremium;
  const completionSet = new Set(workoutsState.completion);
  const totalExercises = canUse ? plan.days.reduce((a,d)=>a+d.exercises.length,0) : 0;
  const doneCount = canUse ? plan.days.reduce((a,d,di)=>{
    return a + d.exercises.reduce((b,ex,ei)=>{
      return b + (completionSet.has(`${planKey}|${di}|${ei}`)?1:0);
    },0);
  },0) : 0;
  const progressPct = totalExercises ? Math.round((doneCount/totalExercises)*100) : 0;

  return `
  <div class="card" style="padding:0;overflow:hidden;">
    <div class="card-hero">
      <img src="${plan.img}" alt="workout" loading="lazy">
      <div class="card-hero-badge">${canUse ? progressPct+"% DONE" : "PREMIUM"}</div>
      <div class="card-hero-label">
        <div class="ch-title">${plan.label} Plan ${plan.premium && !isPremium ? '<span class="premium-tag">PRO</span>' : ''}</div>
        <div class="ch-sub">${canUse ? doneCount+"/"+totalExercises+" exercises" : "Upgrade to access"}</div>
      </div>
    </div>
  </div>
  ${!isPremium ? `<div class="card premium-banner" onclick="showPremiumModal()" style="cursor:pointer;background:linear-gradient(135deg,rgba(255,176,32,0.15),rgba(255,60,31,0.1));border:1px solid rgba(255,176,32,0.3);text-align:center;padding:16px;">
    <div style="font-size:24px;margin-bottom:6px;">&#128081;</div>
    <div style="font-family:'Oswald',sans-serif;font-size:14px;color:var(--amber);letter-spacing:1px;">UNLOCK PREMIUM PLANS</div>
    <div style="font-size:12px;color:var(--ink-dim);margin-top:4px;">Bodybuilding, Powerlifting, Calisthenics Pro & more</div>
  </div>` : ''}
  <div class="card card-bg" style="background-image:url('https://images.unsplash.com/photo-1581009146145-b5ef050c2e1e?w=600&h=600&fit=crop&q=80');padding:18px;">
    <h3>Training plan</h3>
    <div class="plan-tabs">
      ${Object.entries(PLANS).map(([k,p])=>`<div class="plan-tab ${k===planKey?"active":""} ${p.premium && !isPremium ? "plan-locked":""}" data-action="set-plan" data-plan="${k}">${p.label}${p.premium && !isPremium ? ' &#128274;':''}</div>`).join("")}
    </div>
    ${!canUse ? `<div class="premium-lock-card">
      <svg viewBox="0 0 24 24" fill="none" stroke="var(--amber)" stroke-width="2" width="32" height="32"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
      <p style="color:var(--amber);font-family:'Oswald',sans-serif;margin:12px 0 6px;font-size:14px;">PREMIUM PLAN</p>
      <p style="color:var(--ink-dim);font-size:12px;margin-bottom:14px;">Unlock advanced workout programs designed by professionals</p>
      <button class="btn btn-premium" onclick="showPremiumModal()">Upgrade Now</button>
    </div>` : `
    <div class="card" style="background:linear-gradient(135deg,rgba(0,229,160,0.06),rgba(0,150,200,0.06));border-color:rgba(0,229,160,0.25);padding:14px;">
      <h3 style="color:var(--teal);">Rest Timer</h3>
      <div style="display:flex;gap:6px;">
        <button class="btn btn-teal" data-action="start-rest" style="flex:1;font-size:12px;">60s</button>
        <button class="btn btn-teal" data-action="start-rest-90" style="flex:1;font-size:12px;">90s</button>
        <button class="btn btn-teal" data-action="start-rest-120" style="flex:1;font-size:12px;">2min</button>
        <button class="btn btn-teal" data-action="start-rest-180" style="flex:1;font-size:12px;">3min</button>
      </div>
    </div>`}
    ${plan.days.map((d,di)=>`
      <div style="margin-bottom:18px;">
        <div class="day-header">${d.day}</div>
        ${d.exercises.map((ex,ei)=>{
          const key = `${planKey}|${di}|${ei}`;
          const done = completionSet.has(key);
          return `<div class="exrow ${done?"done":""}">
            <div class="check ${done?"done":""}" data-action="toggle-ex" data-key="${key}">${done?"checkmark":""}</div>
            <div class="info"><div class="ex-name">${ex.n}</div><div class="ex-meta">${ex.s}</div></div>
          </div>`;
        }).join("")}
      </div>`).join("")}
  </div>`;
}

/* ---------- GYMS ---------- */
function renderGyms(){
  return `
  <div class="card" style="padding:0;overflow:hidden;">
    <div class="card-hero">
      <img src="https://images.unsplash.com/photo-1558618666-fcd25c85f82e?w=600&h=300&fit=crop&q=80" alt="gym" loading="lazy">
      <div class="card-hero-label">
        <div class="ch-title">Find Gyms</div>
        <div class="ch-sub">Near your location</div>
      </div>
    </div>
  </div>
  <div class="card card-bg" style="background-image:url('https://images.unsplash.com/photo-1540497077202-7c8a3999166f?w=600&h=500&fit=crop&q=80');padding:18px;">
    <h3>Nearest gyms</h3>
    <div class="locate-box">
      <div class="pin">pin</div>
      <p class="smallnote" style="margin-top:0;">Find gyms close to where you are right now.</p>
      <button class="btn btn-primary" data-action="locate">Use my location</button>
      ${lastLoc ? `<a class="maplink" target="_blank" href="https://www.google.com/maps/search/gyms/@${lastLoc.lat},${lastLoc.lng},14z">Open full results in Google Maps</a>
      <iframe class="gymmap" loading="lazy" src="https://maps.google.com/maps?q=gyms&z=14&output=embed&ll=${lastLoc.lat},${lastLoc.lng}"></iframe>` : ""}
    </div>
  </div>`;
}

/* ---------- PROGRESS ---------- */
async function renderProgress(){
  let log = [];
  try { log = await api("/weight"); } catch(e){ log = []; }
  const latest = log[log.length-1];
  const prev = log[log.length-2];
  const delta = (latest && prev) ? (latest.weight - prev.weight) : 0;
  const startWeight = log.length > 0 ? log[0].weight : null;
  const totalChange = (latest && startWeight) ? (latest.weight - startWeight) : 0;

  return `
  <div class="card" style="padding:0;overflow:hidden;">
    <div class="card-hero" style="height:140px;">
      <img src="https://images.unsplash.com/photo-1552674605-db6ffd4facb5?w=600&h=280&fit=crop&q=80" alt="progress" loading="lazy">
      <div class="card-hero-badge">${log.length} entries</div>
      <div class="card-hero-label">
        <div class="ch-title">Your Progress</div>
        <div class="ch-sub">Keep going</div>
      </div>
    </div>
  </div>
  <div class="card card-bg" style="background-image:url('https://images.unsplash.com/photo-1576678927484-cc907957088c?w=600&h=400&fit=crop&q=80');padding:18px;">
    <h3>Weight</h3>
    <div class="weightnow">
      <div class="num">${latest ? latest.weight : "--"}<span style="font-size:16px;color:var(--ink-dim);"> kg</span></div>
      ${prev ? `<div class="delta ${delta<=0?"down":"up"}">${delta>0?"+":""}${delta.toFixed(1)}kg vs last</div>`:""}
    </div>
    ${weightChart(log)}
    <div class="grid2" style="margin-top:14px;">
      <input id="w-date" type="date" value="${todayStr()}">
      <input id="w-val" type="number" step="0.1" placeholder="Weight (kg)">
    </div>
    <button class="btn btn-primary" data-action="add-weight">Log weight</button>
    <button class="btn btn-ghost" data-action="measurements" style="margin-top:8px;">Body Measurements</button>
  </div>
  <div class="card card-bg" style="background-image:url('https://images.unsplash.com/photo-1574680096145-d05b474e2155?w=600&h=500&fit=crop&q=80');padding:18px;">
    <h3>History</h3>
    ${log.length===0 ? '<div class="empty">No entries yet.</div>' :
      [...log].reverse().map((e,i)=>{
        const entryDelta = i < log.length-1 ? (log[log.length-1-i].weight - log[log.length-i].weight) : 0;
        return `<div class="entry">
          <div class="name">${e.date}</div>
          <div style="display:flex;align-items:center;gap:8px;">
            ${i < log.length-1 ? `<span style="font-size:10px;color:${entryDelta<=0?'var(--teal)':'var(--danger)'};font-family:'JetBrains Mono',monospace;">${entryDelta>0?'+':''}${entryDelta.toFixed(1)}</span>` : ""}
            <div class="cal">${e.weight} kg</div>
          </div>
        </div>`;
      }).join("")}
  </div>`;
}
function weightChart(log){
  if(log.length<2) return '<svg class="chart"></svg>';
  const w=320,h=120,pad=10;
  const vals = log.map(e=>e.weight);
  const min=Math.min(...vals), max=Math.max(...vals);
  const range=(max-min)||1;
  const pts = log.map((e,i)=>{
    const x = pad + (i/(log.length-1))*(w-pad*2);
    const y = h-pad - ((e.weight-min)/range)*(h-pad*2);
    return [x,y];
  });
  const path = pts.map((p,i)=>(i===0?"M":"L")+p[0].toFixed(1)+","+p[1].toFixed(1)).join(" ");
  const area = path + ` L${pts[pts.length-1][0]},${h-pad} L${pts[0][0]},${h-pad} Z`;
  return `<svg class="chart" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
    <defs>
      <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="rgba(0,229,160,0.3)"/>
        <stop offset="100%" stop-color="rgba(0,229,160,0)"/>
      </linearGradient>
    </defs>
    <path d="${area}" fill="url(#chartGrad)" stroke="none"/>
    <path d="${path}" fill="none" stroke="var(--teal)" stroke-width="2.5" stroke-linejoin="round" filter="url(#glow)"/>
    ${pts.map(p=>`<circle cx="${p[0]}" cy="${p[1]}" r="3.5" fill="var(--teal)" stroke="var(--panel)" stroke-width="1.5"/>`).join("")}
  </svg>`;
}

/* ---------- Event delegation ---------- */
function attachHandlers(){
  attachFoodSearch();
  attachFoodCats();
  renderSelectedFood();
  document.querySelectorAll("[data-action]").forEach(el=>{
    el.addEventListener("click", handleAction);
  });
}

async function handleAction(e){
  const action = e.currentTarget.dataset.action;
  if(action==="goto-food"){ currentView="food"; renderAll(); }
  else if(action==="goto-train"){ currentView="train"; renderAll(); }
  else if(action==="edit-profile"){ editProfileModal(); }
  else if(action==="add-food"){ await addFoodFromDb(); }
  else if(action==="add-food-manual"){ await addFoodManual(); }
  else if(action==="clear-selected"){ selectedFood=null; renderSelectedFood(); }
  else if(action==="del-food"){ await delFood(e.currentTarget.dataset.id); }
  else if(action==="set-plan"){
    workoutsState.activePlan = e.currentTarget.dataset.plan;
    await api("/workouts/plan", { method:"POST", body: JSON.stringify({ activePlan: workoutsState.activePlan }) });
    renderView();
  }
  else if(action==="toggle-ex"){
    const key = e.currentTarget.dataset.key;
    const result = await api("/workouts/toggle", { method:"POST", body: JSON.stringify({ key }) });
    if(result.done) workoutsState.completion.push(key);
    else workoutsState.completion = workoutsState.completion.filter(k=>k!==key);
    renderView();
  }
  else if(action==="locate"){ locateGyms(); }
  else if(action==="add-weight"){ await addWeight(); }
  else if(action==="water-add"){ await addWater(); }
  else if(action==="water-reset"){ await resetWater(); }
  else if(action==="start-rest"){ startRestTimer(60); }
  else if(action==="start-rest-90"){ startRestTimer(90); }
  else if(action==="start-rest-120"){ startRestTimer(120); }
  else if(action==="start-rest-180"){ startRestTimer(180); }
  else if(action==="stop-rest"){ stopRestTimer(); }
  else if(action==="measurements"){ showMeasurementsModal(); }
}

async function addFoodFromDb(){
  if(!selectedFood){ toast("Search and pick a food first"); return; }
  const grams = parseFloat(document.getElementById("f-grams").value) || 100;
  const scale = grams/100;
  const entry = {
    date: viewingDate,
    name: selectedFood.name,
    grams,
    cal: Math.round(selectedFood.cal*scale),
    protein: +(selectedFood.protein*scale).toFixed(1),
    carb: +(selectedFood.carb*scale).toFixed(1),
    fat: +(selectedFood.fat*scale).toFixed(1),
  };
  await api("/foodlog", { method:"POST", body: JSON.stringify(entry) });
  selectedFood = null;
  renderView();
  toast("Logged");
}
async function addFoodManual(){
  const name = document.getElementById("f-name-manual").value.trim();
  const cal = parseFloat(document.getElementById("f-cal-manual").value);
  if(!name || isNaN(cal)){ toast("Add a name and calories"); return; }
  await api("/foodlog", { method:"POST", body: JSON.stringify({ date: viewingDate, name, cal, protein:0, carb:0, fat:0 }) });
  renderView();
  toast("Logged");
}
async function delFood(id){
  await api("/foodlog/" + id, { method:"DELETE" });
  renderView();
}
async function addWeight(){
  const date = document.getElementById("w-date").value || todayStr();
  const weight = parseFloat(document.getElementById("w-val").value);
  if(isNaN(weight)){ toast("Enter a weight"); return; }
  await api("/weight", { method:"POST", body: JSON.stringify({ date, weight }) });
  renderView();
  toast("Weight saved");
}
function locateGyms(){
  if(!navigator.geolocation){ toast("Location not supported"); return; }
  toast("Locating...");
  navigator.geolocation.getCurrentPosition(pos=>{
    lastLoc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
    renderView();
  }, ()=> toast("Location denied — enable it in browser settings"), { timeout: 8000 });
}

function editProfileModal(){
  const p = profile;
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = `
    <div class="modal" style="background-image:url('https://images.unsplash.com/photo-1583454110551-21f2fa2afe61?w=500&h=600&fit=crop&q=80');background-size:cover;background-position:center;position:relative;">
      <div style="position:absolute;inset:0;background:rgba(21,24,33,0.92);border-radius:18px;"></div>
      <div style="position:relative;z-index:1;">
      <h2>Edit profile</h2>
      <div class="grid2">
        <div><label>Age</label><input type="number" id="ep-age" value="${p.age}"></div>
        <div><label>Sex</label><select id="ep-sex"><option value="male" ${p.sex==="male"?"selected":""}>Male</option><option value="female" ${p.sex==="female"?"selected":""}>Female</option></select></div>
      </div>
      <div class="grid2">
        <div><label>Height (cm)</label><input type="number" id="ep-height" value="${p.height}"></div>
        <div><label>Weight (kg)</label><input type="number" id="ep-weight" value="${p.weight}"></div>
      </div>
      <label>Activity level</label>
      <select id="ep-activity">
        <option value="1.2" ${p.activity==1.2?"selected":""}>Sedentary</option>
        <option value="1.375" ${p.activity==1.375?"selected":""}>Light</option>
        <option value="1.55" ${p.activity==1.55?"selected":""}>Moderate</option>
        <option value="1.725" ${p.activity==1.725?"selected":""}>Active</option>
        <option value="1.9" ${p.activity==1.9?"selected":""}>Very active</option>
      </select>
      <label>Goal</label>
      <select id="ep-goal">
        <option value="-500" ${p.goal==-500?"selected":""}>Lose weight</option>
        <option value="0" ${p.goal==0?"selected":""}>Maintain weight</option>
        <option value="300" ${p.goal==300?"selected":""}>Gain muscle</option>
      </select>
      <div class="btn-row" style="margin-top:10px;">
        <button class="btn btn-ghost" id="ep-cancel">Cancel</button>
        <button class="btn btn-primary" id="ep-save">Save</button>
      </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  document.getElementById("ep-cancel").onclick = ()=>overlay.remove();
  document.getElementById("ep-save").onclick = async ()=>{
    const body = {
      age: parseFloat(document.getElementById("ep-age").value),
      sex: document.getElementById("ep-sex").value,
      height: parseFloat(document.getElementById("ep-height").value),
      weight: parseFloat(document.getElementById("ep-weight").value),
      activity: parseFloat(document.getElementById("ep-activity").value),
      goal: parseFloat(document.getElementById("ep-goal").value),
    };
    profile = await api("/profile", { method:"POST", body: JSON.stringify(body) });
    overlay.remove();
    renderAll();
    toast("Targets updated");
  };
}

function escapeHTML(s){ return String(s).replace(/[&<>"']/g, m=>({"&":"&amp;","<":"&lt;",">":">",'"':"&quot;","'":"&#39;"}[m])); }

/* ---------- WATER TRACKING ---------- */
async function addWater(){
  try {
    const res = await api("/water/increment", { method:"POST", body: JSON.stringify({ date: viewingDate }) });
    waterGlasses = res.glasses || (waterGlasses + 1);
    renderView();
    toast("Glass added! (" + waterGlasses + "/8)");
  } catch(e){ toast("Water error: " + (e.error || e.message || "check server")); }
}
async function resetWater(){
  try {
    await api("/water", { method:"POST", body: JSON.stringify({ date: viewingDate, glasses: 0 }) });
    waterGlasses = 0;
    renderView();
    toast("Water reset");
  } catch(e){ toast("Reset error: " + (e.error || e.message || "check server")); }
}

/* ---------- REST TIMER ---------- */
function startRestTimer(seconds){
  stopRestTimer();
  restTimeLeft = seconds;
  const existing = document.getElementById("rest-timer-overlay");
  if(existing) existing.remove();
  const overlay = document.createElement("div");
  overlay.id = "rest-timer-overlay";
  overlay.className = "modal-overlay";
  overlay.innerHTML = `
    <div class="modal" style="text-align:center;background:linear-gradient(135deg,rgba(13,15,20,0.95),rgba(30,36,56,0.95));border:1px solid var(--teal);">
      <h2 style="color:var(--teal);margin-bottom:4px;">Rest Timer</h2>
      <div style="font-family:'Oswald',sans-serif;font-size:72px;font-weight:700;color:var(--ink);margin:20px 0;line-height:1;" id="rest-timer-display">${seconds}</div>
      <div style="font-size:12px;color:var(--ink-dim);margin-bottom:20px;">seconds remaining</div>
      <div style="display:flex;gap:8px;">
        <button class="btn btn-ghost" onclick="addRestTime(15)">+15s</button>
        <button class="btn btn-teal" onclick="stopRestTimer()">Done</button>
        <button class="btn btn-ghost" onclick="addRestTime(-15)">-15s</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  restTimer = setInterval(()=>{
    restTimeLeft--;
    const display = document.getElementById("rest-timer-display");
    if(display) display.textContent = restTimeLeft;
    if(restTimeLeft <= 0){
      stopRestTimer();
      toast("Rest complete! Let's go!");
      if(navigator.vibrate) navigator.vibrate([200,100,200]);
    }
  }, 1000);
}
function stopRestTimer(){
  if(restTimer){ clearInterval(restTimer); restTimer = null; }
  const overlay = document.getElementById("rest-timer-overlay");
  if(overlay) overlay.remove();
}
function addRestTime(seconds){
  restTimeLeft = Math.max(0, restTimeLeft + seconds);
  const display = document.getElementById("rest-timer-display");
  if(display) display.textContent = restTimeLeft;
}

/* ---------- BODY MEASUREMENTS ---------- */
async function showMeasurementsModal(){
  let measurements = [];
  try { measurements = await api("/measurements"); } catch(e){}
  const latest = measurements.length > 0 ? measurements[measurements.length-1] : {};
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = `
    <div class="modal" style="max-height:85vh;overflow-y:auto;">
      <h2 style="text-align:center;">Body Measurements</h2>
      <p class="smallnote" style="text-align:center;">Track your body composition over time</p>
      <label>Date</label>
      <input type="date" id="m-date" value="${todayStr()}">
      <div class="grid2">
        <div><label>Chest (cm)</label><input type="number" id="m-chest" step="0.1" inputmode="decimal" placeholder="${latest.chest ? latest.chest+' (last)' : 'e.g. 95'}"></div>
        <div><label>Waist (cm)</label><input type="number" id="m-waist" step="0.1" inputmode="decimal" placeholder="${latest.waist ? latest.waist+' (last)' : 'e.g. 80'}"></div>
      </div>
      <div class="grid2">
        <div><label>Hips (cm)</label><input type="number" id="m-hips" step="0.1" inputmode="decimal" placeholder="${latest.hips ? latest.hips+' (last)' : 'e.g. 90'}"></div>
        <div><label>Biceps (cm)</label><input type="number" id="m-biceps" step="0.1" inputmode="decimal" placeholder="${latest.biceps ? latest.biceps+' (last)' : 'e.g. 35'}"></div>
      </div>
      <div class="grid2">
        <div><label>Thighs (cm)</label><input type="number" id="m-thighs" step="0.1" inputmode="decimal" placeholder="${latest.thighs ? latest.thighs+' (last)' : 'e.g. 55'}"></div>
        <div><label>Calves (cm)</label><input type="number" id="m-calves" step="0.1" inputmode="decimal" placeholder="${latest.calves ? latest.calves+' (last)' : 'e.g. 38'}"></div>
      </div>
      <button class="btn btn-primary" id="m-save" style="margin-top:10px;">Save Measurements</button>
      ${measurements.length > 0 ? `
      <h3 style="margin-top:18px;">History</h3>
      ${measurements.slice(-5).reverse().map(m => `
        <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--line);font-size:12px;">
          <span style="color:var(--ink-dim);">${m.date}</span>
          <span>C${m.chest||'-'} W${m.waist||'-'} H${m.hips||'-'} B${m.biceps||'-'} T${m.thighs||'-'} C${m.calves||'-'}</span>
        </div>
      `).join('')}` : ''}
      <button class="btn btn-ghost" id="m-cancel" style="margin-top:10px;">Close</button>
    </div>`;
  document.body.appendChild(overlay);
  document.getElementById("m-cancel").onclick = ()=> overlay.remove();
  document.getElementById("m-save").onclick = async ()=>{
    try {
      await api("/measurements", { method:"POST", body: JSON.stringify({
        date: document.getElementById("m-date").value,
        chest: parseFloat(document.getElementById("m-chest").value) || null,
        waist: parseFloat(document.getElementById("m-waist").value) || null,
        hips: parseFloat(document.getElementById("m-hips").value) || null,
        biceps: parseFloat(document.getElementById("m-biceps").value) || null,
        thighs: parseFloat(document.getElementById("m-thighs").value) || null,
        calves: parseFloat(document.getElementById("m-calves").value) || null,
      })});
      overlay.remove();
      toast("Measurements saved!");
    } catch(e){ toast("Failed to save"); }
  };
}

document.getElementById("dayNavWrap").style.visibility = "visible";
document.querySelectorAll(".navbtn").forEach(btn=>{
  btn.addEventListener("click", ()=>{
    currentView = btn.dataset.view;
    document.getElementById("dayNavWrap").style.visibility = (currentView==="today"||currentView==="food") ? "visible":"hidden";
    if(currentView==="logout"){ currentUser=null; isAdmin=false; isPremium=false; currentPlan=""; localStorage.removeItem("fg_token"); localStorage.removeItem("fg_user"); document.querySelector(".app").style.display="none"; document.querySelector(".bottomnav").style.display="none"; showLogin(); return; }
    renderAll();
  });
});

/* ---------- DIET PLAN ---------- */
async function renderDietPlan(){
  try {
    const plan = await api("/premium/diet-plan");
    const meals = plan.meals;
    return `
    <div class="card" style="padding:0;overflow:hidden;">
      <div class="card-hero" style="height:140px;">
        <img src="https://images.unsplash.com/photo-1490645935967-10de6ba17061?w=600&h=280&fit=crop&q=80" alt="diet" loading="lazy">
        <div class="card-hero-badge" style="background:var(--amber);">PREMIUM</div>
        <div class="card-hero-label">
          <div class="ch-title">Your Meal Plan</div>
          <div class="ch-sub">Personalized nutrition schedule</div>
        </div>
      </div>
    </div>
    <div class="food-summary">
      <div class="fs-item"><div class="fs-val" style="color:var(--teal);">${plan.summary.cal}</div><div class="fs-label">Calories</div></div>
      <div class="fs-item"><div class="fs-val" style="color:var(--neon-red);">${plan.summary.protein}g</div><div class="fs-label">Protein</div></div>
      <div class="fs-item"><div class="fs-val" style="color:var(--amber);">${plan.summary.carb}g</div><div class="fs-label">Carbs</div></div>
      <div class="fs-item"><div class="fs-val" style="color:#74b9ff;">${plan.summary.fat}g</div><div class="fs-label">Fat</div></div>
    </div>
    ${meals.map(meal => `
      <div class="card card-bg" style="background-image:url('https://images.unsplash.com/photo-1498837167922-ddd27525d352?w=600&h=400&fit=crop&q=80');padding:16px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
          <h3 style="margin:0;">${meal.name}</h3>
          <span style="font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--teal);background:rgba(0,229,160,0.1);padding:3px 8px;border-radius:6px;">${meal.time}</span>
        </div>
        ${meal.items.map(item => `
          <div class="food-entry-card" style="margin-bottom:6px;">
            <div class="fe-left">
              <div>
                <div class="fe-name">${item.food} <span style="color:var(--ink-dim);font-size:11px;">${item.grams}g</span></div>
                <div class="fe-meta">P${Math.round(item.protein)} . C${Math.round(item.carb)} . F${Math.round(item.fat)}</div>
                <div style="font-size:10px;color:var(--amber);margin-top:2px;font-style:italic;">${item.note}</div>
              </div>
            </div>
            <div class="fe-right">
              <div class="fe-cal">${Math.round(item.cal)}<span class="fe-unit"> kcal</span></div>
            </div>
          </div>
        `).join("")}
      </div>
    `).join("")}
    <div class="card" style="text-align:center;padding:20px;">
      <p style="color:var(--ink-dim);font-size:12px;">Drink 3-4 liters of water daily. Adjust portions based on your hunger and energy levels.</p>
    </div>`;
  } catch(e) {
    return '<div class="empty">Premium subscription required for diet plans.</div>';
  }
}

/* ---------- ADMIN PANEL ---------- */
async function renderAdmin(){
  if(!isAdmin) return '<div class="empty">Admin access required.</div>';
  try {
    const users = await api("/admin/users");
    return `
    <div class="card" style="padding:0;overflow:hidden;">
      <div class="card-hero" style="height:120px;">
        <img src="https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=600&h=250&fit=crop&q=80" alt="admin" loading="lazy">
        <div class="card-hero-badge" style="background:var(--amber);">ADMIN</div>
        <div class="card-hero-label">
          <div class="ch-title">Admin Panel</div>
          <div class="ch-sub">${users.length} registered users</div>
        </div>
      </div>
    </div>
    <div class="card card-bg" style="background-image:url('https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=600&h=400&fit=crop&q=80');padding:16px;">
      <h3>Quick Actions</h3>
      <div class="btn-row" style="margin-bottom:10px;">
        <button class="btn btn-primary" onclick="adminSetPlan('basic')">Set Basic (NPR 2000)</button>
        <button class="btn btn-primary" onclick="adminSetPlan('premium')" style="background:var(--amber);color:#000;">Set Premium (NPR 5000)</button>
      </div>
      <div class="btn-row" style="margin-bottom:10px;">
        <button class="btn btn-ghost" onclick="adminRevokePremium()">Revoke Access</button>
        <button class="btn btn-ghost" onclick="adminMakeAdmin()">Make Admin</button>
      </div>
      <div class="btn-row">
        <button class="btn btn-ghost" style="color:var(--danger);" onclick="adminDeleteUser()">Delete User</button>
      </div>
    </div>
    <div class="card card-bg" style="background-image:url('https://images.unsplash.com/photo-1551434678-e076c223a692?w=600&h=400&fit=crop&q=80');padding:16px;">
      <h3>All Users</h3>
      ${users.map(u => `
        <div class="food-entry-card" style="margin-bottom:6px;">
          <div class="fe-left">
            <div>
              <div class="fe-name">${escapeHTML(u.name || "No name")} ${u.admin ? '<span style="color:var(--amber);font-size:10px;background:rgba(255,176,32,0.15);padding:2px 6px;border-radius:4px;">ADMIN</span>' : ''} ${u.premium ? '<span style="color:var(--teal);font-size:10px;background:rgba(0,229,160,0.15);padding:2px 6px;border-radius:4px;">' + (u.premiumPlan || 'PRO').toUpperCase() + '</span>' : '<span style="color:var(--ink-dim);font-size:10px;background:rgba(255,255,255,0.1);padding:2px 6px;border-radius:4px;">FREE</span>'}</div>
              <div class="fe-meta">${u.email}</div>
              <div class="fe-meta">${u.premium && u.premiumExpires ? 'Expires: ' + new Date(u.premiumExpires).toLocaleDateString() : 'No expiry'}</div>
            </div>
          </div>
        </div>
      `).join("")}
    </div>`;
  } catch(e) {
    return '<div class="empty">Failed to load admin panel.</div>';
  }
}

function adminSetPlan(planType){
  const label = planType==="basic" ? "Basic (NPR 2000)" : "Premium (NPR 5000)";
  const email = prompt(`Set user to ${label}\nEnter user email:`);
  if(!email) return;
  api("/admin/set-plan", { method:"POST", body:JSON.stringify({email, planType}) })
    .then(()=>{ toast(`${label} plan set for ${email}`); renderView(); })
    .catch(e=>toast("Failed: " + e.message));
}
function adminRevokePremium(){
  const email = prompt("Enter user email to revoke premium:");
  if(!email) return;
  api("/admin/set-plan", { method:"POST", body:JSON.stringify({email, planType:""}) })
    .then(()=>{ toast("Premium revoked!"); renderView(); })
    .catch(e=>toast("Failed: " + e.message));
}
function adminMakeAdmin(){
  const email = prompt("Enter user email to make admin:");
  if(!email) return;
  api("/admin/make-admin", { method:"POST", body:JSON.stringify({email}) })
    .then(()=>{ toast("Admin granted!"); renderView(); })
    .catch(e=>toast("Failed: " + e.message));
}
function adminDeleteUser(){
  const email = prompt("Enter user email to DELETE:");
  if(!email) return;
  if(!confirm("Are you sure? This cannot be undone.")) return;
  api("/admin/delete-user", { method:"POST", body:JSON.stringify({email}) })
    .then(()=>{ toast("User deleted!"); renderView(); })
    .catch(e=>toast("Failed: " + e.message));
}

/* ---------- Start the app ---------- */
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => boot());
} else {
  boot();
}
