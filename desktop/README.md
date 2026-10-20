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


## v0.3.0 | Atualização automática assinada

O Desktop consulta a versão em https://envoxers.envox.com.br/desktop-updates/latest.json ao iniciar (15 segundos após carregar) e a cada 6 horas com o aplicativo aberto. Quando há nova versão, apresenta um aviso com **Atualizar agora** e **Depois**. O usuário deve salvar o trabalho antes de confirmar, pois o Windows encerra o app para instalar.

O painel Diagnóstico Windows também tem **Verificar atualizações**.

### Publicação sem expor a chave privada ao GitHub

1. GitHub Actions compila o instalador NSIS e cria a release pública desktop-vX.Y.Z, apenas uma vez por versão.
2. Na VPS, o timer envoxers-desktop-updater.timer consulta as releases oficiais a cada 5 minutos.
3. O serviço baixa o instalador por HTTPS, valida origem, nome, tamanho e cabeçalho PE, e assina com a chave Tauri local.
4. O serviço publica o instalador e o manifesto latest.json de forma atômica no servidor Envoxers.
5. O aplicativo Windows valida a assinatura criptográfica antes de instalar.

A chave privada fica somente em /etc/envoxers-desktop-updater/signing.key, fora do Git. **É obrigatório manter um backup seguro dessa chave privada.** Perdê-la impede assinar futuras atualizações para clientes existentes. Nunca copie a chave para o GitHub, repositórios, logs, tickets ou chat.

O serviço systemd usa a conta dedicada envox-updater, com acesso restrito à chave e ao diretório de publicação. Verificação operacional:

    sudo systemctl status envoxers-desktop-updater.timer
    sudo systemctl start envoxers-desktop-updater.service
    sudo journalctl -u envoxers-desktop-updater.service -n 30 --no-pager
    curl -fsS https://envoxers.envox.com.br/desktop-updates/latest.json

### Processo de lançamento

1. Incrementar version em desktop/package.json, desktop/src-tauri/Cargo.toml e desktop/src-tauri/tauri.conf.json; atualizar teste ACL.
2. Executar npm run test:acl, build e testes de fumaça.
3. Enviar para main; a Action publica a release da versão.
4. O timer assina e publica a atualização em até aproximadamente 5 minutos.
5. Verificar latest.json e testar no Windows com uma versão anterior.

**A primeira instalação da versão 0.3.0 ainda é manual**, porque os instaladores 0.2.x não possuíam o atualizador. A partir dela, novas versões podem ser instaladas pelo próprio aplicativo.

A instalação exige confirmação para não interromper tarefas. Build e publicação no servidor não substituem um teste real de upgrade no Windows.


### v0.3.1 | Teste de atualização real

Release incremental de homologação. Instale a versão 0.3.0, clique em
Verificar atualizações no diagnóstico e confirme que a versão 0.3.1
é oferecida pelo servidor. Ao aceitar, o Windows deverá instalar a nova
versão, sem desinstalação manual.

## v0.3.2 | Central de downloads com progresso e prévias

- Downloads em streaming agora emitem progresso nativo em bytes.
- A central de downloads mostra uma barra com porcentagem real quando
  o servidor informa Content-Length, ou um indicador indeterminado quando
  não houver tamanho informado.
- O card apresenta as últimas cinco transferências da sessão, status,
  ícone por formato e miniatura para fotos.
- Vídeos suportados pelo WebView2 tentam mostrar um quadro capturado de
  um instante do vídeo (sem reproduzir áudio). Caso o codec ou formato
  não permita, permanece o ícone de vídeo como alternativa.
- Botão **Abrir pasta** da central chama o Explorador de Arquivos
  exclusivamente na pasta Downloads resolvida pelo Windows.
- Relatórios CSV seguem o mesmo card, com indicador de leitura e etapa
  de salvamento, sem porcentagem fictícia.
- O atualizador nativo também emite progresso em bytes e porcentagem,
  exibido no card da atualização com barra e texto.
- Acesso a comandos nativos segue restrito à origem oficial
  envoxers.envox.com.br e à janela principal, com testes de ACL.
- Aplicativos anteriores podem continuar baixando, porém apenas a
  versão 0.3.2 oferece porcentagem nativa e abertura da pasta.

### Homologação Windows 11

1. Com 0.3.1 instalado, atualizar automaticamente para 0.3.2.
2. Baixar PDF médio e vídeo grande; conferir progresso e nome.
3. Baixar foto JPG/PNG e conferir miniatura.
4. Baixar vídeo MP4 compatível e conferir quadro de prévia ou fallback.
5. Clicar em Abrir pasta e confirmar Downloads no Explorador.
6. Baixar arquivo repetido e garantir que não seja sobrescrito.
7. Abrir com uma versão anterior e confirmar compatibilidade.
8. Conferir progresso da próxima atualização de 0.3.2 para uma versão futura.
