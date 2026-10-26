/* Validação de estados do Portal: texto, semântica, cores e contraste. */
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {JSDOM} from "jsdom";
import {transform} from "esbuild";

const base=new URL("../public/",import.meta.url);
const text=(p)=>readFile(new URL(p,base),"utf8");
const [react,reactDom,source,css]=await Promise.all([
  text("vendor/react-18.3.1.min.js"),text("vendor/react-dom-18.3.1.min.js"),
  text("portal/tc-portal-operacao.jsx"),text("portal/portal-cliente-dev-theme.css"),
]);
const {code}=await transform(source,{loader:"jsx",jsx:"transform",jsxFactory:"React.createElement",jsxFragment:"React.Fragment",target:"es2020"});
const statuses=[
  ["Recebida","recebida"],["Em triagem","triagem"],["Em andamento","andamento"],
  ["Não aceita","recusada"],["Em acompanhamento","neutro"],
  ["Planejamento","planejamento"],["Em produção","producao"],
  ["Em revisão","revisao"],["Aguardando aprovação","aprovacao"],
  ["Em ajustes","ajustes"],["Programada","programada"],["Concluída","concluida"],
  ["Estado desconhecido","neutro"]
];
const dom=new JSDOM('<!doctype html><div id="root"></div>',{
  url:"https://staging.example.invalid/portal/",runScripts:"dangerously",pretendToBeVisual:true
});
const w=dom.window;
w.eval(react);w.eval(reactDom);
w.eval(code+"\nwindow.__portalOperacaoStatus=PortalOperacao.Status;");
const root=w.ReactDOM.createRoot(w.document.getElementById("root"));
root.render(w.React.createElement("div",{},statuses.map(([status])=>w.React.createElement(
  w.__portalOperacaoStatus,{key:status},status
))));
for(let i=0;i<50&&!w.document.querySelectorAll(".po-status").length;i++){
  await new Promise(r=>setTimeout(r,20));
}
const badges=[...w.document.querySelectorAll(".po-status")];
assert.equal(badges.length,statuses.length,"All statuses rendered");
const lin=(val)=>{const c=parseInt(val,16)/255;return c<=.04045?c/12.92:Math.pow((c+.055)/1.055,2.4)};
const lum=(color)=>[1,3,5].reduce((total,i,k)=>total+lin(color.slice(i,i+2))*[.2126,.7152,.0722][k],0);
const contrast=(x,y)=>{const a=lum(x),b=lum(y);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05)};
for(let i=0;i<statuses.length;i++){
  const [label,tone]=statuses[i],node=badges[i];
  assert.equal(node.textContent.trim(),label);
  assert.equal(node.dataset.status,tone);
  assert.ok(node.classList.contains("po-status--"+tone));
  const match=css.match(new RegExp("\\.po-status--"+tone+"\\{([^}]+)\\}"));
  assert.ok(match,"Missing palette for "+tone);
  const bg=match[1].match(/--status-bg:(#[0-9A-Fa-f]{6})/i)?.[1];
  const fg=match[1].match(/--status-fg:(#[0-9A-Fa-f]{6})/i)?.[1];
  assert.ok(bg&&fg,"Missing background/text pair for "+tone);
  assert.ok(contrast(bg,fg)>=4.5,"WCAG AA contrast fail for "+tone+": "+contrast(bg,fg).toFixed(2));
  console.log("PORTAL_STATUS_OK",label,tone,contrast(bg,fg).toFixed(2));
}
assert.ok(css.includes(".po-status::before"),"Status must have a visual cue in addition to color");
root.unmount();w.close();
console.log("PORTAL_STATUS_CONTRAST_AND_TEXT_OK");
