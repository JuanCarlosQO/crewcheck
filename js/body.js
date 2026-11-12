// Crew member figure, drawn like a sheet from an engineering drawing set: ink
// outline, a dash-dot centre line, corner marks, and numbered
// balloons that point at each body system. A system's status is shown three
// ways at once: its colour, its hatch pattern (none, diagonal, cross, dots)
// and the word in its balloon, so it reads in print, in the dark and for
// colour-blind crew.
//
// mode "today":  daily systems (mind, lungs, heart, metabolism, body, bones)
// mode "future": bones, muscles, heart, eyes and mind for the projection

const OX = 110; // the figure is drawn around x = 100 and shifted into a 420-wide sheet
const OY = 12;

const SILHOUETTE = `M100 14 a30 30 0 1 1 -0.1 0 z
  M90 72 L90 84 C76 86 60 88 54 102 L42 200 C40 214 54 216 56 202 L66 122
  L66 226 L70 392 C70 404 92 404 92 392 L96 252 L104 252 L108 392
  C108 404 130 404 130 392 L134 226 L134 122 L144 202 C146 216 160 214 158 200
  L146 102 C140 88 124 86 110 84 L110 72 Z`;

// Zone shapes in figure coordinates, and where each balloon points.
const ZONES = {
  mind:       { label: "Mind & sleep",          shape: `<ellipse cx="100" cy="40" rx="20" ry="17"/>`, anchor: [84, 40], side: "left" },
  eyes:       { label: "Eyes & brain",          shape: `<circle cx="91" cy="56" r="5"/><circle cx="109" cy="56" r="5"/>`, anchor: [114, 56], side: "right" },
  lungs:      { label: "Lungs & breathing",     shape: `<ellipse cx="86" cy="126" rx="15" ry="27"/><ellipse cx="114" cy="126" rx="15" ry="27"/>`, anchor: [74, 126], side: "left" },
  heart:      { label: "Heart & circulation",   shape: `<path d="M104 146 c-14 -9 -16 -18 -9 -22 c4 -2 7 0 9 3 c2 -3 5 -5 9 -3 c7 4 5 13 -9 22 z"/>`, anchor: [116, 132], side: "right" },
  metabolism: { label: "Blood sugar & energy",  shape: `<ellipse cx="98" cy="176" rx="22" ry="13"/>`, anchor: [77, 176], side: "left" },
  body:       { label: "Whole body & immunity", shape: `<path d="${SILHOUETTE}"/>`, anchor: [150, 196], side: "right" },
  bones:      { label: "Bones & muscle",        shape: "", anchor: [118, 300], side: "right" },
  muscle:     { label: "Muscles",               shape: `<ellipse cx="81" cy="286" rx="11" ry="36"/><ellipse cx="119" cy="286" rx="11" ry="36"/>`, anchor: [70, 286], side: "left" },
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
  // Balloons are numbered top to bottom, the way a drawing's parts list reads.
  return LAYOUT[mode].systems
    .map((id) => ({ id, label: LAYOUT[mode].labels[id] ?? ZONES[id].label, side: ZONES[id].side, anchor: ZONES[id].anchor }))
    .sort((a, b) => a.anchor[1] - b.anchor[1])
    .map((s, i) => ({ ...s, n: i + 1 }));
}

const PATTERNS = `
  <pattern id="h-yellow" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect class="hb" width="7" height="7"/><line class="hl" x1="0" y1="0" x2="0" y2="7"/></pattern>
  <pattern id="h-red" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect class="hb" width="6" height="6"/><path class="hl" d="M0 0V6M0 0H6"/></pattern>
  <pattern id="h-verify" width="6" height="6" patternUnits="userSpaceOnUse"><rect class="hb" width="6" height="6"/><circle class="hd" cx="3" cy="3" r="1"/></pattern>
  <pattern id="h-hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)"><line class="hl" x1="0" y1="0" x2="0" y2="8" stroke-dasharray="2 2"/></pattern>`;

/**
 * The sheet's SVG. Balloon labels are HTML (calloutsHTML) so their text stays
 * sharp and wraps on phones.
 */
export function figureSVG(mode = "today") {
  const list = systemsFor(mode);
  const zones = list
    .filter((s) => ZONES[s.id].shape)
    .map((s) => `<g class="zone" data-system="${s.id}">${ZONES[s.id].shape}</g>`)
    .join("");

  // Leaders run from a dot on the zone to the balloon column (x 122 / 298).
  const leads = list.map((s) => {
    const [ax, ay] = s.anchor;
    const x = ax + OX, y = ay + OY;
    const edge = s.side === "left" ? 122 : 298;
    const knee = s.side === "left" ? Math.min(x - 16, 150) : Math.max(x + 16, 270);
    return `<path class="lead" data-system="${s.id}" d="M${x} ${y} L${knee} ${y} L${edge} ${y}"/><circle class="lead-dot" data-system="${s.id}" cx="${x}" cy="${y}" r="2.4"/>`;
  }).join("");

  return `<svg class="fig" viewBox="0 0 420 440" aria-hidden="true">
    <defs>${PATTERNS}</defs>
    <line class="centre" x1="210" y1="6" x2="210" y2="434"/>
    <g transform="translate(${OX} ${OY})">
      <path class="silhouette" d="${SILHOUETTE}" pathLength="1"/>
      <g class="zones">${zones}</g>
      <g class="zone skeleton" data-system="bones">${SKELETON}</g>
    </g>
    <g class="leads">${leads}</g>
    <g class="corner" aria-hidden="true"><path d="M8 20 V8 H20 M412 20 V8 H400 M8 420 V432 H20 M412 420 V432 H400"/></g>
  </svg>`;
}

export function calloutsHTML(mode, info) {
  // info: { [systemId]: { status, label, detail } }
  return systemsFor(mode).map((s) => {
    const i = info[s.id] ?? { status: "missing", label: "", detail: "" };
    const top = ((s.anchor[1] + OY) / 440) * 100;
    return `<button class="callout ${s.side} s-${i.status}" data-system="${s.id}" style="top:${top.toFixed(2)}%">
      <span class="c-num" aria-hidden="true">${s.n}</span>
      <span class="c-text"><span class="c-name">${s.label}</span><span class="c-state"><i class="g" aria-hidden="true"></i>${i.label}</span>${i.detail ? `<span class="c-detail">${i.detail}</span>` : ""}</span>
    </button>`;
  }).join("");
}
