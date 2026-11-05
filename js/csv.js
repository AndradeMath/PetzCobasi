/**
 * Parser de CSV leve, sem dependências externas.
 * Lida com aspas, vírgulas dentro de campos e quebras de linha \r\n.
 */
window.CSVUtil = (function () {
  function parseWithHeaders(text) {
    const rows = [];
    let row = [];
    let field = "";
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      const next = text[i + 1];

      if (inQuotes) {
        if (c === '"' && next === '"') { field += '"'; i++; }
        else if (c === '"') { inQuotes = false; }
        else { field += c; }
      } else {
        if (c === '"') { inQuotes = true; }
        else if (c === ',') { row.push(field); field = ""; }
        else if (c === '\r') { /* ignore */ }
        else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ""; }
        else { field += c; }
      }
    }
    if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }

    const nonEmpty = rows.filter(r => r.some(v => String(v).trim() !== ""));
    if (nonEmpty.length === 0) return { headers: [], rows: [] };

    const headers = nonEmpty[0].map(h => String(h).trim());
    const out = [];
    for (let i = 1; i < nonEmpty.length; i++) {
      const r = nonEmpty[i];
      const obj = {};
      headers.forEach((h, idx) => { obj[h] = (r[idx] !== undefined ? String(r[idx]).trim() : ""); });
      out.push(obj);
    }
    return { headers, rows: out };
  }

  function parse(text) {
    return parseWithHeaders(text).rows;
  }

  return { parse, parseWithHeaders };
})();
