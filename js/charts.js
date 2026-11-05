/**
 * Renderização de gráficos (Chart.js). Mantém as instâncias em um
 * registro para poder destruir/recriar ao atualizar os dados, evitando
 * vazamento de memória e gráficos "fantasma".
 */
window.Charts = (function () {
  const instances = {};
  const COLORS = { normal: "#16a34a", atencao: "#d97706", critico: "#dc2626", neutro: "#94a3b8", primary: "#2563eb", secondary: "#7c3aed" };

  function upsert(canvasId, config) {
    if (instances[canvasId]) instances[canvasId].destroy();
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;
    instances[canvasId] = new Chart(ctx, config);
  }

  function evolutionLine(canvasId, historySeries) {
    // historySeries: [{label, data:[{x:Date,y:num}]}]
    upsert(canvasId, {
      type: "line",
      data: {
        datasets: historySeries.map((s, i) => ({
          label: s.label,
          data: s.data,
          borderColor: [COLORS.primary, COLORS.secondary, COLORS.normal, COLORS.atencao][i % 4],
          backgroundColor: "transparent",
          tension: 0.25,
          pointRadius: 3,
        })),
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        scales: { x: { type: "time", time: { unit: "day" }, title: { display: true, text: "Data" } }, y: { beginAtZero: true, title: { display: true, text: "Disparos" } } },
        plugins: { legend: { position: "bottom" } },
      },
    });
  }

  function barByCategory(canvasId, labels, data, label) {
    upsert(canvasId, {
      type: "bar",
      data: { labels, datasets: [{ label, data, backgroundColor: COLORS.primary }] },
      options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true } }, plugins: { legend: { display: false } } },
    });
  }

  function realVsExpected(canvasId, labels, real, esperado) {
    upsert(canvasId, {
      type: "bar",
      data: {
        labels,
        datasets: [
          { label: "Real (hoje)", data: real, backgroundColor: COLORS.primary },
          { label: "Esperado", data: esperado, backgroundColor: COLORS.neutro },
        ],
      },
      options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true } }, plugins: { legend: { position: "bottom" } } },
    });
  }

  function responsesDoughnut(canvasId, promotores, neutros, detratores) {
    upsert(canvasId, {
      type: "doughnut",
      data: {
        labels: ["Promotores", "Neutros", "Detratores"],
        datasets: [{ data: [promotores || 0, neutros || 0, detratores || 0], backgroundColor: [COLORS.normal, COLORS.neutro, COLORS.critico] }],
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: "bottom" } } },
    });
  }

  return { evolutionLine, barByCategory, realVsExpected, responsesDoughnut };
})();
