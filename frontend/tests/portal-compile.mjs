import { readFileSync } from "node:fs";
import { transformSync } from "esbuild";
const files = ["public/portal/tc-portal-api.jsx", "public/portal/tc-portal-app.jsx", "public/portal/tc-portal-operacao.jsx"];
for (const file of files) {
  const source = readFileSync(new URL("../" + file, import.meta.url), "utf8");
  const result = transformSync(source, { loader: "jsx", target: "es2020", format: "iife" });
  if (!result.code || result.warnings.length) throw new Error(file + ": erros de compilação");
  console.log("Portal JSX OK:", file);
}
