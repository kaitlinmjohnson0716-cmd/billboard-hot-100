(async function () {
  // ---- row layout, matches scripts/prepare_data.py's dashboard payload ----
  const COL = { DATE: 0, PERFORMER: 1, SONG: 2, WEEK_POS: 3, PREV_POS: 4, PEAK: 5, WEEKS: 6 };

  const res = await fetch("data/dashboard_data.json");
  const data = await res.json();
  const { dates, performers, songs, rows } = data;

  // Year per date index, computed once so filtering never re-parses date strings.
  const dateYear = dates.map((d) => parseInt(d.slice(0, 4), 10));
  const yearMin = Math.min(...dateYear);
  const yearMax = Math.max(...dateYear);

  function decadeOf(year) {
    return `${Math.floor(year / 10) * 10}s`;
  }

  function peakTier(peak) {
    if (peak === 1) return "#1";
    if (peak <= 10) return "Top 10";
    if (peak <= 40) return "11–40";
    if (peak <= 70) return "41–70";
    return "71–100";
  }
  const PEAK_TIER_ORDER = ["#1", "Top 10", "11–40", "41–70", "71–100"];

  function median(values) {
    if (!values.length) return null;
    const s = values.slice().sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  }

  // ---------------- filter UI setup ----------------
  const yearMinInput = document.getElementById("filter-year-min");
  const yearMaxInput = document.getElementById("filter-year-max");
  const performerInput = document.getElementById("filter-performer");
  const peakTierSelect = document.getElementById("filter-peak-tier");
  const minWeeksInput = document.getElementById("filter-min-weeks");
  const resetBtn = document.getElementById("reset-filters");
  const filterCountEl = document.getElementById("filter-count");

  yearMinInput.min = yearMinInput.placeholder = yearMin;
  yearMaxInput.max = yearMaxInput.placeholder = yearMax;

  const performerList = document.getElementById("performer-options");
  const frag = document.createDocumentFragment();
  performers.forEach((p) => {
    const opt = document.createElement("option");
    opt.value = p;
    frag.appendChild(opt);
  });
  performerList.appendChild(frag);

  function debounce(fn, ms) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), ms);
    };
  }

  // ---------------- filtering ----------------
  function computeFilteredIndices() {
    const yMin = yearMinInput.value ? parseInt(yearMinInput.value, 10) : yearMin;
    const yMax = yearMaxInput.value ? parseInt(yearMaxInput.value, 10) : yearMax;
    const peakMax = peakTierSelect.value ? parseInt(peakTierSelect.value, 10) : null;
    const minWeeks = minWeeksInput.value ? parseInt(minWeeksInput.value, 10) : 0;
    const query = performerInput.value.trim().toLowerCase();

    let performerMask = null;
    if (query) {
      performerMask = new Uint8Array(performers.length);
      for (let i = 0; i < performers.length; i++) {
        if (performers[i].toLowerCase().includes(query)) performerMask[i] = 1;
      }
    }

    const out = [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const year = dateYear[r[COL.DATE]];
      if (year < yMin || year > yMax) continue;
      if (peakMax !== null && r[COL.PEAK] > peakMax) continue;
      if (r[COL.WEEKS] < minWeeks) continue;
      if (performerMask && !performerMask[r[COL.PERFORMER]]) continue;
      out.push(i);
    }
    return out;
  }

  // ---------------- summary numbers ----------------
  function renderSummary(indices) {
    document.getElementById("sum-entries").textContent = fmtCompact(indices.length);
    if (!indices.length) {
      document.getElementById("sum-songs").textContent = "0";
      document.getElementById("sum-artists").textContent = "0";
      document.getElementById("sum-avg-weeks").textContent = "—";
      return;
    }
    const songSet = new Set();
    const artistSet = new Set();
    let weekSum = 0;
    for (const i of indices) {
      const r = rows[i];
      songSet.add(r[COL.SONG] + "|" + r[COL.PERFORMER]);
      artistSet.add(r[COL.PERFORMER]);
      weekSum += r[COL.WEEKS];
    }
    document.getElementById("sum-songs").textContent = fmtCompact(songSet.size);
    document.getElementById("sum-artists").textContent = fmtCompact(artistSet.size);
    document.getElementById("sum-avg-weeks").textContent = (weekSum / indices.length).toFixed(1);
  }

  // ---------------- chart aggregation ----------------
  const MEASURES = [
    { key: "count", label: "Count of entries", suffix: "" },
    { key: "total_weeks", label: "Total weeks on chart", suffix: " wks" },
    { key: "median_peak", label: "Median peak position", suffix: "" },
    { key: "pct_no1", label: "% of entries reaching #1", suffix: "%" },
  ];
  const BREAKDOWNS = [
    { key: "year", label: "Year" },
    { key: "decade", label: "Decade" },
    { key: "peak_tier", label: "Peak position tier" },
    { key: "top_artists", label: "Top artists in view" },
    { key: "top_songs", label: "Top songs in view" },
  ];
  const TOP_N = 12;

  function aggregate(indices, breakdownKey, measureKey) {
    let allowedKeys = null; // Set, only for top_artists / top_songs
    let keyLabel = null; // Map key -> label, only for top_artists / top_songs

    if (breakdownKey === "top_artists" || breakdownKey === "top_songs") {
      const counts = new Map();
      for (const i of indices) {
        const r = rows[i];
        const key = breakdownKey === "top_artists" ? r[COL.PERFORMER] : r[COL.SONG] + "|" + r[COL.PERFORMER];
        counts.set(key, (counts.get(key) || 0) + 1);
      }
      const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, TOP_N);
      allowedKeys = new Set(top.map(([k]) => k));
      keyLabel = new Map(
        top.map(([k]) => {
          if (breakdownKey === "top_artists") return [k, performers[k]];
          const [songIdx] = k.split("|");
          return [k, songs[songIdx]];
        })
      );
    }

    const groups = new Map(); // key -> { count, sumWeeks, no1Count, peaks: [] }
    for (const i of indices) {
      const r = rows[i];
      let key;
      if (breakdownKey === "year") key = dateYear[r[COL.DATE]];
      else if (breakdownKey === "decade") key = decadeOf(dateYear[r[COL.DATE]]);
      else if (breakdownKey === "peak_tier") key = peakTier(r[COL.PEAK]);
      else if (breakdownKey === "top_artists") key = r[COL.PERFORMER];
      else key = r[COL.SONG] + "|" + r[COL.PERFORMER];

      if (allowedKeys && !allowedKeys.has(key)) continue;

      if (!groups.has(key)) groups.set(key, { count: 0, sumWeeks: 0, no1Count: 0, peaks: [] });
      const g = groups.get(key);
      g.count += 1;
      g.sumWeeks += r[COL.WEEKS];
      if (r[COL.WEEK_POS] === 1) g.no1Count += 1;
      g.peaks.push(r[COL.PEAK]);
    }

    let entries = [...groups.entries()];
    if (breakdownKey === "year" || breakdownKey === "decade") {
      entries.sort((a, b) => (a[0] > b[0] ? 1 : -1));
    } else if (breakdownKey === "peak_tier") {
      entries.sort((a, b) => PEAK_TIER_ORDER.indexOf(a[0]) - PEAK_TIER_ORDER.indexOf(b[0]));
    } else {
      entries.sort((a, b) => b[1].count - a[1].count);
    }

    const labels = entries.map(([k]) => (keyLabel ? keyLabel.get(k) : String(k)));
    const values = entries.map(([, g]) => {
      if (measureKey === "count") return g.count;
      if (measureKey === "total_weeks") return g.sumWeeks;
      if (measureKey === "median_peak") return Math.round(median(g.peaks));
      return Math.round((g.no1Count / g.count) * 1000) / 10; // pct_no1, 1 decimal
    });
    return { labels, values };
  }

  // ---------------- chart cards ----------------
  const cardDefaults = [
    { breakdown: "year", measure: "count" },
    { breakdown: "peak_tier", measure: "count" },
    { breakdown: "top_artists", measure: "count" },
    { breakdown: "decade", measure: "total_weeks" },
  ];
  const cards = [...document.querySelectorAll("[data-chart-card]")].map((el, i) => {
    const measureSel = el.querySelector(".measure-select");
    const breakdownSel = el.querySelector(".breakdown-select");
    MEASURES.forEach((m) => measureSel.add(new Option(m.label, m.key)));
    BREAKDOWNS.forEach((b) => breakdownSel.add(new Option(b.label, b.key)));
    measureSel.value = cardDefaults[i].measure;
    breakdownSel.value = cardDefaults[i].breakdown;
    return { el, canvas: el.querySelector("canvas"), measureSel, breakdownSel, chart: null };
  });

  function renderChart(card, indices) {
    const measureKey = card.measureSel.value;
    const breakdownKey = card.breakdownSel.value;
    const measure = MEASURES.find((m) => m.key === measureKey);

    if (card.chart) {
      card.chart.destroy();
      card.chart = null;
    }
    const body = card.canvas.closest(".chart-card__body");
    body.querySelector(".empty-state")?.remove();
    if (!indices.length) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.textContent = "No data for these filters.";
      body.appendChild(empty);
      return;
    }

    const { labels, values } = aggregate(indices, breakdownKey, measureKey);
    if (breakdownKey === "year") {
      card.chart = makeLineChart(card.canvas, {
        labels,
        series: [{ label: measure.label, values }],
        suffix: measure.suffix,
      });
    } else {
      const horizontal = breakdownKey === "top_artists" || breakdownKey === "top_songs";
      card.chart = makeBarChart(card.canvas, {
        labels,
        values,
        horizontal,
        valueLabel: measure.label,
        suffix: measure.suffix,
      });
    }
  }

  function renderCharts(indices) {
    cards.forEach((card) => renderChart(card, indices));
  }

  cards.forEach((card) => {
    card.measureSel.addEventListener("change", () => renderChart(card, currentIndices));
    card.breakdownSel.addEventListener("change", () => renderChart(card, currentIndices));
  });

  // ---------------- table ----------------
  const tableBody = document.getElementById("data-table-body");
  const tableNote = document.getElementById("table-note");
  const TABLE_ROWS = 200;
  let sortState = { key: "date", dir: -1 };

  function rowValue(i, key) {
    const r = rows[i];
    switch (key) {
      case "date":
        return dates[r[COL.DATE]];
      case "song":
        return songs[r[COL.SONG]];
      case "performer":
        return performers[r[COL.PERFORMER]];
      case "week_position":
        return r[COL.WEEK_POS];
      case "previous_week_position":
        return r[COL.PREV_POS] === null ? -1 : r[COL.PREV_POS];
      case "peak_position":
        return r[COL.PEAK];
      case "weeks_on_chart":
        return r[COL.WEEKS];
      default:
        return "";
    }
  }

  function renderTable(indices) {
    const wrap = document.querySelector(".table-wrap");
    if (!indices.length) {
      tableBody.innerHTML = "";
      tableNote.textContent = "";
      wrap.querySelector(".empty-state")?.remove();
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.textContent = "No chart entries match these filters. Try widening the year range or clearing the artist filter.";
      wrap.appendChild(empty);
      return;
    }
    wrap.querySelector(".empty-state")?.remove();

    const sorted = indices.slice().sort((a, b) => {
      const va = rowValue(a, sortState.key);
      const vb = rowValue(b, sortState.key);
      if (va < vb) return -1 * sortState.dir;
      if (va > vb) return 1 * sortState.dir;
      return 0;
    });
    const shown = sorted.slice(0, TABLE_ROWS);

    tableNote.textContent = `Showing ${fmtNumber(shown.length)} of ${fmtNumber(indices.length)} filtered entries, sorted by ${sortState.key.replace(/_/g, " ")} (${sortState.dir === 1 ? "asc" : "desc"})`;

    const rowsHtml = document.createDocumentFragment();
    for (const i of shown) {
      const r = rows[i];
      const tr = document.createElement("tr");
      const cells = [
        dates[r[COL.DATE]],
        songs[r[COL.SONG]],
        performers[r[COL.PERFORMER]],
        r[COL.WEEK_POS],
        r[COL.PREV_POS] === null ? "—" : r[COL.PREV_POS],
        r[COL.PEAK],
        r[COL.WEEKS],
      ];
      cells.forEach((val, idx) => {
        const td = document.createElement("td");
        if (idx >= 3) td.className = "num";
        td.textContent = val;
        tr.appendChild(td);
      });
      rowsHtml.appendChild(tr);
    }
    tableBody.innerHTML = "";
    tableBody.appendChild(rowsHtml);
  }

  document.querySelectorAll("#data-table th[data-key]").forEach((th) => {
    th.addEventListener("click", () => {
      const key = th.dataset.key;
      if (sortState.key === key) sortState.dir *= -1;
      else sortState = { key, dir: key === "date" ? -1 : 1 };
      document.querySelectorAll("#data-table th").forEach((h) => h.classList.remove("is-sorted"));
      th.classList.add("is-sorted");
      renderTable(currentIndices);
    });
  });
  document.querySelector('#data-table th[data-key="date"]').classList.add("is-sorted");

  // ---------------- orchestration ----------------
  let currentIndices = [];

  function renderAll() {
    currentIndices = computeFilteredIndices();
    filterCountEl.innerHTML = `Showing <strong>${fmtNumber(currentIndices.length)}</strong> of ${fmtNumber(rows.length)} chart entries`;
    renderSummary(currentIndices);
    renderCharts(currentIndices);
    renderTable(currentIndices);
  }

  const debouncedRender = debounce(renderAll, 200);
  [yearMinInput, yearMaxInput, minWeeksInput].forEach((el) => el.addEventListener("input", debouncedRender));
  performerInput.addEventListener("input", debouncedRender);
  peakTierSelect.addEventListener("change", renderAll);

  resetBtn.addEventListener("click", () => {
    yearMinInput.value = "";
    yearMaxInput.value = "";
    performerInput.value = "";
    peakTierSelect.value = "";
    minWeeksInput.value = "";
    sortState = { key: "date", dir: -1 };
    document.querySelectorAll("#data-table th").forEach((h) => h.classList.remove("is-sorted"));
    document.querySelector('#data-table th[data-key="date"]').classList.add("is-sorted");
    cards.forEach((card, i) => {
      card.measureSel.value = cardDefaults[i].measure;
      card.breakdownSel.value = cardDefaults[i].breakdown;
    });
    renderAll();
  });

  renderAll();
})();
