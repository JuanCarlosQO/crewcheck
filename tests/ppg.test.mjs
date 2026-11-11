import { test } from "node:test";
import assert from "node:assert/strict";
import { estimateHeartRate, bandpass, findPeaks, qualityLabel } from "../js/ppg.js";

// Seeded random numbers so the tests always see the same noise.
function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

// A fingertip PPG-like brightness trace: a dip per beat, slow drift, sensor noise,
// and uneven frame timing like a phone camera (about 30 fps with jitter).
function synth({ bpm = 72, seconds = 22, noise = 0.15, drift = 3, hrv = 0.03, seed = 1, covered = () => true } = {}) {
  const rand = rng(seed);
  const out = [];
  let t = 0, phase = 0, period = 60 / bpm;
  while (t < seconds * 1000) {
    const dt = 1000 / 30 + (rand() - 0.5) * 12;
    t += dt;
    phase += dt / 1000 / period;
    if (phase >= 1) { phase -= 1; period = (60 / bpm) * (1 + (rand() - 0.5) * 2 * hrv); }
    const pulse = Math.exp(-((phase - 0.2) ** 2) / 0.01) + 0.35 * Math.exp(-((phase - 0.5) ** 2) / 0.02);
    const v = 180 - 1.2 * pulse + drift * Math.sin(t / 4000) + noise * (rand() - 0.5) * 2;
    out.push({ t, v, covered: covered(t) });
  }
  return out;
}

for (const bpm of [48, 62, 75, 98, 130]) {
  test(`clean signal at ${bpm} bpm is found within 3 bpm with a good score`, () => {
    const r = estimateHeartRate(synth({ bpm, seed: bpm }));
    assert.ok(Math.abs(r.bpm - bpm) <= 3, `got ${r.bpm}`);
    assert.ok(r.quality >= 75, `quality ${r.quality}`);
    assert.equal(qualityLabel(r.quality), "Good signal");
  });
}

test("pure noise gives no reading or a poor score", () => {
  const rand = rng(7);
  const samples = Array.from({ length: 660 }, (_, i) => ({ t: i * 33.3, v: 180 + (rand() - 0.5) * 4, covered: true }));
  const r = estimateHeartRate(samples);
  assert.ok(r.bpm == null || r.quality < 60, `bpm ${r.bpm} quality ${r.quality}`);
});

test("heavy noise lowers the score", () => {
  const clean = estimateHeartRate(synth({ seed: 3 }));
  const noisy = estimateHeartRate(synth({ seed: 3, noise: 4 }));
  assert.ok(noisy.quality < clean.quality);
  assert.ok(noisy.quality < 60, `quality ${noisy.quality}`);
});

test("a wrong rate never passes the quality bar", () => {
  for (const noise of [0.5, 1, 1.5, 2, 2.5, 3, 4, 6]) {
    for (let seed = 1; seed <= 12; seed++) {
      const r = estimateHeartRate(synth({ noise, seed }));
      if (r.quality >= 60) assert.ok(Math.abs(r.bpm - 72) <= 5, `noise ${noise} seed ${seed}: ${r.bpm} bpm at quality ${r.quality}`);
    }
  }
});

test("finger lifted for most of the time gives no reading", () => {
  const r = estimateHeartRate(synth({ covered: (t) => t < 6000 }));
  assert.equal(r.bpm, null);
  assert.match(r.reason, /Finger not detected/);
});

test("finger lifted part of the time lowers the score", () => {
  const full = estimateHeartRate(synth({ seed: 5 }));
  const part = estimateHeartRate(synth({ seed: 5, covered: (t) => t < 14000 || t > 19000 }));
  assert.ok(part.quality < full.quality);
});

test("too short a recording gives no reading", () => {
  const r = estimateHeartRate(synth({ seconds: 6 }));
  assert.equal(r.bpm, null);
  assert.match(r.reason, /Too short/);
});

test("band-pass removes a constant offset and slow drift", () => {
  const xs = Array.from({ length: 300 }, (_, i) => 100 + 20 * Math.sin(i / 300));
  const y = bandpass(xs);
  assert.ok(Math.max(...y.slice(30, -30).map(Math.abs)) < 0.5);
});

test("peaks are at least one shortest beat apart", () => {
  const xs = Array.from({ length: 300 }, (_, i) => Math.sin(2 * Math.PI * i / 30) + 0.2 * Math.sin(2 * Math.PI * i / 4));
  const p = findPeaks(xs);
  assert.ok(p.slice(1).every((v, i) => v - p[i] >= Math.round(30 * 60 / 210)));
});
