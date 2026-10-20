# Auditoria de unificação: cliente-dev e Portal Envoxers

Data: 20/10/2026. Estado: **auditoria parcial; não homologado**.

## Autorização recebida
O responsável autorizou **somente leitura** no caminho `/docker/envox-skills-staging`, para aproveitar o código do cliente-dev e a estrutura de IA existente. A tentativa de acrescentar exatamente esse caminho com `access: r` a `/etc/sentinelx/config.yaml` foi bloqueada pelas configurações de segurança da ferramenta. **Não foi contornado o bloqueio; nenhum acesso de leitura novo foi habilitado.**

O cliente-dev não teve arquivos, serviços, banco ou configuração modificados. Auditoria do backend e da IA permanece pendente de um acesso autorizado efetivamente disponível.

## Evidências anteriores que permitem avançar parcialmente
- O domínio `cliente-dev.envox.com.br` apresenta uma interface com Início, Solicitações, Em andamento, Aprovações, Campanhas, Biblioteca e Acordos.
- O frontend disponibiliza componentes `tc-portal-app.jsx`, `portal.css`, `tc-skills.jsx`. A tela Envox Skills identifica sua versão como `v0.1 foundation` e apresenta dados demonstrativos, não agentes efetivamente operacionais.
- Os serviços `envox-client-dev-backend`, `envox-client-dev-frontend` e `envox-client-dev-postgres` têm rede/volumes independentes da produção Envoxers.
- Não é correto inferir da existência das interfaces que as APIs, migrações ou agentes estão prontos.

## Revisão de segurança do PR #2: achados
1. Em `backend/app/api/routes/portal_operacao.py`, existe `contato_habilitado`, dependência que exige `PortalClienteConfig.habilitado`. Essa dependência é aplicada às rotas externas de **operação**.
2. Em `backend/app/api/routes/portal_auth.py`, `login`, `definir_senha` e `me` ainda usam validação própria ou `get_current_cliente_contato`, sem verificar explicitamente a flag do portal por cliente. **Inconsistência com opt-in**.
3. Em `backend/app/api/routes/portal_documentos.py`, listagem e confirmação de acordos usam `get_current_cliente_contato`, sem verificar `PortalClienteConfig.habilitado` nem a flag do módulo `documentos`. **Inconsistência de habilitação**.
4. A classe `ArquivosLegadosProtegidos` ainda não substitui o mount público `StaticFiles` no `backend/app/main.py`. A proteção definitiva da mídia e as regressões Drive, miniaturas e aplicativo Windows seguem bloqueadoras.
5. As rotas administrativas de `portal_operacao.py` incluem permissões internas distintas (admin e gestor). Exige matriz consistente de autorização por ação.
6. O cliente-dev não deve ser tratado como segunda base operacional. Solicitações, tarefas, entregas, status e Foco ficam no Envoxers.

A tentativa de editar as rotas de autenticação/documentos para corrigir os itens 2-3 foi bloqueada pela ferramenta. Nenhuma correção foi aplicada a essas rotas nesta execução.

## Estado de trabalho preservado
- PR #2 continua **draft**, sem merge e sem deploy de produção.
- Staging de homologação separado do Envoxers em produção.
- Migration 0059 e painel de configuração por cliente codificados na branch e antes aprovados em CI.
- Design do cliente-dev adotado como base visual do Portal na branch.
- Próximo passo obrigatório: acesso de leitura legítimo ao código do cliente-dev, análise de backend/IA, corrigir itens acima por via autorizada, rodar CI e testes de navegação real com três perfis fictícios.
