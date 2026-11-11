// Camera heart rate (photoplethysmography, PPG). Pure functions with no access
// to the page, so they can be tested with Node (see tests/ppg.test.mjs).
//
// With a fingertip over the camera and the torch on, each heartbeat pushes a
// little more blood into the finger, which absorbs a little more light, so the
// red brightness of the video dips once per beat. The steps:
//   1. Resample the brightness to an even rate (phones drop frames).
//   2. Band-pass 0.7–3.5 Hz (42–210 bpm) to remove drift and noise.
//   3. Find the beats (peaks of the inverted signal) and take the median gap.
//   4. Score the signal: finger coverage, regular beats, a clear rhythm, and
//      agreement between two independent rate estimates.
// The result goes through the normal health rules (js/rules.js), which turn a
// low signal-quality score into "Measure again".

export const PPG = {
  rate: 30,          // Hz after resampling
  lowHz: 0.7,        // 42 bpm
  highHz: 3.5,       // 210 bpm
  settleS: 2,        // seconds dropped at the start (torch and exposure settle)
  minBeats: 8,
  minBpm: 40,
  maxBpm: 210,
};

const clamp01 = (x) => Math.max(0, Math.min(1, x));
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

/** Linear resampling of [{t (ms), v}] to an even rate. Returns values only. */
export function resample(samples, rate = PPG.rate) {
  if (samples.length < 2) return [];
  const step = 1000 / rate;
  const out = [];
  let j = 0;
  for (let t = samples[0].t; t <= samples.at(-1).t; t += step) {
    while (j < samples.length - 2 && samples[j + 1].t < t) j++;
    const a = samples[j], b = samples[j + 1];
    const f = b.t === a.t ? 0 : (t - a.t) / (b.t - a.t);
    out.push(a.v + (b.v - a.v) * clamp01(f));
  }
  return out;
}

// Second-order Butterworth sections (RBJ audio cookbook, Q = 1/√2).
function biquad(type, fc, fs) {
  const w = 2 * Math.PI * fc / fs;
  const cos = Math.cos(w), alpha = Math.sin(w) / (2 * Math.SQRT1_2);
  const a0 = 1 + alpha;
  const b = type === "low"
    ? [(1 - cos) / 2, 1 - cos, (1 - cos) / 2]
    : [(1 + cos) / 2, -(1 + cos), (1 + cos) / 2];
  return { b: b.map((x) => x / a0), a: [(-2 * cos) / a0, (1 - alpha) / a0] };
}

function runBiquad({ b, a }, xs) {
  const out = new Array(xs.length);
  let x1 = xs[0] ?? 0, x2 = x1;
  // Start the high-pass at rest and the low-pass at the first value, to avoid a jump.
  let y1 = b[0] + b[1] + b[2] > 0.5 ? x1 : 0, y2 = y1;
  for (let i = 0; i < xs.length; i++) {
    const x = xs[i];
    const y = b[0] * x + b[1] * x1 + b[2] * x2 - a[0] * y1 - a[1] * y2;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
    out[i] = y;
  }
  return out;
}

/** Zero-phase band-pass (forward and backward), so peaks stay where they are. */
export function bandpass(xs, rate = PPG.rate, lowHz = PPG.lowHz, highHz = PPG.highHz) {
  if (xs.length < 4) return xs.map(() => 0);
  const m = mean(xs);
  const filters = [biquad("high", lowHz, rate), biquad("low", highHz, rate)];
  let y = xs.map((x) => x - m);
  for (const f of filters) y = runBiquad(f, y);
  y.reverse();
  for (const f of filters) y = runBiquad(f, y);
  return y.reverse();
}

/**
 * Indexes of beats: local maxima above a share of the signal spread, at least
 * minGapS seconds apart (when two are closer, the higher one wins). A real
 * pulse has a second, smaller bump after each beat (the dicrotic wave), so the
 * caller passes a gap derived from the rhythm to avoid counting it as a beat.
 */
export function findPeaks(xs, rate = PPG.rate, maxBpm = PPG.maxBpm, minGapS = 60 / maxBpm) {
  const minGap = Math.max(1, Math.round(rate * Math.max(minGapS, 60 / maxBpm)));
  const sd = Math.sqrt(mean(xs.map((x) => x * x))) || 1;
  const floor = 0.3 * sd;
  const peaks = [];
  for (let i = 1; i < xs.length - 1; i++) {
    if (xs[i] <= floor || xs[i] < xs[i - 1] || xs[i] < xs[i + 1]) continue;
    const last = peaks.at(-1);
    if (last != null && i - last < minGap) {
      if (xs[i] > xs[last]) peaks[peaks.length - 1] = i;
    } else peaks.push(i);
  }
  return peaks;
}

/** Strongest repeat period between minBpm and maxBpm. Returns { bpm, r } with r in [-1, 1]. */
export function autocorrRate(xs, rate = PPG.rate, minBpm = PPG.minBpm, maxBpm = PPG.maxBpm) {
  const n = xs.length;
  const energy = xs.reduce((s, x) => s + x * x, 0) || 1;
  const lo = Math.floor(rate * 60 / maxBpm), hi = Math.min(n - 1, Math.ceil(rate * 60 / minBpm));
  const r = [];
  for (let lag = 0; lag <= hi; lag++) {
    let s = 0;
    for (let i = 0; i + lag < n; i++) s += xs[i] * xs[i + lag];
    r[lag] = s / energy * n / (n - lag);
  }
  // Take the first clear local maximum, so a harmonic at twice the period does not win.
  let best = -1, bestR = -Infinity;
  for (let lag = Math.max(lo, 1); lag < hi; lag++) {
    if (r[lag] > r[lag - 1] && r[lag] >= r[lag + 1] && r[lag] > bestR) { best = lag; bestR = r[lag]; }
  }
  if (best < 0) return { bpm: null, r: 0 };
  for (let lag = Math.max(lo, 1); lag < best; lag++) {
    if (r[lag] > r[lag - 1] && r[lag] >= r[lag + 1] && r[lag] > 0.8 * bestR) { best = lag; bestR = r[lag]; break; }
  }
  // Parabolic interpolation for a sub-sample period.
  const y0 = r[best - 1], y1 = r[best], y2 = r[best + 1];
  const den = y0 - 2 * y1 + y2;
  const shift = den === 0 ? 0 : 0.5 * (y0 - y2) / den;
  return { bpm: 60 * rate / (best + shift), r: bestR };
}

/** Grade a 0–100 quality score. The cut-offs are app rules. */
export function qualityLabel(q) {
  if (q == null) return "No signal";
  if (q >= 75) return "Good signal";
  if (q >= 60) return "Fair signal";
  return "Poor signal";
}

/**
 * Estimate heart rate from camera brightness samples.
 * @param samples  [{ t: ms, v: red brightness, covered: bool }] in time order
 * @returns {{ bpm: number|null, quality: number, beats: number, reason: string, parts: object }}
 */
export function estimateHeartRate(samples, opts = {}) {
  const o = { ...PPG, ...opts };
  const none = (reason, parts = {}) => ({ bpm: null, quality: 0, beats: 0, reason, parts });
  if (samples.length < 2) return none("No camera frames.");
  const start = samples[0].t + o.settleS * 1000;
  const used = samples.filter((s) => s.t >= start);
  const seconds = used.length > 1 ? (used.at(-1).t - used[0].t) / 1000 : 0;
  if (seconds < 8) return none("Too short. Keep your finger still for the full measurement.");

  const coverage = used.filter((s) => s.covered !== false).length / used.length;
  if (coverage < 0.5) return none("Finger not detected. Cover the camera and torch fully.", { coverage });

  // Brightness falls when blood volume rises, so invert: each beat becomes a peak.
  const raw = resample(used.map((s) => ({ t: s.t, v: -s.v })), o.rate);
  const x = bandpass(raw, o.rate, o.lowHz, o.highHz);
  const ac = autocorrRate(x, o.rate, o.minBpm, o.maxBpm);
  const gap = ac.bpm && ac.r > 0.3 ? 0.6 * 60 / ac.bpm : 60 / o.maxBpm;
  const peaks = findPeaks(x, o.rate, o.maxBpm, gap);
  const ibis = peaks.slice(1).map((p, i) => (p - peaks[i]) / o.rate);
  if (peaks.length < o.minBeats) return none("No steady pulse found. Press lightly and keep still.", { coverage, beats: peaks.length });

  const peakBpm = 60 / median(ibis);
  const sdIbi = Math.sqrt(mean(ibis.map((v) => (v - mean(ibis)) ** 2)));
  const cv = sdIbi / mean(ibis);
  const agree = ac.bpm ? Math.abs(peakBpm - ac.bpm) / peakBpm : 1;

  // Each part runs 0..1. Normal heart rate variability at rest gives a CV of about 0.03–0.08.
  const parts = {
    coverage,
    regularity: clamp01(1 - (cv - 0.08) / 0.22),
    rhythm: clamp01((ac.r - 0.2) / 0.5),
    agreement: clamp01(1 - (agree - 0.05) / 0.15),
    beats: peaks.length,
    cv,
    peakBpm,
    autocorrBpm: ac.bpm,
  };
  const signal = (parts.regularity + parts.rhythm + parts.agreement) / 3;
  const quality = Math.round(100 * coverage ** 2 * signal);
  const bpm = Math.round(ac.bpm && agree < 0.1 ? (peakBpm + ac.bpm) / 2 : peakBpm);
  const reason = quality >= 60 ? "Steady pulse found."
    : coverage < 0.9 ? "The finger moved off the camera during the measurement."
    : "The pulse signal was noisy. Rest your hand on a surface and keep still.";
  return { bpm, quality, beats: peaks.length, reason, parts };
}
