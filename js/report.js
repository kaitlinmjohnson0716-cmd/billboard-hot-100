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

  // 2. debut position of eventual #1 hits -> four real "#100 to #1" climbs
  (function renderClimbGrid() {
    const container = document.getElementById("climb-grid");
    const examples = stats.no1_climb_examples;

    container.innerHTML = examples
      .map((ex) => {
        const n = ex.positions.length;
        const points = ex.positions
          .map((p, i) => `${((i / (n - 1)) * 100).toFixed(2)},${((p / 100) * 40).toFixed(2)}`)
          .join(" ");
        const peakIndex = ex.positions.indexOf(ex.peak_position);
        const peakX = ((peakIndex / (n - 1)) * 100).toFixed(2);
        const peakY = ((ex.peak_position / 100) * 40).toFixed(2);
        return `
          <div class="climb-card">
            <svg class="climb-card__svg" viewBox="0 0 100 40" preserveAspectRatio="none" role="img" aria-label="Weekly chart position of ${escapeHtml(ex.song)} by ${escapeHtml(ex.artist)}, climbing from number ${ex.debut_position} to number one">
              <polyline class="climb-card__line" points="${points}"></polyline>
              <circle class="climb-card__peak" cx="${peakX}" cy="${peakY}" r="2.2"></circle>
            </svg>
            <div class="climb-card__meta">
              <p class="climb-card__song">${escapeHtml(ex.song)} — ${escapeHtml(ex.artist)}</p>
              <p class="climb-card__stat">Debuted #${ex.debut_position} → #1 (${ex.weeks_on_chart} weeks on chart total)</p>
            </div>
          </div>`;
      })
      .join("");

    container.querySelectorAll(".climb-card__line").forEach((line) => {
      line.style.setProperty("--len", line.getTotalLength());
    });
  })();

  // Shared renderer for the two by-artist leaderboards (findings 3 and 4)
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

  // 3. most #1 songs by artist
  renderRankList("rank-no1-artist", stats.most_no1_by_artist, {
    nameKey: "artist",
    valueKey: "count",
    valueFmt: (v) => `${v} #1s`,
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
  (function renderCalendarStrip() {
    const container = document.getElementById("calendar-strip");
    const { year_min: yearMin, year_max: yearMax } = stats.headline;
    const songs = stats.most_recurring_songs.slice(0, 8);

    const axisYears = [];
    for (let y = Math.ceil(yearMin / 10) * 10; y <= yearMax; y += 10) axisYears.push(y);
    const axisHtml = axisYears.map((y) => `<span style="left:${(y - yearMin) * 9}px">${y}</span>`).join("");

    const rowsHtml = songs
      .map((song) => {
        const years = new Set(song.years);
        const cells = [];
        for (let y = yearMin; y <= yearMax; y++) {
          const i = y - yearMin;
          cells.push(`<span class="calendar-strip__cell${years.has(y) ? " is-on" : ""}" style="--d:${i * 4}ms" title="${y}"></span>`);
        }
        return `
          <div class="calendar-strip__row">
            <span class="calendar-strip__label">${escapeHtml(song.song)}</span>
            <div class="calendar-strip__cells">${cells.join("")}</div>
          </div>`;
      })
      .join("");

    container.innerHTML = `<div class="calendar-strip__axis">${axisHtml}</div>${rowsHtml}`;
  })();

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
    el.querySelectorAll(".climb-card").forEach((c, i) => {
      setTimeout(() => c.classList.add("is-visible"), i * 130);
    });
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
