"""Generate the 30-day demo mission in data/mission_demo.csv.

The values are invented to tell a story for the demo. They are not real
astronaut data. The data and testing team can replace the CSV with their own
sheet as long as the column names stay the same.

Story:
  days 1-10   everything normal
  days 11-20  sleep drops and mood goes down; exercise is skipped more often
  days 21-25  blood pressure and heart rate climb
  days 26-30  partial recovery after the crew adjusts the schedule
  day 14      a typing mistake: heart rate saved as 400
  day 18      temperature not measured

Run: python3 tools/make_demo.py
"""
import csv
import random
from pathlib import Path

random.seed(2026)
OUT = Path(__file__).resolve().parent.parent / "data" / "mission_demo.csv"
COLUMNS = ["day", "heart_rate", "bp_sys", "bp_dia", "temperature", "glucose",
           "spo2", "sleep", "mood", "exercise_min"]


def jitter(value, spread):
    return value + random.uniform(-spread, spread)


rows = []
for day in range(1, 31):
    hr, sys_, dia = jitter(66, 3), jitter(115, 3), jitter(75, 2)
    temp, glu, spo2 = jitter(36.7, 0.2), jitter(87, 4), jitter(98, 1)
    sleep, mood, ex = jitter(7.6, 0.4), random.choice([4, 5, 5]), jitter(135, 15)

    if 11 <= day <= 20:
        k = (day - 10) / 10
        sleep = jitter(7.4 - 2.2 * k, 0.2)
        mood = 4 if day < 15 else 3
        ex = jitter(110 - 50 * k, 10)
    if 21 <= day <= 25:
        hr, sys_, dia = jitter(81, 3), jitter(132, 3), jitter(84, 2)
        sleep, mood, ex = jitter(5.8, 0.3), random.choice([3, 4]), jitter(70, 10)
    if day >= 26:
        hr, sys_, dia = jitter(71, 3), jitter(121, 3), jitter(79, 2)
        sleep, mood, ex = jitter(7.1, 0.3), 4, jitter(125, 10)

    row = {
        "day": day,
        "heart_rate": round(hr),
        "bp_sys": round(sys_),
        "bp_dia": round(dia),
        "temperature": round(temp, 1),
        "glucose": round(glu),
        "spo2": min(100, round(spo2)),
        "sleep": round(sleep, 1),
        "mood": mood,
        "exercise_min": round(ex),
    }
    if day == 14:
        row["heart_rate"] = 400
    if day == 18:
        row["temperature"] = ""
    rows.append(row)

with OUT.open("w", newline="") as f:
    writer = csv.DictWriter(f, fieldnames=COLUMNS)
    writer.writeheader()
    writer.writerows(rows)

print(f"Wrote {len(rows)} days to {OUT}")
