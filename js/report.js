(async function () {
  const res = await fetch("data/report_stats.json");
  const stats = await res.json();

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  // --- headline numbers (targets only — animated in by setupScrollEffects) ---
  const headlineEls = {
    "stat-total-entries": stats.headline.total_entries,
    "stat-unique-songs": stats.headline.unique_songs,
    "stat-unique-artists": stats.headline.unique_artists,
  };
  for (const [id, value] of Object.entries(headlineEls)) {
    const el = document.getElementById(id);
    el.dataset.target = value;
    el.dataset.compact = "true";
  }
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

      const value = document.createElement("span");
      value.className = "hero__viz-bar-value";
      value.textContent = d.avg_weeks.toFixed(1);
      fill.appendChild(value);

      const label = document.createElement("span");
      label.className = "hero__viz-bar-label";
      label.textContent = d.decade;

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

  // 2. debut position of eventual #1 hits -> one combined line chart of all four climbs
  (function renderClimbChart() {
    const container = document.getElementById("climb-chart");
    const examples = stats.no1_climb_examples;
    const LINE_COLORS = ["#eb6834", "#2a78d6", "#4a3aa7", "#1baf7a"];
    const YTICKS = [1, 20, 40, 60, 80, 100];
    const XTICK_STEP = 5;

    const VB_W = 300, VB_H = 200;
    const PX0 = 6, PX1 = 182;
    const LX0 = PX1 + 8; // where leader lines / labels begin
    const PY0 = 8, PY1 = 192;
    const maxWeeks = Math.max(...examples.map((ex) => ex.positions.length));

    const x = (week) => PX0 + ((week - 1) / (maxWeeks - 1)) * (PX1 - PX0);
    const y = (pos) => PY0 + ((pos - 1) / 99) * (PY1 - PY0);

    function shortenTitle(song) {
      return song.replace(/\s*\(From "[^"]*"\)\s*$/i, "");
    }

    const songs = examples.map((ex, i) => {
      const positions = ex.positions;
      const points = positions.map((p, idx) => [x(idx + 1), y(p)]);
      const peakIndex = positions.indexOf(ex.peak_position);
      return {
        index: i,
        color: LINE_COLORS[i % LINE_COLORS.length],
        song: ex.song,
        displaySong: shortenTitle(ex.song),
        artist: ex.artist,
        debutYear: ex.debut_year,
        positions,
        points,
        debutPt: points[0],
        peakPt: points[peakIndex],
        endPt: points[points.length - 1],
        weeksOnChart: positions.length,
      };
    });

    // Labels are positioned at each line's raw end point first, then nudged
    // apart below (after measuring their real, possibly-wrapped height —
    // "Go Away Little Girl" etc. don't always fit on one line at narrow
    // widths, so a guessed fixed gap isn't reliable).
    const labelY = {};
    songs.forEach((s) => { labelY[s.index] = s.endPt[1]; });

    const yAxisHtml = YTICKS
      .map((p) => `<span class="climb-chart__yaxis-tick" style="top:${((y(p) / VB_H) * 100).toFixed(2)}%">#${p}</span>`)
      .join("");

    const xTicks = [];
    for (let w = XTICK_STEP; w < maxWeeks; w += XTICK_STEP) xTicks.push(w);
    const xAxisHtml = xTicks
      .map((w) => `<span class="climb-chart__xaxis-tick" style="left:${((x(w) / VB_W) * 100).toFixed(2)}%">${w}</span>`)
      .join("");

    const gridlinesSvg = YTICKS.filter((p) => p !== 1)
      .map((p) => `<line class="climb-gridline" x1="${PX0}" x2="${PX1}" y1="${y(p).toFixed(2)}" y2="${y(p).toFixed(2)}"></line>`)
      .join("");

    const bandSvg = `<rect class="climb-band" x="${PX0}" y="${y(1).toFixed(2)}" width="${PX1 - PX0}" height="${(y(10) - y(1)).toFixed(2)}"></rect>`;
    const dashedSvg = `<line class="climb-dashed" x1="${PX0}" x2="${PX1}" y1="${y(1).toFixed(2)}" y2="${y(1).toFixed(2)}"></line>`;
    const finishLabelHtml = `<span class="climb-chart__finish-label" style="left:${((PX1 / VB_W) * 100).toFixed(2)}%;top:${((y(1) / VB_H) * 100).toFixed(2)}%">#1</span>`;

    const linesSvg = songs
      .map((s) => {
        const pts = s.points.map((p) => p.join(",")).join(" ");
        return `
          <polyline class="climb-line" data-song-index="${s.index}" style="--c:${s.color}" points="${pts}"></polyline>
          <circle class="climb-dot is-debut" data-song-index="${s.index}" style="--c:${s.color}" cx="${s.debutPt[0].toFixed(2)}" cy="${s.debutPt[1].toFixed(2)}" r="3"></circle>
          <circle class="climb-dot is-peak" data-song-index="${s.index}" style="--c:${s.color}" cx="${s.peakPt[0].toFixed(2)}" cy="${s.peakPt[1].toFixed(2)}" r="3.4"></circle>
          <line class="climb-leader" data-song-index="${s.index}" style="--c:${s.color}" x1="${s.endPt[0].toFixed(2)}" y1="${s.endPt[1].toFixed(2)}" x2="${(LX0 - 3).toFixed(2)}" y2="${labelY[s.index].toFixed(2)}"></line>`;
      })
      .join("");

    const hitPathsSvg = songs
      .map((s) => `<polyline class="climb-line-hit" data-song-index="${s.index}" points="${s.points.map((p) => p.join(",")).join(" ")}"></polyline>`)
      .join("");

    const labelsHtml = songs
      .map((s) => `
        <div class="climb-chart__label" data-song-index="${s.index}" style="--c:${s.color};left:${((LX0 / VB_W) * 100).toFixed(2)}%;right:4px;top:${((labelY[s.index] / VB_H) * 100).toFixed(2)}%">
          <p class="climb-chart__label-song">${escapeHtml(s.displaySong)}</p>
          <p class="climb-chart__label-artist">${escapeHtml(s.artist)}</p>
        </div>`)
      .join("");

    container.innerHTML = `
      <p class="climb-chart__title">Four songs that debuted at #100 and climbed to #1</p>
      <div class="climb-chart__body">
        <div class="climb-chart__yaxis" aria-hidden="true">${yAxisHtml}</div>
        <div class="climb-chart__plot">
          <svg class="climb-chart__svg" viewBox="0 0 ${VB_W} ${VB_H}">
            ${bandSvg}
            ${gridlinesSvg}
            ${dashedSvg}
            ${linesSvg}
            ${hitPathsSvg}
          </svg>
          ${finishLabelHtml}
          ${labelsHtml}
          <div class="climb-chart__xaxis" aria-hidden="true">${xAxisHtml}</div>
        </div>
      </div>
      <p class="climb-chart__xaxis-title">Weeks since debut</p>
      <p class="climb-chart__caption">Debut years — ${songs.map((s) => `${escapeHtml(s.displaySong)}: ${s.debutYear}`).join(" · ")}</p>
      <div class="climb-chart__tooltip" id="climb-chart-tooltip"></div>
    `;

    const svg = container.querySelector(".climb-chart__svg");
    const plotEl = container.querySelector(".climb-chart__plot");
    const tooltip = container.querySelector("#climb-chart-tooltip");

    // Now that the labels are in the DOM, measure their real (possibly
    // multi-line) rendered height and nudge overlapping ones apart using
    // that actual height rather than a guess, then move each label's
    // leader line to match.
    (function declutterLabels() {
      const plotPxHeight = plotEl.getBoundingClientRect().height;
      if (!plotPxHeight) return;
      const pxToVb = VB_H / plotPxHeight;
      const buffer = 4;

      const items = songs
        .map((s) => {
          const label = container.querySelector(`.climb-chart__label[data-song-index="${s.index}"]`);
          return { index: s.index, label, y: labelY[s.index], h: label.offsetHeight * pxToVb };
        })
        .sort((a, b) => a.y - b.y);

      for (let i = 1; i < items.length; i++) {
        const minGap = (items[i - 1].h + items[i].h) / 2 + buffer;
        if (items[i].y - items[i - 1].y < minGap) items[i].y = items[i - 1].y + minGap;
      }
      const overflow = items.length ? items[items.length - 1].y - PY1 : 0;
      if (overflow > 0) {
        items.forEach((it) => { it.y -= overflow; });
        for (let i = items.length - 2; i >= 0; i--) {
          const minGap = (items[i].h + items[i + 1].h) / 2 + buffer;
          if (items[i + 1].y - items[i].y < minGap) items[i].y = items[i + 1].y - minGap;
        }
      }

      items.forEach((it) => {
        const finalY = Math.max(PY0, Math.min(PY1, it.y));
        it.label.style.top = `${((finalY / VB_H) * 100).toFixed(2)}%`;
        const leader = svg.querySelector(`.climb-leader[data-song-index="${it.index}"]`);
        if (leader) leader.setAttribute("y2", finalY.toFixed(2));
      });
    })();

    function setActive(idx) {
      container.classList.toggle("has-hover", idx !== null);
      container.querySelectorAll("[data-song-index]").forEach((el) => {
        el.classList.toggle("is-active", idx !== null && Number(el.dataset.songIndex) === idx);
      });
    }

    function showTooltip(e, s) {
      const pt = svg.createSVGPoint();
      pt.x = e.clientX;
      pt.y = e.clientY;
      const loc = pt.matrixTransform(svg.getScreenCTM().inverse());
      let week = Math.round(((loc.x - PX0) / (PX1 - PX0)) * (maxWeeks - 1) + 1);
      week = Math.max(1, Math.min(s.weeksOnChart, week));
      const pos = s.positions[week - 1];
      tooltip.innerHTML = `<strong>${escapeHtml(s.displaySong)}</strong><span>${escapeHtml(s.artist)}</span><span>Week ${week} · #${pos}</span>`;
      tooltip.style.left = `${e.clientX + 14}px`;
      tooltip.style.top = `${e.clientY + 14}px`;
      tooltip.classList.add("is-visible");
    }

    songs.forEach((s) => {
      const hit = svg.querySelector(`.climb-line-hit[data-song-index="${s.index}"]`);
      const label = container.querySelector(`.climb-chart__label[data-song-index="${s.index}"]`);
      [hit, label].forEach((el) => {
        el.addEventListener("mouseenter", () => setActive(s.index));
        el.addEventListener("mouseleave", () => {
          setActive(null);
          tooltip.classList.remove("is-visible");
        });
      });
      hit.addEventListener("mousemove", (e) => showTooltip(e, s));
    });
  })();

  // Shared renderer for by-artist leaderboards (finding 4)
  function renderRankList(elementId, items, { nameKey, valueKey, valueFmt }) {
    const container = document.getElementById(elementId);
    const max = Math.max(...items.map((d) => d[valueKey]));
    container.innerHTML = items
      .map((d, i) => `
        <div class="rank-list__row">
          <span class="rank-list__pos">${i + 1}</span>
          <span class="rank-list__name">${escapeHtml(d[nameKey])}</span>
          <span class="rank-list__track"><span class="rank-list__fill" style="--pct:${((d[valueKey] / max) * 100).toFixed(1)}%"></span></span>
          <span class="rank-list__value">${valueFmt(d[valueKey])}</span>
        </div>`)
      .join("");
  }

  // Shared renderer for the two year-grid visuals (finding 3's #1 timeline and
  // finding 8's recurring-song calendar). Uses a CSS grid sized to the exact
  // year count (var(--n)) so the full range always fits without scrolling.
  function renderYearGrid(elementId, rows, { yearMin, yearMax, label, subLabel }) {
    const container = document.getElementById(elementId);
    const totalYears = yearMax - yearMin + 1;
    container.style.setProperty("--n", totalYears);

    const axisYears = [];
    for (let y = Math.ceil(yearMin / 10) * 10; y <= yearMax; y += 10) axisYears.push(y);
    const axisHtml = axisYears
      .map((y) => `<span style="grid-column:${y - yearMin + 1}">${y}</span>`)
      .join("");

    const rowsHtml = rows
      .map((row) => {
        const years = new Set(row.years);
        const cells = [];
        for (let y = yearMin; y <= yearMax; y++) {
          const i = y - yearMin;
          cells.push(`<span class="calendar-strip__cell${years.has(y) ? " is-on" : ""}" style="--d:${i * 3}ms" title="${y}"></span>`);
        }
        return `
          <div class="calendar-strip__row">
            <div class="calendar-strip__label">
              <p class="calendar-strip__song">${escapeHtml(label(row))}</p>
              <p class="calendar-strip__artist">${escapeHtml(subLabel(row))}</p>
            </div>
            <div class="calendar-strip__cells">${cells.join("")}</div>
          </div>`;
      })
      .join("");

    container.innerHTML = `<div class="calendar-strip__axis" aria-hidden="true">${axisHtml}</div>${rowsHtml}`;
  }

  // 3. when each top-10 #1 artist's #1 hits happened
  renderYearGrid("no1-timeline", stats.most_no1_by_artist, {
    yearMin: stats.headline.year_min,
    yearMax: stats.headline.year_max,
    label: (row) => row.artist,
    subLabel: (row) => `${row.count} #1 ${row.count === 1 ? "hit" : "hits"}`,
  });

  // 4. most cumulative weeks by artist
  renderRankList("rank-weeks-artist", stats.most_cumulative_weeks_by_artist, {
    nameKey: "artist",
    valueKey: "weeks",
    valueFmt: (v) => `${fmtNumber(v)} wks`,
  });

  // 5. one-hit wonders / song-count distribution -> pictogram
  (function renderWaffle() {
    const { pct, total_artists } = stats.one_hit_wonders;
    const container = document.getElementById("waffle-one-hit");
    const filled = Math.round(pct);
    const cells = [];
    for (let i = 0; i < 100; i++) {
      const delay = (i % 10) * 12 + Math.floor(i / 10) * 12;
      cells.push(`<span class="waffle__cell${i < filled ? " is-filled" : ""}" style="--d:${delay}ms"></span>`);
    }
    container.innerHTML = cells.join("");

    const pctEl = document.getElementById("waffle-pct");
    pctEl.dataset.target = pct;
    document.getElementById("waffle-total").textContent = fmtNumber(total_artists);
  })();

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

  // 7. #1 reign length by decade -> big comparison number
  (function renderBigCompare() {
    const container = document.getElementById("big-compare-reign");
    // The final entry is always the current, still-in-progress decade (see the
    // "2020s" caveat in the methodology section), so it's excluded from both
    // the "lowest reign" search and the "latest" comparison point.
    const full = stats.no1_reign_by_decade.slice(0, -1);
    const minDecade = full.reduce((a, b) => (b.avg_reign_weeks < a.avg_reign_weeks ? b : a));
    const latestDecade = full[full.length - 1];
    const multiplier = (latestDecade.avg_reign_weeks / minDecade.avg_reign_weeks).toFixed(1);

    container.innerHTML = `
      <div class="big-compare__item">
        <div class="big-compare__value count-up" data-target="${minDecade.avg_reign_weeks}" data-decimals="2" data-suffix=" wks">0</div>
        <div class="big-compare__label">${minDecade.decade} avg #1 reign</div>
      </div>
      <div class="big-compare__arrow">→</div>
      <div class="big-compare__item">
        <div class="big-compare__value is-accent count-up" data-target="${latestDecade.avg_reign_weeks}" data-decimals="2" data-suffix=" wks">0</div>
        <div class="big-compare__label">${latestDecade.decade} avg #1 reign</div>
      </div>
      <span class="big-compare__multiplier">${multiplier}× longer</span>
    `;
  })();

  // 8. most recurring songs -> calendar strip
  renderYearGrid("calendar-strip", stats.most_recurring_songs.slice(0, 8), {
    yearMin: stats.headline.year_min,
    yearMax: stats.headline.year_max,
    label: (row) => row.song,
    subLabel: (row) => row.artist,
  });

  setupScrollEffects();
})();

// --- scroll reveal, count-up numbers, and the side progress rail ---
function setupScrollEffects() {
  const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function animateCount(el) {
    const target = parseFloat(el.dataset.target);
    if (Number.isNaN(target)) return;
    const decimals = Number(el.dataset.decimals || 0);
    const suffix = el.dataset.suffix || "";
    const compact = el.dataset.compact === "true";
    const format = (v) => (compact ? fmtCompact(Math.round(v)) : v.toFixed(decimals)) + suffix;

    if (prefersReduced) {
      el.textContent = format(target);
      return;
    }
    const duration = 1100;
    const start = performance.now();
    function frame(now) {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      el.textContent = format(target * eased);
      if (t < 1) requestAnimationFrame(frame);
      else el.textContent = format(target);
    }
    requestAnimationFrame(frame);
  }

  function activateReveal(el) {
    el.classList.add("is-visible");
    el.querySelectorAll(".waffle, .rank-list, .calendar-strip").forEach((c) => c.classList.add("is-visible"));
    const counters = el.classList.contains("count-up") ? [el] : [...el.querySelectorAll(".count-up")];
    counters.forEach(animateCount);
  }

  const revealEls = document.querySelectorAll(".reveal");
  if (prefersReduced || !("IntersectionObserver" in window)) {
    revealEls.forEach(activateReveal);
  } else {
    const io = new IntersectionObserver(
      (entries, obs) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            activateReveal(entry.target);
            obs.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15, rootMargin: "0px 0px -8% 0px" }
    );
    revealEls.forEach((el) => io.observe(el));
  }

  const rail = document.getElementById("scroll-rail");
  const sections = [...document.querySelectorAll("[data-rail-section]")];
  if (!rail || !sections.length) return;

  const dots = sections.map((section) => {
    const dot = document.createElement("button");
    dot.type = "button";
    dot.className = "scroll-rail__dot";
    dot.style.setProperty("--dot-color", section.dataset.accent || "#fff");
    dot.setAttribute("aria-label", section.dataset.railLabel || "Section");
    dot.addEventListener("click", () => {
      section.scrollIntoView({ behavior: prefersReduced ? "auto" : "smooth", block: "center" });
    });
    rail.appendChild(dot);
    return dot;
  });

  if ("IntersectionObserver" in window) {
    const railIO = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const idx = sections.indexOf(entry.target);
          dots[idx].classList.toggle("is-active", entry.isIntersecting);
        });
      },
      { rootMargin: "-45% 0px -45% 0px", threshold: 0 }
    );
    sections.forEach((s) => railIO.observe(s));
  }
}
