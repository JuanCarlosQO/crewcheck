// Motion and small drawings: the number counter, the sparkline drawn like a
// pen trace, and the timelapse player. Every effect turns itself off when the
// person asks for reduced motion.

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
