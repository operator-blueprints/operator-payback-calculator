let paybackChart = null;

/* ---------- helpers ---------- */

function parseNumber(id) {
  const el = document.getElementById(id);
  if (!el) return 0;
  const raw = String(el.value || "").trim();
  if (!raw) return 0;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

function formatCurrency(value) {
  if (!Number.isFinite(value)) return "–";
  return (
    "$" +
    value.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}

function formatNumber(value) {
  if (!Number.isFinite(value)) return "–";
  return value.toLocaleString("en-US", { maximumFractionDigits: 1 });
}

function timeUnitLabel(unit, plural = true) {
  if (unit === "week") return plural ? "weeks" : "week";
  if (unit === "year") return plural ? "years" : "year";
  return plural ? "months" : "month";
}

/* ---------- UI sync ---------- */

function syncHorizonLabel(value) {
  const n = Number(value) || 0;
  const unit = document.getElementById("timeUnit").value || "month";
  const label = document.getElementById("horizonLabel");
  if (label) {
    label.textContent = `${n} ${timeUnitLabel(unit, n !== 1)}`;
  }
}

function resetSummary() {
  document.getElementById("paybackPeriodValue").textContent = "–";
  document.getElementById("cumMarginValue").textContent = "–";
  document.getElementById("netVsCACValue").textContent = "–";
  document.getElementById("gmPerPeriodValue").textContent = "–";

  document.getElementById("paybackPeriodTag").textContent =
    "Period when cumulative margin first exceeds CAC.";
  document.getElementById("netVsCACTag").textContent =
    "Cumulative margin minus CAC.";

  const summaryList = document.getElementById("summaryList");
  summaryList.innerHTML = "";
  const li = document.createElement("li");
  li.textContent = "Run the payback model to populate your summary.";
  summaryList.appendChild(li);

  if (paybackChart) {
    paybackChart.data.labels = [];
    paybackChart.data.datasets[0].data = [];
    paybackChart.data.datasets[1].data = [];
    paybackChart.update();
  }
}

/* ---------- core model ---------- */

function runPayback() {
  const unit = document.getElementById("timeUnit").value || "month";
  const horizon = Math.max(parseNumber("horizon"), 1);

  const cac = parseNumber("cac");
  const aov = parseNumber("aov");
  const ordersPerPeriod = parseNumber("ordersPerPeriod");
  const grossMarginPct = parseNumber("grossMargin");
  const churnPct = parseNumber("churnRate");
  const discountPct = parseNumber("discountRate");

  // Basic validation
  if (cac <= 0 || aov <= 0 || ordersPerPeriod <= 0) {
    resetSummary();
    return;
  }
  if (grossMarginPct < 0 || grossMarginPct > 100) {
    resetSummary();
    return;
  }
  if (churnPct < 0 || churnPct >= 100) {
    resetSummary();
    return;
  }

  const churn = churnPct / 100;
  const marginRate = grossMarginPct / 100;
  const discountRate = discountPct > 0 ? discountPct / 100 : 0;

  let activeCustomers = 1; // per-customer basis
  let cumulativeMargin = 0;

  const labels = [];
  const cumMarginSeries = [];
  const cacSeries = [];

  let paybackPeriod = null;
  let gmFirstPeriod = 0;

  for (let t = 1; t <= horizon; t++) {
    labels.push(String(t));

    if (t === 1) {
      activeCustomers = 1;
    } else {
      activeCustomers = activeCustomers * (1 - churn);
    }

    const orders = activeCustomers * ordersPerPeriod;
    const revenue = orders * aov;
    const margin = revenue * marginRate;

    const discountFactor =
      discountRate > 0 ? 1 / Math.pow(1 + discountRate, t - 1) : 1;
    const discountedMargin = margin * discountFactor;

    cumulativeMargin += discountedMargin;

    if (t === 1) {
      gmFirstPeriod = discountedMargin;
    }

    if (paybackPeriod === null && cumulativeMargin >= cac) {
      paybackPeriod = t;
    }

    cumMarginSeries.push(cumulativeMargin);
    cacSeries.push(cac);
  }

  const netVsCAC = cumulativeMargin - cac;

  // KPIs
  const paybackValueEl = document.getElementById("paybackPeriodValue");
  const paybackTagEl = document.getElementById("paybackPeriodTag");

  if (paybackPeriod !== null) {
    paybackValueEl.textContent = `${paybackPeriod} ${timeUnitLabel(
      unit,
      paybackPeriod !== 1
    )}`;
    paybackTagEl.textContent =
      "Payback reached when cumulative margin crosses CAC.";
  } else {
    paybackValueEl.textContent = "Not within horizon";
    paybackTagEl.textContent = `Payback not reached in ${horizon} ${timeUnitLabel(
      unit,
      horizon !== 1
    )}.`;
  }

  document.getElementById("cumMarginValue").textContent =
    formatCurrency(cumulativeMargin);
  document.getElementById("netVsCACValue").textContent =
    formatCurrency(netVsCAC);
  document.getElementById("gmPerPeriodValue").textContent =
    formatCurrency(gmFirstPeriod);

  const netVsCACTagEl = document.getElementById("netVsCACTag");
  if (netVsCAC > 0) {
    netVsCACTagEl.textContent = "Net positive contribution after CAC.";
  } else if (netVsCAC < 0) {
    netVsCACTagEl.textContent = "Still underwater vs CAC at this horizon.";
  } else {
    netVsCACTagEl.textContent = "Exactly breakeven vs CAC at this horizon.";
  }

  // Summary
  const summaryList = document.getElementById("summaryList");
  summaryList.innerHTML = "";

  const li1 = document.createElement("li");
  li1.textContent = `CAC per customer is ${formatCurrency(
    cac
  )}, with gross margin of ${grossMarginPct.toFixed(
    1
  )}% on an AOV of ${formatCurrency(aov)} and ${ordersPerPeriod.toFixed(
    2
  )} orders per ${timeUnitLabel(unit)}.`;
  summaryList.appendChild(li1);

  const li2 = document.createElement("li");
  li2.textContent = `Churn is ${churnPct.toFixed(
    1
  )}% per ${timeUnitLabel(
    unit
  )}, and cumulative discounted gross margin over ${horizon} ${timeUnitLabel(
    unit,
    horizon !== 1
  )} is ${formatCurrency(cumulativeMargin)} per customer.`;
  summaryList.appendChild(li2);

  const li3 = document.createElement("li");
  if (paybackPeriod !== null) {
    li3.textContent = `You reach payback around period ${paybackPeriod}, after which additional gross margin is net contribution.`;
  } else {
    li3.textContent = `You do not reach payback within the modeled horizon; consider lowering CAC, increasing margin, or improving retention.`;
  }
  summaryList.appendChild(li3);

  // Chart
  renderPaybackChart(labels, cumMarginSeries, cacSeries, unit);
}

/* ---------- chart ---------- */

function renderPaybackChart(labels, cumMarginSeries, cacSeries, unit) {
  const ctx = document.getElementById("paybackChart");
  if (!ctx) return;

  const config = {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Cumulative Gross Margin per Customer",
          data: cumMarginSeries,
          borderColor: "#38bdf8",
          backgroundColor: "rgba(56, 189, 248, 0.2)",
          borderWidth: 2,
          tension: 0.25,
          yAxisID: "y",
        },
        {
          label: "CAC per Customer",
          data: cacSeries,
          borderColor: "#f97373",
          backgroundColor: "rgba(249, 115, 115, 0.15)",
          borderWidth: 2,
          tension: 0,
          borderDash: [6, 4],
          yAxisID: "y",
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: "index",
        intersect: false,
      },
      plugins: {
        legend: {
          labels: {
            color: "#e5e7eb",
            font: { size: 11 },
          },
        },
        tooltip: {
          callbacks: {
            label(context) {
              const label = context.dataset.label || "";
              const value = context.parsed.y;
              return `${label}: ${formatCurrency(value)}`;
            },
          },
        },
      },
      scales: {
        x: {
          ticks: {
            color: "#9ca3af",
          },
          grid: {
            color: "rgba(55, 65, 81, 0.6)",
          },
          title: {
            display: true,
            text: `Period (${timeUnitLabel(unit)})`,
            color: "#9ca3af",
            font: { size: 11 },
          },
        },
        y: {
          position: "left",
          ticks: {
            color: "#9ca3af",
            callback: (value) => "$" + value.toFixed(0),
          },
          grid: {
            color: "rgba(31, 41, 55, 0.7)",
          },
        },
      },
    },
  };

  if (!paybackChart) {
    paybackChart = new Chart(ctx, config);
  } else {
    paybackChart.data.labels = labels;
    paybackChart.data.datasets[0].data = cumMarginSeries;
    paybackChart.data.datasets[1].data = cacSeries;
    paybackChart.options.scales.x.title.text = `Period (${timeUnitLabel(
      unit
    )})`;
    paybackChart.update();
  }
}

/* ---------- reset & CSV ---------- */

function resetPaybackInputs() {
  const form = document.getElementById("payback-form");
  if (form) form.reset();

  document.getElementById("timeUnit").value = "month";
  document.getElementById("horizon").value = "24";
  document.getElementById("cac").value = "80";
  document.getElementById("aov").value = "70";
  document.getElementById("ordersPerPeriod").value = "1";
  document.getElementById("grossMargin").value = "65";
  document.getElementById("churnRate").value = "8";
  document.getElementById("discountRate").value = "";

  syncHorizonLabel(24);
  resetSummary();
}

function downloadPaybackCsv() {
  const unit = document.getElementById("timeUnit").value || "month";
  const horizon = Math.max(parseNumber("horizon"), 1);

  const cac = parseNumber("cac");
  const aov = parseNumber("aov");
  const ordersPerPeriod = parseNumber("ordersPerPeriod");
  const grossMarginPct = parseNumber("grossMargin");
  const churnPct = parseNumber("churnRate");
  const discountPct = parseNumber("discountRate");

  if (cac <= 0 || aov <= 0 || ordersPerPeriod <= 0) return;
  if (grossMarginPct < 0 || grossMarginPct > 100) return;
  if (churnPct < 0 || churnPct >= 100) return;

  const churn = churnPct / 100;
  const marginRate = grossMarginPct / 100;
  const discountRate = discountPct > 0 ? discountPct / 100 : 0;

  let activeCustomers = 1;
  let cumulativeMargin = 0;

  let csv =
    "Period,Active Customers (relative),Discounted Margin,Cumulative Margin,CAC,Net vs CAC\n";

  for (let t = 1; t <= horizon; t++) {
    if (t === 1) {
      activeCustomers = 1;
    } else {
      activeCustomers = activeCustomers * (1 - churn);
    }

    const orders = activeCustomers * ordersPerPeriod;
    const revenue = orders * aov;
    const margin = revenue * marginRate;

    const discountFactor =
      discountRate > 0 ? 1 / Math.pow(1 + discountRate, t - 1) : 1;
    const discountedMargin = margin * discountFactor;

    cumulativeMargin += discountedMargin;
    const netVsCAC = cumulativeMargin - cac;

    csv += [
      t,
      activeCustomers.toFixed(4),
      discountedMargin.toFixed(2),
      cumulativeMargin.toFixed(2),
      cac.toFixed(2),
      netVsCAC.toFixed(2),
    ].join(",") + "\n";
  }

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "payback_calculator_output.csv";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/* ---------- boot ---------- */

document.addEventListener("DOMContentLoaded", () => {
  const horizonInput = document.getElementById("horizon");
  if (horizonInput) {
    syncHorizonLabel(horizonInput.value);
  }

  const inputsToWatch = [
    "timeUnit",
    "horizon",
    "cac",
    "aov",
    "ordersPerPeriod",
    "grossMargin",
    "churnRate",
    "discountRate",
  ];

  inputsToWatch.forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener("input", () => runPayback());
    el.addEventListener("change", () => runPayback());
  });

  resetSummary();
  runPayback();
});
