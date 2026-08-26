# F4 — PDI + Feedback 360 + Avaliação 180 + Feedback 1:1 + Pesquisa de Clima

**Status geral:** EM ANDAMENTO — construção autônoma iniciada 2026-08-24 ~17h19, Gus fora do teclado,
autorizou "meter ficha em tudo" porque não há dado real de cadastro ainda nesses módulos novos.
Se esta sessão travar, qualquer chat novo deve: ler este arquivo + `demand_log.md` entrada **D-121**
+ rodar `git status`/`git log` pra ver o que já foi commitado vs. só no disco.

Referência completa do desenho (perguntas feitas ao Gus, respostas, plano modular) está em
`demand_log.md` D-121 e na conversa da sessão que abriu essa frente.

## Decisões fechadas (não re-perguntar)
- Clima: híbrido — envoxer vê "confidencial" na UI, gestor nunca vê resposta individual, admin tem rota de auditoria pro dado bruto.
- 180°: mão dupla (gestor avalia liderado E liderado avalia gestor).
- 360°: todo envoxer ativo avalia todo envoxer ativo (incluindo autoavaliação), dentro de um ciclo.
- Ciclos formais (`ciclo_avaliacao`) organizam 360/180/clima.
- Hierarquia nova: campo `gestor_responsavel_id` no Envoxer (Módulo 0), base pra 180°/1:1.
- RBAC: admin = tudo; gestor = tudo igual admin EXCETO resposta individual do clima (só agregado); envoxer = só o que é dele.
- Pendente/assumido (Gus não travou): envoxer comum vê o AGREGADO GERAL da pesquisa de clima (não o individual de ninguém). Se ele não gostar, é 1 linha de RBAC pra trocar.
- Sem scheduler em nada (mesmo padrão Farol/ICP/Entregáveis) — tudo sob demanda.
- Sem push/e-mail nesta rodada (fora de escopo, não pedido).

## Checklist de módulos — TODOS CONCLUÍDOS (2026-08-24, mesma sessão)

- [x] **Módulo 0 — Gestor Responsável**: campo `gestor_responsavel_id` no Envoxer + form
- [x] **Módulo A — PDI**: `pdi_acao` + `pdi_acao_comentario`, rotas, tela "Meu PDI"/"PDI da Equipe"
- [x] **Módulo B — Infra de Ciclos**: `ciclo_avaliacao`, abrir/fechar, geração automática de pares
- [x] **Módulo C — Feedback 360°**: catálogo de competências + `avaliacao_360` + resultado agregado
- [x] **Módulo D — Avaliação 180°**: `avaliacao_180` (mão dupla via gestor_responsavel_id)
- [x] **Módulo E — Feedback 1:1**: `feedback_1a1` contínuo por par gestor↔liderado
- [x] **Módulo F — Pesquisa de Clima**: perguntas configuráveis + `resposta_clima` híbrida

**Status: F4 100% implementado, testado e NO AR em produção.** Ver `demand_log.md` D-121 pro relato
completo (arquivos, decisões técnicas, testes). Resumo rápido:

## O que foi construído
- **Backend**: 8 migrations (`0029`...`0035` + `0028` que já estava pendente de sessão anterior), 9 models
  novos, 6 arquivos de schemas, 6 arquivos de rotas (`pdi.py`, `ciclos.py`, `avaliacao_360.py`,
  `avaliacao_180.py`, `feedback_1a1.py`, `clima.py`), seed idempotente de 6 competências padrão.
- **Frontend**: 1 arquivo novo `tc-f4.jsx` (~700 linhas) com 6 seções (PDI, Ciclos, 360, 180, 1:1, Clima)
  dentro de uma aba única "Desenvolvimento & Pessoas" (`view === "f4"`), item novo na sidebar em
  seção própria "F4 · Desenvolvimento". Campo "Gestor responsável" adicionado ao form de Envoxer.
- **Testado**: `scripts/check_f4_completo.py` (integração contra o Postgres real de produção, dry-run
  com rollback — zero resíduo) cobrindo os 7 módulos fim a fim; Playwright headless (harness com os
  arquivos reais servidos + API 100% mockada) navegando pelas 6 abas, criando ação de PDI, respondendo
  360/180, vendo resultado de clima, criando/abrindo/encerrando ciclo — **zero erros JS**. Screenshots
  revisados visualmente, visual consistente com o design system existente (chips, tags de farol, modais).
- **Deploy**: backend rebuildado e no ar (`docker compose build backend && up -d backend`, migrations
  aplicadas automaticamente no startup, seed de competências confirmado no log). Frontend é bind mount,
  já servindo `tc-f4.jsx` em produção (confirmado via curl 200 tanto local quanto no domínio real).
- **Achado incidental, fora do escopo**: durante o teste de UI descobri que o harness de teste do
  Dashboard precisava do mock certo pra `/tarefas/dashboard-dia`/`/relatorio/tempo-custo` — não é bug
  real de produção, só incompletude do mock inicial (confirmado depois que a tela renderizou perfeita
  com os mocks corretos). Não mexi em nada do Dashboard.

## Pendências / decisões que ficaram assumidas (Gus pode ajustar depois)
- Envoxer comum vê o AGREGADO GERAL da pesquisa de clima (não travei isso — se ele preferir restringir
  a gestor/admin, é 1 linha de RBAC em `routes/clima.py::resultado_clima`).
- 360° inclui autoavaliação (avaliador == avaliado) — decisão minha, não travada explicitamente por ele.
- Nenhum push/e-mail de notificação pra "você tem X avaliações pendentes" — fora de escopo desta rodada.
- **Nada commitado ainda** — mesma pilha pendente de decisão que já vinha desde D-116/117/118/119/120
  (arquivos daquelas demandas + agora também todos os do F4, misturados em alguns arquivos compartilhados
  como `models/__init__.py`/`tc-app.jsx`/`tc-shared.jsx`/`tc-envoxers.jsx`). Não tentei isolar via stash
  porque os hunks de F4 e os hunks antigos se tocam nesses arquivos — decisão de commit é do Gus.

## Como retomar se travar (agora só relevante se Gus pedir MAIS coisa em cima do F4)
1. `cd /docker/envoxers && git status && git log --oneline -15`
2. Este arquivo já reflete o estado final — não há módulo em andamento
3. Ler `demand_log.md` D-121 (FIM) pro relato completo
4. Se Gus pedir ajuste/extensão, é uma demanda NOVA (D-122+) — não uma continuação desta
