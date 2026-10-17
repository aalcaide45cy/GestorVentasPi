import { readFileSync } from "node:fs";
import { textoDeDocumento } from "@/lib/servicios/ocr";
async function main() {
  const { texto } = await textoDeDocumento(readFileSync(process.argv[2]));
  console.log(texto.slice(0, Number(process.argv[3] ?? 1800)));
  process.exit(0);
}
void main();
