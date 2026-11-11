# CrewCheck — project context for Claude Code

CrewCheck is the team's entry for the **NASA Space Apps Challenge 2026**, challenge *Create Health Monitoring Software for Astronauts on Space Missions*. Hackathon: 14–15 November 2026. Submission closes Sunday 15 November at 11:59 p.m. in the local event's time zone. The submission form, the app UI and the demo video must be in **English**. The developer, Juan Carlos, speaks Spanish: talk to him in Spanish.

Live site: GitHub Pages from `main` (`https://juancarlosqo.github.io/crewcheck/`). Every push to `main` redeploys it.

## How to run

- No build step, no dependencies. `npm start` serves the folder on port 8000; open it through a server, not as a file (ES modules and `fetch` need http).
- `npm test` runs the Node unit tests in `tests/` (rules, forecast, hazards). Keep them green and add tests for new rules.

## Architecture

| File | Role |
| --- | --- |
| `index.html` | Shell: aurora background, dock navigation, HUD with live ECG |
| `css/styles.css` | Design tokens (light and dark), all components and animations |
| `js/main.js` | Views (`#today`, `#checkin`, `#trends`, `#future`, `#data`), router, events |
| `js/rules.js` | Pure health rules: missing → plausible → camera signal quality → jump → ranges → personal baseline → streak |
| `js/ppg.js` | Camera heart rate signal processing (pure, tested): resample, band-pass, peaks, quality score |
| `js/camera.js` | Camera heart-rate sheet: `getUserMedia`, torch, finger detection, live waveform |
| `js/forecast.js` | Future body projection (bone loss = published monthly rate × months) |
| `js/hazards.js` | The five NASA hazards, mission dose, career band, storm alert |
| `js/body.js` | Holographic body (SVG slices, scan beam, zones, callouts) |
| `js/charts.js`, `js/fx.js` | SVG charts; count-up, tilt, sparkline, status ring, timelapse |
| `js/store.js` | Loading data, CSV parsing, localStorage |
| `data/*.json`, `data/mission_demo.csv` | All medical content and sources; the team edits these, not the code |

## Rules the project follows

- **No invented numbers.** A value shown as fact needs a source in `data/` and in `docs/DATA_SOURCES.md`. Without one it is shown as "Pending check" or "No number yet". App-chosen thresholds are labelled as app rules.
- **Measurement before health.** Impossible values and sudden jumps become "Measure again", never an alarm.
- **Demo data is labelled** as demo and never mixed with real data.
- **Design identity:** "med bay" — frosted glass over aurora light, dark holographic screens, Unbounded + Sora, aqua for the scanner, coral for time. Status colours always come with a word. Respect `prefers-reduced-motion`.
- Commits end with the Co-Authored-By line for Claude. `docs/AI_USE.md` records AI use for the submission form; keep it accurate.

## Status (11 November 2026)

Done: daily log, body scan with callouts, mission strip, status ring, tiles with sparklines, trends, Future body with timelapse and porous bones, five hazards row, radiation (dosimeter input, 600 mSv career limit, NASA DONKI live + archive, real storm replay), sources page, camera heart rate (code done and tested with a simulated camera; still to test on real phones), 39 passing tests.

## Next tasks

1. **Camera heart-rate input — built, needs real-phone testing.** Test on Android Chrome and iPhone Safari over GitHub Pages; compare against a finger sensor and tune `heart_rate.camera.minQuality` and `isFingerFrame` if needed. Original brief: in the Log view, a "Measure with camera" button for heart rate: fingertip over the phone camera with the torch on, read the red-channel brightness from `getUserMedia` frames, band-pass and count peaks over about 20 seconds (photoplethysmography). Show a live waveform on a holo screen, a signal-quality score, and send the result through the normal rules so a poor signal ends as "Measure again". Label it as an estimate that is less accurate than a medical sensor. It cannot run inside the claude.ai artifact preview (camera blocked), only on GitHub Pages over https; test on a real phone.
2. Load the research team's verified ranges into `data/indicators.json` (set `verified: true` and `source`) and their projection rates into `data/forecast.json` (`effectFactor`, muscle rate).
3. Replace `DEMO_KEY` in `fetchSpaceWeather` (`js/main.js`) with the team's own free key from api.nasa.gov.
4. Confirm with the local event whether code written before 14 November is allowed; if not, the hackathon build starts in a fresh repository.

Team guide (Spanish), roles and calendar: the "Guía del equipo — Monitor de salud para astronautas" doc in claude.ai.
