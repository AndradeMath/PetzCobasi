/**
 * A aba Base_NPS traz Periodo=Dia apenas com o valor de HOJE (não um
 * histórico). Para calcular médias reais (histórica, 7 dias, mesmo dia
 * da semana) sem inventar números, o dashboard acumula, no navegador
 * (localStorage), um snapshot por dia a cada vez que os dados forem
 * atualizados. Com o uso contínuo, o histórico cresce organicamente.
 *
 * Isso é complementar, não substitui uma fonte "hourly" real: quando
 * a fonte horária/erros existir (config.dataSources.hourly/errors),
 * o dashboard passa a usar dados reais também para essas visões.
 */
window.History = (function () {
  const KEY = "torreControleNPS_history_v1";

  function loadRaw() {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  }

  function saveRaw(obj) {
    try { localStorage.setItem(KEY, JSON.stringify(obj)); } catch (e) { /* quota excedida: ignora silenciosamente */ }
  }

  function keyFor(grupo, bandeira, jornada) {
    return [grupo, bandeira, jornada].join("||");
  }

  // Datas sempre em horário LOCAL (evita deslocar o dia em fusos como o do Brasil)
  function isoDate(d) {
    const p = n => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }
  function parseISO(s) {
    const [y, m, d] = s.split("-").map(Number);
    return new Date(y, m - 1, d);
  }

  /** Grava os registros do dia (Periodo=Dia) no histórico local. */
  function recordDailySnapshot(dailyRecords) {
    const store = loadRaw();
    const retentionMs = window.APP_CONFIG.historyRetentionDays * 24 * 3600 * 1000;
    const cutoff = Date.now() - retentionMs;

    dailyRecords
      .filter(r => r.periodo === "Dia" && r.dataRef instanceof Date && !isNaN(r.dataRef) && !r.semDados)
      .forEach(r => {
        const k = keyFor(r.grupo, r.bandeira, r.jornada);
        if (!store[k]) store[k] = {};
        const dISO = isoDate(r.dataRef);
        store[k][dISO] = {
          disparos: r.disparos, respondentes: r.respondentes,
          promotores: r.promotores, neutros: r.neutros, detratores: r.detratores,
          savedAt: Date.now(),
        };
      });

    // limpeza de snapshots antigos
    Object.keys(store).forEach(k => {
      Object.keys(store[k]).forEach(dISO => {
        const t = parseISO(dISO).getTime();
        if (t < cutoff) delete store[k][dISO];
      });
    });

    saveRaw(store);
  }

  /** Retorna array ordenado [{date: Date, disparos, ...}] para uma combinação. */
  function getHistory(grupo, bandeira, jornada) {
    const store = loadRaw();
    const k = keyFor(grupo, bandeira, jornada);
    const obj = store[k] || {};
    return Object.keys(obj)
      .map(dISO => ({ date: parseISO(dISO), ...obj[dISO] }))
      .sort((a, b) => a.date - b.date);
  }

  /**
   * Calcula médias a partir do histórico acumulado, relativas a uma
   * data de referência (normalmente "hoje", excluindo hoje do cálculo).
   * Retorna null nos campos cuja base de observações for insuficiente,
   * em vez de estimar com poucos dados.
   */
  function computeAverages(history, referenceDate, excludeFn) {
    const min = window.APP_CONFIG.thresholds.MIN_HISTORY_POINTS;
    const minWeekday = window.APP_CONFIG.thresholds.MIN_HISTORY_POINTS_WEEKDAY_AVG;

    const before = history
      .filter(h => isoDate(h.date) !== isoDate(referenceDate) && h.date < referenceDate)
      .filter(h => !excludeFn || !excludeFn(h.date)); // ex.: domingos/segundas do CD da Petz

    const last7 = before.filter(h => (referenceDate - h.date) <= 7 * 24 * 3600 * 1000);
    const sameWeekday = before.filter(h => h.date.getDay() === referenceDate.getDay());

    function avgOf(arr) {
      const vals = arr.map(h => h.disparos).filter(v => v !== null && v !== undefined);
      if (vals.length === 0) return null;
      return vals.reduce((a, b) => a + b, 0) / vals.length;
    }

    return {
      historicalAvg: before.length >= min ? avgOf(before) : null,
      historicalCount: before.length,
      avg7d: last7.length >= min ? avgOf(last7) : null,
      avg7dCount: last7.length,
      sameWeekdayAvg: sameWeekday.length >= minWeekday ? avgOf(sameWeekday) : null,
      sameWeekdayCount: sameWeekday.length,
    };
  }

  function clearAll() {
    try { localStorage.removeItem(KEY); } catch (e) { /* noop */ }
  }

  return { recordDailySnapshot, getHistory, computeAverages, clearAll };
})();
