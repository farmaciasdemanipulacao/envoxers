# Envoxers Desktop Windows | versão piloto

Aplicativo Tauri v2 para Windows 11. O frontend remoto usa o domínio
https://envoxers.envox.com.br, o mesmo backend e banco de dados do Web.

Recursos:
- Bandeja: abrir, alternar início com Windows e encerrar.
- Fechar a janela oculta o aplicativo sem desligar o Chat.
- Autostart Windows inicia na bandeja.
- Indicador vermelho na barra de tarefas para mensagens não lidas.
- Notificações nativas de Chat, recebidas via WebSocket com o app aberto em segundo plano.

Segurança:
- Não são armazenadas credenciais no instalador.
- Frontend remoto não tem comandos de shell ou permissões de arquivos Tauri.
- Esta versão piloto não tem atualização automática assinada.
- Notificações nativas dependem do processo na bandeja e das regras Windows
  para notificações e Não Perturbe.

Compilação: cd desktop, npm ci, npm run build -- --bundles nsis.
Também disponível no workflow Envoxers Desktop Windows (piloto) do GitHub.

Testar: login, Chat enquanto no Kanban, ícone na barra de tarefas,
fechar para bandeja, reiniciar Windows com autostart, desabilitar autostart,
sincronização com a versão Web em outra máquina.

## v0.2.0 | diagnóstico e correção Windows

- Início com Windows abre uma janela visível, em vez de ficar oculto na bandeja.
- Migração da configuração de autostart anterior sem sobrescrever a escolha
  de quem desativou o recurso.
- O comando nativo pode consultar/alterar o registro de inicialização.
- Painel **Diagnóstico Windows** no canto inferior direito, visível mesmo no login.
- Testes individuais: notificação nativa, indicador da barra de tarefas,
  estado de inicialização e cópia de resultado.
- Comunicação Tauri autorizada para o domínio oficial com permissões core
  padrão; não há acesso remoto a shell nem arquivos.
- Erros de invocação não são mais descartados silenciosamente.

### Homologação no Windows 11

1. Feche completamente a versão antiga pela bandeja e instale o novo .exe.
2. Abra o painel Diagnóstico Windows e confirme a ponte Tauri conectada.
3. Teste notificação e confira se o banner realmente apareceu.
4. Teste a bolinha no ícone da barra de tarefas.
5. Confira "Inicialização registrada: sim"; se não, use o botão Ativar.
6. Reinicie o Windows. O Envoxers deve abrir com janela visível.
7. Com a janela minimizada, receba uma mensagem de outro usuário e
   confira notificação e badge.
8. Informe qualquer falha com o texto copiado do painel de diagnóstico.

A compilação Windows não substitui a homologação em Windows 11 real.
