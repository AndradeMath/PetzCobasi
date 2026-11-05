/**
 * Orquestração: fluxo Fonte -> Tratamento -> Validação -> Cálculos ->
 * Regras de monitoramento -> Alertas -> Dashboard (item 25 do briefing).
 */
(function () {
  const STATE = {
    raw: { daily: { status: "not_configured", rows: [] }, hourly: { status: "not_configured", rows: [] }, errors: { status: "not_configured", rows: [] } },
    dailyRecords: [],
    quality: { totalProblemas: 0, totalRegistros: 0, percentualAfetado: "—", porTipo: [] },
    kpis: null,
    monitoringRows: [],
    alerts: [],
    alertHistory: [],
    thresholds: { ...window.APP_CONFIG.thresholds },
    lastFetch: null,
    lastGoodFetch: null,
    hasEverLoaded: false,
  };

  function loadThresholdOverrides() {
    try {
      const raw = localStorage.getItem("torreControleNPS_thresholds_v1");
      if (raw) STATE.thresholds = { ...STATE.thresholds, ...JSON.parse(raw) };
    } catch (e) { /* ignore */ }
  }
  function saveThresholdOverrides(newTh) {
    STATE.thresholds = { ...STATE.thresholds, ...newTh };
    try { localStorage.setItem("torreControleNPS_thresholds_v1", JSON.stringify(STATE.thresholds)); } catch (e) { /* ignore */ }
    recomputeAndRender();
  }

  function applyFilters(records, filters) {
    return records.filter(r =>
      (!filters.grupo || r.grupo === filters.grupo) &&
      (!filters.bandeira || r.bandeira === filters.bandeira) &&
      (!filters.jornada || r.jornada === filters.jornada)
    );
  }

  function groupByCombo(records) {
    const map = {};
    records.forEach(r => {
      const k = [r.grupo, r.bandeira, r.jornada].join("||");
      (map[k] = map[k] || []).push(r);
    });
    return map;
  }

  function buildMonitoringRows(dailyRecordsFiltered, referenceDate) {
    const combos = groupByCombo(dailyRecordsFiltered);
    const avgsByCombo = {};
    const rows = Object.keys(combos).map(comboKey => {
      const [grupo, bandeira, jornada] = comboKey.split("||");
      const row = window.Calc.buildMonitoringRow(grupo, bandeira, jornada, combos[comboKey], referenceDate);
      avgsByCombo[comboKey] = row.avgs;

      // status geral desta linha (usado na tabela e no resumo da Visão Geral)
      let status = "SEM_DADOS";
      if (row.regraEmDefinicao) status = "DEFINICAO";
      else if (row.semDisparoPrevisto) status = "SEM_DISPARO";
      else if (row.avaliavel) {
        if (row.mediaEsperada === null) status = "NORMAL"; // sem base de comparação ainda -> não acusa problema
        else {
          const ratio = row.mediaEsperada > 0 ? row.disparosHoje / row.mediaEsperada : 1;
          status = ratio < STATE.thresholds.CRITICAL_THRESHOLD ? "CRITICO" : ratio < STATE.thresholds.ATTENTION_THRESHOLD ? "ATENCAO" : "NORMAL";
        }
      }
      row.statusGeral = status;
      return row;
    });
    return { rows, avgsByCombo };
  }

  function groupHourlyByCombo(hourlyRecords) {
    const map = {};
    hourlyRecords.forEach(r => {
      const k = [r.grupo, r.bandeira, r.jornada].join("||");
      (map[k] = map[k] || []).push(r);
    });
    Object.values(map).forEach(arr => arr.sort((a, b) => a.datetime - b.datetime));
    return map;
  }

  function reconcileAlertHistory(newActiveAlerts) {
    // marca como "Resolvido" os alertas que estavam ativos e não aparecem mais
    const stillActiveKeys = new Set(newActiveAlerts.map(a => [a.tipo, a.bandeira, a.jornada].join("||")));
    STATE.alertHistory.forEach(h => {
      if (h.situacao === "Ativo") {
        const k = [h.tipo, h.bandeira, h.jornada].join("||");
        if (!stillActiveKeys.has(k)) h.situacao = "Resolvido";
      }
    });
    // adiciona os novos (evita duplicar os que já estão ativos com o mesmo motivo)
    const existingActiveKeys = new Set(STATE.alertHistory.filter(h => h.situacao === "Ativo").map(h => [h.tipo, h.bandeira, h.jornada].join("||")));
    newActiveAlerts.forEach(a => {
      const k = [a.tipo, a.bandeira, a.jornada].join("||");
      if (!existingActiveKeys.has(k)) STATE.alertHistory.unshift(a);
    });
    STATE.alertHistory = STATE.alertHistory.slice(0, 300);
  }

  function buildDayNote(rows) {
    const by = {};
    rows.forEach(r => { (by[r.bandeira] = by[r.bandeira] || []).push(r); });
    const fmtD = d => d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
    return Object.keys(by).map(b => {
      if (window.Rules.isPending(b)) return `${b}: regra de atualização em definição`;
      const lag = window.Rules.lagDays(b);
      const dates = by[b].filter(r => r.diaRec && r.dataRef).map(r => r.dataRef.getTime());
      const tag = lag ? `D+${lag}` : "no dia";
      return dates.length ? `${b}: ${fmtD(new Date(Math.max(...dates)))} (${tag})` : `${b}: sem dado atualizado`;
    }).join(" · ");
  }

  function recomputeAndRender() {
    const filters = window.UI.currentFilters();
    const filtered = applyFilters(STATE.dailyRecords, filters);
    const now = new Date();

    STATE.kpis = window.Calc.computeKPIs(filtered);
    STATE.range = window.Calc.resolveRange(filters.periodo, filters.dateFrom, filters.dateTo, now);
    const { rows, avgsByCombo } = buildMonitoringRows(filtered, now);
    STATE.monitoringRows = rows;

    rows.forEach(r => {
      r.periodTotals = window.Calc.computePeriodTotals(window.History.getHistory(r.grupo, r.bandeira, r.jornada), STATE.range);
    });
    const agg = window.Calc.aggregatePeriods(rows.map(r => r.periodTotals));
    STATE.periodKPI = { block: agg.block, days: agg.days, rangeDays: STATE.range.days };

    // KPI "Dia": soma o dia de referência de cada jornada (D+1 etc.), sem usar fonte desatualizada
    const diaRecs = rows.map(r => r.diaRec).filter(Boolean);
    STATE.kpis.hoje = {
      disparos: window.Calc.sum(diaRecs, "disparos"), respondentes: window.Calc.sum(diaRecs, "respondentes"),
      promotores: window.Calc.sum(diaRecs, "promotores"), neutros: window.Calc.sum(diaRecs, "neutros"),
      detratores: window.Calc.sum(diaRecs, "detratores"),
    };
    STATE.dayNote = buildDayNote(rows);
    const bandeirasNoEscopo = [...new Set(rows.map(r => r.bandeira))];
    const semResp = bandeirasNoEscopo.filter(b => !window.Rules.hasResponses(b));
    STATE.responsesAllNA = bandeirasNoEscopo.length > 0 && semResp.length === bandeirasNoEscopo.length;
    STATE.responsesPartialNA = semResp.length > 0 && !STATE.responsesAllNA;

    const hourlyByCombo = groupHourlyByCombo(STATE.hourlyRecords || []);

    let newAlerts = window.Alerts.evaluateAll({
      monitoringRows: rows,
      th: STATE.thresholds,
      now,
      hourlyByCombo,
      hourlySourceStatus: STATE.raw.hourly.status,
      errorRecords: STATE.errorRecords || [],
      errorsSourceStatus: STATE.raw.errors.status,
      avgsByCombo,
    });

    if (filters.status) newAlerts = newAlerts.filter(a => a.status === filters.status);

    STATE.alerts = newAlerts;
    reconcileAlertHistory(newAlerts);

    window.UI.renderHeader(STATE);
    window.UI.renderOverview(STATE);
    window.UI.renderMonitoring(STATE, window.UI.showDrillDown);
    window.UI.renderAlerts(STATE);
    window.UI.renderAnalyses(STATE);
    window.UI.renderQuality(STATE);
    window.UI.renderConfig(STATE, saveThresholdOverrides);
    window.UI.renderRules();

    document.getElementById("alertCountBadge").textContent = STATE.alerts.length;
  }

  async function refreshData() {
    const btn = document.getElementById("btnRefresh");
    btn.disabled = true;
    btn.textContent = "🔄 Atualizando...";

    const result = await window.DataSource.fetchAll();
    STATE.raw = result;
    STATE.lastFetch = result.fetchedAt;

    if (result.usingDemo && !STATE.demoSeeded && window.seedDemoHistory) {
      window.seedDemoHistory();
      STATE.demoSeeded = true;
    }

    if (result.daily.ok) {
      const { records, issues } = window.Mapping.mapDailySheet(result.daily.rows);
      STATE.dailyRecords = records;
      STATE.quality = window.Quality.summarize(issues, records.length);
      window.History.recordDailySnapshot(records);
      STATE.lastGoodFetch = result.fetchedAt;
      STATE.hasEverLoaded = true;
    } else if (!STATE.hasEverLoaded) {
      STATE.dailyRecords = [];
    } // se já tinha carregado antes e falhou agora, preserva os dados antigos (item 21/35)

    if (result.hourly.ok) {
      const { records } = window.Mapping.mapHourlySheet(result.hourly.rows);
      STATE.hourlyRecords = records;
    }
    if (result.errors.ok) {
      const { records } = window.Mapping.mapErrorsSheet(result.errors.rows);
      STATE.errorRecords = records;
    }

    window.UI.populateFilters(STATE, recomputeAndRender);
    recomputeAndRender();

    btn.disabled = false;
    btn.textContent = "🔄 Atualizar dados";
  }

  function exportCSV() {
    const rows = STATE.monitoringRows;
    const header = ["Grupo", "Bandeira", "Jornada", "Data Ref.", "Disparos (dia ref.)", "Média Esperada", "Variação %", `Disparos no Período (${STATE.range ? STATE.range.label : "todo"})`, "Status"];
    const lines = [header.join(";")].concat(rows.map(r => [
      r.grupo, r.bandeira, r.jornada,
      r.dataRef ? r.dataRef.toLocaleDateString("pt-BR") : "",
      r.disparosHoje ?? "", r.mediaEsperada !== null ? Math.round(r.mediaEsperada) : "",
      r.variacaoPct !== null ? r.variacaoPct.toFixed(1) : "",
      r.periodTotals && r.periodTotals.days > 0 ? r.periodTotals.disparos : "", r.statusGeral,
    ].join(";")));
    const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `torre_controle_nps_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  }

  function bindGlobalUI() {
    document.getElementById("btnRefresh").addEventListener("click", refreshData);
    document.getElementById("btnExportCSV").addEventListener("click", exportCSV);
    document.getElementById("drillClose").addEventListener("click", window.UI.hideDrillDown);
    document.getElementById("drillModal").addEventListener("click", (e) => { if (e.target.id === "drillModal") window.UI.hideDrillDown(); });
    document.getElementById("monitoringSort").addEventListener("change", recomputeAndRender);
    window.UI.bindTabs();
  }

  function startAutoRefresh() {
    const minutes = window.APP_CONFIG.autoRefreshMinutes;
    if (!minutes || minutes <= 0) return;
    setInterval(refreshData, minutes * 60 * 1000);
  }

  async function init() {
    loadThresholdOverrides();
    window.UI.populateFilters(STATE, recomputeAndRender);
    bindGlobalUI();
    await refreshData();
    startAutoRefresh();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
