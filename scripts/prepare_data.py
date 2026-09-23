"""
Cleans the raw Billboard Hot 100 weekly chart data (data/raw/billboard_raw.csv)
and writes:
  - data/billboard.csv   the cleaned dataset used throughout the site
  - data/billboard.json  the same data as JSON, used by dashboard.html

Source: TidyTuesday (rfordatascience/tidytuesday), 2021-09-14, which in turn
compiled Billboard Hot 100 weekly chart positions from Billboard.com,
1958-08-04 through 2021-05-29.

Run with: python3 scripts/prepare_data.py
"""
import csv
import gzip
import json
from pathlib import Path

RAW_PATH = Path("data/raw/billboard_raw.csv.gz")
OUT_CSV = Path("data/billboard.csv")
OUT_DASHBOARD_JSON = Path("data/dashboard_data.json")

MONTHS = None  # not needed, week_id is already M/D/YYYY


def parse_date(week_id: str):
    """'7/17/1965' -> ('1965-07-17', 1965, '1960s')"""
    m, d, y = week_id.split("/")
    m, d, y = int(m), int(d), int(y)
    iso = f"{y:04d}-{m:02d}-{d:02d}"
    decade = f"{(y // 10) * 10}s"
    return iso, y, decade


def to_int_or_none(v: str):
    if v in ("", "NA"):
        return None
    return int(v)


def main():
    rows = []
    with gzip.open(RAW_PATH, mode="rt", newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            rows.append(row)

    # Drop rows: 13 rows are duplicate (week_id, song_id) pairs caused by
    # Billboard tracking two simultaneous chart "instances" of the same
    # song/performer in the same week (e.g. The Righteous Brothers'
    # "Unchained Melody" had both its 1965 and 1990 re-entry runs active
    # in the same week in Oct-Nov 1990). For each duplicate pair we keep
    # only the entry with the better (lower) week_position, since that is
    # the position Billboard published as the song's rank that week.
    best_by_key = {}
    for row in rows:
        key = (row["week_id"], row["song_id"])
        wp = int(row["week_position"])
        if key not in best_by_key or wp < int(best_by_key[key]["week_position"]):
            best_by_key[key] = row
    deduped = list(best_by_key.values())
    dropped = len(rows) - len(deduped)

    cleaned = []
    for row in deduped:
        iso_date, year, decade = parse_date(row["week_id"])
        cleaned.append(
            {
                "date": iso_date,
                "year": year,
                "decade": decade,
                "song": row["song"],
                "performer": row["performer"],
                "week_position": int(row["week_position"]),
                "previous_week_position": to_int_or_none(row["previous_week_position"]),
                "peak_position": int(row["peak_position"]),
                "weeks_on_chart": int(row["weeks_on_chart"]),
            }
        )

    cleaned.sort(key=lambda r: (r["date"], r["week_position"]))

    OUT_CSV.parent.mkdir(parents=True, exist_ok=True)
    with OUT_CSV.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=list(cleaned[0].keys()))
        writer.writeheader()
        writer.writerows(cleaned)

    # The dashboard fetches and filters all ~328k rows client-side, so instead
    # of repeating each date/song/performer string on every row (which made a
    # 60MB file), we write them once each to lookup tables and store only the
    # small integer index of each value per row. Decade/year are left out of
    # the row tuples entirely since dashboard.js derives them from the date.
    dates = sorted({r["date"] for r in cleaned})
    performers = sorted({r["performer"] for r in cleaned})
    songs = sorted({r["song"] for r in cleaned})
    date_idx = {v: i for i, v in enumerate(dates)}
    performer_idx = {v: i for i, v in enumerate(performers)}
    song_idx = {v: i for i, v in enumerate(songs)}

    dashboard_rows = [
        [
            date_idx[r["date"]],
            performer_idx[r["performer"]],
            song_idx[r["song"]],
            r["week_position"],
            r["previous_week_position"],
            r["peak_position"],
            r["weeks_on_chart"],
        ]
        for r in cleaned
    ]
    dashboard_payload = {
        "columns": [
            "date_idx",
            "performer_idx",
            "song_idx",
            "week_position",
            "previous_week_position",
            "peak_position",
            "weeks_on_chart",
        ],
        "dates": dates,
        "performers": performers,
        "songs": songs,
        "rows": dashboard_rows,
    }
    with OUT_DASHBOARD_JSON.open("w", encoding="utf-8") as f:
        json.dump(dashboard_payload, f, separators=(",", ":"))

    print(f"read {len(rows)} raw rows")
    print(f"dropped {dropped} duplicate (week_id, song_id) rows")
    print(f"wrote {len(cleaned)} cleaned rows to {OUT_CSV}")
    print(f"wrote indexed dashboard data to {OUT_DASHBOARD_JSON}")


if __name__ == "__main__":
    main()
