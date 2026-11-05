/**
 * Motor de regras de alerta. Recebe as linhas de monitoramento já
 * calculadas (js/calculations.js) + dados horários/erros (se existirem)
 * e devolve a lista de alertas ativos, cada um com status, motivo(s)
 * e todos os campos pedidos pela Central de Alertas.
 *
 * Regra de ouro (item 37 do briefing): sem histórico suficiente, o
 * motor NÃO gera alerta de queda/pico — mostra "Histórico insuficiente".
 */
window.Alerts = (function () {

  function statusColor(status) {
    return { NORMAL: "🟢", ATENCAO: "🟡", CRITICO: "🔴", SEM_DADOS: "⚪" }[status] || "⚪";
  }

  /** Dado desatualizado: base mais antiga que o esperado pela regra da bandeira (ex.: D+1). */
  function checkStaleData(row) {
    if (row.dataStatus !== "stale" || row.regraEmDefinicao) return null;
    const br = d => d.toLocaleDateString("pt-BR");
    return {
      status: "ATENCAO",
      tipo: "Dado desatualizado",
      grupo: row.grupo, bandeira: row.bandeira, jornada: row.jornada,
      valorAtual: null, valorEsperado: null, variacao: null,
      motivo: `Último dado disponível é de ${br(row.ultimaData)}; esperado até ${br(row.refEsperada)}${row.lagDays ? ` (regra D+${row.lagDays})` : ""}. Indica atraso da base, não ausência de disparos.`,
    };
  }

  /** Alerta 1: queda de volume vs. média esperada do dia. */
  function checkVolumeDrop(row, th) {
    if (!row.avaliavel) return null; // fonte desatualizada / dia sem disparo / regra em definição != queda real
    if (row.mediaEsperada === null || row.disparosHoje === null) return null;
    if (row.mediaEsperada <= 0) return null;

    const ratio = row.disparosHoje / row.mediaEsperada;
    let status = null;
    if (ratio < th.CRITICAL_THRESHOLD) status = "CRITICO";
    else if (ratio < th.ATTENTION_THRESHOLD) status = "ATENCAO";
    if (!status) return null;

    return {
      status,
      tipo: "Queda de volume",
      grupo: row.grupo, bandeira: row.bandeira, jornada: row.jornada,
      valorAtual: row.disparosHoje,
      valorEsperado: Math.round(row.mediaEsperada),
      variacao: `${row.variacaoPct.toFixed(1)}%`,
      motivo: `Disparos de ${row.dataRef ? row.dataRef.toLocaleDateString("pt-BR") : "hoje"} (${row.disparosHoje}) representam ${(ratio * 100).toFixed(0)}% da média esperada (${row.mediaEsperadaFonte}${row.isEstimativa ? ", estimativa" : ""}).`,
    };
  }

  /** Alerta: queda vs. média dos últimos 7 dias. */
  function checkSevenDayDrop(row, th, avgs) {
    if (!row.avaliavel || row.catchUpDay) return null; // dia de reposição não usa média de 7 dias/histórico
    if (!avgs || avgs.avg7d === null || row.disparosHoje === null || avgs.avg7d <= 0) return null;
    const drop = (avgs.avg7d - row.disparosHoje) / avgs.avg7d;
    if (drop <= th.SEVEN_DAY_DROP_THRESHOLD) return null;
    return {
      status: drop > th.SEVEN_DAY_DROP_THRESHOLD * 1.5 ? "CRITICO" : "ATENCAO",
      tipo: "Queda vs. últimos 7 dias",
      grupo: row.grupo, bandeira: row.bandeira, jornada: row.jornada,
      valorAtual: row.disparosHoje,
      valorEsperado: Math.round(avgs.avg7d),
      variacao: `-${(drop * 100).toFixed(1)}%`,
      motivo: `Queda de ${(drop * 100).toFixed(1)}% frente à média dos últimos 7 dias (${avgs.avg7dCount} dias observados).`,
    };
  }

  /** Alerta: pico anormal vs. média histórica. */
  function checkAnomalousSpike(row, th, avgs) {
    if (!row.avaliavel || row.catchUpDay) return null; // dia de reposição não usa média de 7 dias/histórico
    const base = avgs && avgs.historicalAvg;
    if (!base || row.disparosHoje === null || base <= 0) return null;
    const ratio = row.disparosHoje / base;
    if (ratio < th.ANOMALOUS_SPIKE_MULTIPLIER) return null;
    return {
      status: "ATENCAO",
      tipo: "Pico anormal",
      grupo: row.grupo, bandeira: row.bandeira, jornada: row.jornada,
      valorAtual: row.disparosHoje,
      valorEsperado: Math.round(base),
      variacao: `+${((ratio - 1) * 100).toFixed(0)}%`,
      motivo: `Volume ${ratio.toFixed(1)}x acima da média histórica (${avgs.historicalCount} dias observados).`,
    };
  }

  /**
   * Alerta: ausência de disparos por N horas — exige fonte "hourly".
   * Sem essa fonte, retorna um alerta informativo único (não por jornada)
   * avisando que a checagem horária está desabilitada, em vez de simular.
   */
  function checkNoDispatch(hourlyByCombo, sourceStatus, th, now) {
    if (sourceStatus !== "connected") return []; // sem fonte confiável -> não afirma nada
    const alerts = [];
    Object.keys(hourlyByCombo).forEach(comboKey => {
      const [grupo, bandeira, jornada] = comboKey.split("||");
      // base com atraso (D+N) ou regra em definição: não dá para afirmar ausência em tempo real
      if (window.Rules.lagDays(bandeira) !== 0) return;
      const records = hourlyByCombo[comboKey].filter(r => r.disparos !== null);
      if (records.length === 0) return;
      const last = records[records.length - 1];
      const hoursSince = (now - last.datetime) / 3600000;
      // só considera "ausência" se essa jornada normalmente tem disparos
      const hasHistory = records.length >= 5;
      if (hasHistory && hoursSince >= th.NO_DISPATCH_HOURS) {
        alerts.push({
          status: hoursSince >= th.NO_DISPATCH_HOURS * 2 ? "CRITICO" : "ATENCAO",
          tipo: "Ausência de disparos",
          grupo, bandeira, jornada,
          valorAtual: 0,
          valorEsperado: null,
          variacao: null,
          motivo: `Sem nenhum disparo há ${hoursSince.toFixed(1)}h (último em ${last.datetime.toLocaleString("pt-BR")}).`,
        });
      }
    });
    return alerts;
  }

  /** Alerta: erro recorrente — exige fonte "errors". */
  function checkRecurringErrors(errorRecords, sourceStatus, th, now) {
    if (sourceStatus !== "connected") return [];
    const windowMs = th.RECURRING_ERROR_WINDOW_HOURS * 3600000;
    const groups = {};
    errorRecords.forEach(e => {
      const key = [e.grupo, e.bandeira, e.jornada, e.tipoErro].join("||");
      (groups[key] = groups[key] || []).push(e);
    });

    const alerts = [];
    Object.keys(groups).forEach(key => {
      const [grupo, bandeira, jornada, tipoErro] = key.split("||");
      const events = groups[key].filter(e => (now - e.datetime) <= windowMs).sort((a, b) => a.datetime - b.datetime);
      const total = events.reduce((s, e) => s + (e.quantidade || 1), 0);
      if (total > th.RECURRING_ERROR_COUNT && events.length > 0) {
        alerts.push({
          status: "ATENCAO",
          tipo: "Erro recorrente",
          grupo, bandeira, jornada,
          valorAtual: total,
          valorEsperado: th.RECURRING_ERROR_COUNT,
          variacao: null,
          motivo: `Erro recorrente identificado em ${bandeira} / ${jornada}: "${tipoErro}" — ${total} ocorrências na última ${th.RECURRING_ERROR_WINDOW_HOURS}h.`,
          primeiraOcorrencia: events[0].datetime,
          ultimaOcorrencia: events[events.length - 1].datetime,
        });
      }
    });
    return alerts;
  }

  /**
   * Roda todas as regras para todas as linhas de monitoramento e
   * devolve a lista consolidada de alertas ativos, já com id, timestamp
   * e status normalizado.
   */
  function evaluateAll({ monitoringRows, th, now, hourlyByCombo, hourlySourceStatus, errorRecords, errorsSourceStatus, avgsByCombo }) {
    const out = [];

    monitoringRows.forEach(row => {
      const comboKey = [row.grupo, row.bandeira, row.jornada].join("||");
      const avgs = avgsByCombo[comboKey];

      [checkStaleData(row), checkVolumeDrop(row, th), checkSevenDayDrop(row, th, avgs), checkAnomalousSpike(row, th, avgs)]
        .filter(Boolean)
        .forEach(a => out.push(a));
    });

    checkNoDispatch(hourlyByCombo || {}, hourlySourceStatus, th, now).forEach(a => out.push(a));
    checkRecurringErrors(errorRecords || [], errorsSourceStatus, th, now).forEach(a => out.push(a));

    return out.map((a, i) => ({
      id: `alert_${now.getTime()}_${i}`,
      data: now.toLocaleDateString("pt-BR"),
      hora: now.toLocaleTimeString("pt-BR"),
      situacao: "Ativo",
      ts: now.getTime(),
      icone: statusColor(a.status),
      ...a,
    }));
  }

  return { evaluateAll, statusColor };
})();
