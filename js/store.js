// Data loading and saving. Everything stays in this browser (localStorage),
// so the app works without a server or a connection to Earth.

const KEY = "crewcheck.v1";

export async function loadJSON(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Could not load ${path} (${res.status})`);
  return res.json();
}

// Turns a CSV row into an entry. Empty cells become null (a missing reading).
export function parseMissionCSV(text) {
  const [head, ...lines] = text.trim().split(/\r?\n/);
  const cols = head.split(",").map((c) => c.trim());
  const num = (s) => (s == null || s.trim() === "" ? null : Number(s));
  return lines.filter(Boolean).map((line) => {
    const cells = line.split(",");
    const row = Object.fromEntries(cols.map((c, i) => [c, cells[i]]));
    const sys = num(row.bp_sys);
    const dia = num(row.bp_dia);
    return {
      day: Number(row.day),
      source: "demo",
      confirmed: {},
      values: {
        heart_rate: num(row.heart_rate),
        blood_pressure: sys == null && dia == null ? null : { sys, dia },
        temperature: num(row.temperature),
        glucose: num(row.glucose),
        spo2: num(row.spo2),
        sleep: num(row.sleep),
        mood: num(row.mood),
        exercise_min: num(row.exercise_min),
        radiation: num(row.radiation_msv),
      },
    };
  });
}

export async function loadDemo() {
  const res = await fetch("data/mission_demo.csv");
  if (!res.ok) throw new Error("Could not load the demo mission");
  return parseMissionCSV(await res.text());
}

const DEFAULT_SETTINGS = { name: "Commander", place: "iss", exerciseTarget: 120, priorDose: 0 };

export function readState() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    return { settings: { ...DEFAULT_SETTINGS, ...s.settings }, entries: s.entries ?? [] };
  } catch {
    return null;
  }
}

export function saveState(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function defaultSettings() {
  return { ...DEFAULT_SETTINGS };
}
