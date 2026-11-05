/**
 * Teste de interface em DOM simulado (jsdom): carrega o index.html real,
 * roda todos os scripts do projeto em modo demonstração e confere o que
 * aparece na tela. Opcional — requer:  npm i jsdom  (não faz parte do deploy).
 * Uso: NODE_PATH=<pasta com node_modules> node test/dom_test.js
 */
const fs = require("fs");
const path = require("path");
const { JSDOM, VirtualConsole } = require("jsdom");

const root = path.join(__dirname, "..");
let passed = 0, failed = 0;
const assert = (c, m) => { if (c) { passed++; console.log("  OK -", m); } else { failed++; console.error("  FALHOU -", m); } };

// Monta um HTML único: scripts do projeto inline, CDNs removidas (Chart.js vira stub)
function buildHtml() {
  let html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  html = html.replace(/\s*<script src="https:[^>]*><\/script>/g, "");
  html = html.replace(/<script src="(js\/[^"]+)"><\/script>/g, (_, f) => "<script>\n" + fs.readFileSync(path.join(root, f), "utf8") + "\n</script>");
  return html;
}

(async () => {
  const errors = [];
  const vc = new VirtualConsole();
  vc.on("jsdomError", e => errors.push(e.message));
  vc.on("error", e => errors.push(String(e)));

  const dom = new JSDOM(buildHtml(), {
    url: "http://localhost/", runScripts: "dangerously", pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) { w.Chart = function () { this.destroy = () => {}; }; },
  });
  const { window } = dom;
  const doc = window.document;
  await new Promise(r => window.addEventListener("load", r));
  await new Promise(r => setTimeout(r, 400));
  const txt = sel => [...doc.querySelectorAll(sel)].map(e => e.textContent.replace(/\s+/g, " ")).join(" | ");
  const change = (id, v) => { const el = doc.getElementById(id); el.value = v; el.dispatchEvent(new window.Event("change")); };

  console.log("\n=== INTERFACE (modo demonstração) ===");
  assert(errors.length === 0, "nenhum erro de JavaScript ao carregar" + (errors.length ? " -> " + errors[0] : ""));
  assert(doc.querySelectorAll("#monitoringBody tr").length === 7, "tabela de monitoramento tem as 7 jornadas");
  const rows = txt("#monitoringBody tr");
  assert(/Petz[^|]*\(D\+1\)/.test(rows), "Petz aparece com 'D+1' na coluna Data ref.");
  assert(/Cobasi[^|]*\(D\+0\)/.test(rows), "Cobasi aparece com 'D+0'");
  assert((rows.match(/Regra em definição/g) || []).length >= 2, "ZeeDog e ZeeNow aparecem como 'Regra em definição'");
  assert(doc.querySelectorAll("#kpiGrid .kpi-card").length === 4, "4 cards de KPI (Dia, Semana, Mês, Período)");
  assert(/Respostas\/NPS não incluem Cobasi/.test(txt("#kpiGrid")), "KPIs avisam que respostas/NPS não incluem a Cobasi");
  assert(/Petz: \d\d\/\d\d \(D\+1\)/.test(txt("#kpiGrid")), "card 'Dia' informa a data de referência da Petz (D+1)");
  assert(/Cobasi/.test(txt("#rulesCard")) && /D\+1/.test(txt("#rulesCard")), "aba Configurações lista as regras por bandeira");
  assert(/Queda de volume/.test(txt("#alertsList")), "Central de Alertas mostra a queda proposital da demonstração");

  console.log("\n=== FILTRO: bandeira = Cobasi ===");
  change("filterBandeira", "Cobasi");
  assert(/N\/A/.test(txt("#kpiGrid")), "KPIs de respostas/NPS mostram N/A quando só há Cobasi");
  assert(/Não disponível/.test(txt("#responsesNote")), "gráfico de respostas informa que não está disponível");

  console.log("\n=== FILTRO: período ===");
  change("filterBandeira", "");
  change("filterPeriodo", "7d");
  assert(/Período: Últimos 7 dias/.test(txt("#kpiGrid")), "preset 'Últimos 7 dias' aparece no card de período");
  change("filterPeriodo", "custom");
  assert(!doc.getElementById("dateFromWrap").classList.contains("hidden"), "período personalizado abre os campos de data");

  console.log("\n=== DRILL-DOWN ===");
  doc.querySelector("#monitoringBody tr").dispatchEvent(new window.Event("click"));
  assert(!doc.getElementById("drillModal").classList.contains("hidden") && /dia de referência/.test(txt("#drillBody")), "clicar na linha abre o detalhe da jornada");

  assert(errors.length === 0, "nenhum erro de JavaScript após interações" + (errors.length ? " -> " + errors[0] : ""));
  console.log(`\n${passed} passaram, ${failed} falharam.`);
  process.exit(failed ? 1 : 0);
})();
