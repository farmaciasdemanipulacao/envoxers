# Desenvolvimento & Pessoas | Interface premium F4

Data: 14/10/2026.

## Objetivo
Harmonizar Feedback 360°, Avaliação 180°, Feedback 1:1, Clima Organizacional e Ciclos com a experiência visual interativa da Jornada PDI.

## Implementação
- `frontend/public/tc-f4-premium.jsx`: design e componentes das cinco seções.
- `frontend/public/f4-premium.css`: estilos compartilhados, responsivos, estados, escalas, calendários e formulários.
- `frontend/public/tc-f4.jsx`: a navegação original agora exibe os componentes premium. Componentes originais permanecem no arquivo para preservar referência/compatibilidade e servir de base a eventuais rollbacks.
- `frontend/public/index.html`: versões cache-busted e ordem dos scripts.

## Operações preservadas
- 360°: seleção de ciclo, envio de notas 1–5 por competência e comentário, consulta por pessoa, catálogo administrativo.
- 180°: avaliação mão dupla, notas, forças e melhorias, consulta de recebidas e envio.
- 1:1: criação, edição, filtros de conversas, respostas do liderado, datas e combinados.
- Clima: resposta/revisão por pergunta, agregados, distribuição média, respostas abertas; auditoria somente para administrador. A pesquisa é confidencial, **não anônima**, conforme backend existente.
- Ciclos: criação de rascunhos, cadastro de perguntas do Clima, abertura (criação dos pares de 360/180) e encerramento, com confirmação.

## Boas práticas
Sem gamificação dos resultados do clima ou ranking de avaliações. Notas e resultados continuam sendo os valores calculados pelo backend. Componentes responsivos e controles com labels, estados de carregamento e confirmação.

## Testes
Transpilação JSX/Babel, análise sintática, renderização simulada das cinco telas e formulários, verificação HTTP 200 dos arquivos no frontend e testes das rotas protegidas sem autenticação (401). Não foi feita captura visual com navegador autenticado.
