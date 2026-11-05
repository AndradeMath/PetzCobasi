/**
 * Testes de lógica de negócio, rodados em Node (fora do navegador).
 * Cobre os testes 1, 2, 3, 4, 5, 6, 8 e 11 do briefing (item 38).
 * Os testes 9, 10 (filtros, drill-down) e 12-14 (build/deploy) são
 * verificados manualmente / por inspeção de arquivos — ver RELATORIO_TESTES.md.
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

let passed = 0, failed = 0;
let asyncTests = Promise.resolve();
function assert(cond, msg) {
  if (cond) { passed++; console.log("  OK -", msg); }
  else { failed++; console.error("  FALHOU -", msg); }
}

// ---------------------------------------------------------------
// Sandbox: simula window + localStorage, carrega os arquivos reais
// do projeto (sem modificá-los) num mesmo contexto.
// ---------------------------------------------------------------
function makeLocalStorage() {
  let store = {};
  return {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; },
    _dump: () => store,
  };
}

const sandbox = {};
sandbox.window = {};
sandbox.localStorage = makeLocalStorage();
sandbox.console = console;
sandbox.Date = Date;
vm.createContext(sandbox);

const files = ["js/config.js", "js/rules.js", "js/demodata.js", "js/csv.js", "js/mapping.js", "js/history.js", "js/calculations.js", "js/alerts.js", "js/quality.js"];
files.forEach(f => {
  const code = fs.readFileSync(path.join(__dirname, "..", f), "utf8");
  vm.runInContext(code, sandbox, { filename: f });
});

const { CSVUtil, Mapping, History, Calc, Alerts, Quality, Rules, APP_CONFIG } = sandbox.window;

console.log("\n=== TESTE 1: parsing de CSV ===");
{
  const csv = 'Grupo,Bandeira,Jornada,Periodo,Data_Referencia,Disparos,Respondentes,Promotores,Neutros,Detratores\n' +
    'PetzCobasi,Petz,Shipping,Dia,2026-09-25,120,80,50,20,10\n' +
    'PetzCobasi,"Petz, com virgula",Shipping,Dia,2026-09-25,120,80,50,20,10\n';
  const rows = CSVUtil.parse(csv);
  assert(rows.length === 2, "parseia 2 linhas de dados");
  assert(rows[0].Disparos === "120", "campo Disparos lido corretamente");
  assert(rows[1].Bandeira === "Petz, com virgula", "campo com vírgula entre aspas é respeitado");
}

console.log("\n=== TESTE 2: mapeamento e qualidade de dados ===");
{
  const rawRows = [
    { Grupo: "PetzCobasi", Bandeira: "Petz", Jornada: "Shipping", Periodo: "Dia", Data_Referencia: "2026-09-25", Disparos: "120", Respondentes: "80", Promotores: "50", Neutros: "20", Detratores: "10" },
    { Grupo: "PetzCobasi", Bandeira: "Petz", Jornada: "Shipping", Periodo: "Dia", Data_Referencia: "2026-09-25", Disparos: "120", Respondentes: "80", Promotores: "50", Neutros: "20", Detratores: "10" }, // duplicado
    { Grupo: "PetzCobasi", Bandeira: "Petz", Jornada: "JornadaInventada", Periodo: "Dia", Data_Referencia: "31/13/2026", Disparos: "-5", Respondentes: "", Promotores: "", Neutros: "", Detratores: "" }, // vários problemas
    { Grupo: "", Bandeira: "Cobasi", Jornada: "Shipping", Periodo: "Mês", Data_Referencia: "", Disparos: "3000", Respondentes: "1500", Promotores: "900", Neutros: "400", Detratores: "200" }, // grupo vazio
  ];
  const { records, issues } = Mapping.mapDailySheet(rawRows);
  assert(records.length === 4, "gera 4 registros normalizados");
  assert(issues.some(i => i.type === "duplicidade"), "detecta duplicidade");
  assert(issues.some(i => i.type === "jornada_desconhecida"), "detecta jornada desconhecida");
  assert(issues.some(i => i.type === "valor_negativo"), "detecta valor negativo");
  assert(issues.some(i => i.type === "campo_obrigatorio_vazio"), "detecta campo obrigatório vazio");
  const q = Quality.summarize(issues, records.length);
  assert(q.totalProblemas === issues.length, "relatório de qualidade soma corretamente");
}

console.log("\n=== TESTE 8: histórico insuficiente (não inventa média) ===");
{
  const { records } = Mapping.mapDailySheet([
    { Grupo: "PetzCobasi", Bandeira: "Petz", Jornada: "Shipping", Periodo: "Dia", Data_Referencia: "2026-09-25", Disparos: "50", Respondentes: "10", Promotores: "5", Neutros: "3", Detratores: "2" },
  ]);
  const row = Calc.buildMonitoringRow("PetzCobasi", "Petz", "Shipping", records, new Date(2026, 8, 25));
  assert(row.mediaEsperada === null || row.isEstimativa === true, "sem histórico local, usa null ou marca explicitamente como estimativa (nunca finge ser média real)");
  assert(row.mediaEsperadaFonte !== "mesmo dia da semana" && row.mediaEsperadaFonte !== "últimos 7 dias", "não reivindica média de 7 dias/mesmo dia da semana sem base suficiente");
}

console.log("\n=== TESTE 3: queda de volume gera alerta, com histórico suficiente ===");
{
  // simula 10 dias de histórico com ~100 disparos/dia
  for (let d = 10; d >= 1; d--) {
    const date = new Date(2026, 8, 25 - d);
    History.recordDailySnapshot([{
      grupo: "PetzCobasi", bandeira: "Petz", jornada: "Shipping", periodo: "Dia",
      dataRef: date, disparos: 100, respondentes: 40, promotores: 25, neutros: 10, detratores: 5, semDados: false,
    }]);
  }
  const hoje = new Date(2026, 8, 25);
  const { records } = Mapping.mapDailySheet([
    { Grupo: "PetzCobasi", Bandeira: "Petz", Jornada: "Shipping", Periodo: "Dia", Data_Referencia: "2026-09-25", Disparos: "40", Respondentes: "15", Promotores: "5", Neutros: "5", Detratores: "5" },
  ]);
  const row = Calc.buildMonitoringRow("PetzCobasi", "Petz", "Shipping", records, hoje);
  row.statusGeral = "CALC_PENDENTE";
  assert(row.mediaEsperada !== null, "agora tem histórico suficiente para calcular média esperada");
  assert(row.disparosHoje === 40 && row.mediaEsperada >= 90, "hoje (40) está bem abaixo da média esperada (~100)");

  const hist = History.getHistory("PetzCobasi", "Petz", "Shipping");
  const avgs = History.computeAverages(hist, hoje);
  const alert = Alerts.evaluateAll({
    monitoringRows: [{ ...row, statusGeral: "CRITICO" }],
    th: APP_CONFIG.thresholds, now: hoje,
    hourlyByCombo: {}, hourlySourceStatus: "not_configured",
    errorRecords: [], errorsSourceStatus: "not_configured",
    avgsByCombo: { "PetzCobasi||Petz||Shipping": avgs },
  });
  assert(alert.some(a => a.tipo === "Queda de volume" && a.status === "CRITICO"), "gera alerta CRÍTICO de queda de volume (40 < 50% de ~100)");
}

console.log("\n=== TESTE 5: pico anormal ===");
{
  const hoje = new Date(2026, 8, 26);
  const { records } = Mapping.mapDailySheet([
    { Grupo: "PetzCobasi", Bandeira: "Petz", Jornada: "Shipping", Periodo: "Dia", Data_Referencia: "2026-09-26", Disparos: "260", Respondentes: "100", Promotores: "60", Neutros: "20", Detratores: "20" },
  ]);
  const row = Calc.buildMonitoringRow("PetzCobasi", "Petz", "Shipping", records, hoje);
  const hist = History.getHistory("PetzCobasi", "Petz", "Shipping");
  const avgs = History.computeAverages(hist, hoje);
  const alert = Alerts.evaluateAll({
    monitoringRows: [row], th: APP_CONFIG.thresholds, now: hoje,
    hourlyByCombo: {}, hourlySourceStatus: "not_configured",
    errorRecords: [], errorsSourceStatus: "not_configured",
    avgsByCombo: { "PetzCobasi||Petz||Shipping": avgs },
  });
  assert(alert.some(a => a.tipo === "Pico anormal"), "gera alerta de pico anormal (260 vs ~100 histórico, >2x)");
}

console.log("\n=== TESTE 4: ausência de disparos (fonte horária) ===");
{
  const now = new Date(2026, 8, 26, 15, 0, 0);
  const hourlyByCombo = {
    "PetzCobasi||Cobasi||Shipping": Array.from({ length: 6 }, (_, i) => ({
      grupo: "PetzCobasi", bandeira: "Cobasi", jornada: "Shipping",
      datetime: new Date(2026, 8, 26, 8 + i, 0, 0), disparos: 10,
    })),
  };
  // último evento às 13h, "agora" é 15h -> 2h sem disparo (default threshold)
  hourlyByCombo["PetzCobasi||Cobasi||Shipping"][5].datetime = new Date(2026, 8, 26, 13, 0, 0);
  const alerts = Alerts.evaluateAll({
    monitoringRows: [], th: APP_CONFIG.thresholds, now,
    hourlyByCombo, hourlySourceStatus: "connected",
    errorRecords: [], errorsSourceStatus: "not_configured",
    avgsByCombo: {},
  });
  assert(alerts.some(a => a.tipo === "Ausência de disparos"), "gera alerta de ausência quando fonte horária está conectada e passou o limite de horas");
}
{
  // mesma situação, mas fonte horária indisponível -> NÃO deve gerar alerta de ausência (item 11)
  const now = new Date(2026, 8, 26, 15, 0, 0);
  const alerts = Alerts.evaluateAll({
    monitoringRows: [], th: APP_CONFIG.thresholds, now,
    hourlyByCombo: {}, hourlySourceStatus: "unavailable",
    errorRecords: [], errorsSourceStatus: "not_configured",
    avgsByCombo: {},
  });
  assert(!alerts.some(a => a.tipo === "Ausência de disparos"), "NÃO gera alerta de ausência quando a fonte horária está indisponível (evita falso positivo)");
}

console.log("\n=== TESTE 6: erro recorrente ===");
{
  const now = new Date(2026, 8, 26, 15, 0, 0);
  const errorRecords = [
    { grupo: "PetzCobasi", bandeira: "Petz", jornada: "Shipping", datetime: new Date(2026, 8, 26, 14, 10), tipoErro: "Timeout API", quantidade: 1 },
    { grupo: "PetzCobasi", bandeira: "Petz", jornada: "Shipping", datetime: new Date(2026, 8, 26, 14, 20), tipoErro: "Timeout API", quantidade: 1 },
    { grupo: "PetzCobasi", bandeira: "Petz", jornada: "Shipping", datetime: new Date(2026, 8, 26, 14, 30), tipoErro: "Timeout API", quantidade: 1 },
    { grupo: "PetzCobasi", bandeira: "Petz", jornada: "Shipping", datetime: new Date(2026, 8, 26, 14, 40), tipoErro: "Timeout API", quantidade: 1 },
  ];
  const alerts = Alerts.evaluateAll({
    monitoringRows: [], th: APP_CONFIG.thresholds, now,
    hourlyByCombo: {}, hourlySourceStatus: "not_configured",
    errorRecords, errorsSourceStatus: "connected",
    avgsByCombo: {},
  });
  assert(alerts.some(a => a.tipo === "Erro recorrente" && a.valorAtual === 4), "gera alerta de erro recorrente com 4 ocorrências em 1h (limite é >3)");
}

console.log("\n=== TESTE 7: fonte CSV real e fallback de demonstração ===");
{
  const dsCode = fs.readFileSync(path.join(__dirname, "..", "js/datasource.js"), "utf8");
  const dailyCsv = "Grupo,Bandeira,Jornada,Periodo,Data_Referencia,Disparos,Respondentes,Promotores,Neutros,Detratores\n" +
    "PetzCobasi,Petz,Shipping,Dia,2026-09-25,120,80,50,20,10";
  let fetchResponse = { ok: true, text: async () => dailyCsv };
  const sandbox2 = {
    window: {
      APP_CONFIG: { dataSources: { daily: "https://example.test/base.csv", hourly: "", errors: "" } },
      CSVUtil: sandbox.window.CSVUtil,
      DEMO_DATA_CSV: sandbox.window.DEMO_DATA_CSV,
    },
    fetch: async () => fetchResponse,
    AbortController, Promise, setTimeout, clearTimeout,
  };
  vm.createContext(sandbox2);
  vm.runInContext(dsCode, sandbox2);
  assert(/^https:\/\/docs\.google\.com\/spreadsheets\/d\/.+\/export\?format=csv&gid=269333055$/.test(APP_CONFIG.dataSources.daily), "configura a URL CSV da aba Base_NPS");

  asyncTests = (async () => {
    const realResult = await sandbox2.window.DataSource.fetchAll();
    assert(realResult.daily.ok && !realResult.usingDemo, "CSV válido carrega dados reais sem ativar demonstração");
    assert(realResult.daily.rows.length === 1, "retorna a linha do CSV real");

    fetchResponse = { ok: false, status: 503 };
    const fallbackResult = await sandbox2.window.DataSource.fetchAll();
    assert(fallbackResult.daily.ok && fallbackResult.usingDemo, "CSV indisponível ativa fallback de demonstração");

    fetchResponse = {
      ok: true,
      text: async () => "Grupo,Bandeira\nPetzCobasi,Petz",
    };
    const invalidCsvResult = await sandbox2.window.DataSource.fetchAll();
    assert(invalidCsvResult.usingDemo, "CSV sem as colunas obrigatórias usa fallback");
  })();
}

console.log("\n=== TESTE 15: filtro de datas ===");
{
  const now = new Date(2026, 8, 25, 10, 0, 0);
  const r7 = Calc.resolveRange("7d", "", "", now);
  assert(r7.days === 7 && r7.from.getDate() === 19 && r7.to.getDate() === 25, "preset 'Últimos 7 dias' cobre 19/09 a 25/09");
  const rm = Calc.resolveRange("month", "", "", now);
  assert(rm.from.getDate() === 1 && rm.days === 25, "preset 'Mês atual' vai de 01/09 até hoje");
  const rc = Calc.resolveRange("custom", "2026-09-24", "2026-09-20", now);
  assert(rc.from.getDate() === 20 && rc.to.getDate() === 24, "período personalizado com datas invertidas é corrigido");
  assert(Calc.resolveRange("custom", "", "", now).from === null, "personalizado vazio = sem limite");

  const hist = [
    { date: new Date(2026, 8, 20), disparos: 10, respondentes: 5, promotores: 3, neutros: 1, detratores: 1 },
    { date: new Date(2026, 8, 22), disparos: 20, respondentes: 8, promotores: 5, neutros: 2, detratores: 1 },
    { date: new Date(2026, 8, 25), disparos: 30, respondentes: 9, promotores: 6, neutros: 2, detratores: 1 },
  ];
  const range = Calc.resolveRange("custom", "2026-09-21", "2026-09-25", now);
  const tot = Calc.computePeriodTotals(hist, range);
  assert(tot.days === 2 && tot.disparos === 50, "soma apenas os dias dentro do período (22 e 25 => 50)");
  const empty = Calc.computePeriodTotals(hist, Calc.resolveRange("custom", "2026-08-01", "2026-08-05", now));
  assert(empty.days === 0 && empty.disparos === null, "período sem dados retorna null (nunca zero)");
  const agg = Calc.aggregatePeriods([tot, Calc.computePeriodTotals(hist, range)]);
  assert(agg.block.disparos === 100 && agg.days === 2, "agregação soma combinações e conta dias distintos");
  assert(Calc.inRange(new Date(2026, 8, 25, 23, 59), range), "último dia do período inclui o dia inteiro");
}

console.log("\n=== TESTE 16: datas do histórico em horário local (fuso) ===");
{
  History.recordDailySnapshot([{ grupo: "T", bandeira: "T", jornada: "T", periodo: "Dia", dataRef: new Date(2026, 8, 21), disparos: 5, respondentes: 1, promotores: 1, neutros: 0, detratores: 0, semDados: false }]);
  const h = History.getHistory("T", "T", "T")[0];
  assert(h.date.getDate() === 21 && h.date.getDay() === 1, "21/09/2026 volta como dia 21 e segunda-feira (sem deslocar 1 dia)");
}

console.log("\n=== TESTE 17: regras por bandeira ===");
{
  const G = "PetzCobasi";
  const rec = (b, j, date, v) => ({ grupo: G, bandeira: b, jornada: j, periodo: "Dia", dataRef: date, disparos: v, respondentes: null, promotores: null, neutros: null, detratores: null, semDados: v === null });
  const fakeHist = (b, j, from, to, fn) => { for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) History.recordDailySnapshot([rec(b, j, new Date(d), fn(new Date(d)))]); };
  const th = APP_CONFIG.thresholds;
  const evalRows = (rows, now) => Alerts.evaluateAll({ monitoringRows: rows, th, now, hourlyByCombo: {}, hourlySourceStatus: "not_configured", errorRecords: [], errorsSourceStatus: "not_configured", avgsByCombo: Object.fromEntries(rows.map(r => [`${r.grupo}||${r.bandeira}||${r.jornada}`, r.avgs])) });

  assert(Rules.lagDays("Petz") === 1 && Rules.lagDays("Cobasi") === 0 && Rules.lagDays("ZeeDog") === null, "regras: Petz D+1, Cobasi D+0, ZeeDog em definição");
  assert(Rules.hasResponses("Cobasi") === false && Rules.hasResponses("Petz") === true, "regras: só a Cobasi não tem respostas");

  // --- Petz D+1: dado de ontem é o "atual"
  const now = new Date(2026, 10, 5, 10, 0); // quinta 05/11 -> Petz espera 04/11
  fakeHist("Petz", "PickUp", new Date(2026, 9, 27), new Date(2026, 10, 3), () => 100);
  const row = Calc.buildMonitoringRow(G, "Petz", "PickUp", [rec("Petz", "PickUp", new Date(2026, 10, 4), 40)], now);
  assert(row.dataStatus === "ok" && row.dataRef.getDate() === 4 && row.avaliavel, "Petz D+1: dado de ontem (04/11) é considerado atualizado e avaliável");
  assert(evalRows([row], now).some(a => a.tipo === "Queda de volume" && a.status === "CRITICO"), "Petz D+1: queda de 40 vs ~100 gera alerta crítico sobre o dia de referência");

  // --- Petz com dado mais antigo que ontem => desatualizado (e NÃO queda)
  const stale = Calc.buildMonitoringRow(G, "Petz", "PickUp", [rec("Petz", "PickUp", new Date(2026, 10, 2), 90)], now);
  assert(stale.dataStatus === "stale" && stale.disparosHoje === null && !stale.avaliavel, "Petz: dado de 02/11 numa quinta é desatualizado e não é tratado como volume do dia");
  const al = evalRows([stale], now);
  assert(al.some(a => a.tipo === "Dado desatualizado") && !al.some(a => a.tipo === "Queda de volume"), "Petz desatualizado gera 'Dado desatualizado', nunca 'Queda de volume'");

  // --- Petz CD: domingo sem disparo previsto
  const nowMon = new Date(2026, 10, 9, 10, 0); // segunda -> Petz espera domingo 08/11
  const cdSun = Calc.buildMonitoringRow(G, "Petz", "CD", [rec("Petz", "CD", new Date(2026, 10, 7), 70)], nowMon);
  assert(cdSun.semDisparoPrevisto && cdSun.dataStatus === "ok" && !cdSun.avaliavel, "Petz CD: domingo é 'sem disparo previsto' (sem 'fonte desatualizada')");
  assert(evalRows([cdSun], nowMon).length === 0, "Petz CD: domingo não gera nenhum alerta");

  // --- Petz CD: segunda é reposição; médias dos outros dias ignoram domingo e segunda
  fakeHist("Petz", "CD", new Date(2026, 9, 10), new Date(2026, 10, 8), d => d.getDay() === 0 ? 0 : d.getDay() === 1 ? 250 : 100);
  const cdMon = Calc.buildMonitoringRow(G, "Petz", "CD", [rec("Petz", "CD", new Date(2026, 10, 9), 240)], new Date(2026, 10, 10, 10, 0));
  assert(cdMon.catchUpDay && Math.round(cdMon.mediaEsperada) === 250 && /reposição/.test(cdMon.mediaEsperadaFonte), "Petz CD: segunda é comparada só com outras segundas (esperado ~250)");
  const alMon = evalRows([cdMon], new Date(2026, 10, 10, 10, 0));
  assert(!alMon.some(a => a.tipo === "Pico anormal" || a.tipo === "Queda vs. últimos 7 dias"), "Petz CD: segunda não dispara 'pico' nem 'queda vs 7 dias' por causa da reposição");
  const cdTue = Calc.buildMonitoringRow(G, "Petz", "CD", [rec("Petz", "CD", new Date(2026, 10, 10), 95)], new Date(2026, 10, 11, 10, 0));
  assert(Math.round(cdTue.avgs.historicalAvg) === 100, "Petz CD: média histórica de terça não é distorcida por domingos (0) nem segundas (250)");

  // --- Cobasi: respostas ignoradas
  const { records } = Mapping.mapDailySheet([
    { Grupo: G, Bandeira: "Cobasi", Jornada: "Shipping", Periodo: "Dia", Data_Referencia: "2026-11-05", Disparos: "80", Respondentes: "30", Promotores: "20", Neutros: "5", Detratores: "5" },
    { Grupo: G, Bandeira: "Petz", Jornada: "Shipping", Periodo: "Dia", Data_Referencia: "2026-11-04", Disparos: "80", Respondentes: "30", Promotores: "20", Neutros: "5", Detratores: "5" },
  ]);
  assert(records[0].disparos === 80 && records[0].respondentes === null && records[0].promotores === null, "Cobasi: só volume de disparos; respostas são ignoradas");
  assert(records[1].respondentes === 30, "Petz mantém respostas normalmente");

  // --- ZeeDog/ZeeNow: regra em definição, sem alertas
  fakeHist("ZeeDog", "Digital", new Date(2026, 9, 20), new Date(2026, 10, 4), () => 100);
  const zee = Calc.buildMonitoringRow(G, "ZeeDog", "Digital", [rec("ZeeDog", "Digital", new Date(2026, 10, 5), 10)], now);
  assert(zee.regraEmDefinicao && !zee.avaliavel && zee.mediaEsperada === null && zee.disparosHoje === 10, "ZeeDog: mostra o volume, mas não avalia (regra em definição)");
  assert(evalRows([zee], now).length === 0, "ZeeDog: queda de 100 -> 10 NÃO gera alerta enquanto a regra não for definida");

  // --- Ausência por hora não vale para base D+1
  const hp = { "PetzCobasi||Petz||Shipping": Array.from({ length: 6 }, (_, i) => ({ grupo: G, bandeira: "Petz", jornada: "Shipping", datetime: new Date(2026, 10, 5, 3 + i, 0), disparos: 10 })) };
  const alH = Alerts.evaluateAll({ monitoringRows: [], th, now: new Date(2026, 10, 5, 15, 0), hourlyByCombo: hp, hourlySourceStatus: "connected", errorRecords: [], errorsSourceStatus: "not_configured", avgsByCombo: {} });
  assert(!alH.some(a => a.tipo === "Ausência de disparos"), "Petz (D+1): não afirma 'ausência de disparos por hora' com base atrasada");
}

console.log("\n=== TESTE 18: pipeline completo com os dados de demonstração ===");
{
  sandbox.window.seedDemoHistory();
  const { records } = Mapping.mapDailySheet(CSVUtil.parse(sandbox.window.DEMO_DATA_CSV));
  History.recordDailySnapshot(records);
  const now = new Date();
  const combos = {};
  records.forEach(r => { (combos[`${r.grupo}||${r.bandeira}||${r.jornada}`] = combos[`${r.grupo}||${r.bandeira}||${r.jornada}`] || []).push(r); });
  const rows = Object.keys(combos).map(k => { const [g, b, j] = k.split("||"); return Calc.buildMonitoringRow(g, b, j, combos[k], now); });
  assert(rows.length === 7, "monta as 7 combinações da demonstração sem erro");
  assert(rows.filter(r => r.bandeira === "Petz").every(r => r.dataStatus === "ok" && r.lagDays === 1), "demo: Petz chega em D+1 e é considerado atualizado");
  assert(rows.filter(r => r.bandeira === "Cobasi").every(r => r.semRespostas), "demo: Cobasi marcada como sem respostas");
  assert(rows.filter(r => r.bandeira.startsWith("Zee")).every(r => r.regraEmDefinicao), "demo: ZeeDog/ZeeNow em definição");
  const alerts = Alerts.evaluateAll({ monitoringRows: rows, th: APP_CONFIG.thresholds, now, hourlyByCombo: {}, hourlySourceStatus: "not_configured", errorRecords: [], errorsSourceStatus: "not_configured", avgsByCombo: Object.fromEntries(rows.map(r => [`${r.grupo}||${r.bandeira}||${r.jornada}`, r.avgs])) });
  assert(alerts.some(a => a.bandeira === "Petz" && a.jornada === "Shipping" && a.tipo === "Queda de volume"), "demo: queda proposital da Petz Shipping gera alerta");
}

asyncTests.then(() => {
  console.log(`\n${passed} passaram, ${failed} falharam.`);
  if (failed > 0) process.exit(1);
});
