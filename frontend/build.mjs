/* Build estático de login + aplicação sem Babel em runtime.
   Compilar com npm run build após alterações em tc-*.jsx. */
import {transform} from "esbuild";
import {readFile,writeFile,mkdir} from "node:fs/promises";
import {createHash} from "node:crypto";
import {resolve} from "node:path";
const publicDir=resolve(import.meta.dirname,"public");
const files=JSON.parse(await readFile(resolve(publicDir,"module-order.json"),"utf8"));
const dest=resolve(publicDir,"assets-runtime");
await mkdir(dest,{recursive:true});
async function render(sourceFiles,outName) {
 const pieces=[];
 for(const f of sourceFiles) {
   const jsx=await readFile(resolve(publicDir,f),"utf8");
   const {code}=await transform(jsx,{
     loader:"jsx",target:"es2020",jsx:"transform",
     jsxFactory:"React.createElement",jsxFragment:"React.Fragment",
     minifySyntax:true,minifyWhitespace:true,minifyIdentifiers:false,legalComments:"none"
   });
   pieces.push("/* "+f+" */\n"+code+"\n;\n");
 }
 const output=pieces.join("");
 await writeFile(resolve(dest,outName),output);
 const hash=createHash("sha256").update(output).digest("hex").slice(0,12);
 return {file:"/assets-runtime/"+outName+"?v="+hash,bytes:Buffer.byteLength(output),hash};
}
const login=await render(["tc-api.jsx","tc-auth.jsx"],"login.js");
const app=await render(files,"app.js");
await writeFile(resolve(dest,"manifest.json"),JSON.stringify({login,app},null,2)+"\n");
const htmlFile=resolve(publicDir,"index.html");
const html=await readFile(htmlFile,"utf8");
const updated=html.replace(
  /src="\/assets-runtime\/login\.js\?v=[a-f0-9]+"/,
  'src="'+login.file+'"'
);
if(updated===html && !html.includes('src="'+login.file+'"')) {
  throw new Error("index.html não aponta para o login compilado");
}
if(updated!==html) await writeFile(htmlFile,updated);
console.log("Build login",login,"Build app",app);
