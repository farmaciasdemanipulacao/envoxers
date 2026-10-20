# Checkpoint: homologação interna SECOVI (20/10/2026)

**Provisório. Não homologado para SECOVI nem pronto para merge ou deploy de produção.**

## Infraestrutura identificada
- Host: `srv1546638` (SentinelX), repositório de produção `/docker/envoxers`.
- Produção: containers `envoxers-backend` (`127.0.0.1:8001`) e `envoxers-frontend` (`127.0.0.1:8081`); PostgreSQL externo ao compose Envoxers em `envox-intel-postgres`, banco `envox_kanban`.
- Branch PR #2: `feature/secovi-portal-foundation-20261020`, **sem merge**; `main` localizado em `9468ee077bd4` e trabalho de staging em pasta não montada na aplicação.
- Staging: `/docker/envoxers/staging-secovi` (clone independente), projeto Docker `secovi-homologacao`. 5 serviços: `db`, `backend`, `frontend`, `gateway`, `tunnel`.
- DB estágio: postgres:16, database `portal_ci` em volume local `staging-secovi/state/postgres`, distinto de qualquer volume de produção. Rede `secovi-homologacao_private` com `internal=true`, sem portas DB e API publicadas no host.
- Uploads estágio em `staging-secovi/state/uploads`, distintos dos arquivos de produção.
- Acesso externo experimental via túnel HTTPS Cloudflare Quick Tunnel e cookie-gate de token aleatório armazenado **somente no servidor**. Esse túnel é temporário, sem SLA ou URL fixa; não é solução definitiva para homologação institucional.

## Contas e dados fictícios
- `admin.teste@secovi.invalid` (admin_institucional), visão Alfa e Beta.
- `regional.teste@secovi.invalid` (gestor_regional), regional Alfa.
- `solicitante.teste@secovi.invalid` (solicitante), regional Alfa.
- Senhas de teste e token de acesso: **somente em** `/docker/envoxers/staging-secovi/test-users.private.json` (0600); não publicar no GitHub nem enviar a terceiros.
- 3 solicitações iniciais fictícias, 2 tarefas vinculadas, 1 registro de Foco fictício persistido.
- Nenhum e-mail ou convite real enviado. Nenhum registro do SECOVI real copiado.

## Auditoria do PR #2
1. **Crítico, pendente:** o `app.mount(... StaticFiles)` em `backend/app/main.py` não foi substituído pela classe `ArquivosLegadosProtegidos`. Em edição anterior a operação na ferramenta foi bloqueada; respeitar o bloqueio, sem alternar ferramentas para contorná-lo.
2. A migration 0058, `PortalAnexo` e a classe `ArquivosLegadosProtegidos` estão versionados, **mas não completam a proteção**; falta integração de rotas de upload/download e avaliação do Drive/miniaturas/Desktop.
3. Gateway do staging bloqueia `/api/v1/uploads/` por padrão, para não expor a rota legada durante a homologação. Portanto downloads/previews do Drive não são funcionalidades liberadas no piloto.
4. API `/portal/operacao` não expõe mais `status_interno_solicitacao` (commit `6599a81`).
5. Portal de documentos agora redige dados privados de confirmantes e IPs, preservando apenas confirmação do contato autenticado (commit `1b62219`, regressão unitária adicionada).
6. RBAC por regional, referência de cliente no JWT e comentários explícitos públicos revisados. Não exportar dados internos de tasks/chats.
7. Formulários customizados versionados e conferidos no servidor, sem dependência de validação só no frontend.

## Evidências confirmadas
- GitHub Actions Portal SECOVI: PostgreSQL efêmero, migrations até `0058`, testes de isolamento e autorização **aprovados** no commit `6599a81`.
- GitHub Actions Frontend Envoxers: JSX compile e smoke frontend aprovado no mesmo commit.
- Staging Docker: backend `healthy`, banco `healthy`; gateway reiniciado após corrigir `map_hash_bucket_size` e `absolute_redirect off`.
- Túnel HTTPS registrou conexão, domínio temporário `queensland-folding-proteins-rim.trycloudflare.com` (pode mudar após reinicialização).
- Requisições externas sem cookie autorizado responderam `403`; uma requisição de teste com cookie válido respondeu `200` no HTML do portal.
- Seed fictício: `SEED_OK`, contatos 1/2/3 e solicitações 1/2/3.
- **Não confirmados:** logins de todos os perfis via túnel após correção de redirect, cenários de click-through em navegador real, integração de mídia e aprovações externas. A tentativa de teste com segredos foi bloqueada pela ferramenta, não contornar.

## Como acessar (atualizado)
- **Prévia navegável sem credenciais, com a interface React e dados apenas em memória:** `https://queensland-folding-proteins-rim.trycloudflare.com/portal/previa.html`. Alterna papéis de administrador, gestor regional e solicitante. Nenhuma requisição da prévia grava dados reais.
- **Portal integrado ao banco fictício:** `https://queensland-folding-proteins-rim.trycloudflare.com/portal/`. Página de login disponível, mas o teste com as três contas ainda depende de uma forma autorizada de configuração/distribuição de credenciais. Tentativa de alteração de senhas via ferramenta foi bloqueada. **Não contornar.**
- Gateway atualizado para **allowlist**: somente assets do Portal e APIs externas necessárias. Toda API interna, inclusive admin de `/portal/operacao`, retorna `404`. Acesso sem token JWT a `/portal/operacao` retorna `401`.
- Ambiente de prévia acessível via Cloudflare Quick Tunnel sem domínio permanente, sem garantia de disponibilidade.
- A prévia é apresentação visual interativa, **não** comprovação de login, persistência, autorização ou entrega externa.

## Restrições e próximo checkpoint
- Não usar dados/arquivos reais, não criar contatos reais, não colocar contrato real ou informação sensível.
- Não mergear PR #2; não atualizar /docker/envoxers/backend, frontend, env, volume ou DB de produção.
- Staging roda na mesma máquina física; isolamento de código, rede Docker e DB, não isolamento de recursos físicos.
- Resolver o bloqueio da correção do mount de mídia por caminho aprovado antes de qualquer entrega de arquivos a clientes.
- Passar cenários de login/navegação com Playwright ou navegador real e testes de privacidade dos payloads.
- Implementar versões/aprovações externas, testar compatibilidade com o aplicativo Windows e Drive em ambiente controlado.

## Incrementos posteriores
- RBAC de gestor regional mais restrito: somente pedidos de unidades permitidas, inclusive quando o gestor originalmente criou solicitação de outra regional.
- Suite Frontend Envoxers estabilizada com espera por elementos do Drive antes das assertivas (sem ignorar falhas).
- CI dos dois workflows aprovado no commit `b0686db8`.
- Todas as alterações de infraestrutura, gateway e simulação executadas exclusivamente no staging; produção `main` `9468ee0` sem alterações versionadas. Diretório `staging-secovi/` é o único item não rastreado no checkout de produção.
