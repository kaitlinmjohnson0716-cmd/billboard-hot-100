# Billboard Hot 100: 63 Years of the Chart

Financial Data Analytics — Data Website Project, by Kaitlin Johnson

**Live site:** https://kaitlinmjohnson0716-cmd.github.io/billboard-hot-100/
**Repository:** https://github.com/kaitlinmjohnson0716-cmd/billboard-hot-100

A two-page static site built around every weekly Billboard Hot 100 chart position
from August 1958 through May 2021 (327,882 chart entries, 29,389 songs, 10,061
artists). `index.html` is a scrollable report with eight findings, each backed
by a chart, plus a 3D "Chart Skyline" of the top artists. `dashboard.html` is
an interactive dashboard that loads the full dataset in the browser and lets
you filter, switch measures, and switch chart breakdowns live.

## Files

| File | What it does |
|---|---|
| `index.html` | The report page: headline numbers, eight findings with charts, a 3D "Chart Skyline" of the top 10 artists, and a closing methodology section. |
| `dashboard.html` | The interactive dashboard: filters, summary numbers, four switchable charts, and a sortable data table. |
| `css/style.css` | Shared styles for both pages (nav, layout, stat tiles, chart cards, table, filters, skyline). |
| `js/charts.js` | Shared Chart.js theme and two small helpers (`makeBarChart`, `makeLineChart`) used by both pages. |
| `js/report.js` | Fetches `data/report_stats.json` and renders the report page's numbers and charts. |
| `js/dashboard.js` | Fetches `data/dashboard_data.json`, and implements all filtering, aggregation, chart switching, sorting, and the reset button entirely client-side. |
| `js/skyline.js` | Three.js 3D scene for the report page's Chart Skyline (top 10 artists as orbitable towers). Loaded as an ES module via an import map, no build step. |
| `data/raw/billboard_raw.csv.gz` | The original, unmodified source data (gzip-compressed). |
| `data/billboard.csv` | The cleaned dataset (see "Rows dropped" below), one row per song per chart week. Used to compute every report number. |
| `data/dashboard_data.json` | The same cleaned data, re-encoded as a compact indexed format (lookup tables for dates/songs/performers + integer-indexed rows) so the dashboard can fetch and filter ~328k rows in the browser without shipping a 60MB file. |
| `data/report_stats.json` | Every number and chart series shown on the report page, precomputed by `scripts/build_report_stats.py`. |
| `scripts/prepare_data.py` | Cleans `data/raw/billboard_raw.csv.gz` into `data/billboard.csv` and `data/dashboard_data.json`. |
| `scripts/build_report_stats.py` | Reads `data/billboard.csv` and computes everything in `data/report_stats.json`. |
| `scripts/explore.py` | Scratch analysis script used during development to find real findings before writing the report. Not used by the site itself. |

## Data source

Weekly Billboard Hot 100 chart positions, 1958-08-04 through 2021-05-29,
compiled by the [TidyTuesday project](https://github.com/rfordatascience/tidytuesday/tree/main/data/2021/2021-09-14),
originally scraped from billboard.com and shared via Data.World by Sean Miller.

**One row is** one song, on one artist's chart entry, in one week — its rank
that week, its rank the previous week, its all-time-best rank so far, and how
many weeks it had charted in total.

**Rows dropped:** 13 rows out of 327,895 were dropped by `prepare_data.py`.
Billboard occasionally tracks two simultaneous chart "instances" of the same
song/artist in the same week (for example, The Righteous Brothers' "Unchained
Melody" had both its 1965 and 1990 re-entry runs active in the same week in
late 1990). For each duplicate week/song pair, only the entry with the better
chart position was kept, since that's the position Billboard published for
that week. No other rows were removed. `previous_week_position` is blank for
a song's debut week (there is no previous week) — this is expected and was
left as-is.

## Reproducing the numbers

```
python3 scripts/prepare_data.py        # data/raw/*.gz -> data/billboard.csv, data/dashboard_data.json
python3 scripts/build_report_stats.py  # data/billboard.csv -> data/report_stats.json
```

Both scripts use only the Python standard library. Re-running them against
the same raw data reproduces `data/billboard.csv`, `data/dashboard_data.json`,
and `data/report_stats.json` byte-for-byte.

## Running locally

The site is plain HTML/CSS/JS with no build step — any static file server
works:

```
python3 -m http.server 8000
```

Then open `http://localhost:8000/index.html`.

## Stack

Plain HTML, CSS, and JavaScript, plus [Chart.js](https://www.chartjs.org/) for the
report and dashboard charts and [Three.js](https://threejs.org/) for the report
page's 3D skyline — both loaded from a CDN. No build step, no framework, no
other dependencies.
