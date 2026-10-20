# Portal SECOVI + Envoxers | Execução Fase 2

> Branch `feature/secovi-portal-foundation-20261020`. **Não homologado. Não implantar em produção sem autorização.**
> Este documento registra evidências de código versionado, não testes presumidos.

## Decisões preservadas
- Cliente SECOVI é um único `Cliente`, com `PortalUnidade` do tipo regional ou frente.
- `Solicitacao` permanece fonte de verdade para pedidos; `Tarefa` e `RegistroFoco` continuam gerindo execução.
- Horas de foco não representam créditos. Tempo agregado só mediante autorização individual explícita.
- Nada é aprovado ou publicado por silêncio; nenhuma solicitação gera automaticamente contrato/cobrança.
- Portal não recebe comentários internos existentes das tarefas.
- Ummense continua sendo formulário vigente durante implantação e homologação.
- Não há seed com usuários reais, regiões fictícias ou dados do SECOVI.

## Implementado nesta branch
1. Migration aditiva 0057: unidades, vínculos de acesso, papéis de contatos, protocolo, campos de solicitação, relacionamento N:N com tarefas, eventos, comentários de visibilidade e formulários versionados.
2. RBAC/ABAC: escopos próprios, unidade, instituição, papel e restrições adicionais. Admissões sempre filtradas pelo cliente do JWT.
3. APIs protegidas em `/api/v1/portal/operacao`: configuração, dashboard, listar/criar/consultar solicitação, comentários compartilhados.
4. APIs internas protegidas para criar unidades, atribuir papéis/unidades, vincular solicitações a tarefas existentes, comentários internos/públicos e formulário.
5. Frontend responsivo: dashboard, listagem/pesquisa, solicitação, detalhamento/timeline, interação e área legada de documentos.
6. Testes unitários puros de autorização, compilação JSX e workflow CI.
7. Nenhuma modificação de produção e nenhum cadastro de contatos reais.

## Pendências técnicas, bloqueios e riscos
- **CRÍTICO**: upload legado é servido por `StaticFiles` sem ACL por recurso. Não foi modificado porque alterar a URL diretamente quebraria thumbnails, downloads e Desktop. Não expor anexos ao portal antes de criar serviço de mídia autenticado e migrar consumidores. Tratar com prioridade no próximo pacote.
- Formulário customizado: versão armazenada e renderização simples; falta enforcement servidor das regras e campos condicionais antes de habilitar formulário arbitrário.
- Dashboard: contagem das solicitações limitadas a 300 para evitar query não limitada. Necessita agregação paginada para números globais.
- O portal faz *polling* a cada 30 segundos; não há WebSocket externo e não deve ser chamado de tempo real instantâneo.
- Aprovação externa e versionamento de materiais ainda não implementados.
- Registros de histórico das tarefas não estão publicados; apenas eventos expressamente públicos aparecem.
- Testes ponta a ponta com PostgreSQL, persistência e regressão de uploads dependem de staging isolado com banco efêmero.
- Sem backup de produção ou restauração validada: host conectado é do Farmas; infraestrutura Envoxers não localizada.
- Contrato: oito perfis sociais vs seis nomes, aprovação 48h úteis, aprovadores e regionais devem ser confirmados.
- **Não migrar ou desativar Ummense.**

## Critérios de liberação
- CI verde + testes com PostgreSQL efêmero.
- Revisão de segurança de ACL em arquivos e endpoints, inclusive IDOR.
- Aprovações cliente e papéis testados com usuários fictícios.
- Regressão do Drive de Arquivos, previews, vídeos e Desktop.
- Homologação interna e autorização expressa antes de publicar ao SECOVI.

## Checklist de execução
| Etapa | Estado |
|---|---|
| Branch isolada e commits | Concluído |
| Modelagem + migration 0057 | Código criado, aguardando integração DB |
| Roles e autorização unitária | Código criado, testes CI pendentes |
| Solicitações, protocolo e ligação com tarefas | Código criado, integração DB pendente |
| Dashboard, nova solicitação e detalhe | Código criado, teste visual pendente |
| Arquivos privados e anexos | Bloqueado até estratégia de migração |
| Aprovações externas, versões | Pendente |
| Atualização instantânea | Pendente |
| Relatórios, calendário, gestão no portal | Pendente |
| Rollout SECOVI, cadastro real e migração | Proibido sem homologação |

## Comandos locais sugeridos (staging/CI)
```bash
python -m compileall -q backend/app backend/migrations/versions backend/tests
(cd backend && python -m unittest discover -s tests -p 'test_portal_*.py' -v)
(cd frontend && npm ci && node tests/portal-compile.mjs && npm run test:smoke)
```
