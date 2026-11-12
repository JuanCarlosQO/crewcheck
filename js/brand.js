// The CrewCheck mission patch. Crews design an embroidered patch for every
// flight; ours is a check mark flown as a trajectory: it leaves the planet's
// limb, bends at the low point and climbs to the spacecraft at its tip.
// Colours come from CSS variables, so the patch follows the light and dark themes.

const STARS = [[31, 31, 2.6], [64, 22, 1.7], [79, 45, 2.2], [22, 47, 1.3], [57, 41, 1.1]];
const star = ([x, y, r]) => `<path d="M${x} ${y - r * 2}Q${x} ${y} ${x + r * 2} ${y}Q${x} ${y} ${x} ${y + r * 2}Q${x} ${y} ${x - r * 2} ${y}Q${x} ${y} ${x} ${y - r * 2}Z"/>`;

function emblem(id) {
  return `
    <clipPath id="${id}-field"><circle cx="50" cy="50" r="39"/></clipPath>
    <circle class="p-field" cx="50" cy="50" r="39"/>
    <g clip-path="url(#${id}-field)">
      <circle class="p-limb" cx="50" cy="128" r="58"/>
      <path class="p-limb-line" d="M-8 86 Q50 60 108 86"/>
      <g class="p-stars">${STARS.map(star).join("")}</g>
      <path class="p-wake" d="M8 74 Q18 66 27 61"/>
      <path class="p-check" d="M27 61 L42 73 L72 33"/>
      <circle class="p-craft" cx="72" cy="33" r="4.2"/>
    </g>`;
}

/**
 * @param ring   true for the large version with the lettered band
 * @param label  accessible name; omit when the patch sits next to the word "CrewCheck"
 */
export function patchSVG({ ring = false, label = "", cls = "patch" } = {}) {
  const id = `p${Math.random().toString(36).slice(2, 7)}`;
  const a11y = label ? `role="img" aria-label="${label}"` : `aria-hidden="true"`;
  const band = ring ? `
    <circle class="p-band" cx="50" cy="50" r="49"/>
    <path id="${id}-arc" d="M50 50 m-41.6 0 a41.6 41.6 0 1 1 83.2 0 a41.6 41.6 0 1 1 -83.2 0" fill="none"/>
    <text class="p-letters"><textPath href="#${id}-arc" textLength="258" lengthAdjust="spacing">CREWCHECK · HEALTH LOG · CREWCHECK · HEALTH LOG ·</textPath></text>
    <circle class="p-stitch" cx="50" cy="50" r="48"/>` : `
    <circle class="p-band" cx="50" cy="50" r="49"/>
    <circle class="p-stitch" cx="50" cy="50" r="45"/>`;
  return `<svg class="${cls}" viewBox="0 0 100 100" ${a11y}>${band}${emblem(id)}<circle class="p-stitch inner" cx="50" cy="50" r="38.2"/></svg>`;
}
