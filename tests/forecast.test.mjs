import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { projectLoss, bandFor, projectionSeries, exerciseAdherence } from "../js/forecast.js";

const data = JSON.parse(readFileSync(new URL("../data/forecast.json", import.meta.url)));
const bones = data.systems.find((s) => s.id === "bones");

test("six months without countermeasures uses the published 1-1.5% per month", () => {
  const p = projectLoss(bones, 182.64, false, 6);
  assert.ok(Math.abs(p.low - 6) < 1e-9);
  assert.ok(Math.abs(p.high - 9) < 1e-9);
  assert.equal(p.extrapolated, false);
});

test("without a published effect size, countermeasures widen the range down to zero", () => {
  const p = projectLoss(bones, 182.64, true, 6);
  assert.equal(p.low, 0);
  assert.ok(Math.abs(p.high - 9) < 1e-9);
  assert.equal(p.uncertainCountermeasure, true);
});

test("a published effect size scales the range", () => {
  const withFactor = { ...bones, countermeasure: { ...bones.countermeasure, effectFactor: 0.5 } };
  const p = projectLoss(withFactor, 182.64, true, 6);
  assert.ok(Math.abs(p.low - 3) < 1e-9);
  assert.equal(p.uncertainCountermeasure, false);
});

test("projections past the measured mission length are flagged", () => {
  assert.equal(projectLoss(bones, 900, false, 6).extrapolated, true);
});

test("display bands", () => {
  assert.equal(bandFor(bones, 1), "green");
  assert.equal(bandFor(bones, 5), "yellow");
  assert.equal(bandFor(bones, 12), "red");
});

test("series ends exactly on the chosen day", () => {
  const s = projectionSeries(bones, 95, false, 6);
  assert.equal(s.at(-1).day, 95);
  assert.equal(s[0].high, 0);
});

test("exercise adherence", () => {
  const entries = [120, 60, 130, null].map((v) => ({ values: { exercise_min: v } }));
  assert.deepEqual(exerciseAdherence(entries, 120), { met: 2, total: 3, pct: 67 });
});
