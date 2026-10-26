# Liberação restrita de leitura ao cliente-dev (ação humana do operador)

**Estado:** pendente de ação no terminal administrativo da VPS. Solicitante autorizou a auditoria somente de leitura em 26/10/2026.

## Diagnóstico verificado
- Agente: `sentinelx-cloud-core`, host `srv1546638`, configuração `/etc/sentinelx/config.yaml`.
- Política `file_ops.paths`: `/etc` está como `access: r` e `/docker/envoxers` como `access: rw`; `/docker/envox-skills-staging` não está cadastrado.
- Tentativa normal de `sentinel_edit` com `sudo:true`, `validator_preset:yaml` e `dry_run:true` retornou `path_not_allowed`. Esse bloqueio **não pode ser ultrapassado com outro comando do agente**.
- Não foi feita nenhuma alteração no cliente-dev, nem na configuração do agente.

## Único passo necessário ao operador

Acessar o terminal administrativo diretamente na VPS, por painel do provedor ou SSH. **Não executar por SentinelX.**

1. Criar um backup e abrir o arquivo:

   ```bash
   sudo cp /etc/sentinelx/config.yaml /etc/sentinelx/config.yaml.bak-portal
   sudo nano /etc/sentinelx/config.yaml
   ```

2. Localizar a seção `file_ops:` / `paths:`. Imediatamente após `/docker/envoxers`, adicionar, com esta indentação:

   ```yaml
       - path: /docker/envox-skills-staging
         access: r
   ```

   Não alterar `/etc` para `rw`. Não adicionar `/docker` ou `/`. Não habilitar escrita no cliente-dev.

3. Salvar no Nano com **Ctrl+O**, Enter, **Ctrl+X** e recarregar o agente com:

   ```bash
   sudo systemctl restart sentinelx-cloud-core
   ```

   O SentinelX pode desconectar momentaneamente e reconectar sozinho. Isso reinicia apenas o agente, não os containers de produção.

4. Retornar ao chat e informar que o agente foi reiniciado. O assistente verificará a permissão com `sentinel_capabilities` e `sentinel_project_snapshot({path:"/docker/envox-skills-staging"})`.

## Rollback se necessário

Restaurar o backup `sudo cp /etc/sentinelx/config.yaml.bak-portal /etc/sentinelx/config.yaml` e reiniciar o agente `sudo systemctl restart sentinelx-cloud-core`.

## Limitações

Essa mudança **só habilita leitura** de um diretório específico para auditar o cliente-dev. Não substitui as revisões de autorização das rotas externas do Portal e não elimina os quatro bloqueadores do CI de segurança de #10. PR #2 permanece draft; nenhuma implantação em produção é autorizada.
