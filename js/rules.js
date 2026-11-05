/**
 * Regras de negócio por bandeira/jornada (lidas de APP_CONFIG.bandeiraRules).
 * Centraliza: atraso da base (D+N), bandeiras sem respostas, dias sem disparo
 * e dias de reposição. Nenhuma outra parte do código tem "if Petz" fixo.
 */
window.Rules = (function () {
  const DEFAULT = { dataLagDays: 0, hasResponses: true };
  function cfg(b) { return (window.APP_CONFIG.bandeiraRules || {})[b] || DEFAULT; }
  function startOfDay(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }

  function lagDays(b) { const v = cfg(b).dataLagDays; return v === undefined ? 0 : v; } // null = em definição
  function isPending(b) { return lagDays(b) === null; }
  function hasResponses(b) { return cfg(b).hasResponses !== false; }

  /** Dia que "deveria" estar na planilha hoje (hoje - atraso). */
  function referenceDate(b, now) {
    const d = startOfDay(now);
    const l = lagDays(b);
    if (l) d.setDate(d.getDate() - l);
    return d;
  }

  function journeyRule(b, j) { const o = cfg(b).journeyOverrides; return (o && o[j]) || null; }
  function hasJourneyOverride(b, j) { return !!journeyRule(b, j); }
  function isNoDispatchDay(b, j, date) {
    const r = journeyRule(b, j);
    return !!(r && r.noDispatchWeekdays && r.noDispatchWeekdays.includes(date.getDay()));
  }
  function isCatchUpDay(b, j, date) {
    const r = journeyRule(b, j);
    return !!(r && r.catchUpWeekdays && r.catchUpWeekdays.includes(date.getDay()));
  }
  /** Último dia com disparo previsto em/antes de `date`. */
  function lastDispatchDay(b, j, date) {
    const d = new Date(date);
    for (let g = 0; g < 7 && isNoDispatchDay(b, j, d); g++) d.setDate(d.getDate() - 1);
    return d;
  }
  /** Quais dias do histórico NÃO devem entrar na média de um dia-alvo. */
  function baselineExclusion(b, j, target) {
    const targetCatchUp = isCatchUpDay(b, j, target);
    return h => isNoDispatchDay(b, j, h) || (!targetCatchUp && isCatchUpDay(b, j, h));
  }

  function describe() {
    const rules = window.APP_CONFIG.bandeiraRules || {};
    return Object.keys(window.APP_CONFIG.orgStructure).map(b => {
      const linhas = [];
      const l = lagDays(b);
      if (l === null) linhas.push("Regra de atualização da base <strong>em definição</strong>: os volumes são exibidos, mas não há avaliação nem alertas de volume até a regra ser definida.");
      else if (l === 0) linhas.push("Dados disponíveis no próprio dia (D+0).");
      else linhas.push(`Dados puxados em <strong>D+${l}</strong>: o dia de referência é ${l} dia(s) antes de hoje; a ausência do dado de hoje é esperada.`);
      if (!hasResponses(b)) linhas.push("Somente volume de disparos: respostas e NPS não se aplicam (contabilizadas pela data da compra, não da resposta).");
      const ov = (rules[b] && rules[b].journeyOverrides) || {};
      Object.keys(ov).forEach(j => linhas.push(`<strong>${j}</strong>: ${ov[j].descricao || ""}`));
      return { bandeira: b, linhas };
    });
  }

  return { lagDays, isPending, hasResponses, referenceDate, hasJourneyOverride, isNoDispatchDay, isCatchUpDay, lastDispatchDay, baselineExclusion, describe };
})();
