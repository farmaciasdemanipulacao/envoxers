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
async function aguardarDOM(dom, selector, tentativas = 60) {
  for (let i = 0; i < tentativas; i++) {
    const alvo = dom.window.document.querySelector(selector);
    if (alvo) return alvo;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error("Timeout aguardando " + selector + " no teste visual, não um sucesso presumido");
}

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
async function open(authorized=false,desktop=false) {
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
      win.localStorage.setItem("envoxers_token","DUMMY_TEST_TOKEN");
      win.localStorage.setItem("envoxers_nome","Teste Envoxers");
      win.localStorage.setItem("envoxers_permissao","envoxer");
      win.localStorage.setItem("envoxers_id","333");
      win.localStorage.setItem("envoxers_modo_acesso","web");
      win.sessionStorage.setItem("envoxers_view_333","arquivos");
      win.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});
      win.__testSockets=[];
      win.WebSocket=class {constructor(){this.readyState=0;win.__testSockets.push(this)}close(){}send(){}};
      win.fetch=(url,options={})=>{
        const path=String(url);
        if(path.includes("/assets-runtime/manifest.json")) return fetch(new URL(path,win.location.origin));
        let data=[];
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
  const folder=await aguardarDOM(logged.dom, '.windows-folder-tile');
  assert.ok(folder,'Pasta de cliente não foi renderizada');
  folder.click();
  await new Promise(resolve=>setTimeout(resolve,25));
  const card=await aguardarDOM(logged.dom, '.windows-folder-tile');
  assert.ok(card,'Pasta de card não foi renderizada');
  card.click();
  await new Promise(resolve=>setTimeout(resolve,40));
  // A tile pode chegar antes da miniatura assíncrona, especialmente no CI.
  await aguardarDOM(logged.dom, '.windows-file-thumbnail img[alt="Miniatura de capa-de-teste.png"]');
  await aguardarDOM(logged.dom, '.windows-file-thumbnail.video');
   const tiles=logged.dom.window.document.querySelectorAll('.windows-file-tile');
  assert.equal(tiles.length,2,'Miniaturas precisam aparecer também dentro do Drive');
  assert.equal(tiles[0].querySelector('.windows-file-thumbnail img')?.alt,'Miniatura de capa-de-teste.png');
  assert.ok(tiles[1].querySelector('.windows-file-thumbnail.video'),'Card de vídeo sem prévia/fallback');
  assert.ok(tiles[1].querySelector('.windows-file-thumbnail-play'),'Ícone de vídeo ausente');
  assert.ok(!logged.errors.length,logged.errors.join('; '));
  console.log('DRIVE_THUMBNAILS_OK:',tiles.length,'file cards');
  logged.dom.window.close();
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
