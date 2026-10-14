# Envoxers | Jornada de Desenvolvimento PDI

Versão de implantação: 14/10/2026.

## Diretriz
PDI dinâmico baseado em evidência real, feedback humano, check-ins semanais, 1:1 quinzenal e marcos 30/60/90 dias. Não utilizar XP como nota de competência ou desempenho.

## Perfis
Duda, 80% operação criativa da agência e 20% Product Operations Jr. Competências: mentalidade de solução, flexibilidade com alterações e comunicação profissional.

Kaory, 80% liderança da agência e 20% Product Analyst/QA de negócio. Competências: prioridades, simplificação, previsibilidade.

## Fluxo
Pessoa registra situação, impacto, solução e resultado. Gestor avalia a evidência e deixa feedback. Um registro validado rende até 20 XP por semana. Marcos de 30/60/90 dias são registrados por gestor e valem 30 XP cada. Avanço = 70% das semanas validadas + 30% dos marcos registrados. Conquistas individuais sem competição nem comparação.

## Rituais
Semana: evidência concreta. Quinta/sexta, lembrete configurável. Segunda, resumo semanal ao gestor. A cada 14 dias, reunião 1:1 com pauta, combinados e próxima data. Marcos formais após 30, 60 e 90 dias transcorridos.

## Arquitetura
Backend em app/api/routes/pdi_jornada.py, app/models/pdi_jornada.py e app/services/pdi_lembretes.py. Migration 0052_pdi_jornada_interativa.py. Frontend em tc-pdi-jornada.jsx e pdi-jornada.css. O sistema antigo de PDI/360/180/1:1 foi preservado.

## Dados reais
Jornadas 55 (Maria Eduarda) e 64 (Kaory), ambas supervisionadas pelo usuário 44, intervalo 14/10/2026 a 12/01/2027. Não foram lançadas evidências ou notas fictícias. Backup SQL anterior às alterações: /var/lib/sentinelx/uploads/envox_kanban_pre_pdi_jornada_20261014.sql.gz.

## Notificações
Alertas ficam visíveis no PDI e em banner no restante do aplicativo. Avisos de Web Push só são enviados para dispositivos com inscrição ativa; podem ser habilitados na própria tela da jornada. A programação roda no backend, deduplica notificações por semana e respeita o horário comercial de São Paulo. Sem suporte a e-mail/SMS neste ciclo.

## Segurança e verificação
Somente proprietário da jornada, gestor indicado e admin podem vê-la. Apenas gestor indicado ou admin pode validar (sem autovalidação). Testes de integração com rollback comprovaram fluxo e zero resíduo de teste. Frontend compilado com Babel, Python validado por AST. Outras frentes futuras: cruzar métricas do Kanban com a rotina operacional e implantar relatórios comparativos nos marcos.
