import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { evaluateMission } from "../js/rules.js";
import { parseMissionCSV } from "../js/store.js";
import { hazardStatus, missionDose, careerBand, stormAlert, HAZARDS } from "../js/hazards.js";

const data = JSON.parse(readFileSync(new URL("../data/indicators.json", import.meta.url)));
const rad = JSON.parse(readFileSync(new URL("../data/radiation.json", import.meta.url)));
const entries = parseMissionCSV(readFileSync(new URL("../data/mission_demo.csv", import.meta.url), "utf8"));
const days = evaluateMission(data.indicators, entries);
const at = (d) => days.find((x) => x.day === d).results;
const extra = { boneBand: "green", careerStatus: "green", storm: null, placeName: "Space station", delay: "a few seconds" };

test("all five NASA hazards are covered", () => {
  assert.deepEqual(HAZARDS.map((h) => h.id), ["radiation", "isolation", "distance", "gravity", "closed"]);
  const ids = new Set(data.indicators.map((i) => i.hazard));
  for (const label of ["Space radiation", "Isolation and confinement", "Gravity fields", "Hostile closed environment"]) assert.ok(ids.has(label), label);
});

test("hazards follow the indicators linked to them", () => {
  const h = Object.fromEntries(hazardStatus(data.indicators, at(17), extra).map((x) => [x.id, x.status]));
  assert.equal(h.isolation, "red");
  assert.equal(h.distance, "none");
  const day22 = Object.fromEntries(hazardStatus(data.indicators, at(22), extra).map((x) => [x.id, x.status]));
  assert.equal(day22.radiation, "yellow");
});

test("an active storm makes radiation red", () => {
  const h = hazardStatus(data.indicators, at(1), { ...extra, storm: { time: "x" } }).find((x) => x.id === "radiation");
  assert.equal(h.status, "red");
});

test("mission dose adds up the log and earlier missions", () => {
  const d = missionDose(entries, 30, 10);
  assert.ok(d > 10 + 14 && d < 10 + 20);
  assert.equal(careerBand(100, rad), "green");
  assert.equal(careerBand(320, rad), "yellow");
  assert.equal(careerBand(500, rad), "red");
});

test("storm alert only for recent events", () => {
  const events = [{ time: "2026-11-10T00:00Z" }, { time: "2026-10-01T00:00Z" }];
  assert.ok(stormAlert(events, Date.parse("2026-11-11T00:00Z"), 2));
  assert.equal(stormAlert(events, Date.parse("2026-11-20T00:00Z"), 2), null);
});
