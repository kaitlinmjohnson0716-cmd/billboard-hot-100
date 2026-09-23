// Shared Chart.js theme + small helpers used by report.js and dashboard.js.
// Palette: single-hue blue for magnitude bars/lines (one measure per chart,
// so no categorical rainbow), orange reserved as the secondary accent.

const PALETTE = {
  series1: "#2a78d6",
  series1Fill: "rgba(42, 120, 214, 0.12)",
  series2: "#eb6834",
  gridline: "#e1e0d9",
  baseline: "#c3c2b7",
  textPrimary: "#0b0b0b",
  textSecondary: "#52514e",
  textMuted: "#898781",
  surface: "#ffffff",
};

if (window.Chart) {
  Chart.defaults.font.family = "system-ui, -apple-system, 'Segoe UI', sans-serif";
  Chart.defaults.color = PALETTE.textSecondary;
  Chart.defaults.plugins.tooltip.backgroundColor = "#101a2b";
  Chart.defaults.plugins.tooltip.titleColor = "#ffffff";
  Chart.defaults.plugins.tooltip.bodyColor = "#ffffff";
  Chart.defaults.plugins.tooltip.padding = 10;
  Chart.defaults.plugins.tooltip.cornerRadius = 8;
  Chart.defaults.plugins.tooltip.displayColors = false;
  Chart.defaults.plugins.legend.labels.usePointStyle = true;
  Chart.defaults.animation.duration = 350;
}

function fmtNumber(n) {
  return new Intl.NumberFormat("en-US").format(n);
}

function fmtCompact(n) {
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

/** Keeps long category labels (song/artist strings) from overflowing the
 * chart's label gutter and getting clipped by the canvas edge. The full
 * text is still shown in the tooltip title via fullLabels. */
function truncateLabel(label, max = 28) {
  if (label.length <= max) return label;
  return label.slice(0, max - 1).trimEnd() + "…";
}

/** Vertical or horizontal single-series bar chart. */
function makeBarChart(canvas, { labels, values, horizontal = false, valueLabel = "Value", suffix = "", fullLabels = null }) {
  const displayLabels = horizontal ? labels.map((l) => truncateLabel(l)) : labels;
  return new Chart(canvas, {
    type: "bar",
    data: {
      labels: displayLabels,
      datasets: [
        {
          label: valueLabel,
          data: values,
          backgroundColor: PALETTE.series1,
          borderRadius: 4,
          borderSkipped: horizontal ? "left" : "bottom",
          maxBarThickness: 26,
          categoryPercentage: 0.7,
          barPercentage: 0.9,
        },
      ],
    },
    options: {
      indexAxis: horizontal ? "y" : "x",
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: (items) => (fullLabels ? fullLabels[items[0].dataIndex] : items[0].label),
            label: (ctx) => `${fmtNumber(ctx.parsed[horizontal ? "x" : "y"])}${suffix}`,
          },
        },
      },
      scales: {
        x: {
          grid: { color: horizontal ? PALETTE.gridline : "transparent", drawTicks: false },
          border: { color: PALETTE.baseline },
          ticks: { color: PALETTE.textMuted, font: { size: 11 } },
        },
        y: {
          grid: { color: horizontal ? "transparent" : PALETTE.gridline, drawTicks: false },
          border: { color: PALETTE.baseline },
          ticks: { color: PALETTE.textMuted, font: { size: 11 } },
          beginAtZero: true,
        },
      },
    },
  });
}

/** Single or multi-series line chart (used for trend-over-decade findings). */
function makeLineChart(canvas, { labels, series, suffix = "" }) {
  const colors = [PALETTE.series1, PALETTE.series2];
  return new Chart(canvas, {
    type: "line",
    data: {
      labels,
      datasets: series.map((s, i) => ({
        label: s.label,
        data: s.values,
        borderColor: colors[i % colors.length],
        backgroundColor: colors[i % colors.length],
        borderWidth: 2,
        pointRadius: 4,
        pointHoverRadius: 6,
        pointBackgroundColor: colors[i % colors.length],
        pointBorderColor: PALETTE.surface,
        pointBorderWidth: 2,
        tension: 0.25,
        fill: false,
      })),
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: series.length > 1, position: "top", align: "end" },
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.dataset.label}: ${fmtNumber(ctx.parsed.y)}${suffix}`,
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          border: { color: PALETTE.baseline },
          ticks: { color: PALETTE.textMuted, font: { size: 11 } },
        },
        y: {
          grid: { color: PALETTE.gridline, drawTicks: false },
          border: { display: false },
          ticks: { color: PALETTE.textMuted, font: { size: 11 } },
          beginAtZero: true,
        },
      },
    },
  });
}
