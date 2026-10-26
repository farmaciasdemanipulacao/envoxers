# Modelo simples de acesso do Portal do Cliente Envoxers

Data de definição: 23/10/2026. Escopo: **módulo permanente e configurável**, SECOVI como primeiro cliente.
Estado: branch do PR #2, em homologação. **Não é autorização para merge ou produção.**

## A hierarquia real

**Envoxers gestor/admin interno**, autenticado pelo Envoxers, tem visão operacional e gestão de todas as atividades e relatórios, inclusive dados internos quando permitidos pelos controles do próprio sistema.

**Administrador/Gestor SECOVI** é um único perfil externo (`admin_institucional`). Pode ser solicitante, participar de aprovações e consultar todas as áreas, pedidos, pessoas e vínculos de acesso **somente do SECOVI**. Não é admin do Envoxers e não recebe acesso a outros clientes.

**Solicitante SECOVI** é o outro perfil externo (`solicitante`). Pode abrir pedidos, comentar e acompanhar demandas vinculadas a **qualquer uma** das regionais e frentes expressamente atribuídas à pessoa. O escopo não depende de quem originalmente abriu a demanda.

**Pode aprovar** é uma permissão booleana adicional por usuário, **não um terceiro perfil**. Pode ser marcada para solicitantes e desmarcada inclusive para um administrador. A fila de pendências de material atualmente é somente leitura; confirmar aprovação ou pedir ajustes depende da integração auditável com o Kanban existente.

Perfis históricos (`consulta`, `gestor_regional`, `gestor_geral`, `aprovador`) ainda são reconhecidos pelo backend por compatibilidade, **não são oferecidos para novas atribuições**. A edição interna oferece apenas os dois perfis novos e conserva a indicação de aprovação existente.

## Regionais, frentes e múltiplas áreas

Regionais são regiões geográficas, como **Maringá** e **Londrina**. Frentes são departamentos/unidades organizacionais, como **Secovimed**.

| Contato fictício | Perfil externo | Áreas vinculadas | Pode aprovar |
|---|---|---|---|
| Marli | Solicitante | Maringá | Sim |
| Tatiana | Solicitante | Maringá | Não |
| Maria | Solicitante | Londrina | Não |
| João | Solicitante | Frente Secovimed | Sim |
| Pessoa Multiárea | Solicitante | Maringá + Secovimed | Sim |
| Admin SECOVI | Administrador/Gestor | Todas as áreas do SECOVI | Configurável |

**Visualização** combina os pedidos cujas regionais **ou** frentes estão atribuídas ao usuário (união dos vínculos), sempre incluindo `cliente_id` na consulta, no detalhe e nas aprovações. Uma conta com Maringá e Secovimed vê ambos sem enxergar Londrina.

**Criação** exige pelo menos uma referência (regional ou frente); ambas são opcionais individualmente. Se as duas forem fornecidas, o usuário precisa estar autorizado a criar pedidos em cada área escolhida. João pode solicitar apenas pela frente Secovimed.

A associação entre contato e área é mantida em `PortalContatoUnidade` e os pedidos continuam em `Solicitacao`, que já contém `portal_unidade_id` e `portal_frente_id`. A execução continua em `Tarefa`, `RegistroFoco` e entregas existentes. **Nenhuma fonte operacional paralela foi criada.**

## Limites obrigatórios dos dados externos

A resposta externa não inclui **valores financeiros, custo de produção, tempo de execução ou usuário interno da Envox responsável pela demanda**. O código do detalhe não retorna horas nem quando um registro antigo contém `ver_horas: true`. O painel de horas continua exclusivo da operação interna.

O administrador SECOVI pode consultar pessoas e vínculos, mas não recebe e-mails, senhas, IPs ou IDs internos do pessoal da Envox nessa listagem.

O gateway do staging nega APIs administrativas, arquivos privados legados e endpoints internos. A proteção final dos arquivos, documentos financeiros, vínculo com Drive, miniaturas e downloads deve estar comprovada antes da liberação, assim como a autenticação real dos perfis. A edição de `portal_auth.py`, `portal_documentos.py` e o mount legado de arquivos continuam pendências de segurança registradas; não alegar homologação completa.

## Testes e estágio da entrega

- Testes de DB e RBAC cobrem Maringá, Londrina, Secovimed, usuários com múltiplos vínculos, criação exclusiva por frente, tentativa de criar em área não autorizada e ausência dos campos privados.
- Teste JSX navega como administrador e cinco exemplos de solicitantes, com e sem aprovação, incluindo pessoa multiárea.
- Staging usa banco fictício isolado e não modifica Envoxers produção, Farmas, TodasBR ou cliente-dev.
- A prévia sem login é apenas demonstrativa e identifica explicitamente dados fictícios.
