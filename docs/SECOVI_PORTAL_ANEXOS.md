# Anexos do Portal SECOVI (branch de desenvolvimento)
- Migration 0058 registra metadados dos anexos; nenhum URL estático é publicado.
- Arquivos em `UPLOAD_DIR/private/{solicitacao_id}`, bloqueados no mount legado.
- Download requer token de contato autorizado, solicitação do mesmo cliente e escopo por regional.
- Arquivos são baixados como attachments e nunca renderizados como conteúdo ativo.
- Upload é streaming, limitado a 250 MB e extensões reconhecidas.
- ATENÇÃO: demais arquivos legados permanecem publicamente servidos. A correção desses arquivos requer migração planejada, incluindo Drive, previews e Desktop.
