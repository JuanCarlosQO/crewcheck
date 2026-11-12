# CrewCheck design: "Earthlight"

The app is seen from where the crew lives: low Earth orbit, on the night side. The thin blue line of the atmosphere curves under the header of every screen, city lights glow on the planet below, and on the access screen the station crosses the sky. When the crew member signs in, the sun rises over the horizon. The station sees about sixteen sunrises a day, and the access screen says so.

The team chose this direction from three mockups (Docking, Earthlight, White Room) for being beautiful, calm and futuristic without looking like a game.

## Materials

| Element | In the app | Why |
| --- | --- | --- |
| Night | Near-black blue (`--bg #02040b`), never pure black, a few quiet stars | Calm, readable in a dark cabin, lets the data stand out |
| The limb | The curve of the Earth under the header, with a soft blue atmosphere glow and city lights | Places every screen in orbit without decorating the content |
| Gold | `--gold #f4c27a`, sunlight on the limb | The one colour for actions, focus and the current position |
| Panels | Dark, slightly translucent, thin borders, 22 px corners | Quiet containers that never compete with the numbers |
| ECG paper | A faint teal millimetre grid | Trend charts and the camera pulse measurement |

## Type

| Face | Use |
| --- | --- |
| **Instrument Serif** (with italics) | Titles, greetings and the numbers that matter (values, dose, projection range) |
| **Manrope** | Everything else: labels, body text, buttons, navigation |

Both are stored in `fonts/` (SIL Open Font License, licences included), so the app looks the same offline.

## Status: word, shape and colour

Status never relies on colour alone. Every status has a word and a shape:

| Status | Shape | Colour |
| --- | --- | --- |
| Normal | ● circle | soft teal `#8fd8c4` |
| Watch | ▲ triangle | orange `#ff9f5a` |
| Act now | octagon | coral red `#ff7b6b`, pulsing slowly |
| Measure again | ◌ open ring | blue `#8fb4ff` |
| No reading | — dash | grey |
| No number yet | hatched square | grey hatch |

On the body map the fill pattern repeats the status (plain, diagonal lines, cross-hatch, dots).

## Screens

- **Access.** The night side of Earth fills the bottom of the screen, the ISS crosses on a dotted orbit, and the crew member is greeted by name ("Good evening, Commander"). Four gold dots fill as the code is typed on a quiet keypad. The fingerprint key sits in the keypad's corner. On success, the sun rises over the limb and the screen fades into the app. Setting a code, confirming it, wrong-code lockout and "Forgot your code?" all happen on the same screen.
- **Today.** A sentence answers "how am I today?" ("Mostly good today, Commander." plus which readings to look at). Thin concentric rings show each body system, with a legend of words. Below that come one gold action ("Start today's check-in"), the mission days, the five hazards, the body map, what to do now, radiation, and every reading as a row with its value, a small trend line and the reason.
- **Check-in, Trends, Future body, Sources** keep the same language: serif titles, thin panels, gold for the one thing to do.

## Motion

Motion is slow and physical: the Earth drifts, stars twinkle, the station orbits, rings and lines draw themselves in, the body outline is plotted, and the sun rises on entry. Nothing bounces. Everything stops with `prefers-reduced-motion`; the access screen then simply fades.

## Accessibility checklist

- Status always has a word and a shape as well as a colour.
- Touch targets are at least 44 px; keypad keys are 62 px tall.
- The keypad works with the keyboard: type the digits, Backspace deletes, Escape clears.
- The access screen is a modal dialog; the app behind it is `inert` until access is granted.
- Live regions announce check-in results, access messages and the camera measurement.
