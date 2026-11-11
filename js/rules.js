// Health rules. Pure functions with no access to the page, so they can be
// tested with Node (see tests/rules.test.mjs).
//
// Each reading goes through four checks, in this order:
//   1. Is there a reading at all?                 -> "missing"
//   2. Can the value be real? Was the signal good  -> "verify" (re-measure first)
//      enough? Did it jump a lot?
//   3. Where does it fall in the ranges?          -> "green" | "yellow" | "red"
//   4. Is it unusual for this astronaut?          -> green can become "yellow"
// Mood also has a streak rule: several yellow days in a row become red.

export const SEVERITY = { missing: 0, green: 1, verify: 2, yellow: 3, red: 4 };

export function worst(statuses) {
  return statuses.reduce((a, b) => (SEVERITY[b] > SEVERITY[a] ? b : a), "missing");
}

const inRanges = (v, ranges = []) => ranges.some(([lo, hi]) => v >= lo && v <= hi);
const isNum = (v) => typeof v === "number" && Number.isFinite(v);

// The single number used for averages and jumps (systolic for blood pressure).
export function primary(ind, value) {
  if (value == null) return null;
  if (ind.type === "bp") return isNum(value.sys) ? value.sys : null;
  return isNum(value) ? value : null;
}

export function isMissing(ind, value) {
  if (value == null) return true;
  if (ind.type === "bp") return !isNum(value.sys) || !isNum(value.dia);
  return !isNum(value);
}

export function isPlausible(ind, value) {
  if (ind.type === "bp") {
    const [sLo, sHi] = ind.plausibleSys;
    const [dLo, dHi] = ind.plausibleDia;
    return value.sys >= sLo && value.sys <= sHi && value.dia >= dLo && value.dia <= dHi && value.sys > value.dia;
  }
  const [lo, hi] = ind.plausible;
  return value >= lo && value <= hi;
}

export function rangeStatus(ind, value) {
  if (ind.type === "bp") {
    const [gS, gD] = ind.greenMax;
    const [yS, yD] = ind.yellowMax;
    if (value.sys <= gS && value.dia <= gD) return "green";
    if (value.sys <= yS && value.dia <= yD) return "yellow";
    return "red";
  }
  if (inRanges(value, ind.green)) return "green";
  if (inRanges(value, ind.yellow)) return "yellow";
  return "red";
}

export function formatValue(ind, value) {
  if (isMissing(ind, value)) return "—";
  if (ind.type === "bp") return `${value.sys}/${value.dia}`;
  return value.toFixed(ind.decimals ?? 0);
}

/**
 * Evaluate one reading.
 * @param ind       indicator definition from data/indicators.json
 * @param value     number, or {sys, dia} for blood pressure, or null
 * @param history   earlier evaluations of the same indicator, oldest first
 * @param confirmed true when the astronaut re-measured and confirmed a big jump
 * @param measured  how the value was taken, e.g. { method: "camera", quality: 0-100 }
 */
export function evaluate(ind, value, history = [], confirmed = false, measured = null) {
  if (isMissing(ind, value)) {
    return { status: "missing", trust: "missing", reasons: ["No reading yet."] };
  }
  if (!isPlausible(ind, value)) {
    return {
      status: "verify",
      trust: "impossible",
      reasons: [`${formatValue(ind, value)} ${ind.unit} is outside what a human body can show. It is probably a typing or sensor error. Measure again.`],
    };
  }

  const cam = measured?.method === "camera" ? ind.camera : null;
  if (cam && !(measured.quality >= cam.minQuality)) {
    return {
      status: "verify",
      trust: "low_signal",
      reasons: [`Camera signal too weak (quality ${Math.round(measured.quality ?? 0)}/100, needs ${cam.minQuality}). Measure again with the camera or a medical sensor.`],
    };
  }

  const valid = history.filter((h) => h.trust === "ok" && h.num != null);
  const last = valid.at(-1);
  const num = primary(ind, value);

  if (!confirmed && ind.jumpPct != null && last && last.num !== 0) {
    const change = Math.abs(num - last.num) / last.num * 100;
    if (change > ind.jumpPct) {
      return {
        status: "verify",
        trust: "jump",
        num,
        reasons: [`Changed ${Math.round(change)}% since the last reading (${formatValue(ind, last.value)} → ${formatValue(ind, value)}). Measure again to confirm before acting on it.`],
      };
    }
  }

  let status = rangeStatus(ind, value);
  const reasons = [];
  if (status === "green") reasons.push("Within the normal range.");
  if (status === "yellow") reasons.push("Outside the normal range.");
  if (status === "red") reasons.push("Far outside the normal range.");

  if (status === "green" && ind.baselinePct != null) {
    const recent = valid.slice(-7);
    if (recent.length >= 3) {
      const avg = recent.reduce((s, h) => s + h.num, 0) / recent.length;
      const diff = (num - avg) / avg * 100;
      if (Math.abs(diff) > ind.baselinePct) {
        status = "yellow";
        reasons.splice(0, 1, `Normal range, but ${Math.round(Math.abs(diff))}% ${diff > 0 ? "above" : "below"} your 7-day average (${avg.toFixed(ind.decimals ?? 0)}). Unusual for you.`);
      }
    }
  }

  if (ind.streakRed && status === ind.streakRed.status) {
    const need = ind.streakRed.days - 1;
    const prev = history.slice(-need);
    if (prev.length === need && prev.every((h) => h.range === ind.streakRed.status)) {
      status = "red";
      reasons.splice(0, 1, `${ind.streakRed.days} days in a row outside the normal range.`);
    }
  }

  if (cam) reasons.push(`Camera estimate (signal quality ${Math.round(measured.quality)}/100). Less accurate than a medical sensor.`);

  return { status, trust: "ok", num, range: rangeStatus(ind, value), reasons };
}

/**
 * Evaluate every indicator for every day.
 * @param indicators list from data/indicators.json
 * @param entries    [{ day, values: { id: value }, confirmed: { id: true }, measured: { id: {...} } }], sorted by day
 * @returns          [{ day, results: { id: { value, status, trust, reasons } } }]
 */
export function evaluateMission(indicators, entries) {
  const history = Object.fromEntries(indicators.map((i) => [i.id, []]));
  return entries.map((entry) => {
    const results = {};
    for (const ind of indicators) {
      const value = entry.values[ind.id] ?? null;
      const res = evaluate(ind, value, history[ind.id], Boolean(entry.confirmed?.[ind.id]), entry.measured?.[ind.id] ?? null);
      const full = { ...res, value, num: res.num ?? primary(ind, value), measured: entry.measured?.[ind.id] ?? null };
      results[ind.id] = full;
      history[ind.id].push(full);
    }
    return { day: entry.day, results };
  });
}

export function systemStatus(indicators, systemId, results) {
  const ids = indicators.filter((i) => i.system === systemId).map((i) => i.id);
  if (!ids.length) return "none";
  return worst(ids.map((id) => results[id]?.status ?? "missing"));
}
