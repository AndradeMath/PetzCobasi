/**
 * Camada de UI: pega o "state" já calculado (main.js monta) e renderiza
 * cada seção do dashboard. Não faz cálculo de negócio aqui — só exibe.
 */
window.UI = (function () {
  let lastRange = null;

  function fmt(n) {
    if (n === null || n === undefined || Number.isNaN(n)) return "—";
    return Math.round(n).toLocaleString("pt-BR");
  }
  function fmtPct(n) {
    if (n === null || n === undefined || Number.isNaN(n)) return "—";
    const sign = n > 0 ? "+" : "";
    return `${sign}${n.toFixed(1)}%`;
  }
  function el(html) {
    const t = document.createElement("template");
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  }
  function fmtDate(d) { return d ? d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) : "—"; }
  function diaCell(r) {
    if (r.semDisparoPrevisto) return "Sem disparo previsto";
    if (r.dataStatus === "stale") return `Fonte desatualizada (último: ${fmtDate(r.ultimaData)})`;
    if (r.semDadosHoje) return "Sem dados";
    return fmt(r.disparosHoje);
  }
  function expectedCell(r) {
    if (r.regraEmDefinicao) return "Regra em definição";
    if (r.semDisparoPrevisto) return "—";
    if (r.mediaEsperada === null) return r.catchUpDay ? "Histórico insuficiente (dia de reposição)" : "Histórico insuficiente";
    return fmt(r.mediaEsperada) + (r.isEstimativa ? " *" : "");
  }
  function dataRefCell(r) {
    const tag = r.regraEmDefinicao ? "regra em definição" : (r.lagDays ? `D+${r.lagDays}` : "D+0");
    return `${fmtDate(r.dataRef || r.refEsperada)} <span class="muted">(${tag})</span>`;
  }

  function statusBadge(status) {
    const map = {
      NORMAL: '<span class="badge badge-normal">🟢 Normal</span>',
      ATENCAO: '<span class="badge badge-atencao">🟡 Atenção</span>',
      CRITICO: '<span class="badge badge-critico">🔴 Crítico</span>',
      SEM_DADOS: '<span class="badge badge-semdados">⚪ Sem dados</span>',
      DEFINICAO: '<span class="badge badge-semdados">⚪ Regra em definição</span>',
      SEM_DISPARO: '<span class="badge badge-semdados">⚪ Sem disparo previsto</span>',
    };
    return map[status] || map.SEM_DADOS;
  }

  // ---------------------------------------------------------------
  // HEADER
  // ---------------------------------------------------------------
  function renderHeader(state) {
    const lastUpdateEl = document.getElementById("lastUpdate");
    lastUpdateEl.textContent = state.lastFetch ? `Última atualização: ${state.lastFetch.toLocaleString("pt-BR")}` : "Ainda não atualizado";

    renderSourceBadge("sourceDaily", "Base diária", state.raw.daily.status);
    renderSourceBadge("sourceHourly", "Base horária", state.raw.hourly.status);
    renderSourceBadge("sourceErrors", "Base de erros", state.raw.errors.status);

    const demoBanner = document.getElementById("demoBanner");
    if (state.raw.usingDemo) demoBanner.classList.remove("hidden");
    else demoBanner.classList.add("hidden");

    const warn = document.getElementById("fetchWarning");
    if (state.raw.usingDemo) {
      warn.classList.add("hidden");
    } else if (state.raw.daily.status !== "connected" && state.hasEverLoaded) {
      warn.classList.remove("hidden");
      warn.textContent = `⚠️ Não foi possível atualizar os dados agora. Última atualização válida: ${state.lastGoodFetch ? state.lastGoodFetch.toLocaleString("pt-BR") : "—"}`;
    } else if (state.raw.daily.status === "not_configured") {
      warn.classList.remove("hidden");
      warn.textContent = "⚠️ Fonte de dados não configurada. Preencha GOOGLE_SHEET_URL em js/config.js com a URL do CSV publicado da planilha.";
    } else {
      warn.classList.add("hidden");
    }
  }

  function renderSourceBadge(id, label, status) {
    const info = window.Quality.sourceLabel(status);
    const elx = document.getElementById(id);
    if (elx) elx.innerHTML = `${info.icone} ${label}: <strong>${info.texto}</strong>`;
  }

  // ---------------------------------------------------------------
  // FILTROS
  // ---------------------------------------------------------------
  function populateFilters(state, onChange) {
    const grupoSel = document.getElementById("filterGrupo");
    const bandeiraSel = document.getElementById("filterBandeira");
    const jornadaSel = document.getElementById("filterJornada");

    if (grupoSel.options.length <= 1) {
      grupoSel.innerHTML = `<option value="">Todos</option><option>PetzCobasi</option>`;
    }
    if (bandeiraSel.options.length <= 1) {
      const bandeiras = Object.keys(window.APP_CONFIG.orgStructure);
      bandeiraSel.innerHTML = `<option value="">Todas</option>` + bandeiras.map(b => `<option>${b}</option>`).join("");
    }
    function refreshJornadas() {
      const b = bandeiraSel.value;
      const jornadas = b ? window.APP_CONFIG.orgStructure[b] : [...new Set(Object.values(window.APP_CONFIG.orgStructure).flat())];
      jornadaSel.innerHTML = `<option value="">Todas</option>` + jornadas.map(j => `<option>${j}</option>`).join("");
    }
    if (jornadaSel.options.length <= 1) refreshJornadas();
    bandeiraSel.onchange = () => { refreshJornadas(); onChange(); };
    grupoSel.onchange = onChange;
    jornadaSel.onchange = onChange;
    document.getElementById("filterStatus").onchange = onChange;

    const periodoSel = document.getElementById("filterPeriodo");
    function toggleCustom() {
      const custom = periodoSel.value === "custom";
      document.getElementById("dateFromWrap").classList.toggle("hidden", !custom);
      document.getElementById("dateToWrap").classList.toggle("hidden", !custom);
    }
    periodoSel.onchange = () => { toggleCustom(); onChange(); };
    document.getElementById("filterDateFrom").onchange = onChange;
    document.getElementById("filterDateTo").onchange = onChange;
    toggleCustom();
  }

  function currentFilters() {
    return {
      grupo: document.getElementById("filterGrupo").value,
      bandeira: document.getElementById("filterBandeira").value,
      jornada: document.getElementById("filterJornada").value,
      status: document.getElementById("filterStatus").value,
      periodo: document.getElementById("filterPeriodo").value,
      dateFrom: document.getElementById("filterDateFrom").value,
      dateTo: document.getElementById("filterDateTo").value,
    };
  }

  // ---------------------------------------------------------------
  // VISÃO GERAL
  // ---------------------------------------------------------------
  function renderOverview(state) {
    const kpis = state.kpis;
    const container = document.getElementById("kpiGrid");
    container.innerHTML = "";
    const respNote = state.responsesPartialNA ? "Respostas/NPS não incluem Cobasi (contabilizadas pela data da compra)" : "";
    const join = (...p) => p.filter(Boolean).join("<br>");

    function kpiCard(title, block, footnote) {
      const nps = window.Calc.computeNPS(block);
      const rf = v => state.responsesAllNA ? "N/A" : fmt(v);
      return `
        <div class="card kpi-card">
          <h3>${title}</h3>
          <div class="kpi-main">${fmt(block.disparos)}</div>
          <div class="kpi-sub">disparos</div>
          <div class="kpi-rows">
            <div><span>Respostas</span><strong>${rf(block.respondentes)}</strong></div>
            <div><span>Promotores</span><strong>${rf(block.promotores)}</strong></div>
            <div><span>Neutros</span><strong>${rf(block.neutros)}</strong></div>
            <div><span>Detratores</span><strong>${rf(block.detratores)}</strong></div>
            <div><span>NPS</span><strong>${state.responsesAllNA ? "N/A" : (nps === null ? "—" : nps)}</strong></div>
          </div>
          ${footnote ? `<div class="kpi-foot">${footnote}</div>` : ""}
        </div>`;
    }

    container.insertAdjacentHTML("beforeend", kpiCard("Dia (mais recente)", kpis.hoje, join(state.dayNote, respNote)));
    container.insertAdjacentHTML("beforeend", kpiCard("Semana", kpis.semana, respNote));
    container.insertAdjacentHTML("beforeend", kpiCard("Mês", kpis.mes, respNote));
    if (state.periodKPI) {
      const p = state.periodKPI;
      const foot = p.days === 0
        ? "Sem dados no histórico para este período"
        : `${p.days} dia(s) com dados${p.rangeDays ? " de " + p.rangeDays : ""} no histórico do navegador`;
      container.insertAdjacentHTML("beforeend", kpiCard("Período: " + state.range.label, p.block, join(foot, respNote)));
    }

    // resumo de status
    const statusCounts = { NORMAL: 0, ATENCAO: 0, CRITICO: 0, SEM_DADOS: 0 };
    state.monitoringRows.forEach(r => statusCounts[r.statusGeral] = (statusCounts[r.statusGeral] || 0) + 1);
    const summaryEl = document.getElementById("statusSummary");
    summaryEl.innerHTML = `
      <div class="status-pill">${statusBadge("NORMAL")} <strong>${statusCounts.NORMAL}</strong></div>
      <div class="status-pill">${statusBadge("ATENCAO")} <strong>${statusCounts.ATENCAO}</strong></div>
      <div class="status-pill">${statusBadge("CRITICO")} <strong>${statusCounts.CRITICO}</strong></div>
      <div class="status-pill">${statusBadge("SEM_DADOS")} <strong>${statusCounts.SEM_DADOS}</strong></div>
      ${statusCounts.SEM_DISPARO ? `<div class="status-pill">${statusBadge("SEM_DISPARO")} <strong>${statusCounts.SEM_DISPARO}</strong></div>` : ""}
      ${statusCounts.DEFINICAO ? `<div class="status-pill">${statusBadge("DEFINICAO")} <strong>${statusCounts.DEFINICAO}</strong></div>` : ""}
    `;

    // gráfico: disparos por bandeira (hoje)
    const byBandeira = {};
    state.monitoringRows.forEach(r => { byBandeira[r.bandeira] = (byBandeira[r.bandeira] || 0) + (r.disparosHoje || 0); });
    window.Charts.barByCategory("chartByBandeira", Object.keys(byBandeira), Object.values(byBandeira), "Disparos hoje");

    // gráfico: respostas (mês, escopo filtrado)
    window.Charts.responsesDoughnut("chartResponses", kpis.mes.promotores, kpis.mes.neutros, kpis.mes.detratores);
    document.getElementById("responsesNote").textContent = state.responsesAllNA
      ? "Não disponível: as respostas da Cobasi são contabilizadas pela data da compra."
      : (state.responsesPartialNA ? "Não inclui Cobasi (respostas contabilizadas pela data da compra)." : "");
  }

  // ---------------------------------------------------------------
  // MONITORAMENTO
  // ---------------------------------------------------------------
  function renderMonitoring(state, onDrillDown) {
    lastRange = state.range;
    const tbody = document.getElementById("monitoringBody");
    tbody.innerHTML = "";

    const rows = [...state.monitoringRows];
    const sortKey = document.getElementById("monitoringSort").value;
    const sorters = {
      queda: (a, b) => (a.variacaoPct ?? 999) - (b.variacaoPct ?? 999),
      volume: (a, b) => (a.disparosHoje ?? Infinity) - (b.disparosHoje ?? Infinity),
      variacao: (a, b) => Math.abs(b.variacaoPct ?? 0) - Math.abs(a.variacaoPct ?? 0),
      critico: (a, b) => sevRank(b.statusGeral) - sevRank(a.statusGeral),
    };
    function sevRank(s) { return { CRITICO: 3, ATENCAO: 2, SEM_DADOS: 1, NORMAL: 0 }[s] ?? 0; }
    rows.sort(sorters[sortKey] || sorters.critico);

    rows.forEach(r => {
      const tr = el(`
        <tr class="row-clickable" data-combo="${r.grupo}||${r.bandeira}||${r.jornada}">
          <td>${r.bandeira}</td>
          <td>${r.jornada}</td>
          <td>${dataRefCell(r)}</td>
          <td>${diaCell(r)}</td>
          <td>${expectedCell(r)}</td>
          <td>${r.variacaoPct === null ? "—" : fmtPct(r.variacaoPct)}</td>
          <td>${r.periodTotals && r.periodTotals.days > 0 ? fmt(r.periodTotals.disparos) : "Sem dados"}</td>
          <td>${statusBadge(r.statusGeral)}</td>
        </tr>`);
      tr.addEventListener("click", () => onDrillDown(r));
      tbody.appendChild(tr);
    });

    const note = document.getElementById("monitoringNote");
    note.textContent = "* média estimada (total do mês / dias corridos) — usada apenas até haver histórico diário suficiente acumulado no navegador.";
  }

  // ---------------------------------------------------------------
  // ALERTAS
  // ---------------------------------------------------------------
  function renderAlerts(state) {
    const active = state.alerts.filter(a => a.situacao === "Ativo");
    const wrap = document.getElementById("alertsList");
    wrap.innerHTML = "";

    if (active.length === 0) {
      wrap.innerHTML = `<div class="empty-state">🟢 Nenhum alerta ativo no momento.</div>`;
    }

    active.forEach(a => {
      wrap.insertAdjacentHTML("beforeend", `
        <div class="alert-card alert-${a.status.toLowerCase()}">
          <div class="alert-top">
            <span>${a.icone} <strong>${a.tipo}</strong></span>
            <span class="alert-meta">${a.data} ${a.hora}</span>
          </div>
          <div class="alert-body">
            <div><span>Bandeira</span><strong>${a.bandeira || "—"}</strong></div>
            <div><span>Jornada</span><strong>${a.jornada || "—"}</strong></div>
            <div><span>Valor atual</span><strong>${a.valorAtual ?? "—"}</strong></div>
            <div><span>Valor esperado</span><strong>${a.valorEsperado ?? "—"}</strong></div>
            <div><span>Variação</span><strong>${a.variacao ?? "—"}</strong></div>
          </div>
          <div class="alert-reason">${a.motivo}</div>
        </div>`);
    });

    const histFiltered = state.alertHistory.filter(a => window.Calc.inRange(new Date(a.ts), state.range));
    document.getElementById("alertHistoryBody").innerHTML =
      histFiltered.length === 0
        ? `<tr><td colspan="7" class="empty-state">Sem histórico de alertas nesta sessão ainda.</td></tr>`
        : histFiltered.map(a => `
          <tr>
            <td>${a.data} ${a.hora}</td>
            <td>${a.bandeira || "—"}</td>
            <td>${a.jornada || "—"}</td>
            <td>${a.tipo}</td>
            <td>${a.situacao}</td>
            <td>${a.motivo}</td>
          </tr>`).join("");
  }

  // ---------------------------------------------------------------
  // ANÁLISES
  // ---------------------------------------------------------------
  function renderAnalyses(state) {
    // evolução: usa histórico local acumulado para até 5 combinações do filtro atual
    const combos = state.monitoringRows.slice(0, 5);
    const series = combos.map(r => {
      const hist = window.History.getHistory(r.grupo, r.bandeira, r.jornada);
      return { label: `${r.bandeira} / ${r.jornada}`, data: hist.filter(h => window.Calc.inRange(h.date, state.range)).map(h => ({ x: h.date, y: h.disparos })) };
    }).filter(s => s.data.length > 0);

    if (series.length === 0) {
      document.getElementById("analysesEmptyNote").classList.remove("hidden");
    } else {
      document.getElementById("analysesEmptyNote").classList.add("hidden");
      window.Charts.evolutionLine("chartEvolution", series);
    }

    // real x esperado
    const top = state.monitoringRows.filter(r => r.mediaEsperada !== null).slice(0, 8);
    window.Charts.realVsExpected("chartRealExpected",
      top.map(r => `${r.bandeira}/${r.jornada}`),
      top.map(r => r.disparosHoje || 0),
      top.map(r => Math.round(r.mediaEsperada)));

    // por jornada (mês)
    const byJornada = {};
    state.monitoringRows.forEach(r => { byJornada[r.jornada] = (byJornada[r.jornada] || 0) + (r.disparosMes || 0); });
    window.Charts.barByCategory("chartByJornada", Object.keys(byJornada), Object.values(byJornada), "Disparos no mês");
  }

  // ---------------------------------------------------------------
  // QUALIDADE DOS DADOS
  // ---------------------------------------------------------------
  function renderQuality(state) {
    const q = state.quality;
    document.getElementById("qualitySummary").innerHTML = `
      <div class="card">
        <div class="kpi-main">${q.totalProblemas}</div>
        <div class="kpi-sub">problemas encontrados em ${q.totalRegistros} registros (${q.percentualAfetado} da base)</div>
      </div>`;

    const tbody = document.getElementById("qualityBody");
    tbody.innerHTML = q.porTipo.length === 0
      ? `<tr><td colspan="3" class="empty-state">Nenhum problema encontrado. 🟢</td></tr>`
      : q.porTipo.map(t => `<tr><td>${t.tipo}</td><td>${t.quantidade}</td><td>${t.percentual}</td></tr>`).join("");
  }

  // ---------------------------------------------------------------
  // CONFIGURAÇÕES
  // ---------------------------------------------------------------
  function renderConfig(state, onSave) {
    const th = state.thresholds;
    const form = document.getElementById("configForm");
    if (form.dataset.bound === "1") {
      // apenas atualiza valores se ainda não foram tocados manualmente
      return;
    }
    form.innerHTML = `
      <label>Limite de ATENÇÃO (queda de volume) <input type="number" step="0.01" id="cfg_attention" value="${th.ATTENTION_THRESHOLD}"></label>
      <label>Limite CRÍTICO (queda de volume) <input type="number" step="0.01" id="cfg_critical" value="${th.CRITICAL_THRESHOLD}"></label>
      <label>Queda máx. vs. 7 dias antes de alertar <input type="number" step="0.01" id="cfg_7d" value="${th.SEVEN_DAY_DROP_THRESHOLD}"></label>
      <label>Horas sem disparo para alertar <input type="number" step="1" id="cfg_nodispatch" value="${th.NO_DISPATCH_HOURS}"></label>
      <label>Múltiplo p/ pico anormal <input type="number" step="0.1" id="cfg_spike" value="${th.ANOMALOUS_SPIKE_MULTIPLIER}"></label>
      <label>Qtde erro recorrente <input type="number" step="1" id="cfg_errcount" value="${th.RECURRING_ERROR_COUNT}"></label>
      <label>Janela erro recorrente (h) <input type="number" step="1" id="cfg_errwindow" value="${th.RECURRING_ERROR_WINDOW_HOURS}"></label>
      <button type="submit" class="btn btn-primary">Salvar configurações</button>
      <p class="hint">As configurações ficam salvas neste navegador (não alteram a planilha nem o código).</p>
    `;
    form.dataset.bound = "1";
    form.onsubmit = (e) => {
      e.preventDefault();
      onSave({
        ATTENTION_THRESHOLD: Number(document.getElementById("cfg_attention").value),
        CRITICAL_THRESHOLD: Number(document.getElementById("cfg_critical").value),
        SEVEN_DAY_DROP_THRESHOLD: Number(document.getElementById("cfg_7d").value),
        NO_DISPATCH_HOURS: Number(document.getElementById("cfg_nodispatch").value),
        ANOMALOUS_SPIKE_MULTIPLIER: Number(document.getElementById("cfg_spike").value),
        RECURRING_ERROR_COUNT: Number(document.getElementById("cfg_errcount").value),
        RECURRING_ERROR_WINDOW_HOURS: Number(document.getElementById("cfg_errwindow").value),
      });
    };
  }

  // ---------------------------------------------------------------
  // DRILL-DOWN (modal)
  // ---------------------------------------------------------------
  function showDrillDown(row) {
    const modal = document.getElementById("drillModal");
    const hist = window.History.getHistory(row.grupo, row.bandeira, row.jornada).filter(h => window.Calc.inRange(h.date, lastRange));
    document.getElementById("drillTitle").textContent = `${row.grupo} → ${row.bandeira} → ${row.jornada}`;
    document.getElementById("drillBody").innerHTML = `
      <div class="kpi-rows">
        <div><span>Disparos (dia de referência)</span><strong>${diaCell(row)}</strong></div>
        <div><span>Disparos semana</span><strong>${fmt(row.disparosSemana)}</strong></div>
        <div><span>Disparos mês</span><strong>${fmt(row.disparosMes)}</strong></div>
        <div><span>NPS (mês)</span><strong>${row.semRespostas ? "N/A (sem respostas)" : (row.npsMes === null ? "—" : row.npsMes)}</strong></div>
        <div><span>Média esperada</span><strong>${expectedCell(row)}</strong></div>
        <div><span>Fonte da média</span><strong>${row.mediaEsperadaFonte || "—"}</strong></div>
        <div><span>Dias no histórico local</span><strong>${row.historicoDias}</strong></div>
        <div><span>Total no período${lastRange ? " (" + lastRange.label + ")" : ""}</span><strong>${row.periodTotals && row.periodTotals.days > 0 ? fmt(row.periodTotals.disparos) : "Sem dados"}</strong></div>
        <div><span>Status</span><strong>${statusBadge(row.statusGeral)}</strong></div>
      </div>
      <h4>Histórico diário acumulado (este navegador)</h4>
      ${hist.length === 0 ? '<p class="empty-state">Ainda sem snapshots suficientes. Volte a acessar o dashboard em outros dias para construir o histórico.</p>' :
        `<table class="mini-table"><thead><tr><th>Data</th><th>Disparos</th><th>Respostas</th></tr></thead><tbody>
          ${hist.slice(-30).reverse().map(h => `<tr><td>${h.date.toLocaleDateString("pt-BR")}</td><td>${fmt(h.disparos)}</td><td>${row.semRespostas ? "N/A" : fmt(h.respondentes)}</td></tr>`).join("")}
        </tbody></table>`}
    `;
    modal.classList.remove("hidden");
  }
  function hideDrillDown() { document.getElementById("drillModal").classList.add("hidden"); }

  // ---------------------------------------------------------------
  // TABS
  // ---------------------------------------------------------------
  function renderRules() {
    const box = document.getElementById("rulesCard");
    if (!box) return;
    box.innerHTML = "<h2>Regras de negócio por bandeira</h2>" + window.Rules.describe().map(b =>
      `<h4>${b.bandeira}</h4><ul>${b.linhas.map(l => `<li>${l}</li>`).join("")}</ul>`).join("") +
      '<p class="hint">Para alterar, edite bandeiraRules em js/config.js.</p>';
  }

  function bindTabs() {
    document.querySelectorAll(".tab-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
        document.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));
        btn.classList.add("active");
        document.getElementById(btn.dataset.tab).classList.add("active");
      });
    });
  }

  return {
    renderHeader, populateFilters, currentFilters, renderOverview, renderMonitoring,
    renderAlerts, renderAnalyses, renderQuality, renderConfig, renderRules, showDrillDown, hideDrillDown,
    bindTabs, statusBadge, fmt, fmtPct,
  };
})();
