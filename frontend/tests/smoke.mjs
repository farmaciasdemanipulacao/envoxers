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
async function open(authorized=false,desktop=false) {
  const resources=new TrackingResources(),errors=[],nativeCalls=[];
  const virtualConsole=new VirtualConsole();
  virtualConsole.on("jsdomError",e=>errors.push(e.message));
  virtualConsole.on("error",e=>errors.push(String(e)));
  const dom=await JSDOM.fromURL(origin+(desktop?"/?envoxers_desktop=1":"/"),{
    resources,virtualConsole,runScripts:"dangerously",pretendToBeVisual:true,
    beforeParse(win) {
      if(desktop) win.__TAURI__={core:{invoke:async (command,args)=>{
        nativeCalls.push({command,args});
        if(command==='native_status') return {version:'0.2.0',windows:true,autostart_registered:true,autostart_error:null};
        if(command==='native_set_autostart') return !!args.enabled;
      }}};
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
        return Promise.resolve({ok:true,status:200,json:async()=>data});
      };
    }
  });
  for(let i=0;i<40;i++){
    if(authorized ? dom.window.document.querySelector(".app")
                  : dom.window.document.querySelector(".access-headline")) break;
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  return {dom,resources,errors,nativeCalls};
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
  logged.dom.window.close();
  const native=await open(true,true);
  assert.equal(native.dom.window.envoxersDesktop?.active,true);
  assert.ok(native.dom.window.document.querySelector('.app'));
  assert.ok(native.nativeCalls.some(call=>call.command==='native_badge'));
  const socket=native.dom.window.__testSockets[0];
  assert.ok(socket && socket.onmessage);
  socket.onmessage({data:JSON.stringify({tipo:'mensagem_nova',canal_id:77,mensagem:{id:991,autor_envoxer_id:444,autor_nome:'Teste',texto:'Olá do Chat'}})});
  await new Promise(resolve=>setTimeout(resolve,30));
  assert.ok(native.nativeCalls.some(call=>call.command==='native_alert'));
  assert.ok(native.dom.window.document.querySelector('#evdx-toggle'), 'diagnóstico nativo não montou');
  native.dom.window.document.querySelector('#evdx-toggle').click();
  await new Promise(resolve=>setTimeout(resolve,40));
  assert.match(native.dom.window.document.querySelector('#evdx-status').textContent,/Ponte Tauri: conectada/);
  native.dom.window.document.querySelector('#evdx-alert').click();
  native.dom.window.document.querySelector('#evdx-startup').click();
  await new Promise(resolve=>setTimeout(resolve,40));
  assert.ok(native.nativeCalls.some(call=>call.command==='native_set_autostart'));
  assert.ok(!native.errors.length,native.errors.join('; '));
  console.log('DESKTOP_BRIDGE_OK:',native.nativeCalls.length,'native calls');
  native.dom.window.close();
} finally {
  server.close();
}
