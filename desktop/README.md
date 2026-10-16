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
