/**
 * Consolida os "issues" produzidos pela camada de mapeamento em um
 * relatório de Qualidade dos Dados, e traduz o status técnico de cada
 * fonte em algo que a operação entende (Conectada / Atrasada / Indisponível).
 */
window.Quality = (function () {

  const LABELS = {
    campo_obrigatorio_vazio: "Campo obrigatório vazio",
    periodo_desconhecido: "Período desconhecido",
    data_invalida: "Data inválida",
    jornada_desconhecida: "Jornada desconhecida",
    bandeira_desconhecida: "Bandeira desconhecida",
    valor_negativo: "Valor negativo",
    duplicidade: "Registro duplicado",
    data_hora_invalida: "Data/hora inválida (planilha horária)",
    erro_registro_incompleto: "Registro de erro incompleto",
  };

  function summarize(issues, totalRows) {
    const byType = {};
    issues.forEach(i => { byType[i.type] = (byType[i.type] || 0) + 1; });

    const list = Object.keys(byType).map(type => ({
      tipo: LABELS[type] || type,
      quantidade: byType[type],
      percentual: totalRows > 0 ? ((byType[type] / totalRows) * 100).toFixed(1) + "%" : "—",
    })).sort((a, b) => b.quantidade - a.quantidade);

    return {
      totalProblemas: issues.length,
      totalRegistros: totalRows,
      percentualAfetado: totalRows > 0 ? ((new Set(issues.map(i => i.row)).size / totalRows) * 100).toFixed(1) + "%" : "—",
      porTipo: list,
      detalhes: issues,
    };
  }

  /** Traduz o status técnico de fetch em rótulo operacional + cor. */
  function sourceLabel(status, lastGoodFetch) {
    const map = {
      connected: { texto: "Conectada", icone: "🟢" },
      delayed: { texto: "Atualização atrasada", icone: "🟡" },
      unavailable: { texto: "Indisponível", icone: "🔴" },
      not_configured: { texto: "Não configurada", icone: "⚪" },
    };
    const base = map[status] || map.not_configured;
    return base;
  }

  return { summarize, sourceLabel };
})();
