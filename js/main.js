import { evaluateMission, evaluate, systemStatus, formatValue, worst, SEVERITY } from "./rules.js";
import { projectLoss, projectionSeries, bandFor, exerciseAdherence, DAYS_PER_MONTH } from "./forecast.js";
import { loadJSON, loadDemo, readState, saveState, defaultSettings } from "./store.js";
import { holoSVG, calloutsHTML } from "./body.js";
import { trendChart, projectionChart } from "./charts.js";
import { HAZARDS, hazardStatus, missionDose, careerBand, stormAlert } from "./hazards.js";
import { countUp, bindTilt, bindSpotlight, sparkline, statusRing, playTimelapse, reduceMotion } from "./fx.js";

const STATUS = {
  green: { label: "Normal" },
  yellow: { label: "Watch" },
  red: { label: "Act now" },
  verify: { label: "Measure again" },
  missing: { label: "No reading" },
  none: { label: "Not daily" },
  hatch: { label: "No number yet" },
};
const FORECAST_LABEL = { green: "Small change", yellow: "Moderate change", red: "Large change" };

const PLACES = {
  iss: { name: "Space station", delay: "a few seconds", mission: "iss" },
  moon: { name: "Lunar base", delay: "about 1.3 seconds each way", mission: "moon" },
  mars: { name: "Mars", delay: "3 to 22 minutes each way", mission: "mars" },
};

const VIEWS = ["today", "checkin", "trends", "future", "data"];
const FUTURE_MAX_DAY = 1000;

const app = {
  data: null, forecast: null, radiation: null, sw: { mode: "loading", events: [], archive: [] }, state: null, days: [], shown: {}, stopPlay: null,
  ui: { view: "today", day: null, system: null, hazard: null, storm: null, trend: "heart_rate", futureDay: null, cm: false, checkinDay: null },
};

const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pill = (status, label = STATUS[status].label) => `<span class="pill s-${status}"><i aria-hidden="true"></i>${esc(label)}</span>`;
const indById = (id) => app.data.indicators.find((i) => i.id === id);
const lastDay = () => app.days.at(-1)?.day ?? 0;
const resultsFor = (day) => app.days.find((d) => d.day === day)?.results ?? {};
const entryFor = (day) => app.state.entries.find((e) => e.day === day);
const stagger = (i) => `style="--i:${i}"`;

function recompute() {
  app.state.entries.sort((a, b) => a.day - b.day);
  app.days = evaluateMission(app.data.indicators, app.state.entries);
  if (app.ui.day == null || !app.days.some((d) => d.day === app.ui.day)) app.ui.day = lastDay();
}

function persist() {
  saveState(app.state);
  recompute();
}

/* ---------- Today: body scan ---------- */

function summary(results) {
  const counts = { red: 0, yellow: 0, verify: 0, green: 0 };
  Object.values(results).forEach((r) => { if (counts[r.status] != null) counts[r.status] += 1; });
  const overall = worst(Object.values(results).map((r) => r.status));
  const parts = [];
  if (counts.red) parts.push(`${counts.red} to act on now`);
  if (counts.yellow) parts.push(`${counts.yellow} to watch`);
  if (counts.verify) parts.push(`${counts.verify} to measure again`);
  const headline = parts.length ? `${parts.join(", ").replace(/^./, (c) => c.toUpperCase())}.` : overall === "missing" ? "No readings for this day yet." : "All readings are normal.";
  return { overall, headline, normal: counts.green };
}

function valueMarkup(ind, value) {
  if (value == null || (ind.type === "bp" && (value.sys == null || value.dia == null))) return `<span class="num">—</span>`;
  const prev = app.shown[ind.id];
  if (ind.type === "bp") {
    return `<span class="num" data-count="${value.sys}" data-from="${prev?.sys ?? 0}">${value.sys}</span><span class="slash">/</span><span class="num" data-count="${value.dia}" data-from="${prev?.dia ?? 0}">${value.dia}</span>`;
  }
  return `<span class="num" data-count="${value}" data-dec="${ind.decimals ?? 0}" data-from="${typeof prev === "number" ? prev : 0}">${value.toFixed(ind.decimals ?? 0)}</span>`;
}

function tile(ind, r, day, i) {
  const upto = app.days.filter((d) => d.day <= day).slice(-7);
  const vals = upto.map((d) => { const v = d.results[ind.id]; return v.trust === "ok" ? v.num : null; });
  const sts = upto.map((d) => d.results[ind.id].status);
  const confirm = r.trust === "jump" ? `<button class="btn tiny" data-confirm="${ind.id}" data-day="${day}">Re-measured, it is correct</button>` : "";
  const fix = r.trust === "impossible" || r.status === "missing" ? `<button class="btn tiny ghost" data-edit-day="${day}">Enter reading</button>` : "";
  return `<article class="tile tilt s-${r.status}" data-system="${ind.system}" ${stagger(i)}>
    <div class="sheen" aria-hidden="true"></div>
    <div class="tile-top"><h3>${esc(ind.name)}</h3>${pill(r.status)}</div>
    <p class="tile-value">${valueMarkup(ind, r.value)}<span class="unit">${esc(ind.unit)}</span></p>
    ${sparkline(vals, sts)}
    <p class="tile-reason">${esc(r.reasons[0])}</p>
    <div class="tile-actions">${confirm}${fix}<button class="link" data-trend="${ind.id}">Trend →</button></div>
  </article>`;
}

function actionItems(results) {
  const place = PLACES[app.state.settings.place];
  return app.data.indicators
    .map((ind) => ({ ind, r: results[ind.id] }))
    .filter(({ r }) => r && ["red", "yellow", "verify"].includes(r.status))
    .sort((a, b) => SEVERITY[b.r.status] - SEVERITY[a.r.status])
    .map(({ ind, r }, i) => {
      let text;
      if (r.status === "verify") text = r.trust === "impossible" ? "This value cannot be right. Check the sensor and measure again before doing anything else." : "Measure again. If the new value is the same, confirm it so the app can judge it.";
      else text = ind.actions[r.status];
      const escalate = r.status === "red"
        ? `<p class="escalate"><strong>Distance from Earth.</strong> From ${esc(place.name.toLowerCase())}, a message to the flight surgeon takes ${esc(place.delay)}. Start these steps now; do not wait for the reply.</p>`
        : "";
      return `<li class="s-${r.status}" ${stagger(i)}><span class="a-bar" aria-hidden="true"></span><div><div class="a-top"><strong>${esc(ind.name)}</strong>${pill(r.status)}</div><p>${esc(text)}</p>${escalate}</div></li>`;
    }).join("");
}

function calloutInfoToday(results) {
  const info = {};
  for (const s of app.data.systems) {
    const status = systemStatus(app.data.indicators, s.id, results);
    const inds = app.data.indicators.filter((i) => i.system === s.id);
    const detail = inds.map((i) => `${formatValue(i, results[i.id]?.value)} ${i.unit}`).join(" · ");
    info[s.id] = status === "none"
      ? { status: "none", label: "Not measured daily", detail: "Open Future body" }
      : { status, label: STATUS[status].label, detail: esc(detail) };
  }
  return info;
}

function missionStrip(day) {
  return `<div class="strip" role="group" aria-label="Mission days">${app.days.map((d) => {
    const st = worst(Object.values(d.results).map((r) => r.status));
    return `<button class="strip-day s-${st} ${d.day === day ? "current" : ""}" data-goto-day="${d.day}" aria-label="Day ${d.day}: ${STATUS[st].label}" title="Day ${d.day}"></button>`;
  }).join("")}</div>`;
}

const HAZARD_ICONS = {
  radiation: `<circle cx="12" cy="12" r="2"/><path d="M12 10 L9 4.8 A8 8 0 0 1 15 4.8 Z M13.7 13 L19.7 13 A8 8 0 0 1 16.7 18.2 Z M10.3 13 L7.3 18.2 A8 8 0 0 1 4.3 13 Z"/>`,
  isolation: `<rect x="4" y="4" width="16" height="16" rx="4"/><circle cx="12" cy="10" r="2.4"/><path d="M8.5 17 q3.5 -5 7 0"/>`,
  distance: `<circle cx="5" cy="17" r="3"/><circle cx="19.5" cy="6.5" r="1.8"/><path d="M8 15 L17.5 8" stroke-dasharray="2 2.4"/>`,
  gravity: `<circle cx="12" cy="7" r="4"/><path d="M12 13v8M8.5 17.5 12 21l3.5-3.5"/>`,
  closed: `<path d="M3.5 18 a8.5 8.5 0 0 1 17 0 Z"/><path d="M8 14.5 q2 -2 4 0 t4 0"/>`,
};

function radiationState(day) {
  const rad = app.radiation;
  const dose = missionDose(app.state.entries, day, Number(app.state.settings.priorDose) || 0);
  const share = dose / rad.careerLimitMSv;
  const live = app.sw.mode === "live" ? stormAlert(app.sw.events, Date.now(), rad.alertDays) : null;
  const storm = app.ui.storm ?? live;
  return { dose, share, status: careerBand(dose, rad), storm, replay: Boolean(app.ui.storm) };
}

function hazardsFor(day, results) {
  const bones = app.forecast.systems.find((s) => s.id === "bones");
  const boneBand = bandFor(bones, projectLoss(bones, day, false, app.forecast.validatedMonths).mid);
  const place = PLACES[app.state.settings.place];
  const r = radiationState(day);
  return hazardStatus(app.data.indicators, results, { boneBand, careerStatus: r.status, storm: r.storm, placeName: place.name, delay: place.delay });
}

function hazardRow(day, results) {
  return `<div class="hazards" role="group" aria-label="The five hazards of human spaceflight">${hazardsFor(day, results).map((h, i) => `
    <button class="hazard s-${h.status} ${app.ui.hazard === h.id ? "active" : ""}" data-hazard="${h.id}" ${stagger(i + 1)}>
      <svg class="hz-icon" viewBox="0 0 24 24" aria-hidden="true">${HAZARD_ICONS[h.icon]}</svg>
      <span class="hz-text"><span class="hz-name">${esc(h.name)}</span><span class="hz-note">${esc(h.note)}</span></span>
      <span class="hz-dot" aria-label="${h.status === "none" ? "Information" : STATUS[h.status].label}"></span>
    </button>`).join("")}</div>`;
}

function radiationPanel(day) {
  const rad = app.radiation;
  const r = radiationState(day);
  const pct = Math.min(100, r.share * 100);
  const latest = app.sw.events.length ? [...app.sw.events].sort((a, b) => Date.parse(b.time) - Date.parse(a.time))[0] : null;
  const fmtDate = (t) => new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  const swLine = app.sw.mode === "loading" ? "Checking NASA DONKI…"
    : app.sw.mode === "live" ? (latest ? `Live from NASA DONKI: last solar particle event on ${fmtDate(latest.time)}.` : "Live from NASA DONKI: no solar particle events in the last 30 days.")
    : `Offline: showing archived NASA DONKI events. Most recent in the archive: ${fmtDate(app.sw.archive[0].time)}.`;
  const replayEvent = app.sw.archive.find((e) => e.id.startsWith("2024-05-11")) ?? app.sw.archive[0];
  return `<div class="panel rad-panel ${r.storm ? "storm" : ""}" ${stagger(4)}>
    <div class="panel-head"><h2>Radiation</h2>${r.storm ? pill("red", "Shelter now") : pill(r.status, "Career dose")}</div>
    <div class="dose">
      <p class="dose-num"><span class="num" data-count="${r.dose.toFixed(1)}" data-dec="1">${r.dose.toFixed(1)}</span><span class="unit">mSv this career</span></p>
      <div class="dose-bar s-${r.status}" style="--p:${pct.toFixed(2)}%"><span></span><i style="left:${rad.displayBands.yellowFrom * 100}%"></i><i style="left:${rad.displayBands.redFrom * 100}%"></i></div>
      <p class="small muted">${(r.share * 100).toFixed(1)}% of NASA's career limit of ${rad.careerLimitMSv} mSv. <a href="${esc(rad.careerLimitSource.url)}" target="_blank" rel="noopener">Source</a></p>
    </div>
    ${r.storm ? `<div class="storm-box"><p><strong>${r.replay ? `Replay of a real event: ${fmtDate(r.storm.time)}.` : "Solar particle event detected."}</strong> ${esc(rad.shelter)}</p><p class="small"><a href="${esc(r.storm.link)}" target="_blank" rel="noopener">${esc(r.storm.instrument)}</a> · NASA DONKI</p></div>` : ""}
    <p class="sw-line small"><span class="sw-dot ${app.sw.mode}"></span>${esc(swLine)}</p>
    <div class="form-actions">${r.replay ? `<button class="btn tiny ghost" data-storm-stop>End the replay</button>` : replayEvent ? `<button class="btn tiny ghost" data-storm-replay="${esc(replayEvent.id)}">Replay a real solar storm</button>` : ""}</div>
  </div>`;
}

function viewToday() {
  const day = app.ui.day;
  if (!app.days.length) {
    return `<section class="view"><div class="panel empty"><h2>No readings yet</h2><p>Start with today's log, or load the demo mission from Sources.</p><a class="btn" href="#checkin">Start the log</a></div></section>`;
  }
  const results = resultsFor(day);
  const entry = entryFor(day);
  const sum = summary(results);
  const stormNow = radiationState(day).storm;
  const overall = stormNow ? "red" : sum.overall;
  const headline = stormNow ? `Solar storm: go to the shelter. ${sum.headline}` : sum.headline;
  const normal = sum.normal;
  const sel = app.ui.system;
  const sysInfo = sel ? app.data.systems.find((s) => s.id === sel) : null;
  const storm = radiationState(day).storm;
  const actions = (storm ? `<li class="s-red" ${stagger(0)}><span class="a-bar" aria-hidden="true"></span><div><div class="a-top"><strong>Space radiation</strong>${pill("red")}</div><p>${esc(app.radiation.shelter)}</p></div></li>` : "") + actionItems(results);
  const tiles = app.data.indicators
    .filter((ind) => !sel || ind.system === sel)
    .map((ind, i) => tile(ind, results[ind.id], day, i)).join("");
  const ring = statusRing(app.data.indicators.map((i) => results[i.id].status));

  return `<section class="view today">
    <div class="view-head" ${stagger(0)}>
      <div>
        <p class="kicker">Body scan · ${entry?.source === "demo" ? "demo data" : "your log"}</p>
        <h1>Mission day <span class="accent">${day}</span></h1>
      </div>
      <div class="stepper">
        <button class="round" data-day-step="-1" aria-label="Previous day" ${day <= app.days[0].day ? "disabled" : ""}>‹</button>
        <button class="round" data-day-step="1" aria-label="Next day" ${day >= lastDay() ? "disabled" : ""}>›</button>
      </div>
    </div>
    ${missionStrip(day)}
    ${hazardRow(day, results)}
    <div class="scan-grid">
      <div class="panel holo-panel" ${stagger(1)}>
        <div class="holo spot" data-mode="today">
          ${holoSVG("today")}
          <div class="callouts">${calloutsHTML("today", calloutInfoToday(results))}</div>
        </div>
        <div class="holo-foot">${sysInfo
          ? `<div><h3>${esc(sysInfo.name)}</h3><p>${esc(sysInfo.about)}</p></div><div class="holo-foot-actions">${sel === "bones" ? `<a class="btn tiny" href="#future">Open Future body</a>` : ""}<button class="btn tiny ghost" data-system-clear>Show all</button></div>`
          : `<p class="muted">Tap a part of the body or a label to focus on it.</p>`}</div>
      </div>
      <div class="side">
        <div class="panel status-panel s-${overall}" ${stagger(2)}>
          <div class="ring-wrap">${ring}<div class="ring-center"><span class="num" data-count="${normal}">${normal}</span><small>of ${app.data.indicators.length} normal</small></div></div>
          <div class="status-text"><p class="kicker">Status</p><p class="headline">${esc(headline)}</p>${pill(overall)}</div>
        </div>
        <div class="panel actions-panel" ${stagger(3)}>
          <h2>What to do now</h2>
          ${actions ? `<ul class="action-list">${actions}</ul>` : `<p class="muted">Nothing to do. Keep your routine: exercise, meals and sleep on schedule.</p>`}
        </div>
        ${radiationPanel(day)}
      </div>
    </div>
    <div class="tiles">${tiles || `<p class="muted">Bones and muscles are not measured daily. See Future body.</p>`}</div>
  </section>`;
}

function paintToday(results) {
  const screen = $('.holo[data-mode="today"]');
  if (!screen) return;
  screen.querySelectorAll("[data-system]").forEach((z) => {
    if (z.classList.contains("callout")) return;
    z.dataset.status = systemStatus(app.data.indicators, z.dataset.system, results);
  });
  screen.dataset.selected = app.ui.system ?? "";
  const hz = HAZARDS.find((h) => h.id === app.ui.hazard);
  screen.dataset.hazard = hz ? hz.id : "";
  screen.querySelectorAll("[data-system]").forEach((z) => z.classList.toggle("lit", Boolean(hz && hz.systems.includes(z.dataset.system))));
  // remember what is on screen so the next day counts up from here
  app.data.indicators.forEach((i) => {
    const v = results[i.id]?.value;
    app.shown[i.id] = v && i.type === "bp" ? { ...v } : v;
  });
}

/* ---------- Log (check-in) ---------- */

const FIELDS = [
  { id: "heart_rate", step: "1" },
  { id: "blood_pressure", bp: true },
  { id: "temperature", step: "0.1" },
  { id: "glucose", step: "1" },
  { id: "spo2", step: "1" },
  { id: "sleep", step: "0.1" },
  { id: "radiation", step: "0.01" },
];
const MOODS = [["1", "Very bad"], ["2", "Bad"], ["3", "OK"], ["4", "Good"], ["5", "Very good"]];

function moodFace(v) {
  const mouth = { 1: "M9 17 q3 -4 6 0", 2: "M9 16.5 q3 -2 6 0", 3: "M9 16 h6", 4: "M9 15.5 q3 2 6 0", 5: "M8.5 15 q3.5 4 7 0" }[v];
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9.5"/><circle class="eye" cx="9" cy="10" r="1.1"/><circle class="eye" cx="15" cy="10" r="1.1"/><path d="${mouth}"/></svg>`;
}

function viewCheckin() {
  const editing = app.ui.checkinDay;
  const day = editing ?? lastDay() + 1;
  const prev = entryFor(day)?.values ?? {};
  const field = (f, i) => {
    const ind = indById(f.id);
    const input = f.bp
      ? `<div class="bp-inputs"><input id="f-bp-sys" name="bp_sys" type="number" inputmode="numeric" placeholder="120" value="${prev.blood_pressure?.sys ?? ""}" aria-label="Systolic, top number"><span>/</span><input id="f-bp-dia" name="bp_dia" type="number" inputmode="numeric" placeholder="80" value="${prev.blood_pressure?.dia ?? ""}" aria-label="Diastolic, bottom number"></div>`
      : `<input id="f-${f.id}" name="${f.id}" type="number" inputmode="decimal" step="${f.step}" value="${prev[f.id] ?? ""}" placeholder="—">`;
    return `<div class="module" data-field="${f.id}" ${stagger(i)}>
      <label for="${f.bp ? "f-bp-sys" : "f-" + f.id}"><span>${esc(ind.name)}</span><span class="unit">${esc(ind.unit)}</span></label>
      ${input}
      <div class="live" aria-live="polite"></div>
      <details><summary>How to measure</summary><ol>${ind.howToMeasure.map((s) => `<li>${esc(s)}</li>`).join("")}</ol><p class="muted">${esc(ind.whatIs)}</p></details>
    </div>`;
  };
  return `<section class="view checkin">
    <div class="view-head" ${stagger(0)}>
      <div><p class="kicker">Daily log</p><h1>${editing ? `Edit day <span class="accent">${day}</span>` : `Log mission day <span class="accent">${day}</span>`}</h1></div>
    </div>
    <p class="lead" ${stagger(1)}>Enter what you measured and leave a box empty if you could not measure it. Each value is checked while you type.</p>
    <form id="checkin-form" novalidate>
      <div class="modules">${FIELDS.map(field).join("")}
        <div class="module" data-field="exercise_min" ${stagger(7)}>
          <label for="f-exercise_min"><span>Exercise today</span><span class="unit">min</span></label>
          <input id="f-exercise_min" name="exercise_min" type="number" inputmode="numeric" step="5" value="${prev.exercise_min ?? ""}" placeholder="—">
          <p class="muted small">Feeds Future body. Mission target: ${app.state.settings.exerciseTarget} minutes.</p>
        </div>
      </div>
      <fieldset class="module mood" data-field="mood" ${stagger(8)}>
        <legend>How do you feel today?</legend>
        <div class="faces">${MOODS.map(([v, label]) => `<label class="face"><input type="radio" name="mood" value="${v}" ${String(prev.mood) === v ? "checked" : ""}><span class="face-btn">${moodFace(v)}<span>${label}</span></span></label>`).join("")}</div>
        <div class="live" aria-live="polite"></div>
      </fieldset>
      <div class="form-actions"><button class="btn big" type="submit">Save log</button>${editing ? `<button class="btn ghost" type="button" data-cancel-edit>Cancel</button>` : ""}</div>
    </form>
  </section>`;
}

function readForm(form) {
  const fd = new FormData(form);
  const n = (k) => { const v = fd.get(k); return v == null || String(v).trim() === "" ? null : Number(v); };
  const sys = n("bp_sys"), dia = n("bp_dia");
  return {
    heart_rate: n("heart_rate"),
    blood_pressure: sys == null && dia == null ? null : { sys, dia },
    temperature: n("temperature"),
    glucose: n("glucose"),
    spo2: n("spo2"),
    sleep: n("sleep"),
    mood: n("mood"),
    exercise_min: n("exercise_min"),
    radiation: n("radiation"),
  };
}

function liveCheck(form) {
  const day = app.ui.checkinDay ?? lastDay() + 1;
  const values = readForm(form);
  const hist = evaluateMission(app.data.indicators, app.state.entries.filter((e) => e.day < day));
  for (const ind of app.data.indicators) {
    const mod = form.querySelector(`[data-field="${ind.id}"]`);
    const box = mod?.querySelector(".live");
    if (!box) continue;
    const v = values[ind.id];
    const bpPartial = ind.type === "bp" && v && (v.sys == null || v.dia == null);
    if (v == null || bpPartial) { box.innerHTML = ""; mod.dataset.status = ""; continue; }
    const r = evaluate(ind, v, hist.map((d) => d.results[ind.id]));
    mod.dataset.status = r.status;
    box.innerHTML = `${pill(r.status)}<span>${esc(r.reasons[0])}</span>`;
  }
}

/* ---------- Trends ---------- */

function viewTrends() {
  const ind = indById(app.ui.trend);
  const pts = app.days.map((d) => ({ x: d.day, status: d.results[ind.id].status, value: d.results[ind.id].value }));
  let series, yMin, yMax, bands;
  if (ind.type === "bp") {
    series = [
      { name: "Top number", points: pts.map((p) => ({ x: p.x, y: p.value?.sys ?? null, status: p.status, label: formatValue(ind, p.value) })) },
      { name: "Bottom number", points: pts.map((p) => ({ x: p.x, y: p.value?.dia ?? null, status: p.status, label: formatValue(ind, p.value) })) },
    ];
    yMin = 50; yMax = 160; bands = [];
  } else {
    series = [{ name: ind.name, points: pts.map((p) => ({ x: p.x, y: p.value, status: p.status, label: formatValue(ind, p.value) })) }];
    const vals = pts.map((p) => p.value).filter((v) => typeof v === "number" && v >= ind.plausible[0] && v <= ind.plausible[1]);
    const g = ind.chartBands === false ? [] : ind.green.flat();
    const lo = Math.min(...vals, ...g), hi = Math.max(...vals, ...g);
    const pad = (hi - lo) * 0.25 || 1;
    yMin = Math.max(ind.plausible[0], +(lo - pad).toFixed(2));
    yMax = Math.min(ind.plausible[1], +(hi + pad).toFixed(2));
    bands = ind.chartBands === false ? [] : [...ind.yellow.map(([a, b]) => ({ from: a, to: b, cls: "b-yellow" })), ...ind.green.map(([a, b]) => ({ from: a, to: b, cls: "b-green" }))];
  }
  const flagged = app.days.filter((d) => d.results[ind.id].status !== "green");
  return `<section class="view trends">
    <div class="view-head" ${stagger(0)}><div><p class="kicker">Trends</p><h1>${esc(ind.name)} <span class="unit-h">${esc(ind.unit)}</span></h1></div></div>
    <div class="segments" role="tablist" ${stagger(1)}>${app.data.indicators.map((i) => `<button role="tab" aria-selected="${i.id === ind.id}" class="segment ${i.id === ind.id ? "active" : ""}" data-trend="${i.id}">${esc(i.name)}</button>`).join("")}</div>
    <div class="panel screen-panel" ${stagger(2)}>
      <ul class="key">${ind.type === "bp" ? `<li><span class="k line0"></span>Top number</li><li><span class="k line1"></span>Bottom number</li><li>Normal: below 120/80</li>` : `<li><span class="k b-green"></span>Normal range</li><li><span class="k b-yellow"></span>Watch range</li>`}<li><span class="k verify"></span>Measure again</li></ul>
      <div class="screen spot chart-wrap">${trendChart({ series, bands, xMax: Math.max(lastDay(), 2), yMin, yMax, unit: ind.unit, selectedX: app.ui.day })}</div>
      <p class="axis-caption">Horizontal axis: mission day. ${esc(ind.whatIs)} Related hazard: ${esc(ind.hazard)}.</p>
    </div>
    <div class="panel" ${stagger(3)}>
      <h2>Days that need a look</h2>
      ${flagged.length ? `<ul class="flag-list">${flagged.map((d) => { const r = d.results[ind.id]; return `<li><button class="link" data-goto-day="${d.day}">Day ${d.day}</button><span class="num">${formatValue(ind, r.value)}</span>${pill(r.status)}<span class="muted">${esc(r.reasons[0])}</span></li>`; }).join("")}</ul>` : `<p class="muted">Every day is in the normal range.</p>`}
    </div>
  </section>`;
}

/* ---------- Future body ---------- */

function futureParts() {
  const f = app.forecast;
  const bones = f.systems.find((s) => s.id === "bones");
  const validatedDay = Math.round(f.validatedMonths * DAYS_PER_MONTH);
  const day = app.ui.futureDay;
  const cm = app.ui.cm;
  const p = projectLoss(bones, day, cm, f.validatedMonths);
  const band = bandFor(bones, p.mid);
  const adherence = exerciseAdherence(app.state.entries, app.state.settings.exerciseTarget);
  const yMax = Math.max(10, Math.ceil(projectLoss(bones, FUTURE_MAX_DAY, false, f.validatedMonths).high / 10) * 10);
  const fmt = (v) => v.toFixed(1);

  const scenarios = [{ cls: "no-cm", label: "No resistive exercise", points: projectionSeries(bones, FUTURE_MAX_DAY, false, f.validatedMonths) }];
  if (cm) scenarios.push({ cls: "cm", label: bones.countermeasure.name, points: projectionSeries(bones, FUTURE_MAX_DAY, true, f.validatedMonths) });

  const range = `<span class="range"><span class="range-num">${cm && p.uncertainCountermeasure ? "0.0" : "−" + fmt(p.low)}</span><span class="range-to">to</span><span class="range-num">−${fmt(p.high)}</span><span class="range-unit">%</span></span>`;
  const readout = `
    <div class="readout-top"><p class="kicker">Bones · spine &amp; hips · day ${day}</p>${pill(band, FORECAST_LABEL[band])}</div>
    ${range}
    <p class="readout-sub">${cm && p.uncertainCountermeasure ? "Exercise helps, but NASA has not published by how much, so the range starts at no loss." : "Bone density compared with before flight."}</p>
    ${p.extrapolated ? `<p class="note warn">Past ${f.validatedMonths} months this is an extrapolation: NASA measured the rate on missions of four to six months.</p>` : ""}
    ${cm && p.uncertainCountermeasure ? `<p class="note">${esc(bones.countermeasure.note)} <a href="${esc(bones.countermeasure.source.url)}" target="_blank" rel="noopener">Source</a>.</p>` : ""}
    ${adherence ? `<p class="note">Your log: exercise target of ${app.state.settings.exerciseTarget} min reached on <strong>${adherence.met} of ${adherence.total}</strong> days.</p>` : ""}`;

  const info = {
    bones: { status: band, label: FORECAST_LABEL[band], detail: `−${fmt(p.low)} to −${fmt(p.high)}%` },
  };
  for (const s of f.systems.filter((x) => x.kind === "qualitative")) info[s.id] = { status: "hatch", label: "No number yet", detail: "" };

  return {
    bones, day, cm, band, p, readout, info,
    months: (day / DAYS_PER_MONTH).toFixed(1),
    chart: projectionChart({ scenarios, maxDay: FUTURE_MAX_DAY, yMax, selectedDay: day, validatedDay, todayDay: lastDay() || null }),
    key: `<li><span class="k no-cm"></span>No resistive exercise</li>${cm ? `<li><span class="k cm"></span>With countermeasures</li>` : ""}<li><span class="k extrap"></span>Beyond measured missions</li>`,
  };
}

function updateFuture() {
  const p = futureParts();
  $("#future-day-num").textContent = p.day;
  $("#future-months").textContent = p.months;
  $("#future-day").value = p.day;
  $("#future-day").style.setProperty("--fill", `${(p.day / FUTURE_MAX_DAY) * 100}%`);
  const ro = $("#future-readout");
  ro.className = `panel readout s-${p.band}`;
  ro.innerHTML = p.readout;
  $("#future-chart").innerHTML = p.chart;
  $("#future-key").innerHTML = p.key;
  $('.holo[data-mode="future"] .callouts').innerHTML = calloutsHTML("future", p.info);
  document.querySelectorAll(".preset").forEach((b) => b.classList.toggle("active", Number(b.dataset.preset) === p.day));
  paintFuture(p);
}

function viewFuture() {
  const f = app.forecast;
  const p = futureParts();
  const qual = f.systems.filter((s) => s.kind === "qualitative").map((s, i) => `
    <article class="panel qual tilt" ${stagger(i + 5)}>
      <div class="sheen" aria-hidden="true"></div>
      <div class="tile-top"><h3>${esc(s.name)}</h3>${pill("hatch")}</div>
      <p>${esc(s.summary)}</p>
      <p class="muted small">${s.source ? `Source: <a href="${esc(s.source.url)}" target="_blank" rel="noopener">${esc(s.source.label)}</a>. ` : "Source pending. "}Research team: ${esc(s.pending)}.</p>
    </article>`).join("");

  return `<section class="view future">
    <div class="view-head" ${stagger(0)}>
      <div><p class="kicker">Future body</p><h1>Your body on day <span class="accent" id="future-day-num">${p.day}</span></h1>
      <p class="lead">If the mission goes on like this, how will your body change? Choose a mission, move through time and switch countermeasures on.</p></div>
    </div>
    <div class="scan-grid">
      <div class="panel holo-panel" ${stagger(1)}>
        <div class="holo spot" data-mode="future">
          ${holoSVG("future")}
          <div class="callouts">${calloutsHTML("future", p.info)}</div>
        </div>
        <div class="holo-foot"><p class="muted">Bones fade and become porous as density is lost. Hatched systems have no published number yet.</p></div>
      </div>
      <div class="side">
        <div class="panel controls" ${stagger(2)}>
          <div class="presets" role="group" aria-label="Mission length">
            ${f.missions.map((m) => `<button class="preset ${p.day === m.days ? "active" : ""}" data-preset="${m.days}"><span class="preset-name">${esc(m.name)}</span><span class="preset-days">${m.days} days</span></button>`).join("")}
          </div>
          <div class="time-row">
            <button class="play" data-play aria-label="Play the mission from launch"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l11-6.5z"/></svg></button>
            <div class="time-slider">
              <label for="future-day">Day in space · <span id="future-months">${p.months}</span> months</label>
              <input id="future-day" type="range" min="0" max="${FUTURE_MAX_DAY}" step="5" value="${p.day}" style="--fill:${(p.day / FUTURE_MAX_DAY) * 100}%">
            </div>
          </div>
          <label class="toggle"><input id="cm-toggle" type="checkbox" ${p.cm ? "checked" : ""}><span class="switch" aria-hidden="true"></span><span>${esc(p.bones.countermeasure.name)}</span></label>
        </div>
        <div class="panel readout s-${p.band}" id="future-readout" ${stagger(3)}>${p.readout}</div>
      </div>
    </div>
    <div class="panel screen-panel" ${stagger(4)}>
      <div class="panel-head"><h2>Bone density loss over the mission</h2><ul class="key" id="future-key">${p.key}</ul></div>
      <div class="screen spot chart-wrap" id="future-chart">${p.chart}</div>
      <p class="axis-caption">Horizontal axis: days in space. Vertical axis: bone density compared with before flight. ${esc(p.bones.displayBands.note)}</p>
      <blockquote class="source">“${esc(p.bones.lossSource.quote)}” <a href="${esc(p.bones.lossSource.url)}" target="_blank" rel="noopener">${esc(p.bones.lossSource.label)}</a></blockquote>
    </div>
    <h2 class="section-title">Other systems</h2>
    <div class="qual-grid">${qual}</div>
    <p class="disclaimer">Projection for education, based on published averages. It is not a diagnosis.</p>
  </section>`;
}

function paintFuture(p = futureParts()) {
  const screen = $('.holo[data-mode="future"]');
  if (!screen) return;
  const loss = Math.min(1, p.p.mid / 30);
  screen.style.setProperty("--loss", loss.toFixed(3));
  screen.querySelectorAll("[data-system]").forEach((z) => {
    if (z.classList.contains("callout")) return;
    z.dataset.status = z.dataset.system === "bones" ? p.band : "hatch";
  });
  // Porous bones: the more density lost, the more gaps in the bone strokes.
  const solid = (8 - loss * 6.5).toFixed(2);
  const gap = (0.01 + loss * 5).toFixed(2);
  screen.querySelectorAll(".skeleton .bone").forEach((b) => { b.style.strokeDasharray = `${solid} ${gap}`; });
}

/* ---------- Sources ---------- */

function viewData() {
  const s = app.state.settings;
  const rows = app.data.indicators.map((i) => `<tr><td>${esc(i.name)}</td><td>${esc(i.unit)}</td><td>${esc(i.hazard)}</td><td>${i.verified ? pill("green", "Source checked") : pill("verify", "Pending check")}</td></tr>`).join("");
  return `<section class="view data-view">
    <div class="view-head" ${stagger(0)}><div><p class="kicker">Sources</p><h1>Data you can <span class="accent">trace</span></h1></div></div>
    <div class="data-grid">
      <div class="panel" ${stagger(1)}>
        <h2>What each label means</h2>
        <ul class="badges">
          <li>${pill("green", "Source checked")}<span>The number comes from a cited source that the team has read.</span></li>
          <li>${pill("verify", "Pending check")}<span>A general reference value still to be confirmed by the research team.</span></li>
          <li>${pill("hatch")}<span>No published figure found, so the app shows words instead of a number.</span></li>
          <li>${pill("none", "Demo data")}<span>Invented readings that tell a story for the demo. Never mixed with real data.</span></li>
        </ul>
      </div>
      <div class="panel" ${stagger(2)}>
        <h2>Sources</h2>
        <ul class="sources">
          <li><a href="https://www.nasa.gov/hrp/hazards" target="_blank" rel="noopener">NASA Human Research Program: the five hazards of human spaceflight</a></li>
          <li><a href="https://www.nasa.gov/reference/risk-of-spaceflight-induced-bone-changes/" target="_blank" rel="noopener">NASA: Risk of Spaceflight-Induced Bone Changes</a></li>
          <li><a href="https://www.nasa.gov/directorates/esdmd/hhp/risk-of-impaired-performance-due-to-reduced-muscle-size-strength-and-endurance/" target="_blank" rel="noopener">NASA: Risk of impaired performance due to reduced muscle size, strength and endurance</a></li>
          <li><a href="https://ohsonline.com/articles/2012/08/27/nasa-more-hopeful-on-astronaut-fitness.aspx" target="_blank" rel="noopener">OHS Online (2012): NASA study on exercise, diet and bone density</a></li>
          <li><a href="https://www.nasa.gov/wp-content/uploads/2023/03/radiation-protection-technical-brief-ochmo.pdf" target="_blank" rel="noopener">NASA: Radiation Protection technical brief (career limit and storm shelter)</a></li>
          <li><a href="https://ccmc.gsfc.nasa.gov/tools/DONKI/" target="_blank" rel="noopener">NASA DONKI: solar particle events, live and archived</a></li>
        </ul>
      </div>
    </div>
    <div class="panel" ${stagger(3)}>
      <h2>Daily indicators</h2>
      <div class="table-wrap"><table><thead><tr><th>Indicator</th><th>Unit</th><th>Spaceflight hazard</th><th>Ranges</th></tr></thead><tbody>${rows}</tbody></table></div>
    </div>
    <div class="data-grid">
      <form id="settings-form" class="panel" ${stagger(4)}>
        <h2>Settings</h2>
        <div class="modules compact">
          <div class="module"><label for="s-name"><span>Astronaut name</span></label><input id="s-name" name="name" value="${esc(s.name)}"></div>
          <div class="module"><label for="s-place"><span>Where you are</span></label><select id="s-place" name="place">${Object.entries(PLACES).map(([k, v]) => `<option value="${k}" ${s.place === k ? "selected" : ""}>${v.name}</option>`).join("")}</select></div>
          <div class="module"><label for="s-ex"><span>Daily exercise target</span><span class="unit">min</span></label><input id="s-ex" name="exerciseTarget" type="number" step="5" value="${s.exerciseTarget}"></div>
          <div class="module"><label for="s-dose"><span>Dose from earlier missions</span><span class="unit">mSv</span></label><input id="s-dose" name="priorDose" type="number" step="1" min="0" value="${s.priorDose ?? 0}"></div>
        </div>
        <div class="form-actions"><button class="btn" type="submit">Save settings</button><span class="saved muted" aria-live="polite"></span></div>
      </form>
      <div class="panel" ${stagger(5)}>
        <h2>Your log</h2>
        <p class="muted">Everything is stored only in this browser, so the app works without a connection to Earth.</p>
        <div class="form-actions"><button class="btn ghost" data-reload-demo>Load the demo mission</button><button class="btn ghost danger" data-clear>Start an empty log</button></div>
        <p class="confirm-line" hidden><span>This deletes every reading in this browser.</span><button class="btn tiny danger" data-clear-yes>Delete</button><button class="btn tiny ghost" data-clear-no>Keep</button></p>
      </div>
    </div>
    <p class="disclaimer">CrewCheck is a prototype for the NASA Space Apps Challenge 2026. It is not a medical device and does not replace a doctor or flight surgeon.</p>
  </section>`;
}

/* ---------- Shell: HUD, dock, router ---------- */

function updateHud() {
  const place = PLACES[app.state.settings.place];
  $("#mission-chip").textContent = `${app.state.settings.name} · ${place.name} · day ${lastDay()}`;
  const latest = [...app.days].reverse().map((d) => d.results.heart_rate).find((r) => r?.trust === "ok");
  const hr = latest?.num ?? 70;
  $("#hud-hr").textContent = latest ? Math.round(hr) : "--";
  $("#hud-pulse").style.setProperty("--beat", `${((2 * 60) / hr).toFixed(2)}s`);
}

function moveDockGlow() {
  const active = document.querySelector('.dock-item[aria-current="page"]');
  const glow = $(".dock-glow");
  if (!active || !glow) return;
  glow.style.setProperty("--x", `${active.offsetLeft}px`);
  glow.style.setProperty("--y", `${active.offsetTop}px`);
  glow.style.setProperty("--w", `${active.offsetWidth}px`);
  glow.style.setProperty("--h", `${active.offsetHeight}px`);
}

function render({ animate = true } = {}) {
  const view = app.ui.view;
  document.querySelectorAll(".dock-item").forEach((a) => a.setAttribute("aria-current", a.getAttribute("href") === `#${view}` ? "page" : "false"));
  moveDockGlow();
  updateHud();
  const root = $("#view");
  root.innerHTML = { today: viewToday, checkin: viewCheckin, trends: viewTrends, future: viewFuture, data: viewData }[view]();
  root.classList.toggle("enter", animate && !reduceMotion());
  if (animate) { root.style.animation = "none"; void root.offsetWidth; root.style.animation = ""; }
  if (view === "today" && app.days.length) paintToday(resultsFor(app.ui.day));
  if (view === "future") paintFuture();
  if (view === "checkin") liveCheck($("#checkin-form"));
  countUp(root);
}

function go(view) {
  if (location.hash !== `#${view}`) location.hash = view;
  else route();
}

function route() {
  app.stopPlay?.();
  const h = location.hash.slice(1);
  app.ui.view = VIEWS.includes(h) ? h : "today";
  if (app.ui.view !== "checkin") app.ui.checkinDay = null;
  render();
  window.scrollTo({ top: 0, behavior: reduceMotion() ? "auto" : "smooth" });
}

function hover(system, on) {
  const screen = document.querySelector(".holo");
  if (screen) screen.dataset.hot = on ? system : "";
}

function bindEvents() {
  window.addEventListener("hashchange", route);
  window.addEventListener("resize", moveDockGlow);
  const root = $("#view");
  bindTilt(root);
  bindSpotlight(root);

  root.addEventListener("pointerover", (e) => {
    const t = e.target.closest(".holo [data-system]");
    if (t) hover(t.dataset.system, true);
  });
  root.addEventListener("pointerout", (e) => {
    const t = e.target.closest(".holo [data-system]");
    if (t && !t.contains(e.relatedTarget)) hover(t.dataset.system, false);
  });
  root.addEventListener("focusin", (e) => { const t = e.target.closest(".callout"); if (t) hover(t.dataset.system, true); });
  root.addEventListener("focusout", (e) => { const t = e.target.closest(".callout"); if (t) hover(t.dataset.system, false); });

  root.addEventListener("click", (e) => {
    const t = e.target.closest("button, .holo .zone");
    if (!t) return;
    const d = t.dataset;
    const inToday = t.closest('.holo[data-mode="today"]');
    if (d.dayStep) { app.ui.day = Math.min(lastDay(), Math.max(app.days[0].day, app.ui.day + Number(d.dayStep))); render({ animate: false }); }
    else if (d.hazard) { app.ui.hazard = app.ui.hazard === d.hazard ? null : d.hazard; render({ animate: false }); }
    else if (d.stormReplay) { app.ui.storm = app.sw.archive.find((x) => x.id === d.stormReplay) ?? null; render({ animate: false }); }
    else if (d.stormStop !== undefined) { app.ui.storm = null; render({ animate: false }); }
    else if (inToday && d.system) { app.ui.system = app.ui.system === d.system ? null : d.system; render({ animate: false }); }
    else if (d.systemClear !== undefined) { app.ui.system = null; render({ animate: false }); }
    else if (d.trend) { app.ui.trend = d.trend; app.ui.view === "trends" ? render({ animate: false }) : go("trends"); }
    else if (d.gotoDay) { app.ui.day = Number(d.gotoDay); app.ui.view === "today" ? render({ animate: false }) : go("today"); }
    else if (d.confirm) { const en = entryFor(Number(d.day)); en.confirmed = { ...en.confirmed, [d.confirm]: true }; persist(); render({ animate: false }); }
    else if (d.editDay) { app.ui.checkinDay = Number(d.editDay); location.hash === "#checkin" ? render() : (location.hash = "checkin"); }
    else if (d.cancelEdit !== undefined) { app.ui.checkinDay = null; go("today"); }
    else if (d.preset) { app.stopPlay?.(); app.ui.futureDay = Number(d.preset); updateFuture(); }
    else if (d.play !== undefined) { startPlay(t); }
    else if (d.reloadDemo !== undefined) { reloadDemo(); }
    else if (d.clear !== undefined) { $(".confirm-line").hidden = false; }
    else if (d.clearNo !== undefined) { $(".confirm-line").hidden = true; }
    else if (d.clearYes !== undefined) { app.state.entries = []; persist(); app.ui.day = null; go("today"); }
  });

  root.addEventListener("input", (e) => {
    if (e.target.id === "future-day") { app.stopPlay?.(); app.ui.futureDay = Number(e.target.value); updateFuture(); }
    else if (e.target.closest("#checkin-form")) liveCheck(e.target.closest("form"));
  });

  root.addEventListener("change", (e) => {
    if (e.target.id === "cm-toggle") { app.ui.cm = e.target.checked; updateFuture(); }
    else if (e.target.name === "mood") liveCheck(e.target.closest("form"));
  });

  root.addEventListener("submit", (e) => {
    e.preventDefault();
    if (e.target.id === "checkin-form") {
      const day = app.ui.checkinDay ?? lastDay() + 1;
      const values = readForm(e.target);
      const existing = entryFor(day);
      if (existing) { existing.values = values; existing.source = "manual"; existing.confirmed = {}; }
      else app.state.entries.push({ day, source: "manual", confirmed: {}, values });
      persist();
      app.ui.day = day;
      app.ui.checkinDay = null;
      go("today");
    } else if (e.target.id === "settings-form") {
      const fd = new FormData(e.target);
      app.state.settings = { ...app.state.settings, name: String(fd.get("name") || "Astronaut"), place: String(fd.get("place")), exerciseTarget: Number(fd.get("exerciseTarget")) || 120, priorDose: Math.max(0, Number(fd.get("priorDose")) || 0) };
      persist();
      render({ animate: false });
      $(".saved").textContent = "Saved.";
    }
  });
}

function startPlay(btn) {
  app.stopPlay?.();
  const target = app.ui.futureDay > 0 ? app.ui.futureDay : 180;
  btn.classList.add("playing");
  app.stopPlay = playTimelapse(0, target, 4200, (d) => { app.ui.futureDay = d; updateFuture(); }, () => { btn.classList.remove("playing"); app.stopPlay = null; });
  const stop = app.stopPlay;
  app.stopPlay = () => { stop(); btn.classList.remove("playing"); app.stopPlay = null; };
}

// Live space weather from NASA DONKI. If the request fails (no connection,
// blocked network, rate limit), the app keeps working with the archive.
async function fetchSpaceWeather() {
  const end = new Date();
  const start = new Date(end - app.radiation.liveDays * 864e5);
  const iso = (d) => d.toISOString().slice(0, 10);
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 7000);
    const res = await fetch(`https://api.nasa.gov/DONKI/SEP?startDate=${iso(start)}&endDate=${iso(end)}&api_key=DEMO_KEY`, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) throw new Error(String(res.status));
    const list = await res.json();
    app.sw.events = list.map((x) => ({ id: x.sepID, time: x.eventTime, instrument: (x.instruments ?? []).map((i) => i.displayName).join(", "), link: x.link }));
    app.sw.mode = "live";
  } catch {
    app.sw.events = app.sw.archive;
    app.sw.mode = "archive";
  }
  if (app.ui.view === "today") render({ animate: false });
}

async function reloadDemo() {
  app.state.entries = await loadDemo();
  app.ui.day = null;
  persist();
  go("today");
}

async function start() {
  try {
    const [data, forecast, radiation, sw] = await Promise.all([loadJSON("data/indicators.json"), loadJSON("data/forecast.json"), loadJSON("data/radiation.json"), loadJSON("data/space_weather.json")]);
    app.data = data;
    app.forecast = forecast;
    app.radiation = radiation;
    app.sw.archive = sw.events;
    app.state = readState() ?? { settings: defaultSettings(), entries: await loadDemo() };
    const mission = app.forecast.missions.find((m) => m.id === PLACES[app.state.settings.place].mission);
    app.ui.futureDay = mission?.days ?? 180;
    recompute();
    saveState(app.state);
    bindEvents();
    route();
    fetchSpaceWeather();
  } catch (err) {
    $("#view").innerHTML = `<section class="view"><div class="panel"><h2>The app could not start</h2><p>${esc(err.message)}. Open it from a web server (for example GitHub Pages or <code>npm start</code>), not by double-clicking the file.</p></div></section>`;
  }
}

start();
