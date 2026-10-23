/* Garante que o login não carrega módulos e que a aplicação abre após login. */
import {createServer} from "node:http";
import {readFile} from "node:fs/promises";
import {join,extname,normalize} from "node:path";
import {fileURLToPath} from "node:url";
import {JSDOM, ResourceLoader, VirtualConsole} from "jsdom";
import assert from "node:assert/strict";

const root=fileURLToPath(new URL("../public/", import.meta.url));
const mime={".html":"text/html", ".js":"application/javascript", ".css":"text/css",
  ".json":"application/json", ".png":"image/png", ".ico":"image/x-icon"};
const server=createServer(async (req,res)=>{
  const pathname=new URL(req.url,"http://localhost").pathname;
  try {
    const path=join(root,normalize(decodeURIComponent(pathname)).replace(/^\/+/,""));
    if(!path.startsWith(root)) throw new Error("path traversal");
    const target=path.endsWith("/")?join(path,"index.html"):path;
    const data=await readFile(target);
    res.writeHead(200,{"Content-Type":mime[extname(target)]||"application/octet-stream"});
    res.end(data);
  } catch {
    res.writeHead(404);res.end("not found");
  }
});
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
const origin="http://127.0.0.1:"+server.address().port;

class TrackingResources extends ResourceLoader {
  urls=[];
  fetch(url,opts) {this.urls.push(url);return super.fetch(url,opts);}
}
async function open(authorized=false,desktop=false,chatFixture=false) {
  const resources=new TrackingResources(),errors=[],nativeCalls=[],nativeEvents=new Map();
  const virtualConsole=new VirtualConsole();
  virtualConsole.on("jsdomError",e=>errors.push(e.message));
  virtualConsole.on("error",e=>errors.push(String(e)));
  const dom=await JSDOM.fromURL(origin+(desktop?"/?envoxers_desktop=1":"/"),{
    resources,virtualConsole,runScripts:"dangerously",pretendToBeVisual:true,
    beforeParse(win) {
      if(desktop) win.__TAURI__={core:{invoke:async (command,args)=>{
        nativeCalls.push({command,args});
        if(command==='native_status') return {version:'0.3.0',windows:true,autostart_registered:true,autostart_error:null};
        if(command==='native_set_autostart') return !!args.enabled;
        if(command==='native_download') {
          const event=nativeEvents.get('envoxers:download-progress');
          event?.({payload:{transferId:args.transferId,received:50,total:100,state:'downloading'}});
          await new Promise(resolve=>setTimeout(resolve,80));
          event?.({payload:{transferId:args.transferId,received:100,total:100,state:'complete'}});
          return args.filename || 'arquivo.pdf';
        }
        if(command==='native_open_downloads') return true;
        if(command==='native_save_file') return args.filename;
        if(command==='native_check_update') return {version:'0.3.1',notes:'Teste de atualização'};
        if(command==='native_install_update') {
          const event=nativeEvents.get('envoxers:update-progress');
          event?.({payload:{phase:'downloading',received:500,total:1000,percent:50}});
          await new Promise(resolve=>setTimeout(resolve,80));
          return true;
        }
      }},event:{listen:async (event,callback)=>{nativeEvents.set(event,callback);return ()=>nativeEvents.delete(event);}}};
      if(!authorized) return;
      win.localStorage.setItem("envoxers_token",chatFixture?"e30.eyJzdWIiOiIzMzMifQ.sig":"DUMMY_TEST_TOKEN");
      win.localStorage.setItem("envoxers_nome","Teste Envoxers");
      win.localStorage.setItem("envoxers_permissao","envoxer");
      win.localStorage.setItem("envoxers_id","333");
      win.localStorage.setItem("envoxers_modo_acesso","web");
      win.sessionStorage.setItem("envoxers_view_333",chatFixture?"chat":"arquivos");
      win.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});
      win.__testSockets=[];
      win.__testReadAcks=[];
      win.WebSocket=class {constructor(){this.readyState=0;win.__testSockets.push(this)}close(){}send(){}};
      win.fetch=(url,options={})=>{
        const path=String(url);
        if(path.includes("/assets-runtime/manifest.json")) return fetch(new URL(path,win.location.origin));
        let data=[];
        if(chatFixture) {
          const base={canal_id:77,autor_envoxer_id:444,autor_nome:"Colaboradora",autor_foto:null,
            texto:"Teste de mensagem",created_at:"2026-10-20T10:00:00Z",anexo_url:null,
            excluida_para_todos_em:null,resposta_a_id:null,resposta_a:null};
          if(path.endsWith("/chat/canais")) data=[{id:77,tipo:"geral",nome:"Geral",nao_lidas:0}];
          if(path.endsWith("/chat/canais/77/leituras")) data=[
            {envoxer_id:444,nome:"Colaboradora",last_read_at:"2026-10-21T10:04:00Z"}
          ];
          if(path.includes("/chat/canais/77/ler") && options.method==="POST") {
            win.__testReadAcks.push(path);
          }
          if(path.endsWith("/chat/canais/77/mensagens/301/reacoes") && options.method==="POST") {
            const emoji=JSON.parse(options.body).emoji;
            win.__testReacted=!win.__testReacted;
            data={mensagem_id:301,emoji,ativa:win.__testReacted,alterado_por_id:333,
              reacoes:win.__testReacted?[{emoji,quantidade:1}]:[]};
          }
          if(path.endsWith("/chat/canais/77/mensagens") && options.method==="POST") {
            const body=JSON.parse(options.body);
            data={...base,id:303,created_at:"2026-10-21T15:02:00Z",texto:body.texto,
              resposta_a_id:body.resposta_a_id,resposta_a:{id:301,autor_nome:"Colaboradora",texto:"Primeiro dia"}};
          } else if(path.endsWith("/chat/canais/77/mensagens")) data=[
            {...base,id:301,texto:"Primeiro dia"},
            {...base,id:302,autor_envoxer_id:333,autor_nome:"Teste Envoxers",created_at:"2026-10-21T10:00:00Z",texto:"Veja o print",
              anexo_url:"/api/v1/uploads/print-teste.png",anexo_nome:"print-teste.png",anexo_mime_type:"image/png"}
          ];
        }
        if(path.includes("/auth/me")) data={id:333,nome:"Teste Envoxers",
          permissao:"envoxer",modulos:["operacao","chat","entregas"]};
        if(path.includes("/chat/bloqueio")) data={bloqueado:false,canais:[]};
        if(path.endsWith("/arquivos")) data=[
          {contexto_nome:"Mister Bim",card_chave:"tarefa:10",card_id:10,
            card_tipo:"tarefa",card_titulo:"Social Media — Edição de Cortes",servico_nome:"Vídeo",
            nome:"capa-de-teste.png",url:"/api/v1/uploads/fixture.png",
            mime_type:"image/png",tamanho_kb:75,criado_em:"2026-10-20T10:00:00"},
          {contexto_nome:"Mister Bim",card_chave:"tarefa:10",card_id:10,
            card_tipo:"tarefa",card_titulo:"Social Media — Edição de Cortes",servico_nome:"Vídeo",
            nome:"corte-de-teste.mp4",url:"/api/v1/uploads/fixture.mp4",
            mime_type:"video/mp4",tamanho_kb:15000,criado_em:"2026-10-20T10:00:00"}
        ];
        return Promise.resolve({ok:true,status:200,json:async()=>data});
      };
    }
  });
  for(let i=0;i<40;i++){
    if(authorized ? dom.window.document.querySelector(".app")
                  : dom.window.document.querySelector(".access-headline")) break;
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  return {dom,resources,errors,nativeCalls,nativeEvents};
}
async function aguardarCondicao(fn, tentativas=50) {
  for(let i=0;i<tentativas;i++) {
    const resultado=fn();
    if(resultado) return resultado;
    await new Promise(resolve=>setTimeout(resolve,50));
  }
  return null;
}
const aguardarElemento=(document,seletor)=>aguardarCondicao(()=>document.querySelector(seletor));

try {
  const first=await open(false);
  assert.equal(first.dom.window.document.querySelector(".access-headline")?.textContent,
    "Como você quer entrar?");
  assert.equal(first.dom.window.document.querySelectorAll(".access-tab").length,3);
  assert.ok(!first.resources.urls.some(url=>url.includes("/app.js")));
  assert.ok(!first.resources.urls.some(url=>url.includes("babel")));
  assert.ok(!first.errors.length,first.errors.join("; "));
  console.log("LOGIN_LIGHT_OK:",first.resources.urls.filter(url=>url.includes(".js")).length,"scripts");
  first.dom.window.close();

  const logged=await open(true);
  assert.ok(logged.resources.urls.some(url=>url.includes("/app.js")),"app.js não carregou");
  assert.ok(logged.dom.window.document.querySelector(".app"),"AppShell não montou");
  assert.ok(!logged.errors.length,logged.errors.join("; "));
  console.log("AUTHENTICATED_APP_OK:",logged.dom.window.document.querySelector(".main")?.textContent.slice(0,65));
  const folder=await aguardarElemento(logged.dom.window.document,'.windows-folder-tile');
  assert.ok(folder,'Pasta de cliente não foi renderizada');
  folder.click();
  const card=await aguardarCondicao(()=>Array.from(logged.dom.window.document.querySelectorAll('.windows-folder-tile')).find(el=>el.textContent.includes('Social Media')));
  assert.ok(card,'Pasta de card não foi renderizada');
  card.click();
  await aguardarCondicao(()=>logged.dom.window.document.querySelectorAll('.windows-file-tile').length===2);
  const tiles=logged.dom.window.document.querySelectorAll('.windows-file-tile');
  assert.equal(tiles.length,2,'Miniaturas precisam aparecer também dentro do Drive');
  const imageTile=await aguardarCondicao(()=>Array.from(logged.dom.window.document.querySelectorAll('.windows-file-tile')).find(tile=>tile.querySelector('.windows-file-thumbnail img')?.alt==='Miniatura de capa-de-teste.png'));
  assert.ok(imageTile,'Miniatura de capa-de-teste.png não apareceu');
  assert.ok(tiles[1].querySelector('.windows-file-thumbnail.video'),'Card de vídeo sem prévia/fallback');
  assert.ok(tiles[1].querySelector('.windows-file-thumbnail-play'),'Ícone de vídeo ausente');
  assert.ok(!logged.errors.length,logged.errors.join('; '));
  console.log('DRIVE_THUMBNAILS_OK:',tiles.length,'file cards');
  logged.dom.window.close();
  // Regressões de Chat: datas, resposta persistente, prévia e foco após Enter.
  const chat=await open(true,false,true);
  const chatDoc=chat.dom.window.document;
  const separators=await aguardarCondicao(()=>chatDoc.querySelectorAll('.chat-day-divider').length===2);
  assert.ok(separators,'Separadores de data ausentes');
  assert.equal(chatDoc.querySelectorAll('.chat-msg').length,2);
  const readMark=chatDoc.querySelector('[data-chat-mensagem-id="302"] .chat-read-receipt.read');
  assert.ok(readMark, 'Confirmação de leitura não aparece na mensagem enviada');
  assert.match(readMark.textContent,/Lido por 1/, 'Grupo deve mostrar total de leitores');
  readMark.click();
  const readDetails=await aguardarElemento(chatDoc,'[data-chat-mensagem-id="302"] .chat-read-details');
  assert.match(readDetails.textContent,/Colaboradora/, 'Detalhes de quem leu ausentes');
  readMark.click();
  const chatSocketReceipts=chat.dom.window.__testSockets[0];
  assert.ok(chatSocketReceipts?.onmessage, 'WS não conectado para confirmação');
  chatSocketReceipts.onmessage({data:JSON.stringify({
    tipo:'chat_leitura_atualizada',canal_id:77,envoxer_id:555,nome:'Outra pessoa',
    last_read_at:'2026-10-21T10:05:00Z'
  })});
  await aguardarCondicao(()=>chatDoc.querySelector('[data-chat-mensagem-id="302"] .chat-read-receipt')?.textContent.includes('Lido por 2'));
  assert.match(chatDoc.querySelector('[data-chat-mensagem-id="302"] .chat-read-receipt').textContent,/Lido por 2/,
    'Confirmação de leitura de outro usuário não chegou em tempo real');
  // Status acompanha a FOTO, nunca o final de uma mensagem/anexo alto.
  const messageAvatar=chatDoc.querySelector('.chat-msg > .avatar-wrap');
  assert.ok(messageAvatar, 'Avatar com status ausente no Chat');
  const bubble=messageAvatar.querySelector('.avatar-status');
  assert.ok(bubble && bubble.parentElement===messageAvatar, 'Status não está junto da foto');
  const win=chat.dom.window;
  assert.equal(win.getComputedStyle(messageAvatar).height, 'max-content', 'Wrapper de foto está esticando com a mensagem');
  assert.equal(win.getComputedStyle(messageAvatar).alignSelf, 'flex-start', 'Avatar de mensagem deve iniciar junto ao autor');
  assert.equal(win.getComputedStyle(messageAvatar.querySelector('.avatar')).width, '38px', 'Foto pequena não foi ampliada');
  assert.equal(win.getComputedStyle(bubble).width, '14px', 'Bolinha do status não foi ampliada');
  const reactButton=chatDoc.querySelector('[data-chat-mensagem-id="301"] button[aria-label="Reagir à mensagem"]');
  assert.ok(reactButton,'Reação por mensagem não existe');
  reactButton.click();
  const picker=await aguardarElemento(chatDoc,'.chat-reaction-picker');
  assert.equal(picker.querySelectorAll('button').length,20,'Seletor de emoji incompleto');
  picker.querySelector('button').click();
  const reacted=await aguardarElemento(chatDoc,'[data-chat-mensagem-id="301"] .chat-reaction-pill.mine');
  assert.ok(reacted,'Reação do próprio usuário não foi destacada');
  assert.match(reacted.textContent,/1/,'Contagem de reações incorreta');
  reacted.click();
  await aguardarCondicao(()=>!chatDoc.querySelector('[data-chat-mensagem-id="301"] .chat-reaction-pill'));
  assert.ok(!chatDoc.querySelector('[data-chat-mensagem-id="301"] .chat-reaction-pill'),'Reação não foi removida');
  // Reação de outra pessoa deve chegar via WebSocket, sem criar outra mensagem.
  const chatSocket=chat.dom.window.__testSockets[0];
  assert.ok(chatSocket?.onmessage,'WebSocket do Chat não conectado');
  chatSocket.onmessage({data:JSON.stringify({
    tipo:'mensagem_reacoes',canal_id:77,mensagem_id:301,emoji:'👏',ativa:true,
    alterado_por_id:444,reacoes:[{emoji:'👏',quantidade:2}]
  })});
  const remoteReaction=await aguardarElemento(chatDoc,'[data-chat-mensagem-id="301"] .chat-reaction-pill');
  assert.equal(remoteReaction.textContent,'👏2','Atualização em tempo real das reações não chegou');
  assert.equal(remoteReaction.getAttribute('aria-pressed'),'false','Reação de outro usuário não pode ser minha');
  assert.equal(chatDoc.querySelectorAll('.chat-msg').length,2,'Reação gerou mensagem duplicada');
  const viewButton=chatDoc.querySelector('.chat-msg-image');
  assert.ok(viewButton,'Prévia de imagem não encontrada');
  assert.ok(chatDoc.querySelector('.chat-image-download'),'Opção de download não encontrada');
  viewButton.click();
  assert.ok(await aguardarElemento(chatDoc,'.chat-image-overlay'),'Imagem não abriu dentro do sistema');
  chatDoc.querySelector('.chat-image-dialog-header button').click();
  const replyBtn=chatDoc.querySelector('.chat-msg-actions button');
  replyBtn.click();
  assert.ok(await aguardarElemento(chatDoc,'.chat-reply-draft'),'Citação da resposta ausente');
  const textarea=chatDoc.querySelector('.chat-input-bar textarea');
  textarea.focus();
  const setter=Object.getOwnPropertyDescriptor(chat.dom.window.HTMLTextAreaElement.prototype,'value').set;
  setter.call(textarea,'Resposta de teste');
  textarea.dispatchEvent(new chat.dom.window.Event('input',{bubbles:true}));
  await aguardarCondicao(()=>chatDoc.querySelector('.chat-send-btn')?.disabled===false);
  textarea.dispatchEvent(new chat.dom.window.KeyboardEvent('keydown',{key:'Enter',code:'Enter',bubbles:true,cancelable:true}));
  const replySaved=await aguardarCondicao(()=>chatDoc.querySelector('[data-chat-mensagem-id="303"]'));
  assert.ok(replySaved,'Resposta enviada não apareceu');
  assert.ok(replySaved.querySelector('.chat-quoted-msg'),'Vínculo da resposta não foi renderizado');
  assert.equal(chatDoc.activeElement,textarea,'Enter retirou o foco do campo');
  chat.dom.window.dispatchEvent(new chat.dom.window.Event('focus'));
  await aguardarCondicao(()=>chat.dom.window.__testReadAcks.length>0);
  assert.ok(chat.dom.window.__testReadAcks.every((p)=>p.includes('ate_mensagem_id=')),
    'Confirmação de leitura deve se limitar às mensagens exibidas');
  assert.ok(!chat.errors.length,chat.errors.join('; '));
  console.log('CHAT_UX_OK:',separators,'date separators; reply + preview + focus');
  chat.dom.window.close();
  const native=await open(true,true);
  assert.equal(native.dom.window.envoxersDesktop?.active,true);
  assert.ok(native.dom.window.document.querySelector('.app'));
  for(let i=0;i<25&&!native.nativeCalls.some(call=>call.command==='native_badge');i++) await new Promise(resolve=>setTimeout(resolve,50));
  assert.ok(native.nativeCalls.some(call=>call.command==='native_badge'));
  const socket=native.dom.window.__testSockets[0];
  assert.ok(socket && socket.onmessage);
  socket.onopen();
  assert.equal(native.dom.window.envoxersDesktop.socketStatus,'conectado');
  socket.onmessage({data:JSON.stringify({tipo:'mensagem_nova',canal_id:77,mensagem:{id:991,autor_envoxer_id:444,autor_nome:'Teste',texto:'Olá do Chat'}})});
  await new Promise(resolve=>setTimeout(resolve,30));
  assert.ok(native.nativeCalls.some(call=>call.command==='native_alert'));
  assert.ok(native.dom.window.envoxersDesktop.lastMessageAt);
  assert.ok(native.dom.window.envoxersDesktop.lastAlertAt);
  assert.ok(native.dom.window.document.querySelector('#evdx-toggle'), 'diagnóstico nativo não montou');
  native.dom.window.document.querySelector('#evdx-toggle').click();
  await new Promise(resolve=>setTimeout(resolve,40));
  assert.match(native.dom.window.document.querySelector('#evdx-status').textContent,/Ponte Tauri: conectada/);
  native.dom.window.document.querySelector('#evdx-alert').click();
  native.dom.window.document.querySelector('#evdx-startup').click();
  await new Promise(resolve=>setTimeout(resolve,40));
  assert.ok(native.nativeCalls.some(call=>call.command==='native_set_autostart'));
  const fileLink=native.dom.window.document.createElement('a');
  fileLink.href='/api/v1/uploads/arquivo-123.pdf';
  fileLink.title='proposta.pdf';
  fileLink.textContent='proposta.pdf';
  native.dom.window.document.body.appendChild(fileLink);
  fileLink.click();
  await new Promise(resolve=>setTimeout(resolve,15));
  const activeBar=native.dom.window.document.querySelector('#envox-download-panel .ev-progress');
  assert.ok(activeBar,'Gerenciador de download não foi aberto');
  assert.match(native.dom.window.document.querySelector('#envox-download-panel .ev-caption').textContent,/50%/);
  assert.equal(Number(activeBar.value),50);
  await new Promise(resolve=>setTimeout(resolve,90));
  const download=native.nativeCalls.find(call=>call.command==='native_download');
  assert.equal(download?.args?.filename,'proposta.pdf');
  assert.ok(download.args.url.endsWith('/api/v1/uploads/arquivo-123.pdf'));
  assert.ok(download.args.transferId.startsWith('dl-'));
  assert.match(native.dom.window.document.querySelector('#envox-download-panel .ev-caption').textContent,/Salvo em Downloads/);
  const perFileFolder=native.dom.window.document.querySelector('#envox-download-panel .ev-reveal');
  assert.ok(perFileFolder,'Link Ver na pasta ausente no card de download');
  assert.equal(perFileFolder.hidden,false,'Link só pode aparecer ao finalizar');
  perFileFolder.click();
  const closeDownload=native.dom.window.document.querySelector('#envox-download-panel .ev-close');
  assert.ok(closeDownload,'Botão X não existe');
  closeDownload.click();
  assert.equal(native.dom.window.document.querySelector('#envox-download-panel').hidden,true,'X não fechou o card');
  native.dom.window.document.querySelector('#envox-download-panel .ev-folder').click();
  await new Promise(resolve=>setTimeout(resolve,10));
  assert.ok(native.nativeCalls.some(call=>call.command==='native_open_downloads'));
  // Prévia de imagem recebe o URL oficial e card com tipo visual.
  const imageLink=native.dom.window.document.createElement('a');
  imageLink.href='/api/v1/uploads/imagem.jpg';
  imageLink.title='imagem.jpg';
  native.dom.window.document.body.appendChild(imageLink);
  imageLink.click();
  assert.equal(native.dom.window.document.querySelector('#envox-download-panel').hidden,false,'Novo download deve reabrir painel fechado');
  await new Promise(resolve=>setTimeout(resolve,95));
  assert.ok(native.dom.window.document.querySelector('#envox-download-panel .ev-preview'));
  const csv=new native.dom.window.Blob(['coluna,valor'],{type:'text/csv'});
  assert.equal(await native.dom.window.envoxersDesktop.saveBlob(csv,'relatorio.csv'),true);
  const saved=native.nativeCalls.find(call=>call.command==='native_save_file');
  assert.equal(saved?.args?.filename,'relatorio.csv');
  assert.ok(saved.args.dataBase64.length>0);
  assert.equal(native.dom.window.envoxersDesktop.lastDownloadName,'relatorio.csv');
  assert.ok(native.dom.window.envoxersDesktopUpdater,'Atualizador não montou');
  native.dom.window.document.querySelector('#evdx-update').click();
  await new Promise(resolve=>setTimeout(resolve,60));
  assert.equal(native.dom.window.envoxersDesktopUpdater.state.version,'0.3.1');
  assert.ok(native.dom.window.document.querySelector('#envoxers-update-banner'),'Aviso de atualização ausente');
  native.dom.window.document.querySelector('#envoxers-update-install').click();
  await new Promise(resolve=>setTimeout(resolve,30));
  assert.equal(native.dom.window.envoxersDesktopUpdater.state.progressPercent,50);
  assert.equal(Number(native.dom.window.document.querySelector('#envoxers-update-bar').value),50);
  await new Promise(resolve=>setTimeout(resolve,80));
  assert.ok(native.nativeCalls.some(call=>call.command==='native_install_update'));
  assert.ok(!native.errors.length,native.errors.join('; '));
  console.log('DESKTOP_BRIDGE_OK:',native.nativeCalls.length,'native calls');
  native.dom.window.close();
} finally {
  server.close();
}
