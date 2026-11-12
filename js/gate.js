// Crew access screen, "Earthlight". The night side of Earth fills the bottom
// of the screen, the station crosses the sky on its orbit, and the crew member
// is greeted by name with a quiet keypad.
//   - Code: four digits; each one lights a gold dot.
//   - Fingerprint: the gold key in the corner of the keypad uses the device's
//     own reader through WebAuthn (or face unlock where that is what it has).
// When access is granted the sun rises over the horizon and the screen fades
// into the app.

import { PIN_LENGTH, pinProblem, createPinRecord, checkPin, lockoutMs, triesLeft, randomBytes, toB64url, fromB64url, verifyAssertion } from "./auth.js";
import { markSVG } from "./brand.js";

const STORE = "crewcheck.access";
const SESSION = "crewcheck.unlocked";
const reduceMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/* ---------- Storage ---------- */

function readAccess() {
  try { return JSON.parse(localStorage.getItem(STORE)) ?? null; } catch { return null; }
}
function writeAccess(a) {
  try { localStorage.setItem(STORE, JSON.stringify(a)); } catch { /* private mode: access lasts for this visit */ }
}
export function hasAccess() { return Boolean(readAccess()?.pin); }
export function isUnlocked() { try { return sessionStorage.getItem(SESSION) === "1"; } catch { return false; } }
function setUnlocked(on) { try { on ? sessionStorage.setItem(SESSION, "1") : sessionStorage.removeItem(SESSION); } catch { /* ignore */ } }
export function fingerprintSaved() { return Boolean(readAccess()?.cred); }

/* ---------- Fingerprint (WebAuthn) ---------- */

export async function fingerprintAvailable() {
  try {
    return Boolean(window.isSecureContext && window.PublicKeyCredential
      && await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable());
  } catch { return false; }
}

const BIO_ERRORS = {
  NotAllowedError: "Fingerprint cancelled or not recognised.",
  InvalidStateError: "This fingerprint key is already saved on the device.",
  SecurityError: "Fingerprint needs the app's own secure address (https).",
  NotSupportedError: "This device has no fingerprint reader the browser can use.",
};

export async function enrolFingerprint(crewName) {
  const cred = await navigator.credentials.create({
    publicKey: {
      challenge: randomBytes(32),
      rp: { name: "CrewCheck" },
      user: { id: randomBytes(16), name: crewName || "crew", displayName: crewName || "Crew member" },
      pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required", residentKey: "discouraged" },
      attestation: "none",
      timeout: 60000,
    },
  });
  const r = cred.response;
  const pk = r.getPublicKey?.();
  const access = readAccess() ?? {};
  access.cred = { id: toB64url(cred.rawId), publicKey: pk ? toB64url(pk) : null, alg: r.getPublicKeyAlgorithm?.() ?? -7, count: 0 };
  writeAccess(access);
}

export function forgetFingerprint() {
  const a = readAccess();
  if (a) { delete a.cred; writeAccess(a); }
}

async function checkFingerprint() {
  const access = readAccess();
  if (!access?.cred) return { ok: false, reason: "No fingerprint saved yet." };
  const challenge = randomBytes(32);
  const got = await navigator.credentials.get({
    publicKey: {
      challenge,
      rpId: location.hostname,
      allowCredentials: [{ type: "public-key", id: fromB64url(access.cred.id), transports: ["internal"] }],
      userVerification: "required",
      timeout: 60000,
    },
  });
  const res = await verifyAssertion(
    { authenticatorData: got.response.authenticatorData, clientDataJSON: got.response.clientDataJSON, signature: got.response.signature },
    { challenge, origin: location.origin, rpId: location.hostname, publicKey: access.cred.publicKey, alg: access.cred.alg },
  );
  // A counter that goes backwards means a cloned key. Authenticators that do not count send 0.
  if (res.ok && res.signCount && res.signCount <= (access.cred.count ?? 0)) return { ok: false, reason: "Fingerprint key looks copied. Use your code." };
  if (res.ok) { access.cred.count = res.signCount; writeAccess(access); }
  return res;
}

/* ---------- Drawing ---------- */

const FP = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 19c-1.5-2-2-4-2-7a7 7 0 0 1 14 0"/><path d="M10 20c-1-2-1.5-4-1.5-7a3.5 3.5 0 0 1 7 0c0 2 .3 4 1 6"/><path d="M13 21c-.8-2-1-4.5-1-8"/><path d="M4.5 8.5A8.5 8.5 0 0 1 12 3.5a8.5 8.5 0 0 1 7.5 5"/></svg>`;

function greeting(now = new Date()) {
  const h = now.getHours();
  return h < 5 ? "Good evening," : h < 12 ? "Good morning," : h < 18 ? "Good afternoon," : "Good evening,";
}

function keysHTML() {
  const key = (d) => `<button type="button" class="dkey" data-digit="${d}">${d}</button>`;
  return `${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(key).join("")}
    <button type="button" class="gkey thumb" data-thumb aria-label="Unlock with fingerprint"><span>${FP}</span></button>
    ${key(0)}
    <button type="button" class="gkey back" data-back>Delete</button>`;
}

function coverHTML({ crewName, place, day }) {
  return `
  <div class="g-sky" aria-hidden="true">
    <div class="stars"></div>
    <svg class="g-orbit" viewBox="0 0 390 210" preserveAspectRatio="none"><path d="M -20 170 Q 195 -10 410 150"/></svg>
    <span class="g-iss"><i></i>ISS</span>
    <div class="g-sun"></div>
    <div class="g-earth"><div class="lights"></div></div>
  </div>
  <div class="g-panel" role="dialog" aria-modal="true" aria-labelledby="gate-title" aria-describedby="gate-msg">
    <header class="g-top">
      <span class="g-brand">${markSVG()}CrewCheck</span>
      <span class="g-meta">${esc(place)} · Day ${esc(day)}</span>
    </header>
    <div class="g-hello">
      <p class="g-greet">${greeting()}</p>
      <h1 id="gate-title">${esc(crewName)}</h1>
    </div>
    <p class="gate-step" id="gate-step"></p>
    <div class="g-code">
      <div class="slots" aria-hidden="true">${"<i></i>".repeat(PIN_LENGTH)}</div>
      <span class="g-rule"></span>
    </div>
    <p class="gate-msg" id="gate-msg" aria-live="polite"></p>
    <div class="gate-stage">
      <div class="dial" data-state="idle">${keysHTML()}</div>
      <div class="gate-card" hidden></div>
    </div>
    <div class="gate-links">
      <button type="button" class="link" data-forgot>Forgot your code?</button>
    </div>
    <footer class="g-foot">Your code and fingerprint key stay on this device.</footer>
  </div>`;
}

/* ---------- Controller ---------- */

/**
 * @param host      element that receives the gate
 * @param app       element to make inert while locked
 * @param crew()    returns { crewName, place, day } for the greeting
 * @param onOpen    called as the screen starts to fade (the app can redraw underneath)
 * @param onReset   erase everything and start again
 */
export function createGate({ host, app, crew, onOpen, onReset }) {
  let mode = "login";         // login | setup | confirm | change | bio
  let digits = "";
  let firstCode = "";
  let busy = false;
  let timer = 0;
  let resolveOpen = null;
  let bioReady = false;
  const $ = (sel) => host.querySelector(sel);

  function mount() {
    host.innerHTML = coverHTML(crew());
    host.hidden = false;
    host.classList.remove("open", "opening");
    app.inert = true;
    app.setAttribute("aria-hidden", "true");
    document.documentElement.classList.add("gated");
    document.documentElement.classList.remove("pre-gate");
  }

  const dial = () => $(".dial");
  const setState = (s) => { dial().dataset.state = s; };
  const say = (msg, tone = "") => { const m = $("#gate-msg"); m.textContent = msg; m.dataset.tone = tone; };
  const step = (text) => { $("#gate-step").textContent = text; };

  function paintSlots() {
    host.querySelectorAll(".slots i").forEach((s, i) => s.classList.toggle("on", i < digits.length));
    $("[data-back]").disabled = !digits.length;
  }

  function showCard(html) {
    const card = $(".gate-card");
    card.innerHTML = html;
    card.hidden = false;
    dial().hidden = true;
    $(".gate-links").hidden = true;
    card.querySelector("button")?.focus();
  }
  function hideCard() {
    $(".gate-card").hidden = true;
    dial().hidden = false;
    $(".gate-links").hidden = false;
  }

  function enterMode(m, message, tone) {
    mode = m;
    digits = "";
    paintSlots();
    hideCard();
    setState("idle");
    const thumb = $("[data-thumb]");
    const bio = m === "login" && fingerprintSaved();
    thumb.disabled = !(bio && bioReady);
    thumb.classList.toggle("off", !bio);
    $("[data-forgot]").hidden = m !== "login";
    const steps = {
      login: ["Crew access", bio && bioReady ? "Enter your code, or touch the fingerprint key." : "Enter your 4-digit crew code."],
      setup: ["Step 1 of 2 · Choose a crew code", "Four digits you will remember. Not 1234, not 0000."],
      confirm: ["Step 2 of 2 · Confirm", "Enter the same code again."],
      change: ["Change code", "First enter your current code."],
    }[m];
    step(steps[0]);
    say(message ?? steps[1], tone);
    if (bio && !bioReady) say(`${steps[1]} Fingerprint is not available in this browser.`);
    tickLockout();
  }

  function lockedFor() {
    const a = readAccess();
    return Math.max(0, (a?.until ?? 0) - Date.now());
  }

  function tickLockout() {
    clearTimeout(timer);
    if (mode !== "login" && mode !== "change") return;
    const left = lockedFor();
    const keys = host.querySelectorAll(".dkey");
    keys.forEach((k) => { k.disabled = left > 0; });
    if (left > 0) {
      setState("locked");
      const s = Math.ceil(left / 1000);
      say(`Too many wrong codes. Try again in ${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}.${fingerprintSaved() && bioReady ? " Your fingerprint still works." : ""}`, "bad");
      timer = setTimeout(tickLockout, 1000 - (left % 1000) + 5);
    } else if (dial().dataset.state === "locked") {
      setState("idle");
      say("You can enter your code again.");
    }
  }

  async function press(d) {
    if (busy || digits.length >= PIN_LENGTH || lockedFor() > 0) return;
    digits += d;
    paintSlots();
    setState("idle");
    if (digits.length === PIN_LENGTH) await submit();
  }

  function back() {
    if (busy || !digits.length) return;
    digits = digits.slice(0, -1);
    paintSlots();
  }

  async function wrong(message) {
    setState("error");
    say(message, "bad");
    if (!reduceMotion()) await new Promise((r) => setTimeout(r, 650));
    digits = "";
    paintSlots();
    if (dial().dataset.state === "error") setState("idle");
  }

  async function submit() {
    const code = digits;
    if (mode === "setup") {
      const problem = pinProblem(code);
      if (problem) return wrong(problem);
      firstCode = code;
      return enterMode("confirm");
    }
    if (mode === "confirm") {
      if (code !== firstCode) { firstCode = ""; enterMode("setup"); return wrong("The two codes were different. Start again."); }
      busy = true;
      setState("working");
      say("Sealing your code…");
      const access = readAccess() ?? {};
      access.pin = await createPinRecord(code);
      access.fails = 0;
      access.until = 0;
      writeAccess(access);
      busy = false;
      firstCode = "";
      return fingerprintSaved() ? grant("New code saved.") : offerFingerprint();
    }
    // login or change: check the code
    busy = true;
    setState("working");
    say("Checking…");
    const access = readAccess();
    const ok = await checkPin(code, access?.pin);
    busy = false;
    if (ok) {
      access.fails = 0; access.until = 0; writeAccess(access);
      if (mode === "change") { enterMode("setup"); return; }
      return grant("Code accepted.");
    }
    access.fails = (access.fails ?? 0) + 1;
    access.until = Date.now() + lockoutMs(access.fails);
    writeAccess(access);
    const left = triesLeft(access.fails);
    await wrong(left > 0 ? `That is not your code. ${left} ${left === 1 ? "try" : "tries"} left before a short wait.` : "That is not your code.");
    tickLockout();
  }

  async function thumb() {
    if (busy || !fingerprintSaved() || !bioReady) return;
    busy = true;
    setState("scanning");
    say("Hold your thumb on the reader…");
    try {
      const res = await checkFingerprint();
      busy = false;
      if (res.ok) {
        const access = readAccess();
        access.fails = 0; access.until = 0; writeAccess(access);
        return grant("Fingerprint accepted.");
      }
      setState("error");
      say(`${res.reason} Enter your code instead.`, "bad");
    } catch (err) {
      busy = false;
      setState("idle");
      say(`${BIO_ERRORS[err?.name] ?? "Fingerprint did not work."} Enter your code instead.`, "bad");
    }
  }

  async function offerFingerprint() {
    mode = "bio";
    step("Optional · Fingerprint");
    if (!bioReady) {
      say("Code saved. This browser cannot use a fingerprint reader, so you will use the code.", "ok");
      showCard(`<p>Fingerprint unlock needs a phone or laptop with a fingerprint (or face) reader and the app's secure address.</p><div class="gate-actions"><button type="button" class="btn" data-open>Continue</button></div>`);
      return;
    }
    say("Code saved.", "ok");
    showCard(`<p class="gate-card-title">Add your fingerprint?</p><p>Next time, touch the fingerprint key instead of typing your code. Your fingerprint never leaves the device.</p>
      <div class="gate-actions"><button type="button" class="btn ghost" data-skip-bio>Not now</button><button type="button" class="btn" data-add-bio>Add fingerprint</button></div>`);
  }

  async function addFingerprint() {
    busy = true;
    say("Follow your device's fingerprint prompt…");
    try {
      await enrolFingerprint(crew().crewName);
      busy = false;
      say("Fingerprint saved.", "ok");
      return grant("Fingerprint saved.");
    } catch (err) {
      busy = false;
      say(`${BIO_ERRORS[err?.name] ?? "The fingerprint could not be saved."} You can add it later in Sources.`, "bad");
    }
  }

  function forgot() {
    clearTimeout(timer);
    step("Forgot your code?");
    say("");
    showCard(`<p class="gate-card-title">Start again on this device</p>
      <p>There is no way to recover a code: it is never stored. Starting again erases your code, your fingerprint key and the health log saved in this browser. The demo mission loads again.</p>
      <div class="gate-actions"><button type="button" class="btn ghost" data-cancel-card>Back</button><button type="button" class="btn danger" data-reset>Erase and start again</button></div>`);
  }

  function grant(message) {
    clearTimeout(timer);
    setState("granted");
    say(`${message} One of the sixteen sunrises you will see today.`, "ok");
    step("Welcome back");
    setUnlocked(true);
    const finish = () => {
      host.hidden = true;
      host.innerHTML = "";
      app.inert = false;
      app.removeAttribute("aria-hidden");
      document.documentElement.classList.remove("gated");
      resolveOpen?.();
      resolveOpen = null;
    };
    if (reduceMotion()) { setTimeout(() => { onOpen?.(); finish(); }, 350); return; }
    // The sun rises over the limb, then the whole screen fades into the app.
    host.classList.add("opening");
    setTimeout(() => {
      app.inert = false;
      app.removeAttribute("aria-hidden");
      onOpen?.();
      host.classList.add("open");
      setTimeout(finish, 900);
    }, 1500);
  }

  host.addEventListener("click", (e) => {
    const t = e.target.closest("button");
    if (!t || t.disabled) return;
    if (t.dataset.digit) press(t.dataset.digit);
    else if (t.hasAttribute("data-thumb")) thumb();
    else if (t.hasAttribute("data-back")) back();
    else if (t.hasAttribute("data-forgot")) forgot();
    else if (t.hasAttribute("data-cancel-card")) enterMode(mode === "bio" ? "login" : mode);
    else if (t.hasAttribute("data-reset")) onReset();
    else if (t.hasAttribute("data-add-bio")) addFingerprint();
    else if (t.hasAttribute("data-skip-bio") || t.hasAttribute("data-open")) grant("Code saved.");
  });

  host.addEventListener("keydown", (e) => {
    if (host.hidden || !dial() || dial().hidden) return;
    if (/^\d$/.test(e.key)) {
      e.preventDefault();
      host.querySelector(`.dkey[data-digit="${e.key}"]`)?.classList.add("pressed");
      press(e.key);
    } else if (e.key === "Backspace") { e.preventDefault(); back(); }
    else if (e.key === "Escape") { e.preventDefault(); digits = ""; paintSlots(); }
  });
  host.addEventListener("keyup", (e) => {
    if (/^\d$/.test(e.key)) host.querySelector(`.dkey[data-digit="${e.key}"]`)?.classList.remove("pressed");
  });

  /** Show the gate. Resolves when access is granted. */
  async function run(startMode = hasAccess() ? "login" : "setup") {
    bioReady = await fingerprintAvailable();
    mount();
    enterMode(startMode);
    // Focus the screen itself so typed digits work at once, without a focus ring on a key.
    host.tabIndex = -1;
    host.focus({ preventScroll: true });
    if (startMode === "login" && fingerprintSaved() && bioReady && !lockedFor()) {
      // Phones ask for the fingerprint as soon as the lock screen shows. Browsers
      // need a tap first, so we only light the fingerprint key as an invitation.
      $("[data-thumb]").classList.add("invite");
    }
    return new Promise((r) => { resolveOpen = r; });
  }

  function lock() {
    setUnlocked(false);
    return run("login");
  }

  return { run, lock, changeCode: () => run("change") };
}
