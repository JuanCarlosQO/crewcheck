// Camera heart-rate measurement: the sheet, the camera and torch, and the live
// waveform. The signal processing lives in js/ppg.js; the verdict comes from
// the normal health rules once the value is in the form.
//
// Only works on a secure page (https or localhost) on a device with a camera.
// It cannot run inside the claude.ai artifact preview, where the camera is blocked.

import { estimateHeartRate, resample, bandpass, qualityLabel, PPG } from "./ppg.js";

const DURATION_MS = 22000;   // 2 s for the torch and exposure to settle + 20 s measured
const LIVE_AFTER_MS = 10000; // start showing a live estimate after this
const LOST_MS = 1500;        // finger off the camera this long: show a warning
const SIZE = { w: 32, h: 24 };

// A fingertip over a lit camera fills the frame with red. App rule, tuned by eye.
export function isFingerFrame(r, g, b) {
  return r > 40 && r > 1.6 * g && r > 1.6 * b;
}

function sheetHTML(minQuality) {
  return `<form method="dialog" class="ppg-sheet">
    <div class="ppg-head">
      <div><p class="kicker">Camera pulse</p><h2>Measure with camera</h2></div>
      <button class="round ppg-x" value="cancel" aria-label="Close">×</button>
    </div>
    <div class="holo ppg-screen">
      <canvas class="ppg-wave" aria-hidden="true"></canvas>
      <div class="ppg-readout">
        <p class="ppg-bpm"><strong class="num" data-bpm>--</strong><span>bpm</span></p>
        <p class="ppg-finger" data-finger aria-live="polite">Starting the camera…</p>
      </div>
      <div class="ppg-progress" aria-hidden="true"><i data-progress></i></div>
    </div>
    <div class="ppg-quality">
      <div class="ppg-q-top"><span>Signal quality</span><span data-qword class="ppg-qword">Waiting</span></div>
      <div class="ppg-meter" role="meter" aria-label="Signal quality" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" data-meter>
        <i data-qbar></i><b style="left:${minQuality}%" title="Minimum to accept"></b>
      </div>
      <p class="muted small" data-qtext>Readings below ${minQuality}/100 are not accepted (app rule).</p>
    </div>
    <ol class="ppg-steps small">
      <li>Cover the back camera <em>and</em> the torch with one fingertip.</li>
      <li>Press lightly. Pressing hard stops the blood flow.</li>
      <li>Rest your hand and keep still for 20 seconds.</li>
    </ol>
    <p class="ppg-note small"><strong>Estimate.</strong> A phone camera is less accurate than a medical sensor. Use the chest strap or finger sensor when you can.</p>
    <div class="ppg-actions" data-actions>
      <button class="btn ghost" value="cancel">Cancel</button>
    </div>
  </form>`;
}

function drawWave(canvas, samples, now) {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (!w || !h) return;
  if (canvas.width !== Math.round(w * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const css = getComputedStyle(canvas);
  const ink = css.getPropertyValue("--scr-holo").trim() || "#3fe9f7";
  const grid = css.getPropertyValue("--scr-line").trim() || "rgba(63,233,247,.13)";

  ctx.strokeStyle = grid;
  ctx.lineWidth = 1;
  for (let x = 0; x < w; x += 24) { ctx.beginPath(); ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, h); ctx.stroke(); }
  for (let y = 0; y < h; y += 24) { ctx.beginPath(); ctx.moveTo(0, y + 0.5); ctx.lineTo(w, y + 0.5); ctx.stroke(); }

  const windowMs = 5000;
  const recent = samples.filter((s) => s.t > now - windowMs - 1500);
  if (recent.length < 20) return;
  const ys = bandpass(resample(recent.map((s) => ({ t: s.t, v: -s.v }))));
  const shown = ys.slice(-Math.round(windowMs / 1000 * PPG.rate));
  const peak = Math.max(...shown.map(Math.abs)) || 1;
  ctx.strokeStyle = ink;
  ctx.lineWidth = 2;
  ctx.lineJoin = "round";
  ctx.shadowColor = ink;
  ctx.shadowBlur = 6;
  ctx.beginPath();
  shown.forEach((v, i) => {
    const x = (i / (shown.length - 1)) * w;
    const y = h * 0.6 - (v / peak) * h * 0.32; // below the readout
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  });
  ctx.stroke();
}

/**
 * Open the measurement sheet.
 * @param minQuality  the app's acceptance score (data/indicators.json → heart_rate.camera)
 * @param onUse       called with { bpm, quality } when the astronaut keeps the value
 */
export function openPulseSheet({ minQuality = 60, onUse }) {
  const dialog = document.createElement("dialog");
  dialog.className = "ppg-dialog";
  dialog.setAttribute("aria-label", "Measure heart rate with the camera");
  dialog.innerHTML = sheetHTML(minQuality);
  document.body.append(dialog);
  const $ = (sel) => dialog.querySelector(sel);
  const canvas = $(".ppg-wave");

  let stream = null, video = null, raf = 0, vfc = 0, stopped = false, closed = false, run = 0;
  let samples = [], startAt = 0, lastCovered = 0, lastEstimate = 0, result = null;
  const grab = Object.assign(document.createElement("canvas"), SIZE);
  const gctx = grab.getContext("2d", { willReadFrequently: true });

  const setFinger = (text, state = "") => { const el = $("[data-finger]"); el.textContent = text; el.dataset.state = state; };
  const setQuality = (q) => {
    const meter = $("[data-meter]");
    meter.setAttribute("aria-valuenow", String(q ?? 0));
    meter.dataset.level = q == null ? "" : q >= 75 ? "good" : q >= minQuality ? "fair" : "poor";
    $("[data-qbar]").style.width = `${q ?? 0}%`;
    $("[data-qword]").textContent = q == null ? "Waiting" : `${qualityLabel(q)} · ${q}/100`;
  };
  const setBpm = (bpm, quality) => {
    const el = $("[data-bpm]");
    el.textContent = bpm == null ? "--" : String(bpm);
    // A number from a weak signal is shown faded, so it is not read as a result.
    el.closest(".ppg-bpm").dataset.weak = bpm != null && quality < minQuality ? "true" : "";
  };
  const setActions = (html) => { $("[data-actions]").innerHTML = html; };

  function stopCamera() {
    stopped = true;
    cancelAnimationFrame(raf);
    if (video && vfc && video.cancelVideoFrameCallback) video.cancelVideoFrameCallback(vfc);
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
  }

  function fail(message) {
    stopCamera();
    setFinger(message, "error");
    setActions(`<button class="btn ghost" value="cancel">Close</button><button class="btn" type="button" data-retry>Try again</button>`);
  }

  function finish() {
    stopCamera();
    result = estimateHeartRate(samples);
    $("[data-progress]").style.width = "100%";
    setQuality(result.bpm == null ? 0 : result.quality);
    setBpm(result.bpm, result.quality);
    if (result.bpm == null) {
      setFinger(result.reason, "error");
      $("[data-qtext]").textContent = "No reading was taken. Measure again.";
      setActions(`<button class="btn ghost" value="cancel">Close</button><button class="btn" type="button" data-retry>Measure again</button>`);
      return;
    }
    const passes = result.quality >= minQuality;
    setFinger(passes ? "Done. You can lift your finger." : result.reason, passes ? "ok" : "warn");
    $("[data-qtext]").textContent = passes
      ? `${result.beats} beats counted. The value goes through the normal health checks.`
      : `Below ${minQuality}/100: if you use it, the log will ask you to measure again.`;
    setActions(passes
      ? `<button class="btn ghost" type="button" data-retry>Measure again</button><button class="btn" type="button" data-use>Use ${result.bpm} bpm</button>`
      : `<button class="btn ghost" type="button" data-use>Use anyway</button><button class="btn" type="button" data-retry>Measure again</button>`);
  }

  function onFrame() {
    if (stopped || !video || video.readyState < 2) return;
    const now = performance.now();
    const vw = video.videoWidth, vh = video.videoHeight;
    // Central half of the frame: the fingertip covers it even when held a little off.
    gctx.drawImage(video, vw / 4, vh / 4, vw / 2, vh / 2, 0, 0, SIZE.w, SIZE.h);
    const px = gctx.getImageData(0, 0, SIZE.w, SIZE.h).data;
    let r = 0, g = 0, b = 0;
    for (let i = 0; i < px.length; i += 4) { r += px[i]; g += px[i + 1]; b += px[i + 2]; }
    const n = px.length / 4;
    r /= n; g /= n; b /= n;
    const covered = isFingerFrame(r, g, b);
    if (covered) lastCovered = now;

    if (!startAt) {
      setFinger(covered ? "Finger detected. Keep still…" : "Place your fingertip over the camera and torch.", covered ? "ok" : "");
      if (covered) startAt = now;
    } else {
      samples.push({ t: now, v: r, covered });
      const elapsed = now - startAt;
      $("[data-progress]").style.width = `${Math.min(100, elapsed / DURATION_MS * 100)}%`;
      if (now - lastCovered > LOST_MS) setFinger("Finger lost. Put it back over the camera.", "warn");
      else if (r > 250) setFinger("Too bright. Press a little less hard or shade the camera.", "warn");
      else setFinger(`Measuring… ${Math.max(0, Math.ceil((DURATION_MS - elapsed) / 1000))} s`, "ok");
      if (elapsed > LIVE_AFTER_MS && now - lastEstimate > 700) {
        lastEstimate = now;
        const est = estimateHeartRate(samples);
        setBpm(est.bpm, est.quality);
        setQuality(est.bpm == null ? 0 : est.quality);
      }
      drawWave(canvas, samples, now);
      if (elapsed >= DURATION_MS) { finish(); return; }
    }
    schedule();
  }

  function schedule() {
    if (stopped) return;
    if (video.requestVideoFrameCallback) vfc = video.requestVideoFrameCallback(onFrame);
    else raf = requestAnimationFrame(onFrame);
  }

  async function start() {
    stopCamera();
    stopped = false;
    const mine = ++run;
    const stale = () => closed || mine !== run;
    samples = []; startAt = 0; lastCovered = 0; lastEstimate = 0; result = null;
    setBpm(null);
    $("[data-progress]").style.width = "0%";
    $("[data-qtext]").textContent = `Readings below ${minQuality}/100 are not accepted (app rule).`;
    setQuality(null);
    setActions(`<button class="btn ghost" value="cancel">Cancel</button>`);
    setFinger("Starting the camera…");
    drawWave(canvas, [], 0);

    if (!window.isSecureContext) return fail("The camera only works on a secure page (https).");
    if (!navigator.mediaDevices?.getUserMedia) return fail("This browser cannot use the camera. Type the value instead.");
    try {
      const got = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: "environment" }, width: { ideal: 320 }, height: { ideal: 240 }, frameRate: { ideal: 30 } },
      });
      // The sheet was closed or restarted while the permission prompt was open.
      if (stale()) { got.getTracks().forEach((t) => t.stop()); return; }
      stream = got;
    } catch (err) {
      if (stale()) return;
      const why = {
        NotAllowedError: "Camera permission was refused. Allow the camera for this site, or type the value.",
        SecurityError: "The camera is blocked on this page. Open CrewCheck on its own https address.",
        NotFoundError: "No camera found on this device.",
        NotReadableError: "The camera is busy in another app. Close it and try again.",
      }[err?.name];
      return fail(why ?? "The camera could not start. Type the value instead.");
    }
    video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.setAttribute("playsinline", "");
    video.srcObject = stream;
    try { await video.play(); } catch { return stale() ? undefined : fail("The camera could not start. Type the value instead."); }
    if (stale()) return;

    const track = stream.getVideoTracks()[0];
    let torch = false;
    try {
      if (track.getCapabilities?.().torch) { await track.applyConstraints({ advanced: [{ torch: true }] }); torch = true; }
    } catch { /* torch not available */ }
    if (stale()) return;
    $(".ppg-steps li").innerHTML = torch
      ? "Cover the back camera <em>and</em> the torch with one fingertip."
      : `Cover the back camera with one fingertip. <span class="muted">This browser cannot switch on the torch: measure in bright light.</span>`;
    setFinger("Place your fingertip over the camera and torch.");
    schedule();
  }

  const onVisibility = () => { if (document.hidden && !stopped) fail("Measurement stopped because the app was hidden."); };
  document.addEventListener("visibilitychange", onVisibility);

  dialog.addEventListener("click", (e) => {
    const t = e.target.closest("button");
    if (!t) return;
    if (t.hasAttribute("data-retry")) start();
    else if (t.hasAttribute("data-use") && result?.bpm != null) { onUse?.({ bpm: result.bpm, quality: result.quality }); dialog.close(); }
  });
  dialog.addEventListener("close", () => {
    closed = true;
    stopCamera();
    document.removeEventListener("visibilitychange", onVisibility);
    dialog.remove();
  });

  dialog.showModal();
  start();
  return { close: () => dialog.open && dialog.close() };
}
