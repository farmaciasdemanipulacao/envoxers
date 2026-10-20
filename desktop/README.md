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

## v0.2.1 | Correção de ACL para comandos nativos remotos

A versão 0.2.0 permitia a origem remota, mas não autorizava os comandos personalizados. Isso resultava em "Command native_status not allowed by ACL", "native_badge not allowed by ACL" e no mesmo bloqueio para alertas e inicialização.

Correção:
- src-tauri/build.rs: AppManifest::commands declara os quatro comandos.
- capabilities/envoxers-remote.json: quatro permissões allow-native-* explícitas, autorizadas somente para https://envoxers.envox.com.br/* na janela main.
- npm run test:acl: impede regressão entre comandos Rust, manifest, permissões, origem e invocações JavaScript.
- O CI do Windows executa o teste ACL antes de compilar o instalador.

Instale a versão 0.2.1, encerre a anterior pela bandeja, abra Diagnóstico Windows e teste notificação, bolinha e inicialização. O build valida as permissões compiladas, mas somente o teste no Windows real confirma o aviso visual e o autostart.

## v0.2.2 | downloads nativos

O aplicativo Windows baixa os anexos gerenciados pelo Envoxers diretamente
na pasta Downloads do Windows, sem depender de abas do WebView2.

- Links /api/v1/uploads/*: download nativo em streaming (até 300 MB).
- Relatórios CSV (Clientes, Relatórios, Foco): salvar arquivo por IPC, até 12 MB.
- Nomes de arquivos sanitizados e renomeação automática quando já existe
  arquivo com o mesmo nome. Nenhum download sobrescreve arquivos existentes.
- Downloads HTTP permitidos apenas por HTTPS no domínio oficial
  envoxers.envox.com.br e somente na rota de uploads. Redirecionamentos
  externos são bloqueados.
- Mensagem de sucesso ou falha na tela e diagnóstico do último download.
- Diagnóstico Windows inclui botão Testar download, que salva um TXT pequeno.

Testar no Windows 11: clique em Testar download e confira o TXT em Downloads;
em seguida baixe um PDF e um arquivo grande enviados pelo Chat/Arquivos.
Confirme também exportação CSV e nomes repetidos. Downloads de URLs externas
não são interceptados por esta implementação.
