// Small SVG charts drawn by hand, so the app has no outside dependencies and
// keeps working without a network connection.

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

function niceTicks(lo, hi, count = 4) {
  const span = hi - lo || 1;
  const raw = span / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw);
  const ticks = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) ticks.push(+v.toFixed(6));
  return ticks;
}

/**
 * Daily trend chart.
 * series: [{ name, points: [{ x, y, status }] }]   (y null = gap)
 * bands:  [{ from, to, cls }]                       (horizontal reference bands)
 */
export function trendChart({ series, bands = [], xMax, yMin, yMax, unit, selectedX }) {
  const W = 900, H = 300, L = 48, R = 16, T = 16, B = 28;
  const X = (x) => L + ((x - 1) / Math.max(1, xMax - 1)) * (W - L - R);
  const Y = (y) => T + (1 - (y - yMin) / (yMax - yMin)) * (H - T - B);
  const clampY = (y) => Math.max(yMin, Math.min(yMax, y));

  const bandRects = bands.map((b) => {
    const y1 = Y(clampY(b.to)), y2 = Y(clampY(b.from));
    return `<rect class="band ${b.cls}" x="${L}" y="${y1}" width="${W - L - R}" height="${Math.max(0, y2 - y1)}" />`;
  }).join("");

  const yTicks = niceTicks(yMin, yMax).map((v) =>
    `<g class="tick"><line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}" /><text x="${L - 8}" y="${Y(v) + 4}" text-anchor="end">${v}</text></g>`).join("");

  const xStep = xMax > 20 ? 5 : xMax > 10 ? 2 : 1;
  const xTicks = [];
  for (let d = 1; d <= xMax; d += d === 1 && xStep > 1 ? xStep - 1 : xStep) xTicks.push(d);
  const xLabels = xTicks.map((d) => `<text class="xlabel" x="${X(d)}" y="${H - 8}" text-anchor="middle">${d}</text>`).join("");

  const lines = series.map((s, si) => {
    let path = "";
    let pen = false;
    for (const p of s.points) {
      if (p.y == null || p.status === "verify") { pen = false; continue; }
      path += `${pen ? "L" : "M"}${X(p.x).toFixed(1)} ${Y(clampY(p.y)).toFixed(1)} `;
      pen = true;
    }
    const dots = s.points.filter((p) => p.y != null).map((p) => {
      const out = p.y > yMax || p.y < yMin;
      return `<circle class="dot ${p.status}${out ? " out" : ""}${p.x === selectedX ? " sel" : ""}" style="--d:${p.x}" cx="${X(p.x)}" cy="${Y(clampY(p.y))}" r="${p.x === selectedX ? 6 : 4}"><title>Day ${p.x}: ${esc(p.label ?? p.y)} ${esc(unit)}</title></circle>`;
    }).join("");
    return `<path class="line s${si}" d="${path}" pathLength="1" />${dots}`;
  }).join("");

  const sel = selectedX ? `<line class="selected" x1="${X(selectedX)}" x2="${X(selectedX)}" y1="${T}" y2="${H - B}" />` : "";

  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Trend chart">
    ${bandRects}${yTicks}${sel}${lines}${xLabels}
  </svg>`;
}

/**
 * Projection chart for Future body: loss ranges over time.
 * scenarios: [{ cls, label, points: [{ day, low, high }] }]
 */
export function projectionChart({ scenarios, maxDay, yMax, selectedDay, validatedDay, todayDay }) {
  const W = 900, H = 300, L = 52, R = 16, T = 16, B = 28;
  const X = (d) => L + (d / maxDay) * (W - L - R);
  const Y = (v) => T + (v / yMax) * (H - T - B); // loss grows downward
  const area = (pts) =>
    `M${pts.map((p) => `${X(p.day).toFixed(1)} ${Y(Math.min(p.low, yMax)).toFixed(1)}`).join(" L")} ` +
    `L${pts.slice().reverse().map((p) => `${X(p.day).toFixed(1)} ${Y(Math.min(p.high, yMax)).toFixed(1)}`).join(" L")} Z`;

  const extra = validatedDay < maxDay
    ? `<rect class="extrapolated" x="${X(validatedDay)}" y="${T}" width="${X(maxDay) - X(validatedDay)}" height="${H - T - B}" />
       <text class="note" x="${X(validatedDay) + 6}" y="${T + 14}">beyond measured missions</text>`
    : "";

  const yTicks = niceTicks(0, yMax).map((v) =>
    `<g class="tick"><line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}" /><text x="${L - 8}" y="${Y(v) + 4}" text-anchor="end">${v === 0 ? "0" : "−" + v}%</text></g>`).join("");

  const xTicks = niceTicks(0, maxDay, 5).map((d) =>
    `<text class="xlabel" x="${X(d)}" y="${H - 10}" text-anchor="middle">${d}</text>`).join("");

  const areas = scenarios.map((s) => `<path class="proj ${s.cls}" d="${area(s.points)}"><title>${esc(s.label)}</title></path>`).join("");
  const today = todayDay != null && todayDay <= maxDay
    ? `<line class="today" x1="${X(todayDay)}" x2="${X(todayDay)}" y1="${T}" y2="${H - B}" /><text class="note" x="${X(todayDay) + 4}" y="${H - B - 6}">today</text>`
    : "";

  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Projected bone density loss over the mission">
    ${extra}${yTicks}${areas}${today}
    <line class="selected" x1="${X(selectedDay)}" x2="${X(selectedDay)}" y1="${T}" y2="${H - B}" />
    ${xTicks}
  </svg>`;
}
