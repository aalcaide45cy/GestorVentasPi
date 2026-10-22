import "dotenv/config";
import { db, pool } from "../src/db";
import { cambiarCifrado, cargarInterruptorCifrado, estadoCifrado } from "../src/lib/servicios/cifrado-datos";
import { crearCopia } from "../src/lib/servicios/copias";

/**
 * Deja todos los datos guardados SIN cifrar (con copia previa) y genera una copia de seguridad nueva en claro. Uso:
 *   npx tsx scripts/cifrado-claro.ts            (convierte lo cifrado y guarda una copia nueva)
 *   npx tsx scripts/cifrado-claro.ts --solo-copia
 */
async function main(): Promise<void> {
  await cargarInterruptorCifrado(db);
  console.log("Antes:", JSON.stringify(await estadoCifrado(db)));
  if (!process.argv.includes("--solo-copia")) {
    const r = await cambiarCifrado(db, false, null, { avance: (h, t, texto) => texto && console.log(`  ${h}/${t} ${texto}`), cancelada: () => false });
    console.log("Conversión:", JSON.stringify(r));
  }
  const despues = await estadoCifrado(db);
  console.log("Después:", JSON.stringify(despues));
  const c = await crearCopia(db, "manual", null, "Copia en claro (sin datos cifrados) para llevar a otro equipo");
  console.log("Copia nueva:", c.nombre, c.tamano);
  await pool.end();
}
main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
