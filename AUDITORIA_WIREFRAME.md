# Auditoria: wireframe × app real (Envoxers)

Comparação sistemática entre `envox-f0-f3-wireframe.html` (fonte da verdade de design) e o frontend/backend implementados em `frontend/public/tc-*.jsx` + `backend/app/`.

**Data:** 2026-07-08 · **Metodologia:** extração programática (grep/diff/Python) de fontes, tokens `:root`, `data-view`, `data-hlp`, ícones SVG e endpoints de backend, cruzada com leitura manual das seções de cada tela.

---

## 1. Fontes — ✅ sem gaps

`index.html` do projeto real tem exatamente o mesmo `<link>` do Google Fonts do wireframe (Inter 400/500/600/700, Instrument Serif ital, JetBrains Mono 400/500), byte-a-byte idêntico. `envox-tokens.css` define `--font-ui/--font-serif/--font-mono` com os mesmos valores. Busquei todo uso de `fontFamily` inline nos `.jsx` — as 3 ocorrências (`tc-churn-lista.jsx`, `tc-foco.jsx`) referenciam as variáveis CSS corretamente, nenhuma fonte hardcoded divergente.

## 2. Design tokens — ✅ sem gaps

Extraí programaticamente o bloco `:root` dos dois arquivos e comparei variável por variável: **26 variáveis em cada, 0 divergência de valor, 0 variável faltando ou sobrando** (cores do farol, `--envox`/`--envox-hover`/`--envox-soft`, `--ink`/`--bg`/`--line` em todos os tons, `--r-sm/md/lg`, `--shadow-1/2`). Idêntico.

## 3. Views do menu — 1 gap crítico

O wireframe define 16 `id="view-*"`: `dashboard, kanban, calendario, relatorio, solicitacoes, clientes, envoxers, servicos, farol, alertas, icp, churn-lista, faturamento, cliente-form, cliente-ficha, envoxer-form`.

| View (wireframe) | Arquivo `.jsx` | Roteada (`tc-app.jsx`) | No menu (`tc-shared.jsx`) |
|---|---|---|---|
| dashboard | ✅ `tc-dashboard.jsx` | ✅ | ✅ |
| kanban | ✅ `tc-kanban.jsx` | ✅ | ✅ |
| calendario | ✅ `tc-calendario.jsx` | ✅ | ✅ |
| **relatorio** | **❌ não existe** | **❌** | **❌** |
| solicitacoes | ✅ `tc-solicitacoes.jsx` | ✅ | ✅ |
| clientes | ✅ `tc-clientes.jsx` | ✅ | ✅ |
| envoxers | ✅ `tc-envoxers.jsx` | ✅ | ✅ |
| servicos | ✅ `tc-servicos.jsx` | ✅ | ✅ |
| farol | ✅ `tc-farol.jsx` | ✅ | ✅ |
| alertas | ✅ `tc-alertas.jsx` | ✅ | ✅ |
| icp | ✅ `tc-icp.jsx` | ✅ | ✅ |
| churn-lista | ✅ `tc-churn-lista.jsx` | ✅ (`view==="churn"`) | ✅ |
| faturamento | ✅ `tc-faturamento.jsx` | ✅ | ✅ |
| cliente-form / envoxer-form | ✅ (modo inline dentro de `ClientesScreen`/`EnvoxersScreen`, não é view separada — arquitetura React válida, não é gap) | — | — |
| cliente-ficha | ❌ nunca construída (decisão já tomada em D-063: tooltips aproximados pro `ClienteForm` em vez de construir a ficha) | — | — |

**GAP CRÍTICO confirmado por 2 fontes independentes:** a tela "Relatório de custo" (`view-relatorio`) nunca foi construída. Cruzei os 31 endpoints registrados no backend contra todo uso de `EnvoxersAPI.api(...)` nos `.jsx` — **`GET /tempo-custo` é o único endpoint do sistema inteiro sem nenhum consumo no frontend**. Backend 100% pronto (horas, custo do time, receita, margem, breakdown por cliente/serviço/tipo/envoxer — já confirmado funcional no D-058), zero UI.

## 4. Ícones SVG — 6 divergências visuais

Comparei `path`/`viewBox` de cada ícone do menu lateral, wireframe × real:

| Nav item | Igual? | Diferença |
|---|---|---|
| Clientes | ✅ idêntico | — |
| Envoxers | ✅ idêntico | — |
| Serviços | ✅ idêntico | — |
| Calendário | ✅ idêntico | (copiado direto do wireframe no D-063) |
| Painel de faturamento | ✅ idêntico | (copiado direto do wireframe no D-063) |
| Cancelamentos | ✅ idêntico | (copiado direto do wireframe no D-063) |
| **Kanban** | ❌ | wireframe: 3 barras `width=3` alturas 10/7/4, `rx=1`. Real: `width=3.5` alturas 12/8/10, `rx=0.5` — proporção visualmente diferente |
| **Dashboard** | ❌ | wireframe: 2 retângulos assimétricos (`5×12` + `5×6`). Real: grid de 4 quadrantes (`rect 12×12` + cruz) — ícone **trocado**, não é o mesmo conceito |
| **Farol** | ⚠️ quase | wireframe: círculo interno `r=2` com `fill="currentColor"`. Real: `r=2.2` sem `fill` (herda `fill="none"` do SVG pai) — o ponto central não aparece preenchido |
| **Alertas** | ⚠️ quase | wireframe: triângulo `M8 2l6 11H2z` + traço `M8 6v3M8 11v.5`. Real: triângulo mais largo `M8 2l6.5 11H1.5z` + traço `M8 6.5v3.2` + círculo preenchido — mais elaborado, mas não é o path original |
| **ICP Builder** | ❌ | wireframe: linha de tendência (`M2 12l4-4 3 3 5-5`, ícone de "check"/crescimento). Real: duas pessoas (círculos + curvas) — ícone **trocado**, conceito completamente diferente |
| **Solicitações** | ❌ | wireframe: balão de fala (`M2 4h12v8l-3-2H2z`). Real: retângulo com 3 linhas (documento) — ícone **trocado** |

## 5. Sistema de tooltips — 55 de 116 chaves ausentes

O componente `HelpIcon` (implementado no D-063) funciona corretamente e replica o comportamento do wireframe (popover via portal, reposicionamento, fecha em clique-fora/Esc/scroll). Comparei os 2 objetos `HELP_TEXTS` (wireframe tem 116 chaves, real tem 61) programaticamente: **0 chave inventada** (nenhum texto no app que não exista no wireframe), **55 chaves faltando**, todas em um destes 2 grupos:

**Grupo A — telas inteiras fora do escopo já decidido no D-063** (Dashboard, Kanban incl. `card_farol/card_etiqueta/card_prazo` e os 8 `kanban_col_*` e os 8 `modal_*` do card de tarefa, Foco/Relatório `foco_*`/`rep_*`, Solicitações `solic_*`) — 47 chaves. Não é gap novo, é escopo já combinado.

**Grupo B — chaves soltas sem elemento correspondente ainda**, 8 chaves:
- `cockpit` — tooltip da marca "envox Cockpit" no topo do sidebar. Fácil de adicionar, elemento existe (`.brand`).
- `nav_dashboard`, `nav_kanban`, `nav_relatorio`, `nav_servicos`, `nav_solic` — tooltips de nav-level das telas do Grupo A (mesma decisão de escopo).
- `farol_kpi_score`, `farol_ordenacao` — sem elemento correspondente porque a tela Farol não tem o KPI "Score médio" nem a legenda de ordenação (ver item 6).
- `icp_como_ler` — sem elemento correspondente na estrutura atual do ICP Builder (ver item 6).
- `cli_checkpoint`, `cli_sugestao` — pertencem à `view-cliente-ficha` nunca construída (mesma decisão do D-063).

## 6. Seções dentro de cada tela

### Dashboard — 3 widgets inteiros faltando (CRÍTICO)
Comparei bloco a bloco o `.dash-grid` do wireframe (7 cards) contra `tc-dashboard.jsx` (4 cards). Faltam:
- **"Farol — o que precisa da sua atenção esta semana"** (`dash_farol_widget`) — card full-width com os clientes de pior health score + link "Ver Farol completo". A própria descrição do wireframe diz: *"Se você abrir o sistema só para uma coisa, é esta."*
- **"Captações & eventos de hoje"** (`dash_hoje_eventos`) — lista de eventos do dia. Não existia como dado até o D-063 criar a tabela `evento`; agora é possível construir.
- **"Relatório rápido — Tempo × Custo"** (`dash_rel_rapido`) — prévia do Relatório de custo (mesma causa raiz do item 3, `GET /tempo-custo`).

### Kanban — filtro "Só atrasadas" ausente (CRÍTICO), filtro por tipo trocado por status (Menor)
O `.kanban-toolbar` do wireframe tem 4 filtros + 2 checkboxes: cliente, responsável, **tipo**, **"Só atrasadas"**, "Ocultar finalizadas". O real tem cliente, responsável, **status** (não é o mesmo filtro — status já é visível pelas colunas, "tipo" filtraria por `tipo_tarefa`, uma dimensão que hoje não tem filtro nenhum), "Ocultar finalizadas", e a checkbox **"Só atrasadas" não existe**.

### Farol — 3 elementos ausentes (Visual)
`.kpis` do wireframe tem 4 cards: Score médio, Vermelhos, Amarelos, Verdes. O real tem: **Clientes ativos** (não existe no wireframe pra essa tela), Vermelho, Amarelo, Verde — ou seja, "Score médio" foi substituído por "Clientes ativos". Também faltam o botão "Recalcular" + texto "Última atualização: agora", e a legenda "Ordenado por health score (menor = mais risco)".

### ICP Builder — estrutura visual diferente da do wireframe (Visual, ver seção de dúvidas)
O wireframe define uma estrutura própria (`.icp-header-cards` com 2 `.icp-pop-card` grandes no topo mostrando a contagem, `.note-bar` explicando como ler, `.icp-dims`/`.icp-bar-fill` pras barras de comparação, `.icp-insights` no rodapé). **Todas essas classes CSS existem prontas em `envox-tokens.css` mas nenhuma é usada** — o real (`tc-icp.jsx`) foi construído reaproveitando `.modal-side-block` (do Farol) com um layout de card lado-a-lado próprio, e o bloco de insights no topo em vez do rodapé. Funcionalmente equivalente, visualmente diferente. Ver seção "Aguardando decisão".

### Clientes — 2 elementos ausentes (Menor)
`.kpis` do wireframe tem 4 cards (Ativos, MRR contratado, Farol vermelho, **Novos (30d)**); o real tem só os 3 primeiros. Botão "Exportar CSV" do header também não existe no real (só "Novo cliente").

### Alertas / Faturamento — ✅ sem gaps estruturais
Alertas bate estruturalmente com o wireframe (real ainda adiciona o filtro "ignorado", que o wireframe não lista mas que existe no modelo de dados — melhoria, não gap). Faturamento usa exatamente as classes do wireframe (`fat-mrr-card`, `fat-side-*`, `mrr-chart`, `concentr-strip`, `cohort-grid`) — construído fielmente.

---

## Resumo por categoria

| Categoria | Itens |
|---|---|
| **Crítico** | (1) Tela Relatório de custo inexistente · (2) 3 widgets do Dashboard ausentes · (3) Filtro "Só atrasadas" do Kanban ausente |
| **Visual** | (4) 6 ícones SVG divergentes (Kanban, Dashboard, Farol, Alertas, ICP, Solicitações) · (5) Farol sem "Score médio"/Recalcular/legenda de ordenação · (6) ICP Builder com estrutura visual própria em vez das classes do wireframe · (7) Clientes sem KPI "Novos (30d)" e botão "Exportar CSV" |
| **Menor** | (8) 55 chaves de tooltip ausentes (47 já são escopo decidido no D-063, 8 soltas — `cockpit`, 5×`nav_*`, `farol_kpi_score`, `farol_ordenacao`, `icp_como_ler`, `cli_checkpoint`, `cli_sugestao`) · (9) Kanban filtra por status em vez de tipo de tarefa |

## Aguardando decisão do Gus

1. **ICP Builder — reconstruir a estrutura visual pra bater com o wireframe?** As classes CSS existem prontas (`.icp-header-cards`, `.icp-pop-card`, `.note-bar`, `.icp-dims`, `.icp-bar-fill`, `.icp-insights`), mas a tela atual (construída em D-046) usa uma estrutura própria funcional e já testada. Reconstruir do zero é essencialmente refazer a tela inteira — risco de regressão numa tela que funciona, só por fidelidade visual. Não vou mexer nisso sem confirmação.
2. **View `cliente-ficha`** — já decidido no D-063 (tooltips aproximados pro `ClienteForm` em vez de construir a ficha read-only separada). Só re-registrando formalmente aqui pra constar na auditoria; meu entendimento é que essa decisão continua valendo, não vou revisitar sozinho.

## Status de execução (Fase 2)

**Concluído nesta sessão — 9 commits, todos com push feito, cada um testado (sintaxe Babel real + harness Playwright com API mockada e/ou chamada direta contra o banco real) antes do commit:**

| # | Commit | O que fechou |
|---|---|---|
| 1 | `8aa4bf9` | **Crítico** — Filtro "Só atrasadas" no Kanban |
| 2 | `418fa5d` | **Crítico** — Tela Relatório de custo inteira (4 abas, KPIs, CSV, insights automáticos) + `agrupar=envoxer` e filtro `tipo_receita` novos no backend (aditivo) |
| 3 | `839a0ed` | **Crítico** — 3 widgets do Dashboard: Farol da semana, Captações & eventos de hoje, Relatório rápido |
| 4 | `5f3a049` | **Visual** — 6 ícones SVG divergentes (Kanban, Dashboard, Farol, Alertas, ICP, Solicitações) + tooltip `cockpit` |
| 5 | `33754db` | **Visual** — Farol: KPI "Score médio", botão Recalcular, legenda de ordenação |
| 6 | `c29cdcc` | **Visual** — Clientes: KPI "Novos (30d)", botão "Exportar CSV" |
| 7 | `d2ffb85` | **Menor** — Filtro por tipo de tarefa no Kanban (adicionado, sem remover o de status) |
| 8 | `07d00bf` | **Menor** — Tooltips das 8 colunas do Kanban + 6 seções do modal de tarefa |
| 9 | `3268ce6` | **Menor** — Tooltips restantes: Meu Foco, Solicitações, nav Serviços |

**Todos os 3 itens Crítico: fechados.** 4 de 5 grupos de itens Visual: fechados (só falta o item 1 da lista de dúvidas abaixo). Praticamente todos os itens Menor endereçáveis sem invenção de conteúdo: fechados.

**Backend:** migration `0013_evento` (já existia desde a Fase 1, D-063) + alteração aditiva em `relatorio.py` (novo agrupamento `envoxer`, novo filtro `tipo_receita` — nenhuma migration nova precisou, nenhuma coluna/tabela alterada ou removida). `alembic current` = `0013_evento (head)`, container `envoxers-backend` saudável.

**Não corrigido de propósito (ver "Aguardando decisão do Gus" abaixo):**
- ICP Builder — estrutura visual diferente do wireframe (item 6 da tabela de categorias)

**Não corrigido por não ter elemento correspondente real (nem no wireframe fonte, nem no app):**
- `card_farol`/`card_etiqueta`/`card_prazo` — chaves órfãs até no `HELP_TEXTS` original do wireframe (nunca têm um `data-hlp` apontando pra elas lá)
- `modal_desc`/`modal_timeline`/`modal_status_bar` — o modal de tarefa real não tem um campo de briefing separado, uma timeline dedicada, nem uma barra de 8 etapas como elementos distintos pra pendurar o tooltip sem inventar UI nova
- `icp_como_ler` — mesma causa raiz do item 6 (estrutura do ICP Builder diferente)
- `cli_checkpoint`/`cli_sugestao` — decisão já tomada no D-063 (aproximados pro `ClienteForm`, não construir a `view-cliente-ficha`)

## Aguardando decisão do Gus (atualizado)

1. ~~**ICP Builder — reconstruir a estrutura visual pra bater com o wireframe?**~~ **RESOLVIDO na Rodada 2 (D-066, 2026-07-08)** — Gus pediu explicitamente, tela reconstruída com as classes do wireframe. Ver seção "Rodada 2" no fim deste documento.
2. **View `cliente-ficha`** — já decidido no D-063 (tooltips aproximados pro `ClienteForm` em vez de construir a ficha read-only separada). Só re-registrando formalmente aqui pra constar na auditoria; meu entendimento é que essa decisão continua valendo, não revisitei sozinho.

## O que NÃO foi tocado (limites de segurança respeitados)

- Nenhuma migration destrutiva — a única migration nova (`0013_evento`, já da Fase 1/D-063) é 100% aditiva (`CREATE TABLE`), sem `DROP`/`ALTER TYPE` em nada existente
- Nenhum arquivo fora de `/docker/envoxers/`
- Nenhum dado `SEED_DATA_2026` nem dado real de cliente/envoxer foi lido, alterado ou apagado — todos os testes desta sessão usaram harness Playwright com API mockada, ou leitura (`GET`/chamadas de função só-leitura) direto contra o banco real, nunca escrita
- 9 commits distintos, push feito a cada um — nenhum trabalho acumulado sem salvar

---

## Rodada 2 (2026-07-08, [[demand_log]] D-066) — gaps achados por comparação visual direta do Gus

Gus comparou o app real lado a lado com o wireframe (não uma auditoria automática) e achou gaps que a Fase 1/2 acima não pegou — a maioria em granularidade de dado exibido, não em CSS/estrutura. Corrigidos na ordem Crítico → Estrutural → Cosmético, um item por vez, commit+push a cada um, teste Playwright (harness com API mockada) antes de avançar. Nenhuma migration nova; nenhum dado real tocado (só leituras/dry-run com rollback contra o banco de produção pra validar).

**Crítico — Farol/Alertas tinham perdido a granularidade do dado real:**
- `motivo_texto` resumia pra rótulo categórico ("Sinais críticos: Tarefas atrasadas, Margem…"); agora formata o valor real de cada sinal não-verde por extenso (`services/farol.py::_motivo_texto_detalhado`)
- `sugestao_acao` reescrita com as mesmas regras condicionais do wireframe (pulso/whatsapp vermelho = recomendação única; senão combina por sinal vermelho) — regras, não IA
- Farol ganhou health-orb colorido, valor/mês e "Xm de casa" por linha (`FarolClienteResponse.valor_contrato`/`meses_de_casa` novos)
- Alertas ganhou a mesma granularidade + botões inline "Reconhecer"/"Abrir ficha" (ficha = navega pro `ClienteForm`, mesma decisão do D-063 de não existir `view-cliente-ficha`)
- Fix de borda descoberto no meio do trabalho: sinal de silêncio sem nenhum check-in mostrava literalmente "None dia(s) sem contato"

**Estrutural — Solicitações virou mestre-detalhe:** `tc-solicitacoes.jsx` reconstruída — lista à esquerda com tabs Novas/Análise/Todas (contagem) + painel de detalhe à direita, igual ao wireframe (`.solic-grid`/`.solic-list`/`.solic-detail`). Não é mais tabela+modal.

**Cosmético:**
- KPIs de Clientes e Farol ganharam a legenda descritiva (`kpi-hint`) do wireframe — a de "Score médio" precisou de endpoint novo (`GET /farol/kpis`, compara com `farol_calculo_historico` de ~7 dias atrás; retorna `None` enquanto não existir snapshot antigo o bastante — Farol só tem 2 dias de vida)
- Envoxers ganhou os chips "Todos/Admin/Gestor/Envoxer" com contagem + avatar circular com iniciais (Envoxers e Clientes/Responsável), reaproveitando `.avatar`/`.avatar.gray` do wireframe
- Kanban ganhou o botão "Calendário" ao lado de "+ Nova demanda"
- Clientes ganhou chips "Recorrente"/"Pontual" + coluna "Início"
- **ICP Builder reconstruído com as classes do wireframe** (`.icp-header-cards`, `.icp-pop-card`, `.note-bar`, `.icp-dim`/`.icp-row`/`.icp-bar-fill`/`.icp-row-diff`) — isso **fecha a pendência "Aguardando decisão do Gus" da Rodada 1**: Gus pediu explicitamente os 4 elementos (cards de resumo com texto completo, box "Como ler", legenda de cor, coluna Δ), então deixou de ser uma decisão em aberto
- Tooltips: reauditados sistematicamente (script comparando `data-hlp` do wireframe × `HELP_TEXTS`/uso real no app); único gap de verdade era `icp_como_ler` (sem elemento até a reconstrução do ICP), corrigido. Os outros 18 "gaps" que o script apontou eram falso positivo (helpKey passado via variável/objeto, não string literal) — confirmados já implementados lendo o código
- Fontes: reconfirmado tecnicamente — `index.html` idêntico byte-a-byte ao wireframe, `--font-ui`/`--font-serif`/`--font-mono` idênticas, nenhum componente sobrescreve com fonte de sistema (5 usos de `fontFamily` inline, todos via variável CSS)

**Aguardando decisão do Gus:** nenhuma pendência nova. A única da Rodada 1 (ICP Builder) foi fechada nesta rodada.
