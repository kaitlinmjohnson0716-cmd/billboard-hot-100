"""Scratch exploration to pick real, correct findings for the report. Not part of the site."""
import csv
from collections import defaultdict, Counter

rows = []
with open("data/billboard.csv", newline="", encoding="utf-8") as f:
    for row in csv.DictReader(f):
        row["week_position"] = int(row["week_position"])
        row["peak_position"] = int(row["peak_position"])
        row["weeks_on_chart"] = int(row["weeks_on_chart"])
        row["year"] = int(row["year"])
        rows.append(row)

print("total rows:", len(rows))

# unique songs (song, performer)
songs = set((r["song"], r["performer"]) for r in rows)
performers = set(r["performer"] for r in rows)
years = set(r["year"] for r in rows)
print("unique songs:", len(songs))
print("unique performers:", len(performers))
print("year range:", min(years), max(years))

# 1. weeks at #1 per song
weeks_at_1 = Counter()
for r in rows:
    if r["week_position"] == 1:
        weeks_at_1[(r["song"], r["performer"])] += 1
top_no1 = weeks_at_1.most_common(10)
print("\nLongest-running #1 hits:")
for (song, perf), wk in top_no1:
    print(f"  {song} - {perf}: {wk} weeks")

# 2. most #1 songs per artist (unique songs that reached #1)
no1_songs_by_artist = defaultdict(set)
for r in rows:
    if r["peak_position"] == 1:
        no1_songs_by_artist[r["performer"]].add(r["song"])
top_artists_no1 = sorted(no1_songs_by_artist.items(), key=lambda kv: -len(kv[1]))[:10]
print("\nMost #1 songs by artist:")
for artist, s in top_artists_no1:
    print(f"  {artist}: {len(s)} #1 songs")

# 3. total cumulative chart weeks by artist
weeks_by_artist = Counter()
for r in rows:
    weeks_by_artist[r["performer"]] += 1
top_weeks_artist = weeks_by_artist.most_common(10)
print("\nMost cumulative weeks on chart by artist:")
for artist, wk in top_weeks_artist:
    print(f"  {artist}: {wk} cumulative chart-weeks")

# 4. one-hit wonders vs repeat hitmakers: unique songs per artist
songs_per_artist = defaultdict(set)
for r in rows:
    songs_per_artist[r["performer"]].add(r["song"])
counts = Counter(len(v) for v in songs_per_artist.values())
one_hit = counts[1]
print(f"\nArtists with exactly 1 charting song: {one_hit} of {len(songs_per_artist)} ({one_hit/len(songs_per_artist)*100:.1f}%)")
print("distribution (num songs -> num artists), top 10:", counts.most_common(10))

# 5. avg weeks on chart by decade (using weeks_on_chart at final/peak row is tricky; use max weeks_on_chart per song per decade of debut)
decade_song_max_weeks = defaultdict(dict)
for r in rows:
    key = (r["song"], r["performer"])
    d = r["decade"]
    decade_song_max_weeks[d][key] = max(decade_song_max_weeks[d].get(key, 0), r["weeks_on_chart"])
print("\nAvg total weeks-on-chart per song, by decade of chart activity:")
for d in sorted(decade_song_max_weeks):
    vals = list(decade_song_max_weeks[d].values())
    print(f"  {d}: n={len(vals)} avg={sum(vals)/len(vals):.2f}")

# 6. debut position of songs that eventually hit #1 (first appearance week_position where previous_week_position is None or it's min date row per song)
song_rows = defaultdict(list)
for r in rows:
    song_rows[(r["song"], r["performer"])].append(r)
debut_positions_for_no1 = []
for key, rs in song_rows.items():
    rs_sorted = sorted(rs, key=lambda r: r["date"])
    if any(r["peak_position"] == 1 for r in rs_sorted):
        debut_positions_for_no1.append(rs_sorted[0]["week_position"])
print(f"\nSongs that eventually hit #1: {len(debut_positions_for_no1)}")
print("avg debut (first week) position of eventual #1 hits:", sum(debut_positions_for_no1)/len(debut_positions_for_no1))
buckets = Counter()
for p in debut_positions_for_no1:
    if p <= 10: buckets["1-10"] += 1
    elif p <= 40: buckets["11-40"] += 1
    elif p <= 70: buckets["41-70"] += 1
    else: buckets["71-100"] += 1
print("debut position buckets:", buckets)

# 7. songs charting in the most distinct calendar years (recurring holiday-type hits)
years_by_song = defaultdict(set)
for r in rows:
    years_by_song[(r["song"], r["performer"])].add(r["year"])
top_recurring = sorted(years_by_song.items(), key=lambda kv: -len(kv[1]))[:10]
print("\nSongs charting across the most distinct years:")
for (song, perf), ys in top_recurring:
    print(f"  {song} - {perf}: {len(ys)} distinct years ({min(ys)}-{max(ys)})")

# 8. number of unique #1 songs per decade / avg reign length per decade -> turnover
no1_rows = [r for r in rows if r["week_position"] == 1]
no1_songs_by_decade = defaultdict(set)
no1_weeks_by_decade = Counter()
for r in no1_rows:
    no1_songs_by_decade[r["decade"]].add((r["song"], r["performer"]))
    no1_weeks_by_decade[r["decade"]] += 1
print("\n#1 turnover by decade (unique #1 songs, total #1 weeks, avg reign):")
for d in sorted(no1_songs_by_decade):
    n_songs = len(no1_songs_by_decade[d])
    n_weeks = no1_weeks_by_decade[d]
    print(f"  {d}: {n_songs} different #1 songs, {n_weeks} total #1 weeks, avg reign {n_weeks/n_songs:.2f} weeks")

# 9. peak position distribution buckets overall
peak_buckets = Counter()
for key, rs in song_rows.items():
    peak = min(r["peak_position"] for r in rs)
    if peak == 1: peak_buckets["#1"] += 1
    elif peak <= 10: peak_buckets["Top 10"] += 1
    elif peak <= 40: peak_buckets["11-40"] += 1
    elif peak <= 70: peak_buckets["41-70"] += 1
    else: peak_buckets["71-100"] += 1
print("\nPeak position distribution (by unique song):", peak_buckets)

# 10. slow burners: songs that never reached top 10 but had many weeks on chart
slow_burners = []
for key, rs in song_rows.items():
    peak = min(r["peak_position"] for r in rs)
    max_weeks = max(r["weeks_on_chart"] for r in rs)
    if peak > 10:
        slow_burners.append((key, peak, max_weeks))
slow_burners.sort(key=lambda x: -x[2])
print("\nTop 'slow burner' songs (peak outside top 10, most weeks on chart):")
for (song, perf), peak, wk in slow_burners[:10]:
    print(f"  {song} - {perf}: peak #{peak}, {wk} weeks on chart")
