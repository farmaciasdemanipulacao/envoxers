/* Testa os menus e contextos de quatro perfis com dados fictícios.
 * Não conversa com bancos, serviços reais ou APIs externas. */
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {JSDOM} from "jsdom";
import {transform} from "esbuild";

const raiz=new URL("../public/",import.meta.url);
const texto=(f)=>readFile(new URL(f,raiz),"utf8");
const [react,reactDom,source]=await Promise.all([
  texto("vendor/react-18.3.1.min.js"),
  texto("vendor/react-dom-18.3.1.min.js"),
  texto("portal/tc-portal-operacao.jsx"),
]);
const {code}=await transform(source,{loader:"jsx",jsx:"transform",jsxFactory:"React.createElement",jsxFragment:"React.Fragment",target:"es2020"});
const defs=[
 {key:"admin",papel:"admin_institucional",caps:["ver_todas","solicitar","comentar","gerenciar_usuarios"],total:3,must:["Pessoas e acessos","Todas as solicitações","Nova solicitação"],missing:["Em validação"]},
 {key:"gestor",papel:"gestor_regional",caps:["ver_unidades","solicitar","comentar"],total:2,must:["Visão regional","Pedidos das regionais","Nova solicitação"],missing:["Pessoas e acessos","Em validação"]},
 {key:"solicitante",papel:"solicitante",caps:["ver_proprias","solicitar","comentar"],total:1,must:["Meus pedidos","Nova solicitação"],missing:["Visão regional","Pessoas e acessos","Em validação"]},
 {key:"aprovador",papel:"aprovador",caps:["ver_unidades","comentar","aprovar"],total:2,must:["Visão regional","Em validação"],missing:["Pessoas e acessos","Nova solicitação"]},
];
async function waitFor(window,pred,max=80) {
 for(let i=0;i<max;i++){if(pred())return;await new Promise(r=>setTimeout(r,30));}
 throw Error("Timeout waiting for role UI");
}
const requests=[
 {id:1,protocolo:"TESTE-1",titulo:"Pedido Alfa",tipo:"evento",status:"Recebida",unidade_id:1,solicitante:"Solicitante",criado_em:"2026-10-20T10:00:00Z",tarefas:[]},
 {id:2,protocolo:"TESTE-2",titulo:"Aguardando material Alfa",tipo:"evento",status:"Em andamento",unidade_id:1,solicitante:"Coordenação",criado_em:"2026-10-20T11:00:00Z",tarefas:[{id:2,titulo:"Material Alfa",status:"Aguardando aprovação"}]},
 {id:3,protocolo:"TESTE-3",titulo:"Pedido Beta restrito",tipo:"evento",status:"Em andamento",unidade_id:2,solicitante:"Coordenação",criado_em:"2026-10-20T12:00:00Z",tarefas:[]},
];
for(const x of defs) {
 const dom=new JSDOM('<!doctype html><div id="root"></div>',{url:"https://stage.example.invalid/portal/",runScripts:"dangerously",pretendToBeVisual:true});
 const {window}=dom,errors=[];
 window.addEventListener("error",e=>errors.push(e.message));
 window.eval(react);window.eval(reactDom);
 window.EnvoxersShared={useToast:()=>()=>{},ToastProvider:({children})=>children};
 window.localStorage.setItem("portal_nome","Pessoa Fictícia");
 window.localStorage.setItem("portal_cliente_nome","SECOVI fictício");
 const visible=requests.filter(r=>x.key==="admin"||(r.unidade_id===1 && (x.key!=="solicitante"||r.id===1)));
 const urls=[];
 window.PortalAPI={
   clearSession(){},getToken:()=>"dummy",
   async api(path) {
     urls.push(path);
     if(path.endsWith("/configuracao"))return {papel:x.papel,capacidades:x.caps,unidades:[{id:1,tipo:"regional",nome:"Alfa"},...(x.key==="admin"?[{id:2,tipo:"regional",nome:"Beta"}]:[])],produto:{modulos:{documentos:true}},formulario:{campos:[]}};
     if(path.endsWith("/dashboard"))return {total:visible.length,recebidas:visible.filter(y=>y.status==="Recebida").length,triagem:0,em_andamento:visible.filter(y=>y.status==="Em andamento").length};
     if(path.endsWith("/solicitacoes"))return visible;
     if(path.endsWith("/pessoas")) {
       if(x.key!=="admin")throw Error("Unauthorized people query");
       return {pessoas:[{nome:"Pessoa Administradora",papel:"admin_institucional",regionais:["Alfa","Beta"]}],regionais:["Alfa","Beta"]};
     }
     if(path.endsWith("/pendencias")) {
       if(x.key!=="aprovador")throw Error("Unauthorized approvals query");
       return visible.filter(y=>y.tarefas.some(t=>t.status==="Aguardando aprovação"));
     }
     throw Error("Unexpected API request: "+path);
   }
 };
 window.eval(code+"\nwindow.__PortalOperacao=PortalOperacao;");
 const root=window.ReactDOM.createRoot(window.document.getElementById("root"));
 root.render(window.React.createElement(window.__PortalOperacao.Shell));
 await waitFor(window,()=>window.document.querySelector(".po-role-banner strong")?.textContent);
 await waitFor(window,()=>window.document.querySelectorAll(".po-solicitacao").length===Math.min(visible.length,6));
 const menu=[...window.document.querySelectorAll(".po-nav")].map(n=>n.textContent);
 for(const label of x.must)assert.ok(menu.includes(label),x.key+" missing menu "+label+": "+menu);
 for(const label of x.missing)assert.ok(!menu.includes(label),x.key+" must not show menu "+label);
 assert.ok(window.document.querySelector(".po-role-banner").textContent.includes(x.key==="admin"?"Toda a organização":x.key==="solicitante"?"Somente pedidos próprios":"Regionais autorizadas")||x.key==="gestor");
 const all=window.document.body.textContent;
 if(x.key!=="admin")assert.ok(!all.includes("Pedido Beta restrito"),x.key+" saw Beta");
 if(x.key==="solicitante")assert.ok(!all.includes("Aguardando material Alfa"),"solicitante saw colleague's request");
 if(x.key==="admin"||x.key==="aprovador") {
   const label=x.key==="admin"?"Pessoas e acessos":"Em validação";
   [...window.document.querySelectorAll(".po-nav")].find(b=>b.textContent===label).click();
   await waitFor(window,()=>window.document.body.textContent.includes(x.key==="admin"?"Pessoa Administradora":"Materiais em validação"));
   assert.ok(urls.includes(x.key==="admin"?"/portal/operacao/pessoas":"/portal/operacao/pendencias"));
 }
 assert.deepEqual(errors,[],x.key+" JS errors");
 root.unmount();window.close();
 console.log("PORTAL_ROLE_UI_OK",x.key,visible.length,menu.join("|"));
}
