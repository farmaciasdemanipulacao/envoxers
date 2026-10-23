# Portal do Cliente | Campanhas e Eventos

Implementado em **PR #2 (draft, não mesclado)** em 23/10/2026.

## Padrão visual

Referência de interface: https://cliente-dev.envox.com.br/portal/. Mantido azul `#16284D`, vermelho Envox `#C10230`, creme `#F7F7F5`, ícones SVG lineares reutilizados da navegação de cliente-dev, cartões sutis e layout responsivo. Campos, ícones e botões seguem classes escopadas `po-*`, sem alterar o app interno da equipe.

## Regra funcional

- Menu externo agora contém **Campanhas** e **Eventos**.
- Nova solicitação: **escolha explícita da campanha e do evento**. Ambos os selects começam vazios, exigem selecionar um cadastro ou **Sem campanha** / **Sem evento**; o backend rejeita omissão dos campos.
- Campanha pode ser criada durante a solicitação digitando **somente nome**, reaproveitando regional/frente escolhida. O cadastro fica salvo e é selecionado automaticamente; não é um segundo Kanban.
- Um evento pode ser escolhido do catálogo ou criado com nome e data. Novo evento é cadastrado na **tabela operacional `evento` já usada pelo calendário interno**, tipo `evento_externo`.
- Páginas exibem os cadastros acessíveis e a contagem das demandas **reais** vinculadas. A abertura de um card filtra as mesmas solicitações, sem replicar tarefas, execução ou cronograma.
- Registros anteriores continuam com vínculos `NULL`, apresentados ao cliente como **Sem campanha** ou **Sem evento**, preservando compatibilidade.

## Persistência e segurança

Migração `0060_portal_campanhas_eventos.py` no banco *isolado* de homologação:

- `portal_campanha`: catálogo vinculado a `cliente_id`, regional ou frente e contato criador; apenas metadados.
- `evento.portal_unidade_id`, `evento.portal_frente_id`: regional/frente do evento existente (nulos nos eventos internos anteriores).
- `solicitacao.portal_campanha_id`, `solicitacao.portal_evento_id`: vínculos FK, mantendo `Solicitacao` como fonte canônica de pedidos.

Rotas na API existente `/api/v1/portal/operacao`: GET/POST `/campanhas`, GET/POST `/eventos`. Verificam autenticação, portal habilitado, `cliente_id` e vínculos de regionais/frentes. O backend rejeita IDs de outro cliente ou não acessíveis e impede criar pedido usando campanha/evento de outra área. Resposta pública limitada à projeção autorizada.

Não foram alterados os projetos Farmas, TodasBR, cliente-dev ou o branch principal em produção.

## Validação

- Teste PostgreSQL `backend/tests/test_portal_campanhas_eventos.py` inclui criação real de campanha/evento, vínculo com solicitação, escolha explícita de `NULL`, contagens, acesso por regional/frente e tentativas de referência cruzada.
- Teste `frontend/tests/portal-role-ui.mjs` abre menu Campanhas, Eventos, nova solicitação, verifica campos vazios e opções Sem, criação inline e os seis perfis de exemplo.
- `frontend/tests/portal-compile.mjs`, smoke do Drive/miniaturas/ponte Windows e testes `test_portal_*.py` passaram na execução de staging.
- Prévia em memória, **não autenticada**, em `https://queensland-folding-proteins-rim.trycloudflare.com/portal/previa.html`, com três campanhas e três eventos fictícios. Dados criados na prévia são descartados ao recarregar.
- O portal de produção **não foi atualizado**, PR continua draft e ainda depende da homologação de autenticação, arquivos privados e workflows de aprovação antes de qualquer merge.
