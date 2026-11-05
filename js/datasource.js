/**
 * Camada de acesso à fonte de dados.
 * Busca os CSVs publicados do Google Sheets. Nunca lança exceção para
 * fora: sempre devolve um objeto de status, para o resto do app decidir
 * como mostrar "fonte indisponível" sem apagar dados anteriores.
 */
window.DataSource = (function () {

  const STATUS = { CONNECTED: "connected", DELAYED: "delayed", UNAVAILABLE: "unavailable", NOT_CONFIGURED: "not_configured" };
  const DAILY_COLUMNS = [
    "Grupo", "Bandeira", "Jornada", "Periodo", "Data_Referencia",
    "Disparos", "Respondentes", "Promotores", "Neutros", "Detratores",
  ];

  async function fetchCSV(url, { timeoutMs = 15000, requiredHeaders = [] } = {}) {
    if (!url || !url.trim()) {
      return { ok: false, reason: "not_configured", rows: [] };
    }
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);
    try {
      // cache-busting para garantir dado fresco a cada clique em "Atualizar"
      const bust = (url.includes("?") ? "&" : "?") + "_ts=" + Date.now();
      const res = await fetch(url + bust, { signal: controller.signal, cache: "no-store" });
      clearTimeout(t);
      if (!res.ok) {
        return { ok: false, reason: "http_" + res.status, rows: [] };
      }
      const text = await res.text();
      const parsed = window.CSVUtil.parseWithHeaders(text);
      const missingColumns = requiredHeaders.filter(column => !parsed.headers.includes(column));
      if (missingColumns.length) {
        return { ok: false, reason: "missing_columns", missingColumns, rows: [] };
      }
      return { ok: true, rows: parsed.rows };
    } catch (err) {
      clearTimeout(t);
      return { ok: false, reason: (err && err.name === "AbortError") ? "timeout" : "network_error", rows: [] };
    }
  }

  /**
   * Busca as três fontes (daily obrigatória, hourly/errors opcionais)
   * e retorna um snapshot consolidado com status de cada uma.
   */
  async function fetchAll() {
    const cfg = window.APP_CONFIG.dataSources;
    const [dailyResult, hourly, errors] = await Promise.all([
      fetchCSV(cfg.daily, { requiredHeaders: DAILY_COLUMNS }),
      fetchCSV(cfg.hourly),
      fetchCSV(cfg.errors),
    ]);

    let daily = dailyResult;
    let usingDemo = false;
    if (!dailyResult.ok && window.DEMO_DATA_CSV) {
      usingDemo = true;
      daily = {
        ok: true,
        rows: window.CSVUtil.parse(window.DEMO_DATA_CSV),
        reason: dailyResult.reason,
      };
    }

    const now = new Date();

    function statusFor(result) {
      if (result.ok) return STATUS.CONNECTED;
      if (result.reason === "not_configured") return STATUS.NOT_CONFIGURED;
      return STATUS.UNAVAILABLE;
    }

    return {
      fetchedAt: now,
      usingDemo,
      daily: { status: statusFor(dailyResult), rows: daily.rows, ok: daily.ok, reason: dailyResult.reason },
      hourly: { status: statusFor(hourly), rows: hourly.rows, ok: hourly.ok, reason: hourly.reason },
      errors: { status: statusFor(errors), rows: errors.rows, ok: errors.ok, reason: errors.reason },
    };
  }

  return { fetchAll, STATUS };
})();
