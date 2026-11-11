// Visual effects: number count-up, tilt with light sheen, pointer spotlight,
// small SVG helpers (sparkline, status ring) and the timelapse player.
// Every effect turns itself off when the person asks for reduced motion.

export const reduceMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Animate every [data-count] inside root from its previous value to the new one. */
export function countUp(root) {
  root.querySelectorAll("[data-count]").forEach((el) => {
    const to = Number(el.dataset.count);
    const dec = Number(el.dataset.dec ?? 0);
    const from = Number(el.dataset.from ?? 0);
    if (!Number.isFinite(to)) return;
    if (reduceMotion()) { el.textContent = to.toFixed(dec); return; }
    const start = performance.now();
    const dur = 900;
    const step = (now) => {
      const t = Math.min(1, (now - start) / dur);
      const e = 1 - (1 - t) ** 4;
      el.textContent = (from + (to - from) * e).toFixed(dec);
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}

/** Cards with .tilt lean toward the pointer and show a moving sheen. */
export function bindTilt(root) {
  root.addEventListener("pointermove", (e) => {
    const card = e.target.closest(".tilt");
    if (!card || reduceMotion() || e.pointerType === "touch") return;
    const r = card.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    card.style.setProperty("--rx", `${(0.5 - y) * 7}deg`);
    card.style.setProperty("--ry", `${(x - 0.5) * 9}deg`);
    card.style.setProperty("--mx", `${x * 100}%`);
    card.style.setProperty("--my", `${y * 100}%`);
  });
  root.addEventListener("pointerout", (e) => {
    const card = e.target.closest(".tilt");
    if (card && !card.contains(e.relatedTarget)) {
      card.style.setProperty("--rx", "0deg");
      card.style.setProperty("--ry", "0deg");
    }
  });
}

/** Screens with .spot get a soft light that follows the pointer. */
export function bindSpotlight(root) {
  root.addEventListener("pointermove", (e) => {
    const s = e.target.closest(".spot");
    if (!s) return;
    const r = s.getBoundingClientRect();
    s.style.setProperty("--sx", `${e.clientX - r.left}px`);
    s.style.setProperty("--sy", `${e.clientY - r.top}px`);
  });
}

/** Tiny line chart for a tile. values: numbers or null. */
export function sparkline(values, statusList) {
  const W = 240, H = 46, P = 4;
  const pts = values.map((v, i) => ({ v, i, s: statusList[i] })).filter((p) => typeof p.v === "number");
  if (pts.length < 2) return `<svg class="spark" viewBox="0 0 ${W} ${H}" aria-hidden="true"></svg>`;
  const lo = Math.min(...pts.map((p) => p.v)), hi = Math.max(...pts.map((p) => p.v));
  const X = (i) => P + (i / Math.max(1, values.length - 1)) * (W - 2 * P);
  const Y = (v) => H - P - ((v - lo) / (hi - lo || 1)) * (H - 2 * P);
  const d = pts.map((p, k) => `${k ? "L" : "M"}${X(p.i).toFixed(1)} ${Y(p.v).toFixed(1)}`).join(" ");
  const area = `${d} L${X(pts.at(-1).i).toFixed(1)} ${H} L${X(pts[0].i).toFixed(1)} ${H} Z`;
  const last = pts.at(-1);
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" aria-hidden="true">
    <path class="spark-area" d="${area}"/>
    <path class="spark-line" d="${d}" pathLength="1"/>
    <circle class="spark-end s-${last.s}" cx="${X(last.i).toFixed(1)}" cy="${Y(last.v).toFixed(1)}" r="3"/>
  </svg>`;
}

/** Ring with one segment per indicator, coloured by status. */
export function statusRing(statuses) {
  const R = 52, C = 2 * Math.PI * R, n = statuses.length, gap = 0.012;
  const seg = 1 / n;
  const arcs = statuses.map((s, i) => {
    const len = (seg - gap) * C;
    const off = -(i * seg) * C;
    return `<circle class="ring-seg s-${s}" cx="64" cy="64" r="${R}" stroke-dasharray="${len.toFixed(2)} ${(C - len).toFixed(2)}" stroke-dashoffset="${off.toFixed(2)}" style="--i:${i}"/>`;
  }).join("");
  return `<svg class="status-ring" viewBox="0 0 128 128" aria-hidden="true"><circle class="ring-track" cx="64" cy="64" r="${R}"/><g transform="rotate(-90 64 64)">${arcs}</g></svg>`;
}

/** Animate a number from `from` to `to`, calling onFrame each frame. Returns a stop function. */
export function playTimelapse(from, to, ms, onFrame, onDone) {
  if (reduceMotion()) { onFrame(to); onDone?.(); return () => {}; }
  let raf;
  const start = performance.now();
  const tick = (now) => {
    const t = Math.min(1, (now - start) / ms);
    const e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
    onFrame(Math.round(from + (to - from) * e));
    if (t < 1) raf = requestAnimationFrame(tick); else onDone?.();
  };
  raf = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(raf);
}
