"""
Computes every number and chart series shown on the report page (index.html)
from the cleaned data (data/billboard.csv) and writes them to
data/report_stats.json, which js/report.js fetches and renders.

This keeps every number on the report reproducible: rerun this script against
data/billboard.csv and the output matches, since nothing here depends on the
browser or is hand-typed into the HTML.

Run with: python3 scripts/build_report_stats.py
"""
import csv
import json
from collections import defaultdict, Counter
from pathlib import Path

IN_CSV = Path("data/billboard.csv")
OUT_JSON = Path("data/report_stats.json")


def load_rows():
    rows = []
    with IN_CSV.open(newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            row["week_position"] = int(row["week_position"])
            row["peak_position"] = int(row["peak_position"])
            row["weeks_on_chart"] = int(row["weeks_on_chart"])
            row["year"] = int(row["year"])
            rows.append(row)
    return rows


def main():
    rows = load_rows()
    songs_by_artist = defaultdict(set)
    song_rows = defaultdict(list)
    for r in rows:
        song_rows[(r["song"], r["performer"])].append(r)
        songs_by_artist[r["performer"]].add(r["song"])

    stats = {}

    # --- headline numbers ---
    stats["headline"] = {
        "total_entries": len(rows),
        "unique_songs": len(song_rows),
        "unique_artists": len(songs_by_artist),
        "year_min": min(r["year"] for r in rows),
        "year_max": max(r["year"] for r in rows),
    }

    # --- 1. peak position distribution (by unique song) ---
    peak_buckets = Counter()
    for key, rs in song_rows.items():
        peak = min(r["peak_position"] for r in rs)
        if peak == 1:
            peak_buckets["#1"] += 1
        elif peak <= 10:
            peak_buckets["Top 10"] += 1
        elif peak <= 40:
            peak_buckets["11–40"] += 1
        elif peak <= 70:
            peak_buckets["41–70"] += 1
        else:
            peak_buckets["71–100"] += 1
    order = ["#1", "Top 10", "11–40", "41–70", "71–100"]
    stats["peak_distribution"] = {
        "labels": order,
        "values": [peak_buckets[k] for k in order],
    }

    # --- 2. debut position of songs that eventually hit #1 ---
    debut_positions = []
    for key, rs in song_rows.items():
        rs_sorted = sorted(rs, key=lambda r: r["date"])
        if any(r["peak_position"] == 1 for r in rs_sorted):
            debut_positions.append(rs_sorted[0]["week_position"])
    buckets = Counter()
    for p in debut_positions:
        if p <= 10:
            buckets["1–10"] += 1
        elif p <= 40:
            buckets["11–40"] += 1
        elif p <= 70:
            buckets["41–70"] += 1
        else:
            buckets["71–100"] += 1
    debut_order = ["1–10", "11–40", "41–70", "71–100"]
    stats["no1_debut_position"] = {
        "labels": debut_order,
        "values": [buckets[k] for k in debut_order],
        "n_songs": len(debut_positions),
        "avg_debut_position": round(sum(debut_positions) / len(debut_positions), 1),
    }

    # --- 3. most #1 songs by artist ---
    no1_songs_by_artist = defaultdict(set)
    for r in rows:
        if r["peak_position"] == 1:
            no1_songs_by_artist[r["performer"]].add(r["song"])
    top_no1_artists = sorted(no1_songs_by_artist.items(), key=lambda kv: -len(kv[1]))[:10]
    stats["most_no1_by_artist"] = [
        {"artist": a, "count": len(s)} for a, s in top_no1_artists
    ]

    # --- 4. most cumulative weeks on chart by artist ---
    weeks_by_artist = Counter()
    for r in rows:
        weeks_by_artist[r["performer"]] += 1
    stats["most_cumulative_weeks_by_artist"] = [
        {"artist": a, "weeks": w} for a, w in weeks_by_artist.most_common(10)
    ]

    # --- 5. one-hit wonders vs repeat hitmakers ---
    n_one_hit = sum(1 for s in songs_by_artist.values() if len(s) == 1)
    stats["one_hit_wonders"] = {
        "one_hit_artists": n_one_hit,
        "total_artists": len(songs_by_artist),
        "pct": round(n_one_hit / len(songs_by_artist) * 100, 1),
    }

    # --- 6. avg weeks on chart per song, by decade ---
    decade_song_max_weeks = defaultdict(dict)
    for r in rows:
        key = (r["song"], r["performer"])
        d = r["decade"]
        decade_song_max_weeks[d][key] = max(
            decade_song_max_weeks[d].get(key, 0), r["weeks_on_chart"]
        )
    avg_weeks_by_decade = []
    for d in sorted(decade_song_max_weeks):
        vals = list(decade_song_max_weeks[d].values())
        avg_weeks_by_decade.append(
            {"decade": d, "avg_weeks": round(sum(vals) / len(vals), 2), "n_songs": len(vals)}
        )
    stats["avg_weeks_on_chart_by_decade"] = avg_weeks_by_decade

    # --- 7. #1 reign length by decade ---
    no1_rows = [r for r in rows if r["week_position"] == 1]
    no1_songs_by_decade = defaultdict(set)
    no1_weeks_by_decade = Counter()
    for r in no1_rows:
        no1_songs_by_decade[r["decade"]].add((r["song"], r["performer"]))
        no1_weeks_by_decade[r["decade"]] += 1
    reign_by_decade = []
    for d in sorted(no1_songs_by_decade):
        n_songs = len(no1_songs_by_decade[d])
        n_weeks = no1_weeks_by_decade[d]
        reign_by_decade.append(
            {
                "decade": d,
                "unique_no1_songs": n_songs,
                "total_no1_weeks": n_weeks,
                "avg_reign_weeks": round(n_weeks / n_songs, 2),
            }
        )
    stats["no1_reign_by_decade"] = reign_by_decade

    # --- 8. recurring songs across the most distinct years (holiday perennials) ---
    years_by_song = defaultdict(set)
    for r in rows:
        years_by_song[(r["song"], r["performer"])].add(r["year"])
    top_recurring = sorted(years_by_song.items(), key=lambda kv: -len(kv[1]))[:10]
    stats["most_recurring_songs"] = [
        {
            "song": song,
            "artist": perf,
            "distinct_years": len(ys),
            "year_min": min(ys),
            "year_max": max(ys),
        }
        for (song, perf), ys in top_recurring
    ]

    OUT_JSON.write_text(json.dumps(stats, indent=2), encoding="utf-8")
    print(f"wrote {OUT_JSON}")


if __name__ == "__main__":
    main()
