# CrewCheck — project context for Claude Code

CrewCheck is the team's entry for the **NASA Space Apps Challenge 2026**, challenge *Create Health Monitoring Software for Astronauts on Space Missions*. Hackathon: 14–15 November 2026. Submission closes Sunday 15 November at 11:59 p.m. in the local event's time zone. The submission form, the app UI and the demo video must be in **English**. The developer, Juan Carlos, speaks Spanish: talk to him in Spanish.

Live site: GitHub Pages from `main` (`https://juancarlosqo.github.io/crewcheck/`). Every push to `main` redeploys it.

## How to run

- No build step, no dependencies. `npm start` serves the folder on port 8000; open it through a server, not as a file (ES modules and `fetch` need http).
- `npm test` runs the Node unit tests in `tests/` (rules, forecast, hazards). Keep them green and add tests for new rules.

## Architecture

| File | Role |
| --- | --- |
| `index.html` | Shell: sky (stars, Earth's limb), header (mark, navigation, GMT clock, pulse, Lock), page, gate host |
| `css/styles.css` | "Earthlight" design tokens, all components, the access screen, responsive and print styles |
| `js/auth.js` | Crew access, pure and tested: code rules, PBKDF2 hash, wrong-try lockout, WebAuthn assertion check |
| `js/gate.js` | Access screen: night Earth, ISS orbit, greeting, keypad with fingerprint key, sunrise on entry |
| `js/brand.js` | The CrewCheck mark (Earth, gold orbit, station) as SVG |
| `js/main.js` | Views (`#today`, `#checkin`, `#trends`, `#future`, `#data`), router, events |
| `js/rules.js` | Pure health rules: missing → plausible → camera signal quality → jump → ranges → personal baseline → streak |
| `js/ppg.js` | Camera heart rate signal processing (pure, tested): resample, band-pass, peaks, quality score |
| `js/camera.js` | Camera heart-rate sheet: `getUserMedia`, torch, finger detection, live waveform |
| `js/forecast.js` | Future body projection (bone loss = published monthly rate × months) |
| `js/hazards.js` | The five NASA hazards, mission dose, career band, storm alert |
| `js/body.js` | Body map (outline, centre line, hatch patterns per status, numbered markers) |
| `js/charts.js`, `js/fx.js` | SVG charts; count-up, sparkline, timelapse |
| `fonts/` | Instrument Serif and Manrope (OFL), self-hosted so the app works offline |
| `js/store.js` | Loading data, CSV parsing, localStorage |
| `data/*.json`, `data/mission_demo.csv` | All medical content and sources; the team edits these, not the code |

## Rules the project follows

- **No invented numbers.** A value shown as fact needs a source in `data/` and in `docs/DATA_SOURCES.md`. Without one it is shown as "Pending check" or "No number yet". App-chosen thresholds are labelled as app rules.
- **Measurement before health.** Impossible values and sudden jumps become "Measure again", never an alarm.
- **Demo data is labelled** as demo and never mixed with real data.
- **Design identity:** "Earthlight" (chosen by Juan Carlos from three mockups on 12 November) — low Earth orbit at night: near-black blue, the Earth's limb glowing under the header, gold (`--gold`) as the only action colour, Instrument Serif for titles and key numbers, Manrope for the rest, slow physical motion (orbit, drawing lines, sunrise on sign-in). Serious and beautiful, not playful: no bouncing, mascots or confetti. Status always has a word and a shape as well as a colour. Respect `prefers-reduced-motion`. Full rationale in `docs/DESIGN.md`.
- **Crew access:** the app opens on the Earthlight access screen with a 4-digit code (stored only as a salted PBKDF2 hash) and an optional fingerprint (WebAuthn platform authenticator, checked on the device). It is a device lock, not encryption: say so honestly wherever it comes up. Fingerprint only works over https on a device with a reader.
- Commits end with the Co-Authored-By line for Claude. `docs/AI_USE.md` records AI use for the submission form; keep it accurate.

## Status (12 November 2026)

Done and live on GitHub Pages (last merge: PR #3): daily log, body map with numbered markers, mission days strip, rings per body system, readings with sparklines, trends, Future body with timelapse and porous bones, five hazards row, radiation (dosimeter input, 600 mSv career limit, NASA DONKI live + archive, real storm replay), sources page, camera heart rate (tested only with a simulated camera), "Earthlight" design with crew access login (code + fingerprint), 49 passing tests. Development branch: `claude/adoring-bardeen-c7jjpj`; Juan Carlos asks for a PR and merge into `main` when a change is ready, after a full verification (unit tests plus a Playwright run of every view on desktop and phone).

## Design history (keep for context)

1. "Med bay" glass and aurora: rejected, looked AI-made.
2. "Flight Data File" paper binder: rejected, too serious, few attractive animations, not intuitive.
3. Playful round (mascot "Cosmo", 70s retro, orbit planets): rejected, too animated; NASA wants something beautiful, creative and futuristic but serious.
4. Second round on a claude.ai design canvas: **B · Earthlight chosen and implemented**; **A · Docking also liked, to implement later**; C · White Room not chosen. The mockup sources and a description of each are in `docs/mockups/` (the canvas itself belongs to one claude.ai account).

## Next tasks

1. **Camera heart-rate input — built, needs real-phone testing.** Test on Android Chrome and iPhone Safari over GitHub Pages; compare against a finger sensor and tune `heart_rate.camera.minQuality` and `isFingerFrame` if needed. Original brief: in the Log view, a "Measure with camera" button for heart rate: fingertip over the phone camera with the torch on, read the red-channel brightness from `getUserMedia` frames, band-pass and count peaks over about 20 seconds (photoplethysmography). Show a live waveform on ECG paper, a signal-quality score, and send the result through the normal rules so a poor signal ends as "Measure again". Label it as an estimate that is less accurate than a medical sensor. It cannot run inside the claude.ai artifact preview (camera blocked), only on GitHub Pages over https; test on a real phone.
2. **Implement design A · Docking later (Juan Carlos liked it after choosing Earthlight).** Spec and mockup sources: `docs/mockups/README.md`, `docs/mockups/A-docking-*.dc.html`. Ask him first whether it should replace Earthlight or be a second theme the crew can switch to (a theme switch in Sources would keep both). The access screen's ring alignment maps onto the existing gate logic in `js/gate.js` (one ring per digit; fingerprint in the centre).
3. **Test the login on real phones** over GitHub Pages: set a code, add the fingerprint, lock, open with the thumb. Check iPhone (Face ID / Touch ID) and Android.
4. Load the research team's verified ranges into `data/indicators.json` (set `verified: true` and `source`) and their projection rates into `data/forecast.json` (`effectFactor`, muscle rate).
5. Replace `DEMO_KEY` in `fetchSpaceWeather` (`js/main.js`) with the team's own free key from api.nasa.gov.
6. Confirm with the local event whether code written before 14 November is allowed; if not, the hackathon build starts in a fresh repository.

Team guide (Spanish), roles and calendar: the "Guía del equipo — Monitor de salud para astronautas" doc in claude.ai.
