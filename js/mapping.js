/**
 * Camada de mapeamento e tratamento de dados.
 * Adapta a estrutura real da planilha (nomes de coluna podem variar) para
 * a estrutura canônica usada pelo resto do dashboard. A base original
 * nunca é alterada — esta camada só lê e produz uma cópia tratada.
 */
window.Mapping = (function () {

  const COLUMN_ALIASES = {
    grupo: ["grupo", "group"],
    bandeira: ["bandeira", "marca", "brand"],
    jornada: ["jornada", "journey"],
    periodo: ["periodo", "período", "period"],
    dataReferencia: ["data_referencia", "data referencia", "data_referência", "data referência", "data"],
    disparos: ["disparos", "dispatches", "envios"],
    respondentes: ["respondentes", "respostas", "responses"],
    promotores: ["promotores", "promoters"],
    neutros: ["neutros", "neutrals", "neutral"],
    detratores: ["detratores", "detractors"],
    hora: ["hora", "hour"],
    dataHora: ["datahora", "data_hora", "data hora", "timestamp"],
    tipoErro: ["tipoerro", "tipo_erro", "tipo erro", "erro", "error"],
    quantidade: ["quantidade", "qtd", "count", "quantity"],
  };

  function normKey(k) {
    return String(k || "").toLowerCase().trim()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, ""); // remove acentos
  }

  function buildHeaderIndex(rawRow) {
    const idx = {};
    Object.keys(rawRow).forEach(originalKey => {
      idx[normKey(originalKey)] = originalKey;
    });
    return idx;
  }

  function pick(rawRow, headerIdx, canonicalField) {
    const aliases = COLUMN_ALIASES[canonicalField] || [canonicalField];
    for (const alias of aliases) {
      const norm = normKey(alias);
      if (headerIdx[norm] !== undefined) {
        return rawRow[headerIdx[norm]];
      }
    }
    return undefined;
  }

  function toNumberOrNull(v) {
    if (v === undefined || v === null || String(v).trim() === "") return null;
    const cleaned = String(v).replace(/\./g, "").replace(",", ".").replace(/[^\d.\-]/g, "");
    if (cleaned === "" || cleaned === "-") return null;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }

  let ALL_KNOWN_JOURNEYS = null;
  function allKnownJourneys() {
    if (!ALL_KNOWN_JOURNEYS) {
      ALL_KNOWN_JOURNEYS = new Set(
        Object.values(window.APP_CONFIG.orgStructure).flat().map(normKey)
      );
    }
    return ALL_KNOWN_JOURNEYS;
  }

  function normalizeJourney(raw) {
    if (!raw) return { name: null, raw, recognized: false };
    const key = normKey(raw);
    const alias = window.APP_CONFIG.journeyAliases[key];
    const name = alias || raw;
    const recognized = allKnownJourneys().has(normKey(name));
    return { name, raw, recognized };
  }

  function parseDateFlexible(raw) {
    if (!raw) return null;
    const s = String(raw).trim();
    // formato ISO: 2026-09-23
    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    // formato BR: 23/09/2026 ou 23/09
    m = s.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
    if (m) {
      const year = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : new Date().getFullYear();
      return new Date(year, Number(m[2]) - 1, Number(m[1]));
    }
    return null; // intervalos tipo "20/09 a 23/09" não viram Date único — tratado à parte
  }

  const PERIODO_MAP = { "dia": "Dia", "day": "Dia", "semana": "Semana", "week": "Semana", "mes": "Mês", "mês": "Mês", "month": "Mês" };

  /**
   * Normaliza as linhas da aba diária/semanal/mensal (Base_NPS).
   * Retorna { records, issues } — issues alimenta a seção de Qualidade dos Dados.
   */
  function mapDailySheet(rawRows) {
    const records = [];
    const issues = [];
    const seenKeys = new Set();

    rawRows.forEach((rawRow, i) => {
      const rowNum = i + 2; // +2: linha 1 é cabeçalho, planilha é 1-indexed
      const headerIdx = buildHeaderIndex(rawRow);

      const grupo = pick(rawRow, headerIdx, "grupo");
      const bandeira = pick(rawRow, headerIdx, "bandeira");
      const jornadaRaw = pick(rawRow, headerIdx, "jornada");
      const periodoRaw = pick(rawRow, headerIdx, "periodo");
      const dataRefRaw = pick(rawRow, headerIdx, "dataReferencia");

      const journey = normalizeJourney(jornadaRaw);
      const periodo = PERIODO_MAP[normKey(periodoRaw)] || null;
      const dataParsed = periodo === "Dia" ? parseDateFlexible(dataRefRaw) : null;

      const disparos = toNumberOrNull(pick(rawRow, headerIdx, "disparos"));
      const comResp = window.Rules.hasResponses(bandeira); // ex.: Cobasi não tem respostas (data da compra)
      const respondentes = comResp ? toNumberOrNull(pick(rawRow, headerIdx, "respondentes")) : null;
      const promotores = comResp ? toNumberOrNull(pick(rawRow, headerIdx, "promotores")) : null;
      const neutros = comResp ? toNumberOrNull(pick(rawRow, headerIdx, "neutros")) : null;
      const detratores = comResp ? toNumberOrNull(pick(rawRow, headerIdx, "detratores")) : null;

      // ---- validações de qualidade ----
      if (!grupo || !bandeira || !jornadaRaw || !periodoRaw) {
        issues.push({ type: "campo_obrigatorio_vazio", row: rowNum, detail: "Grupo/Bandeira/Jornada/Periodo ausente" });
      }
      if (periodoRaw && !periodo) {
        issues.push({ type: "periodo_desconhecido", row: rowNum, detail: String(periodoRaw) });
      }
      if (periodo === "Dia" && dataRefRaw && !dataParsed) {
        issues.push({ type: "data_invalida", row: rowNum, detail: String(dataRefRaw) });
      }
      if (jornadaRaw && !journey.recognized) {
        issues.push({ type: "jornada_desconhecida", row: rowNum, detail: String(jornadaRaw) });
      }
      if (bandeira && window.APP_CONFIG.orgStructure[bandeira] === undefined) {
        issues.push({ type: "bandeira_desconhecida", row: rowNum, detail: String(bandeira) });
      }
      [["disparos", disparos], ["respondentes", respondentes], ["promotores", promotores], ["neutros", neutros], ["detratores", detratores]]
        .forEach(([field, val]) => {
          if (val !== null && val < 0) issues.push({ type: "valor_negativo", row: rowNum, detail: `${field}=${val}` });
        });

      const dedupeKey = [grupo, bandeira, jornadaRaw, periodoRaw, dataRefRaw].join("|");
      if (seenKeys.has(dedupeKey)) {
        issues.push({ type: "duplicidade", row: rowNum, detail: dedupeKey });
      }
      seenKeys.add(dedupeKey);

      const isFullyEmpty = disparos === null && respondentes === null && promotores === null && neutros === null && detratores === null;

      records.push({
        grupo: grupo || null,
        bandeira: bandeira || null,
        jornada: journey.name,
        jornadaRaw: jornadaRaw || null,
        periodo,
        dataRefRaw: dataRefRaw || null,
        dataRef: dataParsed, // Date | null (só quando Periodo=Dia)
        disparos, respondentes, promotores, neutros, detratores,
        semDados: isFullyEmpty,
        rowNum,
      });
    });

    return { records, issues };
  }

  /** Normaliza a aba horária (opcional/futura). */
  function mapHourlySheet(rawRows) {
    const records = [];
    const issues = [];
    rawRows.forEach((rawRow, i) => {
      const rowNum = i + 2;
      const headerIdx = buildHeaderIndex(rawRow);
      const grupo = pick(rawRow, headerIdx, "grupo");
      const bandeira = pick(rawRow, headerIdx, "bandeira");
      const journey = normalizeJourney(pick(rawRow, headerIdx, "jornada"));
      const dataRaw = pick(rawRow, headerIdx, "dataReferencia");
      const horaRaw = pick(rawRow, headerIdx, "hora");
      const dataParsed = parseDateFlexible(dataRaw);
      const hora = horaRaw !== undefined ? parseInt(String(horaRaw).replace(/\D/g, ""), 10) : NaN;

      if (!dataParsed || Number.isNaN(hora)) {
        issues.push({ type: "data_hora_invalida", row: rowNum, detail: `${dataRaw} ${horaRaw}` });
        return;
      }
      const dt = new Date(dataParsed);
      dt.setHours(hora, 0, 0, 0);

      records.push({
        grupo: grupo || null,
        bandeira: bandeira || null,
        jornada: journey.name,
        datetime: dt,
        disparos: toNumberOrNull(pick(rawRow, headerIdx, "disparos")),
        respondentes: window.Rules.hasResponses(bandeira) ? toNumberOrNull(pick(rawRow, headerIdx, "respondentes")) : null,
        promotores: window.Rules.hasResponses(bandeira) ? toNumberOrNull(pick(rawRow, headerIdx, "promotores")) : null,
        neutros: window.Rules.hasResponses(bandeira) ? toNumberOrNull(pick(rawRow, headerIdx, "neutros")) : null,
        detratores: window.Rules.hasResponses(bandeira) ? toNumberOrNull(pick(rawRow, headerIdx, "detratores")) : null,
      });
    });
    return { records, issues };
  }

  /** Normaliza a aba de erros (opcional/futura). */
  function mapErrorsSheet(rawRows) {
    const records = [];
    const issues = [];
    rawRows.forEach((rawRow, i) => {
      const rowNum = i + 2;
      const headerIdx = buildHeaderIndex(rawRow);
      const grupo = pick(rawRow, headerIdx, "grupo");
      const bandeira = pick(rawRow, headerIdx, "bandeira");
      const journey = normalizeJourney(pick(rawRow, headerIdx, "jornada"));
      const dtRaw = pick(rawRow, headerIdx, "dataHora");
      const tipoErro = pick(rawRow, headerIdx, "tipoErro");
      const quantidade = toNumberOrNull(pick(rawRow, headerIdx, "quantidade")) ?? 1;

      let dt = null;
      if (dtRaw) {
        const d = new Date(String(dtRaw).replace(" ", "T"));
        if (!Number.isNaN(d.getTime())) dt = d;
      }
      if (!dt || !tipoErro) {
        issues.push({ type: "erro_registro_incompleto", row: rowNum, detail: String(dtRaw) });
        return;
      }
      records.push({ grupo: grupo || null, bandeira: bandeira || null, jornada: journey.name, datetime: dt, tipoErro: String(tipoErro), quantidade });
    });
    return { records, issues };
  }

  return { mapDailySheet, mapHourlySheet, mapErrorsSheet, toNumberOrNull, parseDateFlexible, normKey };
})();
