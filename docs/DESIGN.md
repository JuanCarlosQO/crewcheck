# CrewCheck design: "Flight Data File"

On the space station, every procedure the crew follows is printed in the **Flight Data File**: ring binders of checklists and cue cards with coloured index tabs, rubber-stamped, annotated in pencil and read under cabin lights. CrewCheck is designed as the crew's own personal volume of that file. Every visual choice below comes from that one idea, so the app looks like an object from the mission instead of a generic dashboard.

## Materials

| Element | What it is in the app | Why |
| --- | --- | --- |
| Paper | Warm uncoated stock with grain (`--page`, `--grain`) | Printed procedures, not screens. Readable in bright light. |
| The page | One big sheet, punched for three rings, with a salmon margin line and sheets stacked underneath | Every view is a page of the binder. |
| Index tabs | Manila, salmon, sky, sage and butter dividers sticking out of the page (bottom edge on phones) | Navigation you can find without reading. The open tab joins the page. |
| Ink | Near-black, never pure black. Drawings in 0.9–1.6 px lines | Technical drawing conventions. |
| International Orange | `--orange`, used only for actions, the current position and things you must not miss | The colour of spacecraft safety markings. |
| ECG paper | Salmon millimetre grid with a heavier line every fifth square | Trend charts, the masthead pulse strip and the camera measurement are drawn on it. |
| Engineering paper | Fine blue-grey grid | The body drawing. |

Night mode ("night cabin") keeps the same materials under dim cabin lighting: charcoal board, cream ink, orange that glows a little more.

## Type

| Face | Use | Why |
| --- | --- | --- |
| **Big Shoulders** (condensed, after Chicago industrial signage) | Titles, values, buttons, all caps | Big, narrow, readable at arm's length. |
| **Atkinson Hyperlegible Next** | Body text | Drawn by the Braille Institute for low-vision readers. Right for a health tool used by tired people in odd light. |
| **Martian Mono** (variable width, set at 87.5 %) | Labels, procedure numbers, units, metadata | The voice of printed forms. |

The fonts are stored in `fonts/` (SIL Open Font License, licences included), so the app looks the same offline, far from Earth.

## Status: word, shape and colour

Status never relies on colour alone. Each one has a shape and a word everywhere it appears:

| Status | Shape | Colour |
| --- | --- | --- |
| Normal | ● circle | green |
| Watch | ▲ triangle | caution amber |
| Act now | octagon (a stop sign) | warning red, blinking slowly |
| Measure again | ◌ open ring | blue |
| No reading | — dash | grey |
| No number yet | hatched square | grey hatch |

On the body drawing the fill pattern repeats the status (plain, diagonal lines, cross-hatch, dots), so the drawing still reads in black and white or for colour-blind crew.

## Signature pieces

- **The cover (login).** The app opens as the binder's orange cover: rings on the left, a black elastic strap marked *Sealed · Crew only*, a label plate *Issued to* the crew member, and a **combination dial** printed on it. The ten digits sit around the dial like a safe's; an orange needle swings to each digit you press. The centre of the dial is the **thumb plate** for the fingerprint. When access is granted the strap slides off and the cover swings open on its rings (3D), showing the inside board and then the page underneath, where the body drawing plots itself in.
- **The mission patch.** Crews design an embroidered patch for every flight. Ours is a check mark flown as a trajectory: it leaves the planet's limb, bends at the low point and climbs to the spacecraft at its tip. Stitching runs around the rim; the large version has a lettered band (`js/brand.js`).
- **The body as a technical drawing.** Ink outline, dash-dot centre line, corner marks, a title block (*Fig. 1 · Crew member · front view · Day 30*) and numbered balloons, read top to bottom like a drawing's parts list. On wide screens it draws itself in like a pen plotter.
- **Caution and warning panel.** The day's status is an annunciator: a grid of lamps (HR, BP, TEMP, GLU, SPO2, SLEEP, MOOD, RAD). Watch lamps light amber; Act now lamps flash like a master alarm. Next to it, a rubber stamp with the overall status and the day.
- **Procedures.** "What to do now" is a numbered procedure. The daily log is a checklist: each step has a number (2.01, 2.02 …) and a box that gets an orange pencil tick when a value is in.
- **Hardware controls.** Buttons are key caps that press down; the countermeasure switch is a lever; the mission slider is a ruler.
- **Small things.** Station time in GMT (the station's time zone) on the masthead, warning-tape stripes on the radiation card during a solar storm, a barcode on the cover, card codes (C&W, PROC, RAD) on tabs above each card, and a print stylesheet so a page prints like a page of the file.

## Motion

Motion imitates physical things: the cover swinging open, the strap sliding off, the dial needle, a stamp landing, pen strokes plotting, key caps pressing. Everything is switched off with `prefers-reduced-motion`; then the cover simply fades and nothing moves.

## Accessibility checklist

- Status always has a word and a shape as well as a colour.
- Every touch target is at least 44 px; the dial keys are 42–52 px.
- The dial works with the keyboard: type the digits, Backspace deletes, Escape clears.
- The cover is a modal dialog; the app behind it is `inert` until it opens.
- Live regions announce check-in results, gate messages and the camera measurement.
