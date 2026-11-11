import { evaluateMission, evaluate, systemStatus, formatValue, worst, SEVERITY } from "./rules.js";
import { projectLoss, projectionSeries, bandFor, exerciseAdherence, DAYS_PER_MONTH } from "./forecast.js";
import { loadJSON, loadDemo, readState, saveState, defaultSettings } from "./store.js";
import { bodySVG } from "./body.js";
import { trendChart, projectionChart } from "./charts.js";

const STATUS = {
  green: { label: "Normal", icon: "✓" },
  yellow: { label: "Watch", icon: "!" },
  red: { label: "Act now", icon: "✕" },
  verify: { label: "Measure again", icon: "?" },
  missing: { label: "No reading", icon: "–" },
  none: { label: "Not measured daily", icon: "–" },
};

const PLACES = {
  iss: { name: "Space station", delay: "a few seconds", mission: "iss" },
  moon: { name: "Lunar base", delay: "about 1.3 seconds each way", mission: "moon" },
  mars: { name: "Mars", delay: "3 to 22 minutes each way", mission: "mars" },
};

const VIEWS = ["today", "checkin", "trends", "future", "data"];

const app = { data: null, forecast: null, state: null, days: [], ui: { view: "today", day: null, system: null, trend: "heart_rate", futureDay: null, cm: false, checkinDay: null } };

const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const FORECAST_LABEL = { green: "Small change", yellow: "Moderate change", red: "Large change" };
const chip = (status, extra = "") => `<span class="chip s-${status}"><span class="chip-icon" aria-hidden="true">${STATUS[status].icon}</span>${STATUS[status].label}${extra}</span>`;
const forecastChip = (band) => `<span class="chip s-${band}"><span class="chip-icon" aria-hidden="true">${STATUS[band].icon}</span>${FORECAST_LABEL[band]}</span>`;
const indById = (id) => app.data.indicators.find((i) => i.id === id);
const lastDay = () => app.days.at(-1)?.day ?? 0;
const resultsFor = (day) => app.days.find((d) => d.day === day)?.results ?? {};
const entryFor = (day) => app.state.entries.find((e) => e.day === day);

function recompute() {
  app.state.entries.sort((a, b) => a.day - b.day);
  app.days = evaluateMission(app.data.indicators, app.state.entries);
  if (app.ui.day == null || !app.days.some((d) => d.day === app.ui.day)) app.ui.day = lastDay();
}

function persist() {
  saveState(app.state);
  recompute();
}

/* ---------- Today ---------- */

function summary(results) {
  const counts = { red: 0, yellow: 0, verify: 0 };
  Object.values(results).forEach((r) => { if (counts[r.status] != null) counts[r.status] += 1; });
  const overall = worst(Object.values(results).map((r) => r.status));
  const parts = [];
  if (counts.red) parts.push(`${counts.red} to act on now`);
  if (counts.yellow) parts.push(`${counts.yellow} to watch`);
  if (counts.verify) parts.push(`${counts.verify} to measure again`);
  const headline = parts.length ? `${parts.join(", ").replace(/^./, (c) => c.toUpperCase())}.` : overall === "missing" ? "No readings for this day yet." : "All readings are normal.";
  return { overall, headline };
}

function indicatorCard(ind, r, day) {
  const value = formatValue(ind, r.value);
  const confirm = r.trust === "jump" ? `<button class="btn small" data-confirm="${ind.id}" data-day="${day}">I measured again, it is correct</button>` : "";
  const fix = r.trust === "impossible" || r.status === "missing" ? `<button class="btn small ghost" data-edit-day="${day}">Enter the reading</button>` : "";
  return `<article class="ind-card s-${r.status}" data-system="${ind.system}">
    <header><h3>${esc(ind.name)}</h3>${chip(r.status)}</header>
    <p class="value"><span class="num">${value}</span> <span class="unit">${esc(ind.unit)}</span></p>
    <p class="reason">${esc(r.reasons[0])}</p>
    <div class="card-actions">${confirm}${fix}<button class="link" data-trend="${ind.id}">See trend</button></div>
  </article>`;
}

function actionItems(results) {
  const place = PLACES[app.state.settings.place];
  return app.data.indicators
    .map((ind) => ({ ind, r: results[ind.id] }))
    .filter(({ r }) => r && ["red", "yellow", "verify"].includes(r.status))
    .sort((a, b) => SEVERITY[b.r.status] - SEVERITY[a.r.status])
    .map(({ ind, r }) => {
      let text;
      if (r.status === "verify") text = r.trust === "impossible" ? "This value cannot be right. Check the sensor and measure again before doing anything else." : "Measure again. If the new value is the same, confirm it so the app can judge it.";
      else text = ind.actions[r.status];
      const escalate = r.status === "red"
        ? `<p class="escalate">Distance from Earth: from ${esc(place.name.toLowerCase())}, a message to the flight surgeon takes ${esc(place.delay)}. Start the steps above now; do not wait for the reply.</p>`
        : "";
      return `<li class="s-${r.status}">${chip(r.status)}<div><strong>${esc(ind.name)}</strong><p>${esc(text)}</p>${escalate}</div></li>`;
    }).join("");
}

function viewToday() {
  const day = app.ui.day;
  if (!app.days.length) {
    return `<section class="empty card"><h2>No readings yet</h2><p>Start with today's check-in, or load the demo mission from Data &amp; sources.</p><a class="btn" href="#checkin">Start check-in</a></section>`;
  }
  const results = resultsFor(day);
  const entry = entryFor(day);
  const { overall, headline } = summary(results);
  const sel = app.ui.system;
  const sysInfo = sel ? app.data.systems.find((s) => s.id === sel) : null;
  const sysStatus = (id) => systemStatus(app.data.indicators, id, results);
  const actions = actionItems(results);
  const cards = app.data.indicators
    .filter((ind) => !sel || ind.system === sel)
    .map((ind) => indicatorCard(ind, results[ind.id], day)).join("");

  return `<section class="today">
    <div class="dayline">
      <button class="icon-btn" data-day-step="-1" aria-label="Previous day" ${day <= app.days[0].day ? "disabled" : ""}>‹</button>
      <h1>Mission day ${day}</h1>
      <button class="icon-btn" data-day-step="1" aria-label="Next day" ${day >= lastDay() ? "disabled" : ""}>›</button>
      <span class="tag">${entry?.source === "demo" ? "Demo data" : "Logged by you"}</span>
    </div>
    <div class="summary s-${overall}">${chip(overall)}<p>${esc(headline)}</p></div>
    <div class="today-grid">
      <div class="card body-card">
        <div class="card-head"><h2>Body map</h2>${sel ? `<button class="link" data-system-clear>Show all</button>` : `<span class="hint">Tap a part of the body</span>`}</div>
        <div class="body-wrap" data-mode="today">${bodySVG("today")}</div>
        <ul class="legend">${app.data.systems.map((s) => `<li><button class="legend-item ${sel === s.id ? "active" : ""}" data-system-pick="${s.id}"><span class="dot s-${sysStatus(s.id)}"></span>${esc(s.name)}</button></li>`).join("")}</ul>
        ${sysInfo ? `<div class="system-info"><h3>${esc(sysInfo.name)}</h3><p>${esc(sysInfo.about)}</p>${sel === "bones" ? `<a class="btn small" href="#future">Open Future body</a>` : ""}</div>` : ""}
      </div>
      <div class="right-col">
        <div class="card actions">
          <h2>What to do now</h2>
          ${actions ? `<ul class="action-list">${actions}</ul>` : `<p class="muted">Nothing to do. Keep your routine: exercise, meals and sleep on schedule.</p>`}
        </div>
        <div class="ind-grid">${cards || `<p class="muted">Bones and muscles are not measured daily. See Future body.</p>`}</div>
      </div>
    </div>
  </section>`;
}

function paintBody(results) {
  document.querySelectorAll('.body-wrap[data-mode="today"] .zone').forEach((z) => {
    const id = z.dataset.system;
    z.dataset.status = systemStatus(app.data.indicators, id, results);
    z.classList.toggle("selected", app.ui.system === id);
    z.classList.toggle("dimmed", Boolean(app.ui.system) && app.ui.system !== id);
  });
}

/* ---------- Check-in ---------- */

const FIELDS = [
  { id: "heart_rate", step: "1" },
  { id: "blood_pressure", bp: true },
  { id: "temperature", step: "0.1" },
  { id: "glucose", step: "1" },
  { id: "spo2", step: "1" },
  { id: "sleep", step: "0.1" },
];
const MOODS = [["1", "😣", "Very bad"], ["2", "🙁", "Bad"], ["3", "😐", "OK"], ["4", "🙂", "Good"], ["5", "😄", "Very good"]];

function viewCheckin() {
  const editing = app.ui.checkinDay;
  const day = editing ?? lastDay() + 1;
  const prev = entryFor(day)?.values ?? {};
  const field = (f) => {
    const ind = indById(f.id);
    const input = f.bp
      ? `<div class="bp-inputs"><input id="f-bp-sys" name="bp_sys" type="number" inputmode="numeric" placeholder="120" value="${prev.blood_pressure?.sys ?? ""}" aria-label="Systolic, top number"><span>/</span><input id="f-bp-dia" name="bp_dia" type="number" inputmode="numeric" placeholder="80" value="${prev.blood_pressure?.dia ?? ""}" aria-label="Diastolic, bottom number"></div>`
      : `<input id="f-${f.id}" name="${f.id}" type="number" inputmode="decimal" step="${f.step}" value="${prev[f.id] ?? ""}">`;
    return `<div class="field" data-field="${f.id}">
      <label for="${f.bp ? "f-bp-sys" : "f-" + f.id}">${esc(ind.name)} <span class="unit">${esc(ind.unit)}</span></label>
      ${input}
      <div class="live" aria-live="polite"></div>
      <details><summary>How to measure</summary><ol>${ind.howToMeasure.map((s) => `<li>${esc(s)}</li>`).join("")}</ol><p class="muted">${esc(ind.whatIs)}</p></details>
    </div>`;
  };
  return `<section class="checkin">
    <h1>${editing ? `Edit day ${day}` : `Check-in for mission day ${day}`}</h1>
    <p class="muted">Fill in what you measured. Leave a box empty if you could not measure it. Each value is checked as you type.</p>
    <form id="checkin-form" class="card" novalidate>
      <div class="fields">${FIELDS.map(field).join("")}
        <div class="field" data-field="exercise_min">
          <label for="f-exercise_min">Exercise today <span class="unit">min</span></label>
          <input id="f-exercise_min" name="exercise_min" type="number" inputmode="numeric" step="5" value="${prev.exercise_min ?? ""}">
          <p class="muted small">Used in Future body. Your mission target is ${app.state.settings.exerciseTarget} minutes.</p>
        </div>
      </div>
      <fieldset class="mood" data-field="mood">
        <legend>How do you feel today?</legend>
        <div class="faces">${MOODS.map(([v, face, label]) => `<label class="face"><input type="radio" name="mood" value="${v}" ${String(prev.mood) === v ? "checked" : ""}><span class="face-btn"><span aria-hidden="true">${face}</span>${label}</span></label>`).join("")}</div>
        <div class="live" aria-live="polite"></div>
      </fieldset>
      <div class="form-actions"><button class="btn" type="submit">Save check-in</button>${editing ? `<button class="btn ghost" type="button" data-cancel-edit>Cancel</button>` : ""}</div>
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
  };
}

function liveCheck(form) {
  const day = app.ui.checkinDay ?? lastDay() + 1;
  const values = readForm(form);
  const before = app.state.entries.filter((e) => e.day < day);
  const hist = evaluateMission(app.data.indicators, before);
  for (const ind of app.data.indicators) {
    const box = form.querySelector(`[data-field="${ind.id}"] .live`);
    if (!box) continue;
    const v = values[ind.id];
    const bpPartial = ind.type === "bp" && v && (v.sys == null || v.dia == null);
    if (v == null || bpPartial) { box.innerHTML = ""; continue; }
    const history = hist.map((d) => d.results[ind.id]);
    const r = evaluate(ind, v, history);
    box.innerHTML = `${chip(r.status)}<span>${esc(r.reasons[0])}</span>`;
  }
}

/* ---------- Trends ---------- */

function viewTrends() {
  const ind = indById(app.ui.trend);
  const pts = app.days.map((d) => {
    const r = d.results[ind.id];
    return { x: d.day, status: r.status, value: r.value };
  });
  let series, yMin, yMax, bands;
  if (ind.type === "bp") {
    series = [
      { name: "Top number", points: pts.map((p) => ({ x: p.x, y: p.value?.sys ?? null, status: p.status, label: formatValue(ind, p.value) })) },
      { name: "Bottom number", points: pts.map((p) => ({ x: p.x, y: p.value?.dia ?? null, status: p.status, label: formatValue(ind, p.value) })) },
    ];
    yMin = 50; yMax = 160;
    bands = [];
  } else {
    series = [{ name: ind.name, points: pts.map((p) => ({ x: p.x, y: p.value, status: p.status, label: formatValue(ind, p.value) })) }];
    const vals = pts.map((p) => p.value).filter((v) => typeof v === "number" && v >= ind.plausible[0] && v <= ind.plausible[1]);
    const g = ind.green.flat();
    const lo = Math.min(...vals, ...g), hi = Math.max(...vals, ...g);
    const pad = (hi - lo) * 0.25 || 1;
    yMin = Math.max(ind.plausible[0], +(lo - pad).toFixed(1));
    yMax = Math.min(ind.plausible[1], +(hi + pad).toFixed(1));
    bands = [...ind.yellow.map(([a, b]) => ({ from: a, to: b, cls: "b-yellow" })), ...ind.green.map(([a, b]) => ({ from: a, to: b, cls: "b-green" }))];
  }
  const flagged = app.days.filter((d) => d.results[ind.id].status !== "green");
  return `<section class="trends">
    <h1>Trends</h1>
    <div class="tabs" role="tablist">${app.data.indicators.map((i) => `<button role="tab" aria-selected="${i.id === ind.id}" class="tab ${i.id === ind.id ? "active" : ""}" data-trend="${i.id}">${esc(i.name)}</button>`).join("")}</div>
    <div class="card">
      <div class="card-head"><h2>${esc(ind.name)} <span class="unit">${esc(ind.unit)}</span></h2>
        <ul class="key">${ind.type === "bp" ? `<li><span class="k line0"></span>Top number</li><li><span class="k line1"></span>Bottom number</li><li class="muted">Normal: below 120/80</li>` : `<li><span class="k b-green"></span>Normal range</li><li><span class="k b-yellow"></span>Watch range</li>`}<li><span class="k verify"></span>Measure again</li></ul>
      </div>
      <div class="chart-wrap">${trendChart({ series, bands, xMax: Math.max(lastDay(), 2), yMin, yMax, unit: ind.unit, selectedX: app.ui.day })}</div>
      <p class="axis-caption">Horizontal axis: mission day.</p>
      <p class="muted small">${esc(ind.whatIs)} Related hazard: ${esc(ind.hazard)}.</p>
    </div>
    <div class="card">
      <h2>Days that need a look</h2>
      ${flagged.length ? `<ul class="flag-list">${flagged.map((d) => { const r = d.results[ind.id]; return `<li><button class="link" data-goto-day="${d.day}">Day ${d.day}</button><span class="num">${formatValue(ind, r.value)}</span>${chip(r.status)}<span class="muted">${esc(r.reasons[0])}</span></li>`; }).join("")}</ul>` : `<p class="muted">Every day is in the normal range.</p>`}
    </div>
  </section>`;
}

/* ---------- Future body ---------- */

const FUTURE_MAX_DAY = 1000;

function futureParts() {
  const f = app.forecast;
  const bones = f.systems.find((s) => s.id === "bones");
  const validatedDay = Math.round(f.validatedMonths * DAYS_PER_MONTH);
  const maxDay = FUTURE_MAX_DAY;
  const day = app.ui.futureDay;
  const cm = app.ui.cm;
  const p = projectLoss(bones, day, cm, f.validatedMonths);
  const band = bandFor(bones, p.mid);
  const adherence = exerciseAdherence(app.state.entries, app.state.settings.exerciseTarget);
  const yMax = Math.max(10, Math.ceil(projectLoss(bones, maxDay, false, f.validatedMonths).high / 10) * 10);
  const fmt = (v) => v.toFixed(1);

  const text = cm && p.uncertainCountermeasure
    ? `Between <strong>0%</strong> and <strong>−${fmt(p.high)}%</strong>. Exercise helps, but NASA has not published by how much, so the app shows the whole possible range.`
    : `Between <strong>−${fmt(p.low)}%</strong> and <strong>−${fmt(p.high)}%</strong> of bone density in the spine and hips.`;

  const scenarios = [
    { cls: "no-cm", label: "No resistive exercise", points: projectionSeries(bones, maxDay, false, f.validatedMonths) },
  ];
  if (cm) scenarios.push({ cls: "cm", label: bones.countermeasure.name, points: projectionSeries(bones, maxDay, true, f.validatedMonths) });

  const readout = `
    <div class="card-head"><h2>Bones · day ${day}</h2>${forecastChip(band)}</div>
    <p class="big">${text}</p>
    ${p.extrapolated ? `<p class="warn">Past ${f.validatedMonths} months the rate is extrapolated: NASA measured it on missions of four to six months, so treat this as a rough estimate.</p>` : ""}
    ${cm && p.uncertainCountermeasure ? `<p class="muted small">${esc(bones.countermeasure.note)} <a href="${esc(bones.countermeasure.source.url)}" target="_blank" rel="noopener">Source</a>.</p>` : ""}
    ${adherence ? `<p class="fact">Your log: you reached the ${app.state.settings.exerciseTarget}-minute exercise target on <strong>${adherence.met} of ${adherence.total}</strong> days.</p>` : ""}`;

  return {
    bones, day, cm, band,
    label: `Day in space: <strong class="num">${day}</strong> <span class="muted">(${(day / DAYS_PER_MONTH).toFixed(1)} months)</span>`,
    legend: `<li><span class="dot s-${band}"></span>Bones: ${FORECAST_LABEL[band].toLowerCase()}</li><li><span class="dot hatch"></span>No published number yet</li>`,
    readout,
    chart: projectionChart({ scenarios, maxDay, yMax, selectedDay: day, validatedDay, todayDay: lastDay() || null }),
    key: `<li><span class="k no-cm"></span>No resistive exercise</li>${cm ? `<li><span class="k cm"></span>With countermeasures</li>` : ""}<li><span class="k extrap"></span>Beyond measured missions</li>`,
  };
}

function updateFuture() {
  const p = futureParts();
  $("#future-label").innerHTML = p.label;
  $("#future-legend").innerHTML = p.legend;
  const ro = $("#future-readout");
  ro.className = `card readout s-${p.band}`;
  ro.innerHTML = p.readout;
  $("#future-chart").innerHTML = p.chart;
  $("#future-key").innerHTML = p.key;
  $("#future-intro-day").textContent = p.day;
  document.querySelectorAll(".preset").forEach((b) => b.classList.toggle("active", Number(b.dataset.preset) === p.day));
  paintFuture();
}

function viewFuture() {
  const f = app.forecast;
  const { bones, day, cm, band, label, legend, readout, chart, key } = futureParts();

  const qual = f.systems.filter((s) => s.kind === "qualitative").map((s) => `
    <article class="qual">
      <header><h3>${esc(s.name)}</h3><span class="badge pending">No number yet</span></header>
      <p>${esc(s.summary)}</p>
      <p class="muted small">${s.source ? `Source: <a href="${esc(s.source.url)}" target="_blank" rel="noopener">${esc(s.source.label)}</a>. ` : "Source pending. "}Research team: ${esc(s.pending)}.</p>
    </article>`).join("");

  return `<section class="future">
    <div class="future-intro">
      <h1>Future body</h1>
      <p>If the mission goes on like this, how will your body be on day <span id="future-intro-day">${day}</span>? Move the slider and turn countermeasures on and off.</p>
    </div>
    <div class="future-grid">
      <div class="card body-card">
        <div class="body-wrap" data-mode="future">${bodySVG("future")}</div>
        <ul class="legend compact" id="future-legend">${legend}</ul>
      </div>
      <div class="right-col">
        <div class="card controls">
          <div class="presets" role="group" aria-label="Mission length">
            ${f.missions.map((m) => `<button class="preset ${day === m.days ? "active" : ""}" data-preset="${m.days}">${esc(m.name)}<span>${m.days} days</span></button>`).join("")}
          </div>
          <label class="slider-label" for="future-day" id="future-label">${label}</label>
          <input id="future-day" type="range" min="0" max="${FUTURE_MAX_DAY}" step="5" value="${day}">
          <label class="toggle"><input id="cm-toggle" type="checkbox" ${cm ? "checked" : ""}><span class="switch" aria-hidden="true"></span>${esc(bones.countermeasure.name)}</label>
        </div>
        <div class="card readout s-${band}" id="future-readout">${readout}</div>
      </div>
    </div>
    <div class="card">
      <div class="card-head"><h2>Bone density loss over the mission</h2>
        <ul class="key" id="future-key">${key}</ul>
      </div>
      <div class="chart-wrap" id="future-chart">${chart}</div>
      <p class="axis-caption">Horizontal axis: days in space. Vertical axis: bone density compared with before flight.</p>
      <blockquote class="source">“${esc(bones.lossSource.quote)}” <a href="${esc(bones.lossSource.url)}" target="_blank" rel="noopener">${esc(bones.lossSource.label)}</a></blockquote>
      <p class="muted small">${esc(bones.displayBands.note)} Projection for education, based on published averages. It is not a diagnosis.</p>
    </div>
    <h2 class="section-title">Other systems</h2>
    <div class="qual-grid">${qual}</div>
  </section>`;
}

function paintFuture() {
  const f = app.forecast;
  const bones = f.systems.find((s) => s.id === "bones");
  const p = projectLoss(bones, app.ui.futureDay, app.ui.cm, f.validatedMonths);
  document.querySelectorAll('.body-wrap[data-mode="future"] .zone').forEach((z) => {
    z.dataset.status = z.dataset.system === "bones" ? bandFor(bones, p.mid) : "hatch";
  });
}

/* ---------- Data & sources ---------- */

function viewData() {
  const s = app.state.settings;
  const rows = app.data.indicators.map((i) => `<tr><td>${esc(i.name)}</td><td>${esc(i.unit)}</td><td>${esc(i.hazard)}</td><td>${i.verified ? `<span class="badge ok">Source checked</span>` : `<span class="badge pending">Pending check</span>`}</td></tr>`).join("");
  return `<section class="data-view">
    <h1>Data &amp; sources</h1>
    <div class="card">
      <h2>What each label means</h2>
      <ul class="badges">
        <li><span class="badge ok">Source checked</span> The number comes from a cited source that the team has read.</li>
        <li><span class="badge pending">Pending check</span> A general reference value still to be confirmed by the research team.</li>
        <li><span class="badge pending">No number yet</span> No published figure found, so the app shows words instead of a number.</li>
        <li><span class="tag">Demo data</span> Invented readings that tell a story for the demo. Never mixed with real data.</li>
      </ul>
    </div>
    <div class="card">
      <h2>Daily indicators</h2>
      <div class="table-wrap"><table><thead><tr><th>Indicator</th><th>Unit</th><th>Spaceflight hazard</th><th>Ranges</th></tr></thead><tbody>${rows}</tbody></table></div>
    </div>
    <div class="card">
      <h2>Sources</h2>
      <ul class="sources">
        <li><a href="https://www.nasa.gov/hrp/hazards" target="_blank" rel="noopener">NASA Human Research Program: the five hazards of human spaceflight</a></li>
        <li><a href="https://www.nasa.gov/reference/risk-of-spaceflight-induced-bone-changes/" target="_blank" rel="noopener">NASA: Risk of Spaceflight-Induced Bone Changes</a></li>
        <li><a href="https://www.nasa.gov/directorates/esdmd/hhp/risk-of-impaired-performance-due-to-reduced-muscle-size-strength-and-endurance/" target="_blank" rel="noopener">NASA: Risk of impaired performance due to reduced muscle size, strength and endurance</a></li>
        <li><a href="https://ohsonline.com/articles/2012/08/27/nasa-more-hopeful-on-astronaut-fitness.aspx" target="_blank" rel="noopener">OHS Online (2012): NASA study on exercise, diet and bone density</a></li>
      </ul>
    </div>
    <form id="settings-form" class="card settings">
      <h2>Settings</h2>
      <div class="fields">
        <div class="field"><label for="s-name">Astronaut name</label><input id="s-name" name="name" value="${esc(s.name)}"></div>
        <div class="field"><label for="s-place">Where you are</label><select id="s-place" name="place">${Object.entries(PLACES).map(([k, v]) => `<option value="${k}" ${s.place === k ? "selected" : ""}>${v.name}</option>`).join("")}</select></div>
        <div class="field"><label for="s-ex">Daily exercise target <span class="unit">min</span></label><input id="s-ex" name="exerciseTarget" type="number" step="5" value="${s.exerciseTarget}"></div>
      </div>
      <div class="form-actions"><button class="btn" type="submit">Save settings</button><span class="saved muted" aria-live="polite"></span></div>
    </form>
    <div class="card">
      <h2>Your log</h2>
      <p class="muted">Everything is stored only in this browser, so the app works without a connection to Earth.</p>
      <div class="form-actions"><button class="btn ghost" data-reload-demo>Load the demo mission</button><button class="btn ghost danger" data-clear>Start an empty log</button></div>
      <p class="confirm-line" hidden><span>This deletes every reading in this browser.</span><button class="btn small danger" data-clear-yes>Delete</button><button class="btn small ghost" data-clear-no>Keep</button></p>
    </div>
    <p class="disclaimer">CrewCheck is a prototype for the NASA Space Apps Challenge 2026. It is not a medical device and does not replace a doctor or flight surgeon.</p>
  </section>`;
}

/* ---------- Router and events ---------- */

function render() {
  const view = app.ui.view;
  document.querySelectorAll(".nav a").forEach((a) => a.setAttribute("aria-current", a.getAttribute("href") === `#${view}` ? "page" : "false"));
  const place = PLACES[app.state.settings.place];
  $("#mission-chip").textContent = `${app.state.settings.name} · ${place.name} · day ${lastDay()}`;
  const root = $("#view");
  root.innerHTML = { today: viewToday, checkin: viewCheckin, trends: viewTrends, future: viewFuture, data: viewData }[view]();
  if (view === "today" && app.days.length) paintBody(resultsFor(app.ui.day));
  if (view === "future") paintFuture();
  if (view === "checkin") liveCheck($("#checkin-form"));
}

function go(view) {
  if (location.hash !== `#${view}`) location.hash = view;
  else route();
}

function route() {
  const h = location.hash.slice(1);
  app.ui.view = VIEWS.includes(h) ? h : "today";
  if (app.ui.view !== "checkin") app.ui.checkinDay = null;
  render();
  window.scrollTo({ top: 0 });
}

function bindEvents() {
  window.addEventListener("hashchange", route);
  const root = $("#view");

  root.addEventListener("click", (e) => {
    const t = e.target.closest("button, [data-system]");
    if (!t) return;
    const d = t.dataset;
    if (d.dayStep) { app.ui.day = Math.min(lastDay(), Math.max(app.days[0].day, app.ui.day + Number(d.dayStep))); render(); }
    else if (d.systemPick) { app.ui.system = app.ui.system === d.systemPick ? null : d.systemPick; render(); }
    else if (t.classList.contains("zone") && t.closest('[data-mode="today"]')) { app.ui.system = app.ui.system === d.system ? null : d.system; render(); }
    else if (d.systemClear !== undefined) { app.ui.system = null; render(); }
    else if (d.trend) { app.ui.trend = d.trend; go("trends"); }
    else if (d.gotoDay) { app.ui.day = Number(d.gotoDay); go("today"); }
    else if (d.confirm) { const en = entryFor(Number(d.day)); en.confirmed = { ...en.confirmed, [d.confirm]: true }; persist(); render(); }
    else if (d.editDay) { app.ui.checkinDay = Number(d.editDay); location.hash === "#checkin" ? render() : (location.hash = "checkin"); }
    else if (d.cancelEdit !== undefined) { app.ui.checkinDay = null; go("today"); }
    else if (d.preset) { app.ui.futureDay = Number(d.preset); $("#future-day").value = app.ui.futureDay; updateFuture(); }
    else if (d.reloadDemo !== undefined) { reloadDemo(); }
    else if (d.clear !== undefined) { $(".confirm-line").hidden = false; }
    else if (d.clearNo !== undefined) { $(".confirm-line").hidden = true; }
    else if (d.clearYes !== undefined) { app.state.entries = []; persist(); app.ui.day = null; go("today"); }
  });

  root.addEventListener("keydown", (e) => {
    const z = e.target.closest(".zone");
    if (z && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); z.dispatchEvent(new MouseEvent("click", { bubbles: true })); }
  });

  root.addEventListener("input", (e) => {
    if (e.target.id === "future-day") {
      app.ui.futureDay = Number(e.target.value);
      updateFuture();
    } else if (e.target.closest("#checkin-form")) liveCheck(e.target.closest("form"));
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
      app.state.settings = { ...app.state.settings, name: String(fd.get("name") || "Astronaut"), place: String(fd.get("place")), exerciseTarget: Number(fd.get("exerciseTarget")) || 120 };
      persist();
      render();
      $(".saved").textContent = "Saved.";
    }
  });
}

async function reloadDemo() {
  app.state.entries = await loadDemo();
  app.ui.day = null;
  persist();
  go("today");
}

async function start() {
  try {
    const [data, forecast] = await Promise.all([loadJSON("data/indicators.json"), loadJSON("data/forecast.json")]);
    app.data = data;
    app.forecast = forecast;
    app.state = readState() ?? { settings: defaultSettings(), entries: await loadDemo() };
    const mission = app.forecast.missions.find((m) => m.id === PLACES[app.state.settings.place].mission);
    app.ui.futureDay = mission?.days ?? 180;
    recompute();
    saveState(app.state);
    bindEvents();
    route();
  } catch (err) {
    $("#view").innerHTML = `<section class="card error"><h2>The app could not start</h2><p>${esc(err.message)}. Open it from a web server (for example GitHub Pages or <code>npm start</code>), not by double-clicking the file.</p></section>`;
  }
}

start();
