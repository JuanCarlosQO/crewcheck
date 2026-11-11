import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { evaluate, evaluateMission, worst, systemStatus } from "../js/rules.js";
import { parseMissionCSV } from "../js/store.js";

const data = JSON.parse(readFileSync(new URL("../data/indicators.json", import.meta.url)));
const ind = (id) => data.indicators.find((i) => i.id === id);
const ok = (num, extra = {}) => ({ trust: "ok", num, value: num, range: "green", ...extra });

test("missing reading", () => {
  assert.equal(evaluate(ind("heart_rate"), null).status, "missing");
});

test("impossible value asks to measure again instead of raising an alarm", () => {
  const r = evaluate(ind("heart_rate"), 400);
  assert.equal(r.status, "verify");
  assert.equal(r.trust, "impossible");
});

test("ranges", () => {
  assert.equal(evaluate(ind("heart_rate"), 72).status, "green");
  assert.equal(evaluate(ind("heart_rate"), 110).status, "yellow");
  assert.equal(evaluate(ind("heart_rate"), 130).status, "red");
  assert.equal(evaluate(ind("spo2"), 93).status, "yellow");
  assert.equal(evaluate(ind("temperature"), 38.5).status, "red");
});

test("blood pressure uses both numbers", () => {
  const bp = ind("blood_pressure");
  assert.equal(evaluate(bp, { sys: 115, dia: 75 }).status, "green");
  assert.equal(evaluate(bp, { sys: 115, dia: 85 }).status, "yellow");
  assert.equal(evaluate(bp, { sys: 145, dia: 75 }).status, "red");
  assert.equal(evaluate(bp, { sys: 70, dia: 90 }).trust, "impossible");
});

test("big jump needs confirmation, then is evaluated normally", () => {
  const hist = [ok(64), ok(66), ok(65)];
  assert.equal(evaluate(ind("heart_rate"), 110, hist).status, "verify");
  assert.equal(evaluate(ind("heart_rate"), 110, hist, true).status, "yellow");
});

test("normal value far from personal average turns yellow", () => {
  const hist = [ok(110), ok(112), ok(111), ok(113)].map((h) => ({ ...h, value: { sys: h.num, dia: 72 } }));
  const r = evaluate(ind("blood_pressure"), { sys: 118, dia: 74 }, hist);
  assert.equal(r.status, "green");
  const hr = [ok(52), ok(53), ok(52), ok(51)];
  assert.equal(evaluate(ind("heart_rate"), 68, hr).status, "yellow");
});

test("three yellow mood days in a row become red", () => {
  const y = { trust: "ok", num: 3, value: 3, range: "yellow" };
  assert.equal(evaluate(ind("mood"), 3, [y]).status, "yellow");
  assert.equal(evaluate(ind("mood"), 3, [y, y]).status, "red");
});

test("worst status wins", () => {
  assert.equal(worst(["green", "yellow", "verify"]), "yellow");
  assert.equal(worst(["green", "verify"]), "verify");
  assert.equal(worst(["missing"]), "missing");
});

test("demo mission tells the intended story", () => {
  const csv = readFileSync(new URL("../data/mission_demo.csv", import.meta.url), "utf8");
  const days = evaluateMission(data.indicators, parseMissionCSV(csv));
  const at = (d) => days.find((x) => x.day === d).results;
  assert.equal(days.length, 30);
  assert.equal(at(14).heart_rate.trust, "impossible");
  assert.equal(at(18).temperature.status, "missing");
  assert.equal(at(17).mood.status, "red");
  assert.equal(at(23).blood_pressure.status, "yellow");
  assert.equal(systemStatus(data.indicators, "heart", at(1)), "green");
});

test("a radiation dose far above the personal average turns yellow", () => {
  const hist = [0.5, 0.48, 0.52, 0.5].map((v) => ({ trust: "ok", num: v, value: v, range: "green" }));
  assert.equal(evaluate(ind("radiation"), 0.55, hist).status, "green");
  assert.equal(evaluate(ind("radiation"), 2.4, hist).status, "yellow");
});

test("camera reading with a weak signal asks to measure again", () => {
  const r = evaluate(ind("heart_rate"), 72, [], false, { method: "camera", quality: 40 });
  assert.equal(r.status, "verify");
  assert.equal(r.trust, "low_signal");
});

test("camera reading with a good signal is judged normally and labelled as an estimate", () => {
  const r = evaluate(ind("heart_rate"), 72, [], false, { method: "camera", quality: 85 });
  assert.equal(r.status, "green");
  assert.match(r.reasons.at(-1), /Camera estimate/);
  assert.equal(evaluate(ind("heart_rate"), 130, [], false, { method: "camera", quality: 85 }).status, "red");
});

test("confirming does not override a weak camera signal", () => {
  const r = evaluate(ind("heart_rate"), 72, [], true, { method: "camera", quality: 20 });
  assert.equal(r.status, "verify");
});

test("evaluateMission passes how each value was measured", () => {
  const entries = [{ day: 1, values: { heart_rate: 72 }, measured: { heart_rate: { method: "camera", quality: 30 } } }];
  const [d] = evaluateMission(data.indicators, entries);
  assert.equal(d.results.heart_rate.trust, "low_signal");
});
