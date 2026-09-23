(async function () {
  const res = await fetch("data/report_stats.json");
  const stats = await res.json();

  // --- headline numbers ---
  document.getElementById("stat-total-entries").textContent = fmtCompact(stats.headline.total_entries);
  document.getElementById("stat-unique-songs").textContent = fmtCompact(stats.headline.unique_songs);
  document.getElementById("stat-unique-artists").textContent = fmtCompact(stats.headline.unique_artists);
  document.getElementById("stat-year-range").textContent =
    `${stats.headline.year_min}–${stats.headline.year_max}`;

  // --- hero interactive graphic: avg weeks on chart per song, by decade ---
  (function renderHeroViz() {
    const decades = stats.avg_weeks_on_chart_by_decade;
    const barsEl = document.getElementById("hero-viz-bars");
    const readoutEl = document.getElementById("hero-viz-readout");
    const defaultReadout = readoutEl.textContent;
    const maxVal = Math.max(...decades.map((d) => d.avg_weeks));

    decades.forEach((d, i) => {
      const bar = document.createElement("button");
      bar.type = "button";
      bar.className = "hero__viz-bar";
      bar.style.setProperty("--delay", `${i * 0.15}s`);

      const fill = document.createElement("span");
      fill.className = "hero__viz-bar-fill";
      fill.style.setProperty("--h", `${Math.max((d.avg_weeks / maxVal) * 100, 3)}%`);

      const label = document.createElement("span");
      label.className = "hero__viz-bar-label";
      label.textContent = d.decade.replace("s", "'s");

      bar.appendChild(fill);
      bar.appendChild(label);

      const show = () => {
        readoutEl.innerHTML = "";
        readoutEl.append(`${d.decade}: `, Object.assign(document.createElement("span"), { className: "num", textContent: `${d.avg_weeks} avg weeks` }), ` on chart (${fmtNumber(d.n_songs)} songs)`);
      };
      bar.addEventListener("mouseenter", show);
      bar.addEventListener("focus", show);
      bar.addEventListener("mouseleave", () => { readoutEl.textContent = defaultReadout; });
      bar.addEventListener("blur", () => { readoutEl.textContent = defaultReadout; });

      barsEl.appendChild(bar);
    });
  })();

  // 1. peak position distribution
  makeBarChart(document.getElementById("chart-peak-distribution"), {
    labels: stats.peak_distribution.labels,
    values: stats.peak_distribution.values,
    valueLabel: "Songs",
  });

  // 2. debut position of eventual #1 hits
  makeBarChart(document.getElementById("chart-debut-position"), {
    labels: stats.no1_debut_position.labels,
    values: stats.no1_debut_position.values,
    valueLabel: "Songs",
  });

  // 3. most #1 songs by artist
  const no1 = stats.most_no1_by_artist;
  makeBarChart(document.getElementById("chart-no1-by-artist"), {
    labels: no1.map((d) => d.artist),
    values: no1.map((d) => d.count),
    horizontal: true,
    valueLabel: "#1 songs",
  });

  // 4. most cumulative weeks by artist
  const weeks = stats.most_cumulative_weeks_by_artist;
  makeBarChart(document.getElementById("chart-weeks-by-artist"), {
    labels: weeks.map((d) => d.artist),
    values: weeks.map((d) => d.weeks),
    horizontal: true,
    valueLabel: "Chart-weeks",
    suffix: " weeks",
  });

  // 5. one-hit wonders / song-count distribution
  makeBarChart(document.getElementById("chart-one-hit"), {
    labels: stats.one_hit_wonders.distribution.labels,
    values: stats.one_hit_wonders.distribution.values,
    valueLabel: "Artists",
  });

  // 6. avg weeks on chart by decade
  makeLineChart(document.getElementById("chart-weeks-by-decade"), {
    labels: stats.avg_weeks_on_chart_by_decade.map((d) => d.decade),
    series: [
      {
        label: "Avg weeks on chart",
        values: stats.avg_weeks_on_chart_by_decade.map((d) => d.avg_weeks),
      },
    ],
    suffix: " weeks",
  });

  // 7. #1 reign length by decade
  makeLineChart(document.getElementById("chart-reign-by-decade"), {
    labels: stats.no1_reign_by_decade.map((d) => d.decade),
    series: [
      {
        label: "Avg #1 reign",
        values: stats.no1_reign_by_decade.map((d) => d.avg_reign_weeks),
      },
    ],
    suffix: " weeks",
  });

  // 8. most recurring songs
  const recurring = stats.most_recurring_songs;
  makeBarChart(document.getElementById("chart-recurring"), {
    labels: recurring.map((d) => d.song),
    fullLabels: recurring.map((d) => `${d.song} — ${d.artist}`),
    values: recurring.map((d) => d.distinct_years),
    horizontal: true,
    valueLabel: "Distinct years charted",
  });
})();
