# CrewCheck

**Astronaut health self-assessment for long space missions.** NASA Space Apps Challenge 2026 — *Create Health Monitoring Software for Astronauts on Space Missions*.

On long missions, astronauts must spot health changes in themselves. CrewCheck turns a short daily check-in into a clear answer: *how am I today, and what should I do?* It then answers the question that comes next: *if the mission goes on like this, how will my body be in six months?*

## What it does

| View | What the astronaut gets |
| --- | --- |
| **Today** | A body map coloured by system, every reading with a status (Normal, Watch, Act now, Measure again) and a plain-language action list. Red items say how long a message to the flight surgeon takes from the current location. |
| **Check-in** | A daily form with step-by-step measuring instructions. Each value is checked as it is typed. |
| **Trends** | Each indicator over the mission, with its normal and watch ranges, and the days that need a look. |
| **Future body** | A projection of bone density loss over the mission, built on NASA's published rate, with a countermeasure switch, mission presets and an honest uncertainty range. |
| **Data & sources** | Every source, which values are verified, and the app settings. |

### What makes it different

1. **It checks the measurement before the health.** An impossible value (a heart rate of 400) or a sudden jump asks the astronaut to measure again instead of raising a false alarm.
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
index.html            app shell
css/styles.css        design tokens, light and dark themes
js/main.js            views, navigation and events
js/rules.js           health rules: missing, plausible, jump, ranges, personal baseline, streaks
js/forecast.js        Future body projection
js/body.js            body map (SVG)
js/charts.js          trend and projection charts (SVG, no libraries)
js/store.js           loading data, saving to the browser
data/indicators.json  ranges, texts and actions for each indicator
data/forecast.json    projection rates and their sources
data/mission_demo.csv 30-day demo mission (invented data)
tools/make_demo.py    script that generates the demo mission
tests/                unit tests for the rules and the projection
docs/                 data sources and AI use
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
