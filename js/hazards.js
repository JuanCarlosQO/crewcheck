// The five hazards of human spaceflight (NASA Human Research Program) and
// how CrewCheck tracks each one. Pure functions, tested in tests/hazards.test.mjs.

import { worst } from "./rules.js";

export const HAZARDS = [
  { id: "radiation", name: "Space radiation", systems: ["body"], icon: "radiation" },
  { id: "isolation", name: "Isolation & confinement", systems: ["mind"], icon: "isolation" },
  { id: "distance", name: "Distance from Earth", systems: [], icon: "distance" },
  { id: "gravity", name: "Gravity fields", systems: ["heart", "bones"], icon: "gravity" },
  { id: "closed", name: "Hostile closed environment", systems: ["lungs", "metabolism", "body"], icon: "closed" },
];

const BY_LABEL = {
  "Space radiation": "radiation",
  "Isolation and confinement": "isolation",
  "Gravity fields": "gravity",
  "Hostile closed environment": "closed",
};

/** Sum of daily doses logged so far (mSv), plus the dose from earlier missions. */
export function missionDose(entries, upToDay, priorDose = 0) {
  return entries
    .filter((e) => e.day <= upToDay && typeof e.values.radiation === "number" && e.values.radiation >= 0 && e.values.radiation <= 100)
    .reduce((s, e) => s + e.values.radiation, priorDose);
}

export function careerBand(dose, rad) {
  const f = dose / rad.careerLimitMSv;
  if (f >= rad.displayBands.redFrom) return "red";
  if (f >= rad.displayBands.yellowFrom) return "yellow";
  return "green";
}

/** Is a solar particle event recent enough to tell the crew to shelter? */
export function stormAlert(events, now, alertDays) {
  const recent = events.filter((e) => now - Date.parse(e.time) <= alertDays * 864e5 && now >= Date.parse(e.time));
  return recent.length ? recent.sort((a, b) => Date.parse(b.time) - Date.parse(a.time))[0] : null;
}

/**
 * Status of each hazard for one day.
 * @param indicators  list from data/indicators.json
 * @param results     evaluated results for the day
 * @param extra       { boneBand, careerStatus, storm, placeName, delay }
 */
export function hazardStatus(indicators, results, extra) {
  const byHazard = {};
  for (const ind of indicators) {
    const h = BY_LABEL[ind.hazard];
    if (!h) continue;
    (byHazard[h] ??= []).push(results[ind.id]?.status ?? "missing");
  }
  return HAZARDS.map((h) => {
    let status;
    let note;
    if (h.id === "distance") {
      status = "none";
      note = `${extra.placeName}: messages take ${extra.delay}`;
    } else if (h.id === "radiation") {
      status = worst([...(byHazard.radiation ?? []), extra.careerStatus, extra.storm ? "red" : "green"]);
      note = extra.storm ? "Solar particle event: shelter now" : "Dose and space weather";
    } else if (h.id === "gravity") {
      status = worst([...(byHazard.gravity ?? []), extra.boneBand]);
      note = "Heart, blood pressure and bones";
    } else {
      status = worst(byHazard[h.id] ?? ["missing"]);
      note = h.id === "isolation" ? "Sleep and mood" : "Temperature, blood sugar and oxygen";
    }
    return { ...h, status, note };
  });
}
