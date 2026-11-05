# Torre de Controle — Disparos NPS (Grupo PetzCobasi)

Dashboard estático (HTML/CSS/JS puro, sem build step) para monitorar os
disparos de pesquisas NPS do Grupo PetzCobasi. Lê os dados diretamente do
Google Sheets publicado como CSV, **sem precisar de novo deploy** quando a
planilha é atualizada.

---

## 1. Como publicar a planilha (obrigatório)

1. Abra a planilha no Google Sheets.
2. Verifique se a aba com os dados diários/semanais/mensais se chama
   **Base_NPS** (colunas: `Grupo, Bandeira, Jornada, Periodo, Data_Referencia,
   Disparos, Respondentes, Promotores, Neutros, Detratores`).
3. Menu **Arquivo → Compartilhar → Publicar na Web**.
4. Em "Link", escolha a aba **Base_NPS** (não "Documento inteiro") e o
   formato **Valores separados por vírgula (.csv)**.
5. Clique em **Publicar** e copie a URL gerada (algo como
   `https://docs.google.com/spreadsheets/d/e/2PACX-.../pub?gid=123456&single=true&output=csv`).
6. Cole essa URL na constante `GOOGLE_SHEET_URL`, no início de
   `js/config.js`. A planilha precisa estar publicada/acessível como CSV.

O projeto está configurado inicialmente para a planilha fornecida, usando
o endpoint CSV da aba `Base_NPS` (`gid=269333055`). Se a publicação gerar outra URL,
substitua o valor de `GOOGLE_SHEET_URL` pela URL CSV publicada.
Se a fonte estiver indisponível ou não contiver todas as colunas obrigatórias,
o dashboard usa os dados de demonstração como fallback e exibe o banner
correspondente; quando o CSV válido é carregado, o banner não aparece.

> ⚠️ Publicar na Web torna a planilha (só a aba escolhida, em modo somente
> leitura) acessível por link a quem tiver a URL. É a forma mais simples de
> ter "atualizar a planilha = atualizar o dashboard" sem backend nem chaves
> de API. Se isso for uma restrição para o seu caso, veja a seção 7
> (alternativa com Google Sheets API + Netlify Functions).

### 1.1 Fontes futuras (opcional): disparos por hora e log de erros

O dashboard já está pronto para os alertas de **ausência de disparos por
hora** e **erro recorrente**, mas eles só ativam quando você criar (e
publicar da mesma forma) duas abas extras:

**Aba de disparos por hora** (nome livre, ex: `Base_Hora`), colunas:
`Grupo, Bandeira, Jornada, Data, Hora, Disparos, Respondentes, Promotores, Neutros, Detratores`
(`Hora` = 0 a 23)

**Aba de log de erros** (nome livre, ex: `Base_Erros`), colunas:
`Grupo, Bandeira, Jornada, DataHora, TipoErro, Quantidade`
(`DataHora` no formato `2026-09-25 14:32`)

Publique cada uma como CSV (mesmo processo acima) e cole as URLs em
`dataSources.hourly` e `dataSources.errors` em `js/config.js`. Até lá, o
dashboard mostra "Histórico insuficiente" / esconde essas checagens — ele
nunca inventa dado horário a partir da base diária.

---

## 2. Configuração (`js/config.js`)

Todo o comportamento sensível fica centralizado nesse arquivo:

- `dataSources`: as 3 URLs de CSV (item 1).
- `autoRefreshMinutes`: intervalo de atualização automática (0 desativa).
- `thresholds`: os limites de alerta (queda, pico, erro recorrente, etc.).
  Também podem ser ajustados pela própria aba **Configurações** do
  dashboard (fica salvo no navegador de quem ajustou, sem alterar o código).
- `orgStructure`: a hierarquia Grupo → Bandeira → Jornada usada para
  validar a base e alimentar os filtros.
- `journeyAliases`: mapeamento de variações de nome de jornada encontradas
  na planilha real (ex.: "Ship" → "Shipping").

Nenhuma credencial, token ou senha é usado neste projeto — não há nada a
esconder em variável de ambiente porque a fonte é um CSV público de leitura.

---

## 3. Rodando localmente

Não há build. Basta servir os arquivos estáticos, por exemplo:

```bash
npx serve .
# ou
python3 -m http.server 8080
```

Abra `http://localhost:8080` (ou a porta indicada).

---

## 4. Deploy no Netlify

**Opção A — arrastar e soltar:** na Netlify, "Add new site" → "Deploy
manually" → arraste a pasta do projeto (ou o ZIP extraído).

**Opção B — Git:** suba este projeto para um repositório e conecte no
Netlify. Configuração de build já está em `netlify.toml`:
- Build command: (vazio — não há build)
- Publish directory: `.`

Depois do primeiro deploy, **atualizar a planilha no Google Sheets já é
suficiente** — não é preciso mexer no Netlify de novo. O dashboard busca o
CSV publicado a cada clique em "🔄 Atualizar dados" e, opcionalmente, a
cada `autoRefreshMinutes`.

---

## 5. Estrutura do projeto

```
index.html            Estrutura das telas (Visão Geral, Monitoramento, Alertas, Análises, Qualidade, Configurações)
css/style.css          Estilo visual (design corporativo, cores semânticas)
js/config.js           Configuração central (fontes de dados + thresholds) — ETAPA "Configurações"
js/rules.js            Regras de negócio por bandeira (D+1, CD da Petz, Cobasi sem respostas, Zee em definição)
js/csv.js              Parser de CSV
js/datasource.js        Busca os CSVs publicados — ETAPA "Fonte de dados"
js/mapping.js           Normaliza/mapeia colunas reais -> estrutura canônica, valida qualidade — ETAPAS "Tratamento" + "Validação"
js/history.js           Acumula histórico diário no navegador (localStorage) para calcular médias reais
js/calculations.js      KPIs, NPS, médias, variações — ETAPA "Cálculos"
js/alerts.js            Regras de alerta (queda, 7 dias, pico, ausência, erro recorrente) — ETAPA "Regras de monitoramento"
js/quality.js           Relatório de Qualidade dos Dados + status da fonte
js/charts.js            Gráficos (Chart.js)
js/ui.js                Renderização das telas — ETAPA "Dashboard"
js/main.js              Orquestra o fluxo completo (fonte → tratamento → validação → cálculo → alertas → dashboard)
netlify.toml            Configuração de publish/redirects para Netlify
test/smoke_test.js      Testes automatizados da lógica de negócio (rode com `node test/smoke_test.js`)
```

Arquitetura (item 25 do briefing):

```
Fonte de dados (CSV publicado)
        ↓
js/mapping.js  (tratamento)
        ↓
js/mapping.js  (validação/qualidade)
        ↓
js/calculations.js + js/history.js  (cálculos e médias)
        ↓
js/alerts.js  (regras de monitoramento e alertas)
        ↓
js/ui.js + js/main.js  (dashboard)
```

---

## 6. Como a "média esperada" é calculada — leia isto

A aba `Base_NPS` traz o valor de **hoje** para `Periodo=Dia`, não uma série
histórica. Para não inventar médias, o dashboard **acumula seu próprio
histórico no navegador** (`localStorage`) a cada atualização, guardando o
snapshot do dia. Com o uso contínuo (acessos em dias diferentes), a
qualidade das médias melhora:

1. **Sem nenhum histórico ainda:** o dashboard usa uma **estimativa**
   explicitamente rotulada (total do mês / dias corridos) — nunca chamada
   de "média histórica".
2. **Com poucos dias (abaixo dos mínimos configurados):** mostra
   "Histórico insuficiente" e **não gera alertas de queda/pico** para
   aquela combinação, para evitar falso positivo.
3. **Com histórico suficiente:** usa, em ordem de preferência, a média do
   mesmo dia da semana → média dos últimos 7 dias → média histórica geral.

Isso é uma solução de contorno para a limitação real da planilha atual
(sem granularidade horária/série diária persistida). Se a aba `Base_NPS`
vier a manter um histórico diário completo (uma linha por dia por
jornada, e não só "hoje"), a lógica de `js/history.js` pode ser adaptada
para ler direto da planilha em vez do localStorage — isso deixaria o
histórico compartilhado entre todos os usuários, em vez de por navegador.

Os alertas de **ausência de disparos por hora** e **erro recorrente**
seguem a mesma filosofia: só ficam ativos quando as fontes `hourly` /
`errors` estiverem configuradas e conectadas (ver seção 1.1). Sem elas,
o dashboard nunca afirma "sem disparos há 2h" com base em dados que não
tem.

---

### 6.1 Filtro de datas

O filtro **Período** (Hoje, Últimos 7/30 dias, Mês atual ou Personalizado) afeta:
o card "Período" da Visão Geral, a coluna "Total no período" do Monitoramento,
o gráfico de evolução, o histórico de alertas, o drill-down e a exportação CSV.

Importante: ele soma o **histórico diário acumulado no navegador** (seção 6).
Dias em que ninguém abriu/atualizou o dashboard não existem nesse histórico —
por isso o card mostra "X dia(s) com dados de Y" para você saber a cobertura.
Período sem nenhum dia registrado aparece como "Sem dados", nunca como zero.
Os cards fixos Hoje/Semana/Mês continuam vindo direto da planilha.

---

### 6.2 Regras de negócio por bandeira (`bandeiraRules` em `js/config.js`)

| Bandeira | Regra aplicada |
|---|---|
| **Petz** | Dados puxados em **D+1**: o "dia de referência" é ontem. A falta do dado de hoje é esperada; só gera alerta **"Dado desatualizado"** se faltar o dado de ontem. |
| **Petz → CD** | Não dispara aos **domingos** (status "Sem disparo previsto", sem alerta). A **segunda** é dia de reposição: só é comparada com outras segundas e não gera alerta de pico/queda vs. 7 dias. Domingos e segundas ficam fora da média dos demais dias. |
| **Cobasi** | Somente **volume de disparos**. Respostas, promotores, neutros, detratores e NPS aparecem como **N/A** (contabilizados pela data da compra) e os totais de respostas informam que não incluem a Cobasi. Assume-se dado no próprio dia (D+0). |
| **ZeeDog / ZeeNow** | **Regra em definição**: os volumes aparecem, mas não há avaliação nem alertas de volume. Quando a regra for definida, basta trocar `dataLagDays: null` pelo valor correto. |

Alertas de **ausência de disparos por hora** só valem para bandeiras com base no próprio dia (D+0), pois com base atrasada não dá para afirmar ausência em tempo real.

Suposição: `Data_Referencia` na planilha é a data do **disparo**. Se for a data da compra/pedido, ajuste `noDispatchWeekdays`/`catchUpWeekdays`.

---

## 7. Alternativa mais robusta de fonte de dados (opcional)

Se no futuro a planilha não puder ficar "Publicada na Web" (por política
de segurança, por exemplo), a alternativa é:

- Google Sheets API v4 com uma Service Account;
- a chamada à API feita a partir de uma **Netlify Function** (backend
  serverless), nunca do navegador;
- a credencial da Service Account fica em uma variável de ambiente do
  Netlify (`GOOGLE_SERVICE_ACCOUNT_KEY`), nunca no repositório;
- o front-end passa a chamar `/.netlify/functions/get-nps-data` em vez do
  CSV público diretamente.

Essa opção é mais segura (a planilha não fica pública) mas exige mais
configuração (criar a Service Account, compartilhar a planilha com o
e-mail dela, configurar a variável de ambiente no Netlify). Não foi a
opção implementada nesta entrega porque você optou pela alternativa mais
simples (CSV publicado); avise se quiser que eu implemente esta variante.

---

## 8. Testes

Rode a suíte de testes de lógica (parsing, mapeamento, qualidade, médias,
alertas) com:

```bash
node test/smoke_test.js
```

Teste opcional da interface (precisa de `npm i jsdom`, não faz parte do deploy): `node test/dom_test.js`.

Os 48 testes automatizados cobrem: parsing de CSV, mapeamento e detecção
de problemas de qualidade (duplicidade, jornada desconhecida, valor
negativo, campo vazio), histórico insuficiente (não inventar média),
queda de volume, pico anormal, ausência de disparos (com e sem fonte
horária conectada — para garantir que não gera falso positivo), erro
recorrente, e resiliência da camada de fonte de dados a falhas de rede.

Testes de filtros, drill-down, responsividade e deploy no Netlify em si
são de UI/infraestrutura e foram verificados manualmente (estrutura de
arquivos, referências de scripts/CSS, sintaxe de todos os arquivos JS,
validade dos links de CDN do Chart.js). Veja `test/smoke_test.js` para o
detalhe de cada asserção.

---

## 9. Limitações conhecidas (transparência)

- A planilha fornecida (`Base_NPS`) só tem granularidade **Dia / Semana /
  Mês**, sem hora nem log de erros — por isso os alertas horários e de
  erro recorrente dependem das fontes opcionais descritas na seção 1.1.
- O histórico usado para calcular médias reais é acumulado **por
  navegador** (localStorage), não compartilhado entre usuários, até que a
  planilha tenha uma série histórica própria (ver seção 6).
- "Publicar na Web" deixa a aba escolhida da planilha acessível a quem
  tiver o link, em modo leitura. Veja a seção 7 se isso for um problema.
