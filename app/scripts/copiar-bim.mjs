// Copia o worker do Fragments e o WASM do web-ifc para public/bim (usados pelo visualizador IFC).
import { copyFileSync, mkdirSync, existsSync } from "node:fs";
const destino = "public/bim";
mkdirSync(destino, { recursive: true });
const arquivos = [
  ["node_modules/@thatopen/fragments/dist/Worker/worker.mjs", "worker.mjs"],
  ["node_modules/web-ifc/web-ifc.wasm", "web-ifc.wasm"],
  ["node_modules/web-ifc/web-ifc-mt.wasm", "web-ifc-mt.wasm"],
];
for (const [de, para] of arquivos) {
  if (existsSync(de)) copyFileSync(de, `${destino}/${para}`);
  else console.warn(`[bim] não encontrado: ${de}`);
}
