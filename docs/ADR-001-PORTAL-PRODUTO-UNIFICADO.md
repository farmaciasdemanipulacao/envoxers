# ADR 001 | Portal do Cliente como módulo permanente do Envoxers

Status: **direção aprovada pelo usuário, execução incremental; PR #2 não homologado para merge**.
Data: 20/10/2026.

## Descoberta sobre cliente-dev.envox.com.br

O serviço existente não é apenas um design. Evidências observáveis:
- Nginx do domínio: HTTPS, frontend localhost:18190, backend localhost:18191.
- Docker: três containers independentes `envox-client-dev-frontend`, `envox-client-dev-backend` e `envox-client-dev-postgres` no projeto Compose `envox-skills-staging` e rede `envox-client-dev_internal`. O Envoxers principal é outro Compose e usa banco `envox_kanban` na rede `envox-intel-internal`.
- O frontend publicado do cliente-dev tem Portal com Início, Solicitações, Em andamento, Aprovações, Campanhas, Biblioteca e Acordos. Ele faz requisições a APIs como `/portal/dashboard`, `/portal/solicitacoes`, `/portal/tarefas`, `/portal/aprovacoes`, `/portal/campanhas` e `/portal/biblioteca`; a existência das telas **não prova homologação backend**.
- O design publicado fornece referência visual: azul-marinho `#16284D`, vermelho `#C10230`, creme `#F7F7F5`, Inter e Instrument Serif, sidebar navy, cartões e login editorial de duas colunas.
- O menu interno expõe `Envox Skills` (abas Visão geral, Brain, Agentes), explicitamente identificado no próprio código como `v0.1 foundation` e **dados demonstrativos, sem execuções de agentes reais**.
- O HTML/JS mostra ancestralidade de implementação com Envoxers; `tc-portal-api.jsx` é byte a byte idêntico ao arquivo do Envoxers principal, mas `tc-portal-app.jsx` tem mais módulos. Isso **não** implica banco compartilhado.

A origem dos códigos backend e o esquema interno completo do serviço cliente-dev ainda exigem uma auditoria de fonte autorizada. A pasta `/docker/envox-skills-staging` não integra o caminho de leitura habilitado no SentinelX; **não contornar a política do agente**. Pode-se estudar as interfaces HTTP já expostas sem alterar esse projeto.

## Arquitetura de produto

**Um único produto e fonte de verdade = Envoxers.**

| Domínio | Fonte autoritativa |
|---|---|
| Organização/contratos/serviços | `Cliente`, `Servico`, `ItemEscopo`, cadastros Envoxers |
| Pessoas externas | `ClienteContato` existente, vinculado a `Cliente` |
| Regionais/frentes | `PortalUnidade` e `PortalContatoUnidade` como atributos de acesso |
| Pedido original | `Solicitacao` existente, protocolo e briefing estendido |
| Execução | `Tarefa` existente, status e vínculos sem copiar cards |
| Kanban/entrega | Etapas, `EntregaCheck`, `ItemEscopo` e provisionamento existentes |
| Horas | `RegistroFoco` existente (opcional e sem créditos/saldo) |
| Materiais | `Tarefa.anexos` / Drive + política de mídia privada; **bloqueado até ACL** |
| Aprovação | Estado canônico de `Tarefa` e `Alteracao`, com auditoria de autor/data; **não criar um segundo status de aprovação** |
| Comentários | Solicitação: mensagens vinculadas à própria `Solicitacao`; comentários de tarefa permanecem com a tarefa. **Não sincronizar por cópia nem espelhar comentários internos** |
| Notificações | Outbox/evento auditável sobre mudança canônica; permissão configurada por cliente e usuário. Implementação pendente |
| IA/Skills | Acesso sob demanda via serviços isolados por API, com escopo cliente+unidade e governança Envox; não acesso direto ao Brain ou a outro banco |

A proposta é incorporar a experiência do cliente-dev ao **Portal como frontend do mesmo backend Envoxers**, mantendo contratos HTTP canônicos; o projeto antigo deve continuar intacto até inventário, migração e desativação expressamente autorizada. A IA poderá rodar como um serviço isolado no futuro, sem copiar tabelas de clientes ou o Kanban. Qualquer porta de acesso à IA deve ser aprovada por flags e auditoria.

## Implementado neste incremento do PR #2

1. Identidade visual do Portal alinhada ao cliente-dev: login editorial e navegação navy, cores/tipografia, layout responsivo. Arquivo `portal-cliente-dev-theme.css`.
2. Migration `0059_portal_cliente_config`: configuração persistida **por cliente**, desativada por padrão; sem dados operacionais duplicados.
3. RBAC para Envox admin na rota `/api/v1/portal/operacao/admin/clientes` e GET/PUT de configuração, incluindo contatos, vínculo de unidades e formulário ativo.
4. Nova tela real em **Configurações → Portal do Cliente**, com habilitação, módulos, cadastro de regional/frente, atribuição de papel a contatos existentes, versão de campos adicionais do formulário.
5. API operacional do Portal passa a negar clientes não habilitados. Módulos ainda não homologados permanecem não habilitáveis. Notificações externas e exposição de horas não podem ser ligadas via PUT.
6. Teste de isolamento/opt-in por cliente no PostgreSQL efêmero, testes unitários e frontend compilado incluídos no CI.
7. Staging separado atualizado até a migration 0059. Somente organização fictícia `SECOVI-PR | HOMOLOGAÇÃO FICTÍCIA` foi habilitada; sem dados reais.
8. Arquivos legados não são disponibilizados pelo gateway do staging, que mantém allowlist restritiva. O PR segue sem merge.

## Critérios de aceitação futuros (não confundir planejamento com entrega)

- [ ] Código-fonte do cliente-dev auditado com caminho read-only aprovado, principalmente backend, migrações e IA.
- [ ] Fluxo de login de três perfis internos/externos via staging validado em navegador e smartphone real.
- [ ] Testes end-to-end por cliente/regional: inclusive trocar regional após criar solicitação, IDOR, documentos, visibilidade pública.
- [ ] Acesso externo a arquivos privado por recurso, URLs legadas migradas sem quebrar thumbnails, Drive, downloads ou Tauri Windows.
- [ ] Aprovação e pedido de ajuste gravam no estado **canônico** da tarefa, com versionamento e trilha auditável, e notificação outbox.
- [ ] Área de configurações com catálogo de serviços, regras de SLA/visibilidade, notificações e perfis customizáveis; sem usar backend para operação cotidiana.
- [ ] Métricas internas: solicitações sem responsável, gargalos, prazo de aprovação, cliente pendente, sem saldo de horas.
- [ ] Experiência mobile completa, acessibilidade, reações ao offline, upload, notificações, limpeza de navegação.
- [ ] Não remover cliente-dev nem migrar seus dados sem inventário, backup, contrato de API e autorização expressa.
- [ ] PR #2 permanece em draft até segurança de mídia, testes reais, regressão e aprovação.

## Segurança e isolamento do staging

- Envoxers produção: `/docker/envoxers`, main no commit `9468ee077bd4` durante a auditoria.
- Staging: `/docker/envoxers/staging-secovi`, Compose `secovi-homologacao`, PostgreSQL `portal_ci`, rede Docker privada, volumes isolados e tunnel HTTPS temporário.
- Apenas endpoints do Portal são liberados ao gateway. Rotas administrativas exigem autenticação **interna** e permanecem não publicadas no tunnel, por isso a área Admin ainda precisa de teste em ambiente autenticado adequado.
- Prévia visual externa com dados **somente em memória**: `/portal/previa.html` (não representa teste autenticado).
- O arquivo `ArquivosLegadosProtegidos` continua não ligado ao mount no `main.py`, questão bloqueadora previamente registrada. Não contornar bloqueio da ferramenta.
