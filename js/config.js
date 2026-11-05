/**
 * ============================================================
 * CONFIGURAÇÃO CENTRAL — TORRE DE CONTROLE NPS
 * ============================================================
 * Todos os thresholds e parâmetros do sistema ficam aqui.
 * NÃO espalhe números mágicos pelo resto do código.
 *
 * IMPORTANTE — CONFIGURAR ANTES DE USAR:
 * A constante GOOGLE_SHEET_URL abaixo deve apontar para o CSV publicado.
 * Veja o README.md, seção "Como publicar a planilha", para o
 * passo a passo de como gerar essas URLs sem precisar de senha
 * ou chave de API.
 * ============================================================
 */

// URL CSV da aba Base_NPS. Substitua aqui pela URL publicada como CSV,
// se a URL/aba da planilha mudar. A planilha precisa estar acessível publicamente.
const GOOGLE_SHEET_URL = "https://docs.google.com/spreadsheets/d/17HvCMwsVOaFzAbAaJWxJCcPi85OCHGWdSvgTvOW-wmg/export?format=csv&gid=269333055";

window.APP_CONFIG = {

  // ----------------------------------------------------------
  // FONTES DE DADOS (CSV publicado via Google Sheets)
  // ----------------------------------------------------------
  // "daily" é obrigatória (é a aba Base_NPS, com Periodo Dia/Semana/Mês).
  // "hourly" e "errors" são OPCIONAIS: se a URL ficar em branco ou o
  // fetch falhar, o dashboard simplesmente esconde/desabilita as
  // seções que dependem delas e mostra "Histórico insuficiente" /
  // "Sem dados", em vez de quebrar ou inventar números.
  dataSources: {
    daily: GOOGLE_SHEET_URL,
    hourly: "", // <- (opcional, futuro) CSV com colunas: Grupo,Bandeira,Jornada,Data,Hora,Disparos,Respondentes,Promotores,Neutros,Detratores
    errors: "", // <- (opcional, futuro) CSV com colunas: Grupo,Bandeira,Jornada,DataHora,TipoErro,Quantidade
  },

  // Intervalo de atualização automática (minutos). 0 = desativado.
  autoRefreshMinutes: 10,

  // ----------------------------------------------------------
  // THRESHOLDS DE ALERTA (todos configuráveis pela tela de
  // Configurações do próprio dashboard — isso aqui são os
  // valores padrão / de fábrica)
  // ----------------------------------------------------------
  thresholds: {
    // Alerta 1 — queda de volume vs. média esperada do dia
    ATTENTION_THRESHOLD: 0.80,   // abaixo de 80% da média esperada -> ATENÇÃO
    CRITICAL_THRESHOLD: 0.50,    // abaixo de 50% da média esperada -> CRÍTICO

    // Alerta — queda comparada à média dos últimos 7 dias
    SEVEN_DAY_DROP_THRESHOLD: 0.30, // queda > 30% -> alerta

    // Alerta — ausência de disparos (depende da fonte "hourly")
    NO_DISPATCH_HOURS: 2,

    // Alerta — pico anormal (múltiplo da média histórica)
    ANOMALOUS_SPIKE_MULTIPLIER: 2.0, // 2x a média histórica -> pico anormal

    // Alerta — erro recorrente (depende da fonte "errors")
    RECURRING_ERROR_COUNT: 3,
    RECURRING_ERROR_WINDOW_HOURS: 1,

    // Histórico mínimo de dias para considerar uma média confiável
    MIN_HISTORY_POINTS: 3,
    MIN_HISTORY_POINTS_WEEKDAY_AVG: 4, // mín. de mesmas ocorrências de dia da semana
  },

  // Quantos dias de snapshot diário o dashboard guarda no navegador
  // (localStorage) para construir histórico próprio a partir da
  // aba Base_NPS, que só traz o "hoje". Ver js/history.js.
  historyRetentionDays: 120,

  // Estrutura organizacional (Grupo -> Bandeira -> Jornadas)
  // Usada para validar dados e para navegação/drill-down mesmo
  // quando a planilha ainda não tem registro para uma combinação.
  orgStructure: {
    "Cobasi": ["Shipping", "PickUp", "CD", "PetAnjo", "Assinatura", "Amigo Cobasi", "Loja Física"],
    "Petz": ["Shipping", "PickUp", "CD", "Banho e Tosa", "Seres", "Assinatura", "Loja Física"],
    "ZeeDog": ["Digital", "Loja Física"],
    "ZeeNow": ["Digital", "Loja Física"],
  },

  // ----------------------------------------------------------
  // REGRAS DE NEGÓCIO POR BANDEIRA
  // ----------------------------------------------------------
  // dataLagDays : atraso da base. 0 = dado do próprio dia; 1 = D+1 (o dia de
  //               referência é ontem); null = REGRA EM DEFINIÇÃO (mostra os
  //               volumes, mas não avalia nem gera alertas de volume).
  // hasResponses: false = só existe volume de disparos (respostas/NPS não se aplicam).
  // journeyOverrides.<Jornada>: noDispatchWeekdays = dias SEM disparo;
  //               catchUpWeekdays = dias de reposição (volume maior).
  //               Dias da semana: 0=domingo, 1=segunda ... 6=sábado.
  bandeiraRules: {
    "Petz": {
      dataLagDays: 1,
      hasResponses: true,
      journeyOverrides: {
        "CD": {
          noDispatchWeekdays: [0],
          catchUpWeekdays: [1],
          descricao: "não dispara aos domingos (sem alerta); a segunda-feira é dia de reposição e só é comparada com outras segundas.",
        },
      },
    },
    "Cobasi": { dataLagDays: 0, hasResponses: false },
    "ZeeDog": { dataLagDays: null, hasResponses: true },
    "ZeeNow": { dataLagDays: null, hasResponses: true },
  },

  // Aliases de nomes de jornada encontrados na planilha real,
  // para normalizar contra o orgStructure acima (ex: "Ship" -> "Shipping").
  journeyAliases: {
    "ship": "Shipping",
    "shipping": "Shipping",
    "pickup": "PickUp",
    "pick-up": "PickUp",
    "loja fisica": "Loja Física",
    "loja física": "Loja Física",
    "cd": "CD",
    "petanjo": "PetAnjo",
    "assinatura": "Assinatura",
    "amigo cobasi": "Amigo Cobasi",
    "banho e tosa": "Banho e Tosa",
    "seres": "Seres",
    "digital": "Digital",
  },
};
