# Homologação visual do Portal SECOVI

Estado em 26/10/2026: staging isolado, banco `portal_ci`, dados 100% fictícios, PR #2 draft e produção preservada.

## Endereços
- Portal autenticado de homologação: `https://equilibrium-mod-hundreds-theories.trycloudflare.com/portal/`
- Prévia sem login: `https://equilibrium-mod-hundreds-theories.trycloudflare.com/portal/previa.html`

O domínio é um túnel temporário. A homologação final antes do lançamento exige domínio fixo HTTPS.

## Pessoas fictícias
Todas pertencem ao cliente `SECOVI-PR | HOMOLOGAÇÃO FICTÍCIA`. A senha compartilhada de homologação **não é armazenada neste repositório**.

| Pessoa | Login | Perfil | Escopo |
|---|---|---|---|
| Administrador SECOVI | admin.secovi@example.com | Admin/Gestor institucional | toda a organização |
| Marli Teste | marli.maringa@example.com | Solicitante + aprovação | Maringá |
| Tatiana Teste | tatiana.maringa@example.com | Solicitante | Maringá |
| Maria Teste | maria.londrina@example.com | Solicitante | Londrina |
| João Teste | joao.secovimed@example.com | Solicitante + aprovação | Secovimed |
| Usuário Multiárea | multi.secovi@example.com | Solicitante + aprovação | Maringá + Secovimed |

Contas antigas `.invalid` e áreas genéricas Alfa/Beta foram desativadas no banco de homologação.

## Massa de dados
- Regionais: Maringá e Londrina.
- Frente: Secovimed.
- 3 campanhas fictícias.
- 3 eventos fictícios.
- 4 solicitações fictícias com vínculos variados, incluindo casos "sem campanha/sem evento".
- Menus, status coloridos, Campanhas, Eventos, Pessoas e acessos, Documentos e Em validação conforme as permissões.

## Evidências de validação
- `17/17` testes `backend/tests/test_portal_*.py` aprovados.
- Frontend: sintaxe Portal, seis perfis, status/contraste WCAG, Chat, Drive e app Windows aprovados.
- Alembic: um único head `0061_portal_chat_merge`.
- Endpoint público do Portal = HTTP 200.
- `/api/v1/portal/operacao/configuracao` sem token = HTTP 401.
- `/api/v1/portal/documentos` sem token = HTTP 401.
- APIs internas e uploads pelo gateway de homologação = HTTP 404.
- Gate de release = **4/5**. O único bloqueador restante é conectar `ArquivosLegadosProtegidos` ao mount de uploads no `backend/app/main.py`; a ferramenta recusou essa edição e ela não foi contornada.

## O que esta homologação NÃO autoriza
Não fazer merge, deploy em produção ou cadastrar SECOVI real enquanto o gate de release estiver vermelho. A classe protetora de arquivos passou isoladamente, mas o mount de produção ainda não foi corrigido. O ambiente autenticado é apenas para avaliação funcional com dados fictícios.
