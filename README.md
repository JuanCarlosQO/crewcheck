# CrewCheck

**Astronaut health self-assessment for long space missions.** NASA Space Apps Challenge 2026 — *Create Health Monitoring Software for Astronauts on Space Missions*.

On long missions, astronauts must spot health changes in themselves. CrewCheck turns a short daily check-in into a clear answer: *how am I today, and what should I do?* It then answers the question that comes next: *if the mission goes on like this, how will my body be in six months?*

## What it does

| View | What the astronaut gets |
| --- | --- |
| **Today** | A body map coloured by system, every reading with a status (Normal, Watch, Act now, Measure again) and a plain-language action list. Red items say how long a message to the flight surgeon takes from the current location. |
| **Check-in** | A daily form with step-by-step measuring instructions. Each value is checked as it is typed. Heart rate can also be measured with the phone camera (fingertip over the camera and torch), with a live pulse waveform and a signal-quality score. |
| **Trends** | Each indicator over the mission, with its normal and watch ranges, and the days that need a look. |
| **Future body** | A projection of bone density loss over the mission, built on NASA's published rate, with a countermeasure switch, mission presets and an honest uncertainty range. |
| **Data & sources** | Every source, which values are verified, the app settings and crew access. |
| **Crew access** | The app opens like the crew's binder: dial a 4-digit code on the cover's combination dial, or hold your thumb on its centre (fingerprint through the device's own reader). |

### What makes it different

1. **It checks the measurement before the health.** An impossible value (a heart rate of 400), a sudden jump or a weak camera signal asks the astronaut to measure again instead of raising a false alarm.
2. **It compares you with yourself.** A value inside the normal range still turns yellow when it is far from your own 7-day average.
3. **It looks forward.** *Future body* shows how the body changes with mission length and what countermeasures do, and it never shows a number that has no published source.

## Run it

No build step and no dependencies. Serve the folder with any static web server:

```bash
npm start          # same as: python3 -m http.server 8000
# open http://localhost:8000
```

Run the tests (Node 20 or newer):

```bash
npm test
```

## Project structure

```
index.html            app shell: masthead, binder page, index tabs
css/styles.css        "Flight Data File" design: tokens, day and night themes, components
js/gate.js            login: binder cover, combination dial, fingerprint thumb plate
js/auth.js            code hashing, wrong-try lockout, fingerprint (WebAuthn) checks
js/brand.js           mission patch logo
js/main.js            views, navigation and events
js/rules.js           health rules: missing, plausible, jump, ranges, personal baseline, streaks
js/ppg.js             camera heart rate: filtering, beat detection, signal-quality score
js/camera.js          camera heart-rate sheet: camera and torch, live waveform
js/forecast.js        Future body projection
js/body.js            body as a technical drawing (SVG)
js/charts.js          trend and projection charts (SVG, no libraries)
js/store.js           loading data, saving to the browser
data/indicators.json  ranges, texts and actions for each indicator
data/forecast.json    projection rates and their sources
data/mission_demo.csv 30-day demo mission (invented data)
tools/make_demo.py    script that generates the demo mission
fonts/                self-hosted fonts (SIL Open Font License)
tests/                unit tests: rules, projection, hazards, camera pulse, crew access
docs/                 data sources, design rationale and AI use
```

The medical content lives in `data/`, so the research and content team can change ranges and texts without touching the code.

## Data

- NASA Human Research Program: [the five hazards of human spaceflight](https://www.nasa.gov/hrp/hazards)
- NASA: [Risk of Spaceflight-Induced Bone Changes](https://www.nasa.gov/reference/risk-of-spaceflight-induced-bone-changes/)
- NASA: [Risk of impaired performance due to reduced muscle size, strength and endurance](https://www.nasa.gov/directorates/esdmd/hhp/risk-of-impaired-performance-due-to-reduced-muscle-size-strength-and-endurance/)

See [docs/DATA_SOURCES.md](docs/DATA_SOURCES.md) for what each source is used for and what is still pending.

## Disclaimer

CrewCheck is a prototype built for a hackathon. It is not a medical device and does not replace a doctor or a flight surgeon. The demo mission uses invented data.

## License

MIT
