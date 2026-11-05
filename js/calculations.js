/**
 * Motor de cálculos: KPIs agregados e métricas de monitoramento por
 * jornada. Não decide alertas (isso é js/alerts.js) — só calcula números.
 */
window.Calc = (function () {

  function sum(arr, field) {
    const vals = arr.map(r => r[field]).filter(v => v !== null && v !== undefined);
    if (vals.length === 0) return null;
    return vals.reduce((a, b) => a + b, 0);
  }

  /** KPIs agregados (Hoje/Semana/Mês) para um conjunto de registros já filtrado. */
  function computeKPIs(dailyRecords) {
    const hoje = dailyRecords.filter(r => r.periodo === "Dia");
    const semana = dailyRecords.filter(r => r.periodo === "Semana");
    const mes = dailyRecords.filter(r => r.periodo === "Mês");

    function block(arr) {
      return {
        disparos: sum(arr, "disparos"),
        respondentes: sum(arr, "respondentes"),
        promotores: sum(arr, "promotores"),
        neutros: sum(arr, "neutros"),
        detratores: sum(arr, "detratores"),
      };
    }

    return { hoje: block(hoje), semana: block(semana), mes: block(mes) };
  }

  /** NPS = %Promotores - %Detratores, sobre respondentes. */
  function computeNPS(block) {
    if (!block || !block.respondentes) return null;
    const pct = v => (v || 0) / block.respondentes * 100;
    return Math.round(pct(block.promotores) - pct(block.detratores));
  }

  function sameDay(a, b) {
    return !!a && !!b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }

  /**
   * Linha de monitoramento por Bandeira/Jornada, aplicando as regras de
   * negócio (js/rules.js): dia de referência (D+N), dia sem disparo,
   * dia de reposição e regra em definição.
   * dataStatus: ok | stale (base mais antiga que o esperado) | missing | indefinido
   */
  function buildMonitoringRow(grupo, bandeira, jornada, dailyRecordsForCombo, now) {
    const R = window.Rules;
    const pending = R.isPending(bandeira);
    const ref = R.referenceDate(bandeira, now); // dia que deveria estar na planilha
    const mesRec = dailyRecordsForCombo.find(r => r.periodo === "Mês");
    const semanaRec = dailyRecordsForCombo.find(r => r.periodo === "Semana");

    const diaRecs = dailyRecordsForCombo.filter(r => r.periodo === "Dia");
    const dated = diaRecs.filter(r => r.dataRef instanceof Date && !isNaN(r.dataRef)).sort((a, b) => b.dataRef - a.dataRef);
    const chosen = dated.find(r => sameDay(r.dataRef, ref)) || dated[0] || diaRecs[0] || null;
    const chosenDate = chosen && chosen.dataRef instanceof Date && !isNaN(chosen.dataRef) ? startOfDay(chosen.dataRef) : null;
    const hasValues = !!chosen && !chosen.semDados;

    const noDispatch = !pending && R.isNoDispatchDay(bandeira, jornada, ref);
    const expectedLast = R.lastDispatchDay(bandeira, jornada, ref);
    let dataStatus;
    if (pending) dataStatus = hasValues ? "indefinido" : "missing";
    else if (noDispatch) dataStatus = "ok"; // não há disparo previsto: ausência de dado é normal
    else if (!chosen) dataStatus = "missing";
    else if (chosenDate && chosenDate < expectedLast) dataStatus = "stale";
    else dataStatus = hasValues ? "ok" : "missing";

    const dataDate = (chosenDate && dataStatus !== "stale") ? chosenDate : ref;
    const catchUp = !pending && R.isCatchUpDay(bandeira, jornada, dataDate);
    const hist = window.History.getHistory(grupo, bandeira, jornada);
    const avgs = window.History.computeAverages(hist, dataDate, R.baselineExclusion(bandeira, jornada, dataDate));

    const usable = (dataStatus === "ok" || dataStatus === "indefinido") && !noDispatch && hasValues;
    const value = usable && chosen.disparos !== null ? chosen.disparos : null;

    let expected = null, expectedSource = null, isEstimate = false;
    if (!pending && !noDispatch && dataStatus !== "stale") {
      if (catchUp) {
        // dia de reposição: só vale comparar com o mesmo dia da semana
        expected = avgs.sameWeekdayAvg;
        expectedSource = expected !== null ? "mesmo dia da semana (dia de reposição)" : null;
      } else {
        expected = avgs.sameWeekdayAvg ?? avgs.avg7d ?? avgs.historicalAvg ?? null;
        expectedSource = avgs.sameWeekdayAvg !== null ? "mesmo dia da semana"
          : avgs.avg7d !== null ? "últimos 7 dias"
          : avgs.historicalAvg !== null ? "histórico geral" : null;
        // estimativa (rotulada) só para jornadas sem regra especial de calendário
        if (expected === null && mesRec && mesRec.disparos && !R.hasJourneyOverride(bandeira, jornada)) {
          const dias = dataDate.getDate();
          if (dias > 0) { expected = mesRec.disparos / dias; expectedSource = "estimativa (total do mês / dias corridos)"; isEstimate = true; }
        }
      }
    }

    const avaliavel = !pending && !noDispatch && dataStatus === "ok" && value !== null;
    const variacaoPct = (avaliavel && expected) ? ((value - expected) / expected) * 100 : null;

    return {
      grupo, bandeira, jornada,
      dataRef: chosenDate, refEsperada: ref, ultimaData: chosenDate, lagDays: R.lagDays(bandeira),
      dataStatus, avaliavel, catchUpDay: catchUp, semDisparoPrevisto: noDispatch, regraEmDefinicao: pending,
      semRespostas: !R.hasResponses(bandeira),
      disparosHoje: value,
      semDadosHoje: value === null && !noDispatch,
      diaRec: usable ? chosen : null,
      avgs,
      mediaEsperada: expected,
      mediaEsperadaFonte: expectedSource,
      isEstimativa: isEstimate,
      variacaoPct,
      historicoDias: avgs.historicalCount,
      disparosSemana: semanaRec ? semanaRec.disparos : null,
      disparosMes: mesRec ? mesRec.disparos : null,
      npsMes: (mesRec && R.hasResponses(bandeira)) ? computeNPS(mesRec) : null,
    };
  }

  // ---------------- FILTRO DE DATAS ----------------
  const FIELDS = ["disparos", "respondentes", "promotores", "neutros", "detratores"];
  const pad = n => String(n).padStart(2, "0");
  function isoLocal(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
  function startOfDay(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
  function parseInputDate(s) {
    const m = String(s || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
  }

  /** Converte a seleção de período em {from, to, label, days}. from/to nulos = sem limite. */
  function resolveRange(preset, fromStr, toStr, now) {
    const today = startOfDay(now);
    const br = d => d.toLocaleDateString("pt-BR");
    const back = n => { const f = new Date(today); f.setDate(f.getDate() - (n - 1)); return f; };
    switch (preset) {
      case "today": return { from: today, to: today, label: "Hoje", days: 1 };
      case "7d": return { from: back(7), to: today, label: "Últimos 7 dias", days: 7 };
      case "30d": return { from: back(30), to: today, label: "Últimos 30 dias", days: 30 };
      case "month": return { from: new Date(today.getFullYear(), today.getMonth(), 1), to: today, label: "Mês atual", days: today.getDate() };
      case "custom": {
        let f = parseInputDate(fromStr), t = parseInputDate(toStr);
        if (!f && !t) return { from: null, to: null, label: "Todo o histórico", days: null };
        if (f && t && f > t) { const x = f; f = t; t = x; }
        return { from: f, to: t, label: `${f ? br(f) : "início"} a ${t ? br(t) : "hoje"}`, days: f && t ? Math.round((t - f) / 86400000) + 1 : null };
      }
      default: return { from: null, to: null, label: "Todo o histórico", days: null };
    }
  }

  function inRange(date, range) {
    if (!range || (!range.from && !range.to)) return true;
    const d = startOfDay(date);
    if (range.from && d < range.from) return false;
    if (range.to && d > range.to) return false;
    return true;
  }

  /** Soma o histórico diário dentro do período. Sem nenhum dia => valores null (não zero). */
  function computePeriodTotals(history, range) {
    const inside = history.filter(h => inRange(h.date, range));
    const out = { days: inside.length, dates: inside.map(h => isoLocal(h.date)) };
    FIELDS.forEach(f => {
      const vals = inside.map(h => h[f]).filter(v => v !== null && v !== undefined);
      out[f] = vals.length ? vals.reduce((a, b) => a + b, 0) : null;
    });
    return out;
  }

  function aggregatePeriods(list) {
    const block = {}; const dates = new Set();
    FIELDS.forEach(f => { block[f] = null; });
    list.forEach(p => {
      if (!p) return;
      FIELDS.forEach(f => { if (p[f] !== null && p[f] !== undefined) block[f] = (block[f] || 0) + p[f]; });
      p.dates.forEach(d => dates.add(d));
    });
    return { block, days: dates.size };
  }

  return { computeKPIs, computeNPS, buildMonitoringRow, sum, resolveRange, inRange, computePeriodTotals, aggregatePeriods };
})();
