// "Future body" projection. Pure functions, tested in tests/forecast.test.mjs.
//
// The projection is linear: monthly loss x months. It is only as good as the
// published rate behind it, so every result carries its range (low to high)
// and a flag when it goes beyond the mission length the rate was measured on.

export const DAYS_PER_MONTH = 30.44;

/**
 * Projected loss for a quantified system after `days` in flight.
 * @param sys            system from data/forecast.json (kind "quantified")
 * @param days           days since launch
 * @param countermeasure true when the astronaut follows the countermeasure
 * @param validatedMonths mission length the published rate comes from
 * @returns { low, high, mid, extrapolated, uncertainCountermeasure }
 */
export function projectLoss(sys, days, countermeasure, validatedMonths) {
  const months = Math.max(0, days) / DAYS_PER_MONTH;
  const [rateLo, rateHi] = sys.lossPerMonth;
  let low = rateLo * months;
  let high = rateHi * months;
  let uncertainCountermeasure = false;

  if (countermeasure) {
    const f = sys.countermeasure?.effectFactor;
    if (typeof f === "number") {
      low *= f;
      high *= f;
    } else {
      // No published effect size: the honest answer is "somewhere between no
      // loss and the loss without countermeasures".
      low = 0;
      uncertainCountermeasure = true;
    }
  }

  return {
    low,
    high,
    mid: (low + high) / 2,
    extrapolated: months > validatedMonths,
    uncertainCountermeasure,
  };
}

export function bandFor(sys, loss) {
  const { yellowFrom, redFrom } = sys.displayBands;
  if (loss >= redFrom) return "red";
  if (loss >= yellowFrom) return "yellow";
  return "green";
}

// Points for the chart: one per `step` days from 0 to `days`.
export function projectionSeries(sys, days, countermeasure, validatedMonths, step = 10) {
  const points = [];
  for (let d = 0; d <= days; d += step) points.push({ day: d, ...projectLoss(sys, d, countermeasure, validatedMonths) });
  if (points.at(-1).day !== days) points.push({ day: days, ...projectLoss(sys, days, countermeasure, validatedMonths) });
  return points;
}

// Share of logged days that met the exercise target, as a plain fact for the
// astronaut. It does not change the rate: no published number links minutes
// of exercise to bone loss yet.
export function exerciseAdherence(entries, targetMin) {
  const logged = entries.map((e) => e.values.exercise_min).filter((v) => typeof v === "number");
  if (!logged.length) return null;
  const met = logged.filter((v) => v >= targetMin).length;
  return { met, total: logged.length, pct: Math.round((met / logged.length) * 100) };
}
