/**
 * Muestra las incidencias pendientes de la base de datos (las mismas que Configuración › Incidencias) en forma de informe de texto.
 * Uso:  npx tsx --env-file=.env scripts/incidencias.ts [--todas] [--limite=30]
 * Solo lee: no cambia nada.
 */
import { db } from "@/db";
import { informeDe } from "@/lib/incidencias";
import { listarIncidencias, resumenIncidencias } from "@/lib/servicios/incidencias";

async function main() {
  const todas = process.argv.includes("--todas");
  const limite = Number(process.argv.find((a) => a.startsWith("--limite="))?.split("=")[1] ?? 30);
  const lista = await listarIncidencias(db, { estados: todas ? undefined : ["nueva", "revisada"], limite });
  const r = await resumenIncidencias(db);
  console.log(`Incidencias: ${r.nuevasErrores} errores nuevos, ${r.nuevasAvisos} avisos nuevos, ${r.ultimas24h} en las últimas 24 h, ${r.total} en total.\n`);
  console.log(lista.length > 0 ? informeDe(lista) : "No hay incidencias pendientes.");
  process.exit(0);
}
void main();
