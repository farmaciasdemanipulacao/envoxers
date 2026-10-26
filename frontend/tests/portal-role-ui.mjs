/* SECOVI: testar dois perfis e múltiplos vínculos, aprovação opcional.
 * Não acessa banco, URLs externas ou serviços de produção. */
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {JSDOM} from "jsdom";
import {transform} from "esbuild";

const rootDir=new URL("../public/",import.meta.url);
const getText=(f)=>readFile(new URL(f,rootDir),"utf8");
const [react,reactDom,source]=await Promise.all([
 getText("vendor/react-18.3.1.min.js"),getText("vendor/react-dom-18.3.1.min.js"),
 getText("portal/tc-portal-operacao.jsx"),
]);
const {code}=await transform(source,{loader:"jsx",jsx:"transform",jsxFactory:"React.createElement",jsxFragment:"React.Fragment",target:"es2020"});
const unidades=[
 {id:1,tipo:"regional",nome:"Maringá"}, {id:2,tipo:"regional",nome:"Londrina"},
 {id:3,tipo:"frente",nome:"Secovimed"},
];
const requests=[
 {id:1,protocolo:"TESTE-1",titulo:"Pedido Maringá",tipo:"evento",status:"Recebida",unidade_id:1,frente_id:null,solicitante:"Marli",criado_em:"2026-10-20T10:00:00Z",tarefas:[]},
 {id:2,protocolo:"TESTE-2",titulo:"Pedido Londrina",tipo:"evento",status:"Em andamento",unidade_id:2,frente_id:null,solicitante:"Maria",criado_em:"2026-10-20T11:00:00Z",tarefas:[]},
 {id:3,protocolo:"TESTE-3",titulo:"Material Secovimed",tipo:"material_extra",status:"Em andamento",unidade_id:null,frente_id:3,solicitante:"João",criado_em:"2026-10-20T12:00:00Z",tarefas:[{id:3,titulo:"Material para validação",status:"Aguardando aprovação"}]},
];
const cenarios=[
 {key:"admin",papel:"admin_institucional",podeAprovar:true,ids:[1,2,3],esperados:[1,2,3],menus:["Pessoas e acessos","Em validação","Nova solicitação"]},
 {key:"marli",papel:"solicitante",podeAprovar:true,ids:[1],esperados:[1],menus:["Em validação","Nova solicitação"]},
 {key:"tatiana",papel:"solicitante",podeAprovar:false,ids:[1],esperados:[1],menus:["Nova solicitação"]},
 {key:"maria",papel:"solicitante",podeAprovar:false,ids:[2],esperados:[2],menus:["Nova solicitação"]},
 {key:"joao",papel:"solicitante",podeAprovar:true,ids:[3],esperados:[3],menus:["Em validação","Nova solicitação"]},
 {key:"multi",papel:"solicitante",podeAprovar:true,ids:[1,3],esperados:[1,3],menus:["Em validação","Nova solicitação"]},
];
async function waitFor(w,pred,max=120) {
 for(let i=0;i<max;i++){if(pred())return;await new Promise(r=>setTimeout(r,25));}
 throw Error("Timeout in profile navigation");
}
for(const c of cenarios) {
 const dom=new JSDOM('<!doctype html><div id="root"></div>',{url:"https://stage.example.invalid/portal/",runScripts:"dangerously",pretendToBeVisual:true});
 const w=dom.window,errors=[],urls=[];
 w.addEventListener("error",e=>errors.push(e.message));
 w.eval(react);w.eval(reactDom);
 w.EnvoxersShared={useToast:()=>()=>{},ToastProvider:({children})=>children};
 w.localStorage.setItem("portal_nome",c.key);
 w.localStorage.setItem("portal_cliente_nome","SECOVI fictício");
 const visible=requests.filter(r=>c.papel==="admin_institucional" || c.ids.includes(r.unidade_id) || c.ids.includes(r.frente_id));
 w.PortalAPI={clearSession(){},getToken:()=>"dummy",async api(path){
   urls.push(path);
   if(path.endsWith("/configuracao"))return {
     papel:c.papel,capacidades:c.papel==="admin_institucional"?
       ["ver_todas","solicitar","comentar","aprovar","gerenciar_usuarios"]:
       ["ver_unidades","solicitar","comentar",...(c.podeAprovar?["aprovar"]:[])],
     unidades:c.papel==="admin_institucional"?unidades:unidades.filter(u=>c.ids.includes(u.id)),
     produto:{modulos:{documentos:true}},formulario:{campos:[]},
   };
   if(path.endsWith("/dashboard"))return {total:visible.length,recebidas:visible.filter(r=>r.status==="Recebida").length,triagem:0,em_andamento:visible.filter(r=>r.status==="Em andamento").length};
   if(path.endsWith("/solicitacoes"))return visible;
   if(path.endsWith("/campanhas"))return [{id:10,nome:"Campanha exemplo",unidade_id:1,frente_id:null,total_solicitacoes:1}].filter(r=>c.papel==="admin_institucional"||c.ids.includes(r.unidade_id));
   if(path.endsWith("/eventos"))return [{id:20,nome:"Evento exemplo",unidade_id:null,frente_id:3,data:"2026-11-20",total_solicitacoes:1}].filter(r=>c.papel==="admin_institucional"||c.ids.includes(r.frente_id));
   if(path.endsWith("/pessoas")) {
     if(c.papel!=="admin_institucional")throw Error("Unauthorized roster");
     return {pessoas:[{nome:"Admin SECOVI",papel:"admin_institucional",areas:[],pode_aprovar:true}],regionais:["Maringá","Londrina"],frentes:["Secovimed"]};
   }
   if(path.endsWith("/pendencias")) {
     if(!c.podeAprovar)throw Error("Unauthorized approval queue");
     return visible.filter(r=>r.tarefas.some(t=>t.status==="Aguardando aprovação"));
   }
   throw Error("Unexpected resource: "+path);
 }};
 w.eval(code+"\nwindow.__Portal=PortalOperacao;");
 const root=w.ReactDOM.createRoot(w.document.getElementById("root"));
 root.render(w.React.createElement(w.__Portal.Shell));
 await waitFor(w,()=>w.document.querySelector(".po-top h1")?.textContent);
 assert.equal(w.document.querySelectorAll(".po-org").length,0,"Organization must not repeat in sidebar");
 assert.equal(w.document.querySelectorAll(".po-role-banner").length,0,"Old full-width role banner must be removed");
 assert.ok(w.document.querySelector(".po-sidebar-footer .po-user-role")?.textContent,"Role preserved in compact footer");
 assert.equal(w.document.querySelectorAll(".po-context").length,1,"Organization should appear exactly once");
 await waitFor(w,()=>w.document.querySelectorAll(".po-solicitacao").length===Math.min(visible.length,6));
 const menu=[...w.document.querySelectorAll(".po-nav")].map(n=>n.textContent);
 for(const m of c.menus)assert.ok(menu.includes(m),c.key+" missing "+m);
 if(c.papel!=="admin_institucional")assert.ok(!menu.includes("Pessoas e acessos"),"SECOVI scoped user saw people");
 if(!c.podeAprovar)assert.ok(!menu.includes("Em validação"),"User without approval saw queue");
 assert.ok(!menu.includes("Visão regional")&&!menu.includes("Gestor regional"),"Complex old menu returned");
 assert.ok(menu.includes("Demandas"));
 assert.ok(menu.includes("Campanhas")&&menu.includes("Eventos"),"Menu must show catalogs");
 const campaignTab=[...w.document.querySelectorAll(".po-nav")].find(b=>b.textContent.includes("Campanhas"));
 campaignTab.click();
 await waitFor(w,()=>w.document.querySelector(".po-catalog-card"));
 assert.ok(w.document.body.textContent.includes("Sem campanha"),"Missing unlinked campaign group");
 const eventTab=[...w.document.querySelectorAll(".po-nav")].find(b=>b.textContent.includes("Eventos"));
 eventTab.click();
 await waitFor(w,()=>w.document.body.textContent.includes("Sem evento"));
 assert.ok(w.document.querySelector(".po-catalog-card"),"Missing event cards");
 assert.ok(!w.document.body.textContent.includes("Eventos da sua organização"),"Catalog title repeated");
 assert.ok(w.document.querySelector(".po-catalog-count"),"Compact catalog toolbar missing");
 const newTab=[...w.document.querySelectorAll(".po-nav")].find(b=>b.textContent.includes("Nova solicitação"));
 newTab.click();
 await waitFor(w,()=>w.document.body.textContent.includes("ORGANIZAÇÃO DA DEMANDA"));
 const selects=[...w.document.querySelectorAll(".po-relationships select")];
 assert.equal(selects.length,2,"Campaign and event selects required");
 for(const select of selects) {
   assert.equal(select.value,"","Do not silently choose no campaign/event");
   assert.ok([...select.options].some(o=>o.value==="none"),"Missing explicit Sem campanha / Sem evento");
 }
 const quick=[...w.document.querySelectorAll(".po-inline-quick button")].find(b=>b.textContent.includes("Nova campanha"));
 quick.click();
 await waitFor(w,()=>w.document.getElementById("campanha-rapida"));
 assert.ok(w.document.body.textContent.includes("Somente o nome."),"Quick campaign creation should be obvious");

 const body=w.document.body.textContent;
 for(const r of requests.filter(r=>!c.esperados.includes(r.id)))assert.ok(!body.includes(r.titulo),c.key+" saw "+r.titulo);
 if(c.papel==="admin_institucional") {
   [...w.document.querySelectorAll(".po-nav")].find(b=>b.textContent==="Pessoas e acessos").click();
   await waitFor(w,()=>w.document.body.textContent.includes("Admin SECOVI"));
   assert.ok(urls.includes("/portal/operacao/pessoas"));
 }
 if(c.podeAprovar) {
   [...w.document.querySelectorAll(".po-nav")].find(b=>b.textContent==="Em validação").click();
   await waitFor(w,()=>w.document.body.textContent.includes("Materiais em validação"));
   assert.ok(urls.includes("/portal/operacao/pendencias"));
 }
 assert.deepEqual(errors,[],c.key+" unexpected errors");
 root.unmount();w.close();
 console.log("PORTAL_ROLE_UI_OK",c.key,visible.length,menu.join("|"));
}
