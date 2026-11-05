/**
 * Dados de DEMONSTRAÇÃO, usados apenas quando `dataSources.daily` está
 * vazio em config.js. Assim que você preencher a URL real da planilha
 * publicada, este arquivo deixa de ser usado automaticamente.
 *
 * Serve para: (a) você ver o dashboard funcionando de ponta a ponta
 * antes de publicar sua planilha, e (b) demonstrar os alertas (há uma
 * queda de volume e um pico propositais nos dados abaixo).
 */
window.DEMO_DATA_CSV = (function () {
  const hoje = new Date();
  const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const d0 = iso(hoje);
  const ontem = new Date(hoje); ontem.setDate(ontem.getDate() - 1);
  const dm1 = iso(ontem); // Petz chega em D+1

  const rows = [
    "Grupo,Bandeira,Jornada,Periodo,Data_Referencia,Disparos,Respondentes,Promotores,Neutros,Detratores",
    // Petz Shipping: queda proposital hoje
    `PetzCobasi,Petz,Shipping,Dia,${dm1},38,20,8,6,6`,
    `PetzCobasi,Petz,Shipping,Semana,20/09 a 25/09,540,260,150,70,40`,
    `PetzCobasi,Petz,Shipping,Mês,Setembro/2026,3200,1500,900,380,220`,
    // Petz PickUp: pico proposital hoje
    `PetzCobasi,Petz,PickUp,Dia,${dm1},310,150,90,40,20`,
    `PetzCobasi,Petz,PickUp,Semana,20/09 a 25/09,620,300,180,80,40`,
    `PetzCobasi,Petz,PickUp,Mês,Setembro/2026,3600,1700,1000,450,250`,
    // Petz Loja Física: normal
    `PetzCobasi,Petz,Loja Física,Dia,${dm1},95,50,30,12,8`,
    `PetzCobasi,Petz,Loja Física,Semana,20/09 a 25/09,650,320,190,80,50`,
    `PetzCobasi,Petz,Loja Física,Mês,Setembro/2026,3900,1900,1150,470,280`,
    // Cobasi Shipping: sem dados hoje (campo vazio de propósito)
    `PetzCobasi,Cobasi,Shipping,Dia,${d0},,,,,`,
    `PetzCobasi,Cobasi,Shipping,Semana,20/09 a 25/09,480,,,,`,
    `PetzCobasi,Cobasi,Shipping,Mês,Setembro/2026,2900,,,,`,
    // Cobasi PetAnjo: normal
    `PetzCobasi,Cobasi,PetAnjo,Dia,${d0},64,,,,`,
    `PetzCobasi,Cobasi,PetAnjo,Semana,20/09 a 25/09,410,,,,`,
    `PetzCobasi,Cobasi,PetAnjo,Mês,Setembro/2026,2500,,,,`,
    // ZeeDog Digital: normal
    `PetzCobasi,ZeeDog,Digital,Dia,${d0},52,25,15,7,3`,
    `PetzCobasi,ZeeDog,Digital,Semana,20/09 a 25/09,340,160,95,40,25`,
    `PetzCobasi,ZeeDog,Digital,Mês,Setembro/2026,2100,980,580,250,150`,
    // ZeeNow Digital: normal
    `PetzCobasi,ZeeNow,Digital,Dia,${d0},41,20,11,6,3`,
    `PetzCobasi,ZeeNow,Digital,Semana,20/09 a 25/09,290,140,80,35,25`,
    `PetzCobasi,ZeeNow,Digital,Mês,Setembro/2026,1800,860,500,220,140`,
  ];
  return rows.join("\n");
})();

/**
 * Semeia ~10 dias de histórico local "normal" para cada combinação de
 * demonstração, para que a comparação hoje×esperado já funcione na
 * prévia (sem isso, o dashboard mostraria "Histórico insuficiente" em
 * tudo no primeiro acesso, o que é o comportamento correto, mas menos
 * ilustrativo para quem está só vendo a demonstração).
 */
window.seedDemoHistory = function () {
  const baseline = {
    "PetzCobasi||Petz||Shipping": 100,
    "PetzCobasi||Petz||PickUp": 140,
    "PetzCobasi||Petz||Loja Física": 92,
    "PetzCobasi||Cobasi||Shipping": 88,
    "PetzCobasi||Cobasi||PetAnjo": 62,
    "PetzCobasi||ZeeDog||Digital": 50,
    "PetzCobasi||ZeeNow||Digital": 40,
  };
  for (let d = 10; d >= 1; d--) {
    const date = new Date();
    date.setDate(date.getDate() - d);
    const records = Object.keys(baseline).map(k => {
      const [grupo, bandeira, jornada] = k.split("||");
      const jitter = 0.9 + Math.random() * 0.2; // pequena variação natural
      return {
        grupo, bandeira, jornada, periodo: "Dia", dataRef: date,
        disparos: Math.round(baseline[k] * jitter),
        respondentes: Math.round(baseline[k] * jitter * 0.5),
        promotores: Math.round(baseline[k] * jitter * 0.3),
        neutros: Math.round(baseline[k] * jitter * 0.13),
        detratores: Math.round(baseline[k] * jitter * 0.07),
        semDados: false,
      };
    });
    window.History.recordDailySnapshot(records);
  }
};
