\# Envoxers — Sistema de Gestão Interna da Envox



\## Stack

\- Backend: Python + FastAPI + Alembic

\- Frontend: React via Babel standalone, arquivos tc-\*.jsx, sem bundler

\- Banco: PostgreSQL — database envox\_kanban no container envox-intel-postgres

\- Infra: Docker Compose + nginx (padrão do envox-intel)

\- Subdomínio: envoxers.envox.com.br



\## Arquivos de referência

\- /docker/envoxers/envox-f0-f3-schema.sql → modelo de dados (converter MySQL → PostgreSQL)

\- /docker/envoxers/envox-f0-f3-wireframe.html → design exato — não redesenhar



\## Regras

\- Seguir estrutura de pastas do envox-intel (/docker/envox-intel/backend/)

\- tenant\_id nas tabelas principais (nullable, default 1) — sem lógica multi-tenant agora

\- Auth: JWT + bcrypt, papéis: admin / gestor / envoxer

\- Portas livres (8000 e 8080 ocupadas)

\- Não tocar nos server blocks nginx existentes

\- Mostrar plano antes de executar qualquer coisa



\## Fases

F0 → cadastros base | F1 → Kanban + Foco + dashboard

F2 → Farol + alertas + aprovações | F3 → ICP + churn + faturamento

F4 → PDI + feedback + gamificação | F5 → IA + integrações



\## Construir uma fase por vez. Só avançar quando Gus validar.

## Stack técnica do projeto Envoxers



\- Backend: Python + FastAPI + Alembic

\- Frontend: React via Babel standalone, arquivos tc-\*.jsx, sem bundler

\- Banco: PostgreSQL — database envox\_kanban no container envox-intel-postgres (já existente)

\- Infra: Docker Compose + nginx (mesmo padrão do /docker/envox-intel)

\- Subdomínio: envoxers.envox.com.br

\- Portas livres (8000 e 8080 já ocupadas pelo envox-intel)



\## Arquivos de referência

\- /docker/envoxers/envox-f0-f3-schema.sql → modelo de dados (MySQL → converter para PostgreSQL)

\- /docker/envoxers/envox-f0-f3-wireframe.html → design exato — não redesenhar



\## Regras de construção

\- tenant\_id nas tabelas principais (nullable, default 1) — sem lógica multi-tenant agora

\- Auth: JWT + bcrypt, papéis: admin / gestor / envoxer

\- Não tocar nos server blocks nginx existentes

\- Mostrar plano completo antes de executar qualquer migration ou subir container

\- Construir uma fase por vez, só avançar quando Gus validar



## Padrão obrigatório de formulários e fields

- Todo formulário novo deve nascer já no padrão visual global do Envoxers. Não deixar `input`, `select`, `textarea`, datepicker ou controles equivalentes com aparência nativa/arcaica do navegador.
- O acabamento obrigatório está em `frontend/public/envox-forms.css`, carregado depois de `envox-tokens.css`.
- Estrutura preferencial: `.field` para label + controle e `.form-row` para agrupamentos. Evitar estilos inline para aparência de campos; usar o design system.
- Manter tipografia, altura, padding, borda, radius, hover, focus, disabled e placeholder consistentes em toda a aplicação.
- `select` e campos de data devem permanecer funcionais, mas visualmente integrados ao Envoxers.
- Botões posicionados ao lado de campos devem acompanhar a altura do controle.
- Modal sem painel lateral não pode reservar coluna vazia. Modal de uma coluna deve ocupar somente o espaço necessário e ser responsivo.
- Ao criar ou revisar qualquer tela com formulário, verificar desktop e mobile e corrigir visualmente antes de considerar a entrega concluída.
- Checklist obrigatório antes de finalizar forms: controles com .field/.form-row, sem aparência nativa, ações com .form-actions, modal de uma coluna com .modal-form-single e nenhum style inline usado para consertar aparência de field.
- Sempre que envox-forms.css ou envox-tokens.css mudar, incrementar a versão ?v= correspondente em index.html para impedir que o PWA mantenha CSS antigo em cache.
