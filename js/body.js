// Holographic body scan. The body is drawn as horizontal "slices" (like a
// medical scanner) inside a dark screen. Each system is a glowing zone under
// the slices, with a callout label beside the body connected by a leader line.
//
// mode "today":  daily systems (mind, lungs, heart, metabolism, body, bones)
// mode "future": bones, muscles, heart, eyes and mind for the projection

const OX = 110; // the figure is drawn around x = 100 and shifted into a 420-wide screen
const OY = 12;

const SILHOUETTE = `M100 14 a30 30 0 1 1 -0.1 0 z
  M90 72 L90 84 C76 86 60 88 54 102 L42 200 C40 214 54 216 56 202 L66 122
  L66 226 L70 392 C70 404 92 404 92 392 L96 252 L104 252 L108 392
  C108 404 130 404 130 392 L134 226 L134 122 L144 202 C146 216 160 214 158 200
  L146 102 C140 88 124 86 110 84 L110 72 Z`;

// Zone shapes in figure coordinates, and where each callout sits.
const ZONES = {
  mind:       { label: "Mind & sleep",        shape: `<ellipse cx="100" cy="40" rx="20" ry="17"/>`, anchor: [84, 40], side: "left" },
  eyes:       { label: "Eyes & brain",        shape: `<circle cx="91" cy="56" r="5"/><circle cx="109" cy="56" r="5"/>`, anchor: [114, 56], side: "right" },
  lungs:      { label: "Lungs & breathing",   shape: `<ellipse cx="86" cy="126" rx="15" ry="27"/><ellipse cx="114" cy="126" rx="15" ry="27"/>`, anchor: [74, 126], side: "left" },
  heart:      { label: "Heart & circulation", shape: `<circle cx="104" cy="132" r="12"/>`, anchor: [116, 132], side: "right" },
  metabolism: { label: "Blood sugar & energy", shape: `<ellipse cx="98" cy="176" rx="22" ry="13"/>`, anchor: [77, 176], side: "left" },
  body:       { label: "Whole body & immunity", shape: `<path d="${SILHOUETTE}"/>`, anchor: [150, 196], side: "right" },
  bones:      { label: "Bones & muscle",      shape: "", anchor: [118, 300], side: "right" },
  muscle:     { label: "Muscles",             shape: `<ellipse cx="81" cy="286" rx="11" ry="36"/><ellipse cx="119" cy="286" rx="11" ry="36"/>`, anchor: [70, 286], side: "left" },
};

const SKELETON = `
  <path class="bone" d="M100 92 V222"/>
  <path class="bone pelvis" d="M80 224 q20 16 40 0 q-4 18 -20 22 q-16 -4 -20 -22 z"/>
  <path class="bone" d="M86 250 L82 318 M114 250 L118 318"/>
  <path class="bone thin" d="M82 326 L84 386 M118 326 L116 386"/>
  <path class="bone thin" d="M74 102 q26 10 52 0"/>
  <path class="bone thin" d="M66 122 L56 200 M134 122 L144 200"/>`;

const LAYOUT = {
  today: { systems: ["mind", "lungs", "metabolism", "heart", "body", "bones"], labels: { bones: "Bones & muscle" } },
  future: { systems: ["mind", "muscle", "eyes", "heart", "bones"], labels: { bones: "Bones · spine & hip", heart: "Heart & circulation", mind: "Mind & sleep" } },
};

export function systemsFor(mode) {
  return LAYOUT[mode].systems.map((id) => ({ id, label: LAYOUT[mode].labels[id] ?? ZONES[id].label, side: ZONES[id].side, anchor: ZONES[id].anchor }));
}

function slices() {
  let s = "";
  for (let y = 14; y <= 406; y += 5) s += `M30 ${y} H170 `;
  return s;
}

/**
 * Returns the SVG for the screen. Callout buttons are added as HTML by the
 * caller (calloutsHTML), so their text stays sharp and readable on phones.
 */
export function holoSVG(mode = "today") {
  const list = systemsFor(mode);
  const zones = list
    .filter((s) => ZONES[s.id].shape)
    .map((s) => `<g class="zone" data-system="${s.id}">${ZONES[s.id].shape}</g>`)
    .join("");
  const glows = list
    .filter((s) => ZONES[s.id].shape && s.id !== "body")
    .map((s) => `<g class="zone" data-system="${s.id}">${ZONES[s.id].shape}</g>`)
    .join("");

  // Leader lines go from the zone to the callout column (x 128 / 292 in screen units).
  const leads = list.map((s) => {
    const [ax, ay] = s.anchor;
    const x = ax + OX, y = ay + OY;
    const edge = s.side === "left" ? 118 : 302;
    const mid = s.side === "left" ? Math.min(x - 14, 150) : Math.max(x + 14, 270);
    return `<path class="lead" data-system="${s.id}" d="M${x} ${y} L${mid} ${y} L${edge} ${y}"/><circle class="lead-dot" data-system="${s.id}" cx="${x}" cy="${y}" r="2.6"/>`;
  }).join("");

  return `<svg class="holo-svg" viewBox="0 0 420 440" aria-hidden="true">
    <defs>
      <clipPath id="clip-${mode}"><path d="${SILHOUETTE}" transform="translate(${OX} ${OY})"/></clipPath>
      <linearGradient id="beam-${mode}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="var(--holo)" stop-opacity="0"/>
        <stop offset="0.85" stop-color="var(--holo)" stop-opacity="0.45"/>
        <stop offset="1" stop-color="var(--holo)" stop-opacity="0.95"/>
      </linearGradient>
      <filter id="glow-${mode}" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="7"/></filter>
      <pattern id="hatch-${mode}" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="5" class="hatch-line"/></pattern>
    </defs>

    <g class="rings">
      <ellipse class="ring r1" cx="210" cy="230" rx="150" ry="34"/>
      <ellipse class="ring r2" cx="210" cy="230" rx="118" ry="24"/>
    </g>

    <g transform="translate(${OX} ${OY})">
      <g class="glows" filter="url(#glow-${mode})">${glows}</g>
      <g clip-path="url(#clip-${mode})">
        <path class="slices" d="${slices()}"/>
        <g class="scan"><rect x="30" y="-60" width="140" height="60" fill="url(#beam-${mode})"/></g>
      </g>
      <path class="outline" d="${SILHOUETTE}"/>
      <g class="zones">${zones}</g>
      <g class="zone skeleton" data-system="bones">${SKELETON}</g>
    </g>

    <g class="leads">${leads}</g>
    <line class="scanline" x1="20" x2="400" y1="0" y2="0"/>
  </svg>`;
}

export function calloutsHTML(mode, info) {
  // info: { [systemId]: { status, label, detail } }
  return systemsFor(mode).map((s) => {
    const i = info[s.id] ?? { status: "missing", label: "", detail: "" };
    const top = ((s.anchor[1] + OY) / 440) * 100;
    return `<button class="callout ${s.side} s-${i.status}" data-system="${s.id}" style="top:${top.toFixed(2)}%">
      <span class="c-dot"></span>
      <span class="c-text"><span class="c-name">${s.label}</span><span class="c-state">${i.label}</span>${i.detail ? `<span class="c-detail">${i.detail}</span>` : ""}</span>
    </button>`;
  }).join("");
}
