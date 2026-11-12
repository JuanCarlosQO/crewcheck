// The CrewCheck mark: Earth's night side seen from orbit, a thin gold orbit
// and the station on it. Drawn in fine lines so it sits quietly next to the
// serif wordmark. Colours come from CSS (see .mark in styles.css).

let n = 0;

/**
 * @param label  accessible name; omit when the mark sits next to the word "CrewCheck"
 */
export function markSVG({ label = "", cls = "mark" } = {}) {
  const id = `m${++n}`;
  const a11y = label ? `role="img" aria-label="${label}"` : `aria-hidden="true"`;
  return `<svg class="${cls}" viewBox="0 0 40 40" ${a11y}>
    <defs>
      <radialGradient id="${id}-e" cx="50%" cy="20%" r="80%"><stop offset="0" stop-color="#16325f"></stop><stop offset="1" stop-color="#040a18"></stop></radialGradient>
      <clipPath id="${id}-c"><circle cx="20" cy="20" r="11"></circle></clipPath>
    </defs>
    <circle class="m-earth" cx="20" cy="20" r="11" fill="url(#${id}-e)"></circle>
    <path class="m-limb" d="M9.6 16.5 A11 11 0 0 1 30.4 16.5" clip-path="url(#${id}-c)"></path>
    <ellipse class="m-orbit" cx="20" cy="20" rx="18" ry="6.2" transform="rotate(-24 20 20)"></ellipse>
    <circle class="m-station" cx="34.6" cy="12.4" r="2.1"></circle>
  </svg>`;
}
