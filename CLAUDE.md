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

