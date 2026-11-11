// The body figure, drawn as SVG. Each organ or system is a group with
// data-system="<id>", so the app can colour it and react to clicks.
// mode "today" shows the daily systems; mode "future" shows bones, muscles,
// heart, eyes and mind for the projection.

const zone = (id, label, inner) =>
  `<g class="zone" data-system="${id}" role="button" tabindex="0" aria-label="${label}">${inner}</g>`;

export function bodySVG(mode = "today") {
  const silhouette = `
    <path class="silhouette" d="
      M100 14 a30 30 0 1 1 -0.1 0 z
      M90 72 L90 84 C76 86 60 88 54 102 L42 200 C40 214 54 216 56 202 L66 122
      L66 226 L70 392 C70 404 92 404 92 392 L96 252 L104 252 L108 392
      C108 404 130 404 130 392 L134 226 L134 122 L144 202 C146 216 160 214 158 200
      L146 102 C140 88 124 86 110 84 L110 72 Z" />`;

  const bones = zone("bones", "Bones", `
    <path class="bone" d="M100 92 V222" />
    <path class="bone pelvis" d="M80 224 q20 16 40 0 q-4 18 -20 22 q-16 -4 -20 -22 z" />
    <path class="bone" d="M86 250 L82 318 M114 250 L118 318" />
    <path class="bone thin" d="M82 326 L84 386 M118 326 L116 386" />
    <path class="bone thin" d="M74 102 q26 10 52 0" />`);

  const muscle = zone("muscle", "Muscles", `
    <path class="organ" d="M70 254 q10 -6 22 0 l-3 66 q-8 6 -16 0 z" />
    <path class="organ" d="M108 254 q10 -6 22 0 l-3 66 q-8 6 -16 0 z" />`);

  const mind = zone("mind", mode === "future" ? "Mind and sleep" : "Mind and sleep", `
    <path class="organ" d="M82 40 q0 -18 18 -18 q18 0 18 18 q0 10 -8 12 h-20 q-8 -2 -8 -12 z" />`);

  const eyes = zone("eyes", "Eyes and brain", `
    <circle class="organ" cx="91" cy="58" r="4" /><circle class="organ" cx="109" cy="58" r="4" />`);

  const lungs = zone("lungs", "Lungs and breathing", `
    <path class="organ" d="M96 100 q-20 -2 -22 22 q-2 22 8 30 q14 4 14 -10 z" />
    <path class="organ" d="M104 100 q20 -2 22 22 q2 22 -8 30 q-14 4 -14 -10 z" />`);

  const heart = zone("heart", "Heart and circulation", `
    <path class="organ" d="M103 130 q0 -9 8 -9 q8 0 8 9 q0 9 -16 20 q-16 -11 -16 -20 q0 -9 8 -9 q8 0 8 9 z" />`);

  const metabolism = zone("metabolism", "Blood sugar and energy", `
    <ellipse class="organ" cx="98" cy="176" rx="18" ry="11" />`);

  const parts = mode === "future"
    ? [bones, muscle, heart, eyes, mind]
    : [zone("body", "Whole body and immunity", silhouette), bones, mind, lungs, heart, metabolism];

  return `<svg class="body-figure" viewBox="0 0 200 420" aria-label="Body map">
    <defs>
      <pattern id="hatch-${mode}" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <line x1="0" y1="0" x2="0" y2="6" class="hatch-line" />
      </pattern>
    </defs>
    ${mode === "future" ? `<g class="ghost">${silhouette}</g>` : ""}
    ${parts.join("")}
  </svg>`;
}
