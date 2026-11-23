/**
 * script.js – Bakery Sales Dashboard
 * ============================================================
 * Alur kerja:
 *   1. Fetch data.json (pre-aggregated dari CSV)
 *   2. Simpan ke variabel global `rawData`
 *   3. Inisialisasi filter dropdown dari data
 *   4. Render semua KPI & chart
 *   5. Event listener filter → recalculate → update semua chart & KPI
 * ============================================================
 */

"use strict";

// ── Palet Warna Konsisten ─────────────────────────────────────────────
const COLORS = {
  primary   : "#6366f1",
  secondary : "#8b5cf6",
  emerald   : "#10b981",
  amber     : "#f59e0b",
  rose      : "#f43f5e",
  cyan      : "#06b6d4",
  sky       : "#0ea5e9",
  palette   : [
    "#6366f1","#8b5cf6","#10b981","#f59e0b",
    "#f43f5e","#06b6d4","#0ea5e9","#ec4899",
    "#84cc16","#f97316"
  ]
};

// Chart.js global defaults
Chart.defaults.font.family = '-apple-system, "Segoe UI", system-ui, sans-serif';
Chart.defaults.font.size   = 12;
Chart.defaults.color       = "#6b7280";
Chart.defaults.plugins.legend.position = "bottom";
Chart.defaults.plugins.legend.labels.padding = 14;
Chart.defaults.plugins.legend.labels.usePointStyle = true;
Chart.defaults.plugins.tooltip.padding = 10;
Chart.defaults.plugins.tooltip.cornerRadius = 8;
Chart.defaults.plugins.tooltip.backgroundColor = "rgba(17,24,39,0.88)";

// ── State Global ──────────────────────────────────────────────────────
let rawData   = null;   // data.json yang sudah di-fetch
let chartRefs = {};     // referensi instance Chart.js { id: Chart }

// Filter aktif saat ini
const activeFilters = {
  year    : "all",
  segment : "all",
  gender  : "all",
  loyalty : "all"
};

// ── Entry Point ───────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  showLoading(true);
  fetchData();
});

// ── Fetch JSON ────────────────────────────────────────────────────────
/**
 * Mengambil data.json dan memulai inisialisasi dashboard.
 * data.json berisi data pre-aggregated dari CSV asli.
 */
async function fetchData() {
  try {
    const response = await fetch("data.json");
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    rawData = await response.json();

    initFilters();
    renderAll();
    setLastUpdated();
    showLoading(false);
  } catch (err) {
    console.error("Gagal memuat data:", err);
    showError();
  }
}

// ── Loading State ─────────────────────────────────────────────────────
function showLoading(show) {
  let overlay = document.getElementById("loading-overlay");
  if (!overlay) {
    // Buat overlay secara dinamis
    overlay = document.createElement("div");
    overlay.id = "loading-overlay";
    overlay.innerHTML = `
      <div class="spinner"></div>
      <p class="text-sm text-gray-500 font-medium">Memuat data…</p>
    `;
    document.body.appendChild(overlay);
  }
  overlay.classList.toggle("hidden", !show);
}

function showError() {
  showLoading(false);
  document.querySelector("main").innerHTML = `
    <div class="flex flex-col items-center justify-center py-24 text-center gap-4">
      <span class="text-5xl">⚠️</span>
      <p class="text-gray-600 font-medium">Gagal memuat <code>data.json</code>.</p>
      <p class="text-gray-400 text-sm">Pastikan file <code>data.json</code> berada di direktori yang sama dengan <code>index.html</code>.</p>
    </div>
  `;
}

function setLastUpdated() {
  const el = document.getElementById("last-updated");
  if (el) {
    const now = new Date();
    el.textContent = `Terakhir diperbarui: ${now.toLocaleString("id-ID")}`;
  }
}

// ── Init Filters ──────────────────────────────────────────────────────
/**
 * Mengisi dropdown Segment & Gender dari data unik di JSON.
 * Tahun dan Loyalty sudah di-hardcode di HTML.
 */
function initFilters() {
  // Segment
  const segSelect = document.getElementById("filter-segment");
  rawData.segment_dist.forEach(s => {
    const opt = document.createElement("option");
    opt.value = s.segment;
    opt.textContent = s.segment;
    segSelect.appendChild(opt);
  });

  // Gender
  const genderSelect = document.getElementById("filter-gender");
  rawData.gender_dist.forEach(g => {
    const opt = document.createElement("option");
    opt.value = g.gender;
    opt.textContent = g.gender;
    genderSelect.appendChild(opt);
  });

  // Attach listeners
  document.getElementById("filter-year").addEventListener("change",    onFilterChange);
  document.getElementById("filter-segment").addEventListener("change", onFilterChange);
  document.getElementById("filter-gender").addEventListener("change",  onFilterChange);
  document.getElementById("filter-loyalty").addEventListener("change", onFilterChange);
  document.getElementById("btn-reset").addEventListener("click",       onResetFilters);
}

// ── Filter Handlers ───────────────────────────────────────────────────
function onFilterChange() {
  activeFilters.year    = document.getElementById("filter-year").value;
  activeFilters.segment = document.getElementById("filter-segment").value;
  activeFilters.gender  = document.getElementById("filter-gender").value;
  activeFilters.loyalty = document.getElementById("filter-loyalty").value;
  renderAll();
}

function onResetFilters() {
  document.getElementById("filter-year").value    = "all";
  document.getElementById("filter-segment").value = "all";
  document.getElementById("filter-gender").value  = "all";
  document.getElementById("filter-loyalty").value = "all";
  activeFilters.year = activeFilters.segment = activeFilters.gender = activeFilters.loyalty = "all";
  renderAll();
}

// ── Data Filtering Logic ──────────────────────────────────────────────
/**
 * Karena data sudah pre-aggregated, kita filter berdasarkan metadata
 * yang tersedia di rawData. Untuk filter multi-dimensi, kita gunakan
 * rawData.gender_segment dan rawData.seg_loyalty sebagai basis.
 */
function getFilteredData() {
  const { year, segment, gender, loyalty } = activeFilters;

  // --- Monthly Trend ---
  let monthlyTrend = rawData.monthly_trend.slice();
  if (year !== "all") {
    monthlyTrend = monthlyTrend.filter(d => d.period.startsWith(year));
  }

  // --- YoY data ---
  const yoyData = rawData.yoy_data;

  // --- Segment distribution (filter by gender & loyalty if needed) ---
  // Gunakan gender_segment untuk filter gender, seg_loyalty untuk filter loyalty
  let segmentData;
  if (gender === "all" && loyalty === "all") {
    segmentData = rawData.segment_dist.slice();
    if (segment !== "all") segmentData = segmentData.filter(s => s.segment === segment);
  } else {
    // Re-calculate dari gender_segment matrix
    const gs = rawData.gender_segment;
    segmentData = gs.segments.map((seg, si) => {
      let total = 0;
      gs.genders.forEach((g, gi) => {
        if (gender === "all" || g === gender) {
          total += gs.data[gi][si];
        }
      });
      // Loyalty filter: perkiraan proporsional
      if (loyalty !== "all") {
        const lRow = rawData.seg_loyalty.find(s => s.segment === seg);
        if (lRow) {
          const lTotal = lRow.member + lRow.non_member;
          const lPct   = loyalty === "Yes" ? lRow.member / lTotal : lRow.non_member / lTotal;
          total = Math.round(total * lPct);
        }
      }
      return { segment: seg, orders: total };
    }).filter(s => segment === "all" || s.segment === segment);
  }

  // --- Gender distribution ---
  let genderData = rawData.gender_dist.slice();
  if (gender !== "all") genderData = genderData.filter(g => g.gender === gender);

  // --- Loyalty distribution ---
  let loyaltyData = rawData.loyalty_dist.slice();
  if (loyalty !== "all") {
    loyaltyData = loyaltyData.filter(d =>
      (loyalty === "Yes" && d.status === "Member") ||
      (loyalty === "No"  && d.status === "Non-Member")
    );
  }

  // --- Age distribution ---
  const ageData = rawData.age_dist.slice();

  // --- Seg × Loyalty stacked ---
  let segLoyalty = rawData.seg_loyalty.slice();
  if (segment !== "all") segLoyalty = segLoyalty.filter(s => s.segment === segment);

  // --- Items dist ---
  const itemsData = rawData.items_dist.slice();

  // --- DoW ---
  let dowData = rawData.dow_data.slice();
  if (year !== "all") {
    // Skala proporsional (tidak ada data DoW per tahun di pre-agg)
    // Hitung rasio year dari monthly_trend
    const totalAll  = rawData.monthly_trend.reduce((a, d) => a + d.orders, 0);
    const totalYear = rawData.monthly_trend
      .filter(d => d.period.startsWith(year))
      .reduce((a, d) => a + d.orders, 0);
    const ratio = totalAll > 0 ? totalYear / totalAll : 1;
    dowData = dowData.map(d => ({ ...d, orders: Math.round(d.orders * ratio) }));
  }

  // --- Top Customers ---
  const topCustomers = rawData.top_customers.slice(0, 10);

  // --- KPI numbers ---
  const totalOrders   = monthlyTrend.reduce((a, d) => a + d.orders, 0);
  const totalAllOrders = rawData.monthly_trend.reduce((a, d) => a + d.orders, 0);
  // Skala customers & rows proporsionally
  const ratio = totalAllOrders > 0 ? totalOrders / totalAllOrders : 1;
  const kpi = {
    total_rows       : Math.round(rawData.kpi.total_rows * ratio),
    unique_orders    : totalOrders,
    unique_customers : Math.round(rawData.kpi.unique_customers * ratio),
    avg_items_per_order: rawData.kpi.avg_items_per_order,
    loyalty_pct      : rawData.kpi.loyalty_member_pct
  };

  return { monthlyTrend, yoyData, segmentData, genderData, loyaltyData,
           ageData, segLoyalty, itemsData, dowData, topCustomers, kpi };
}

// ── Render All ────────────────────────────────────────────────────────
function renderAll() {
  const data = getFilteredData();
  updateKPIs(data.kpi);
  renderMonthlyTrend(data.monthlyTrend);
  renderSegmentChart(data.segmentData);
  renderGenderChart(data.genderData);
  renderLoyaltyChart(data.loyaltyData);
  renderAgeChart(data.ageData);
  renderYoYChart(data.yoyData);
  renderDowChart(data.dowData);
  renderSegLoyaltyChart(data.segLoyalty);
  renderItemsChart(data.itemsData);
  renderTopCustomers(data.topCustomers, data.kpi.unique_orders);
}

// ── KPI Updater ───────────────────────────────────────────────────────
function updateKPIs(kpi) {
  animateNumber("kpi-rows",      kpi.total_rows,          0,  ".");
  animateNumber("kpi-orders",    kpi.unique_orders,       0,  ".");
  animateNumber("kpi-customers", kpi.unique_customers,    0,  ".");
  document.getElementById("kpi-avg-items").textContent = kpi.avg_items_per_order.toFixed(2);
  document.getElementById("kpi-loyalty").textContent   = kpi.loyalty_pct + "%";
}

/**
 * Animasi angka naik dari nilai saat ini ke nilai target.
 * @param {string} elId  - ID elemen
 * @param {number} end   - nilai akhir
 * @param {number} dec   - jumlah desimal
 * @param {string} sep   - separator ribuan ("." untuk ID, "," untuk EN)
 */
function animateNumber(elId, end, dec, sep = ".") {
  const el = document.getElementById(elId);
  if (!el) return;
  const start    = 0;
  const duration = 600;
  const startTs  = performance.now();

  function step(ts) {
    const progress = Math.min((ts - startTs) / duration, 1);
    const ease     = 1 - Math.pow(1 - progress, 3); // ease-out cubic
    const current  = start + (end - start) * ease;
    el.textContent = formatNumber(current, dec, sep);
    if (progress < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

function formatNumber(n, dec, sep) {
  return n.toFixed(dec).replace(/\B(?=(\d{3})+(?!\d))/g, sep);
}

// ── Chart Helper ──────────────────────────────────────────────────────
/**
 * Membuat atau memperbarui chart. Jika chart sudah ada, update datanya
 * menggunakan Chart.js update() agar animasi smooth.
 * @param {string} canvasId
 * @param {string} type
 * @param {object} config
 */
function upsertChart(canvasId, type, config) {
  if (chartRefs[canvasId]) {
    // Update chart yang sudah ada
    const chart = chartRefs[canvasId];
    chart.data   = config.data;
    chart.options = config.options ?? chart.options;
    chart.update("active");
  } else {
    // Buat chart baru
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;
    chartRefs[canvasId] = new Chart(ctx, { type, ...config });
  }
}

// ── Chart: Monthly Trend ──────────────────────────────────────────────
function renderMonthlyTrend(trend) {
  upsertChart("chart-monthly-trend", "line", {
    data: {
      labels: trend.map(d => d.label),
      datasets: [{
        label        : "Unique Orders",
        data         : trend.map(d => d.orders),
        borderColor  : COLORS.primary,
        backgroundColor: hexAlpha(COLORS.primary, 0.12),
        fill         : true,
        tension      : 0.4,
        pointRadius  : 4,
        pointBackgroundColor: COLORS.primary,
        pointHoverRadius: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false }, ticks: { maxTicksLimit: 12 } },
        y: { grid: { color: "#f3f4f6" }, beginAtZero: true }
      }
    }
  });
}

// ── Chart: Customer Segment (Doughnut) ───────────────────────────────
function renderSegmentChart(segs) {
  upsertChart("chart-segment", "doughnut", {
    data: {
      labels  : segs.map(s => s.segment),
      datasets: [{
        data           : segs.map(s => s.orders),
        backgroundColor: COLORS.palette,
        borderWidth    : 2,
        borderColor    : "#ffffff",
        hoverOffset    : 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "60%",
      plugins: {
        legend: { position: "bottom" },
        tooltip: {
          callbacks: {
            label: ctx => ` ${ctx.label}: ${formatNumber(ctx.parsed, 0, ".")} rows`
          }
        }
      }
    }
  });
}

// ── Chart: Gender Distribution (Pie) ─────────────────────────────────
function renderGenderChart(genders) {
  upsertChart("chart-gender", "pie", {
    data: {
      labels  : genders.map(g => g.gender),
      datasets: [{
        data           : genders.map(g => g.count),
        backgroundColor: [COLORS.primary, COLORS.emerald, COLORS.amber],
        borderWidth    : 2,
        borderColor    : "#ffffff",
        hoverOffset    : 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: "bottom" } }
    }
  });
}

// ── Chart: Loyalty (Doughnut) ─────────────────────────────────────────
function renderLoyaltyChart(loyalty) {
  upsertChart("chart-loyalty", "doughnut", {
    data: {
      labels  : loyalty.map(l => l.status),
      datasets: [{
        data           : loyalty.map(l => l.count),
        backgroundColor: [COLORS.primary, "#e5e7eb"],
        borderWidth    : 2,
        borderColor    : "#ffffff",
        hoverOffset    : 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "65%",
      plugins: {
        legend: { position: "bottom" },
        tooltip: {
          callbacks: {
            label: ctx => {
              const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
              const pct   = total > 0 ? ((ctx.parsed / total) * 100).toFixed(1) : 0;
              return ` ${ctx.label}: ${formatNumber(ctx.parsed, 0, ".")} (${pct}%)`;
            }
          }
        }
      }
    }
  });
}

// ── Chart: Age Distribution (Bar) ────────────────────────────────────
function renderAgeChart(ages) {
  upsertChart("chart-age", "bar", {
    data: {
      labels  : ages.map(a => a.group),
      datasets: [{
        label          : "Jumlah Entries",
        data           : ages.map(a => a.count),
        backgroundColor: COLORS.palette,
        borderRadius   : 6,
        borderWidth    : 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false } },
        y: { grid: { color: "#f3f4f6" }, beginAtZero: true }
      }
    }
  });
}

// ── Chart: Year-over-Year (Grouped Bar) ──────────────────────────────
function renderYoYChart(yoy) {
  const months = rawData.month_names;
  upsertChart("chart-yoy", "bar", {
    data: {
      labels  : months,
      datasets: [
        {
          label          : "2023",
          data           : yoy["2023"],
          backgroundColor: hexAlpha(COLORS.primary, 0.75),
          borderRadius   : 4,
          borderWidth    : 0
        },
        {
          label          : "2024",
          data           : yoy["2024"],
          backgroundColor: hexAlpha(COLORS.secondary, 0.75),
          borderRadius   : 4,
          borderWidth    : 0
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: "bottom" } },
      scales: {
        x: { grid: { display: false } },
        y: { grid: { color: "#f3f4f6" }, beginAtZero: true }
      }
    }
  });
}

// ── Chart: Day of Week (Bar – horizontal) ────────────────────────────
function renderDowChart(dow) {
  upsertChart("chart-dow", "bar", {
    data: {
      labels  : dow.map(d => d.day),
      datasets: [{
        label          : "Unique Orders",
        data           : dow.map(d => d.orders),
        backgroundColor: dow.map((_, i) => COLORS.palette[i % COLORS.palette.length]),
        borderRadius   : 6,
        borderWidth    : 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false } },
        y: { grid: { color: "#f3f4f6" }, beginAtZero: true }
      }
    }
  });
}

// ── Chart: Segment × Loyalty (Stacked Bar) ───────────────────────────
function renderSegLoyaltyChart(segLoyalty) {
  upsertChart("chart-seg-loyalty", "bar", {
    data: {
      labels  : segLoyalty.map(s => s.segment),
      datasets: [
        {
          label          : "Member",
          data           : segLoyalty.map(s => s.member),
          backgroundColor: COLORS.primary,
          borderRadius   : 0,
          borderWidth    : 0
        },
        {
          label          : "Non-Member",
          data           : segLoyalty.map(s => s.non_member),
          backgroundColor: "#e5e7eb",
          borderRadius   : 0,
          borderWidth    : 0
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: "bottom" } },
      scales: {
        x: { stacked: true, grid: { display: false } },
        y: { stacked: true, grid: { color: "#f3f4f6" }, beginAtZero: true }
      }
    }
  });
}

// ── Chart: Items per Order (Bar) ──────────────────────────────────────
function renderItemsChart(items) {
  // Kelompokkan ke bucket untuk keterbacaan
  const buckets = { "1":"1","2":"2","3":"3","4":"4","5":"5","6-7":"6-7","≥8":"≥8" };
  const counts  = { "1":0,"2":0,"3":0,"4":0,"5":0,"6-7":0,"≥8":0 };
  items.forEach(d => {
    if      (d.items <= 5) counts[String(d.items)] += d.orders;
    else if (d.items <= 7) counts["6-7"] += d.orders;
    else                   counts["≥8"]  += d.orders;
  });
  const labels = Object.keys(counts);
  const values = Object.values(counts);

  upsertChart("chart-items", "bar", {
    data: {
      labels,
      datasets: [{
        label          : "Jumlah Orders",
        data           : values,
        backgroundColor: hexAlpha(COLORS.cyan, 0.75),
        borderRadius   : 6,
        borderWidth    : 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: {
          grid: { display: false },
          title: { display: true, text: "Items per Order", font: { size: 11 } }
        },
        y: { grid: { color: "#f3f4f6" }, beginAtZero: true }
      }
    }
  });
}

// ── Top Customers Table ───────────────────────────────────────────────
function renderTopCustomers(customers, totalOrders) {
  const tbody = document.getElementById("top-customers-body");
  if (!tbody) return;
  const maxOrders = customers[0]?.orders || 1;
  tbody.innerHTML = customers.map((c, i) => {
    const pct      = totalOrders > 0 ? ((c.orders / totalOrders) * 100).toFixed(2) : 0;
    const barWidth = Math.round((c.orders / maxOrders) * 100);
    const rankClass = i === 0 ? "rank-gold"
                    : i === 1 ? "rank-silver"
                    : i === 2 ? "rank-bronze"
                    : "rank-normal";
    return `
      <tr>
        <td><span class="rank-badge ${rankClass}">${i + 1}</span></td>
        <td class="font-mono text-xs">${escHtml(c.customer_id)}</td>
        <td class="text-right font-semibold">${formatNumber(c.orders, 0, ".")}</td>
        <td>
          <div class="share-bar-wrap">
            <div class="share-bar" style="width:${barWidth}%"></div>
            <span class="share-label">${pct}%</span>
          </div>
        </td>
      </tr>
    `;
  }).join("");
}

// ── Utilities ─────────────────────────────────────────────────────────
/** Konversi hex color + alpha ke rgba string */
function hexAlpha(hex, alpha) {
  const r = parseInt(hex.slice(1,3), 16);
  const g = parseInt(hex.slice(3,5), 16);
  const b = parseInt(hex.slice(5,7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Escape HTML untuk mencegah XSS pada dynamic content */
function escHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
