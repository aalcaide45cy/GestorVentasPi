import "dotenv/config";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { and, asc, eq, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { marcas, modelos, plantillasPlan, plantillasTarifasVn } from "../src/db/schema";
import type { CatalogoInicial } from "../src/db/semilla";

/**
 * Guarda como catálogo de partida lo que hay ahora en esta base de datos: las marcas y los modelos (con sus colores, el punto y el acceso rápido) y las plantillas
 * base de tarifas y de planes (las marcadas como «base»). Escribe `src/db/catalogo-inicial.json`: tras subirlo a GitHub, cualquier instalación nueva (otro Mac, otro
 * PC, otra Raspberry) arranca con todo eso. Uso, en el equipo que tiene el catálogo bien preparado:
 *   npm run exportar-catalogo
 */
async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool);
  const ms = await db.select().from(marcas).where(isNull(marcas.eliminadoEn)).orderBy(asc(marcas.nombre));
  const catalogo: CatalogoInicial = { version: 1, marcas: [], plantillasTarifas: [], plantillasPlan: [] };
  for (const m of ms) {
    const mos = await db
      .select()
      .from(modelos)
      .where(and(eq(modelos.marcaId, m.idMarca), isNull(modelos.eliminadoEn)))
      .orderBy(asc(modelos.ordenAccesoRapido), asc(modelos.nombreModelo));
    catalogo.marcas.push({
      nombre: m.nombre,
      activo: m.activo ?? true,
      accesoRapido: m.accesoRapido ?? false,
      sistemaComisiones: m.sistemaComisiones,
      color: m.color,
      punto: m.punto,
      puntoColor: m.puntoColor,
      modelos: mos.map((x) => ({ nombre: x.nombreModelo, accesoRapido: x.accesoRapido ?? false, orden: x.ordenAccesoRapido ?? 0 })),
    });
  }
  for (const t of await db.select().from(plantillasTarifasVn).where(eq(plantillasTarifasVn.sistema, true)).orderBy(asc(plantillasTarifasVn.nombre))) catalogo.plantillasTarifas.push({ nombre: t.nombre, descripcion: t.descripcion, datos: t.datos });
  for (const t of await db.select().from(plantillasPlan).where(eq(plantillasPlan.sistema, true)).orderBy(asc(plantillasPlan.ambito), asc(plantillasPlan.nombre))) catalogo.plantillasPlan.push({ ambito: t.ambito, nombre: t.nombre, descripcion: t.descripcion, datos: t.datos });
  const destino = path.join(process.cwd(), "src", "db", "catalogo-inicial.json");
  writeFileSync(destino, `${JSON.stringify(catalogo, null, 2)}\n`, "utf8");
  console.log(`Guardado ${destino}: ${catalogo.marcas.length} marcas, ${catalogo.marcas.reduce((n, m) => n + m.modelos.length, 0)} modelos, ${catalogo.plantillasTarifas.length} plantillas de tarifas base y ${catalogo.plantillasPlan.length} plantillas de plan base.`);
  console.log("Súbelo a GitHub (git add src/db/catalogo-inicial.json) para que las instalaciones nuevas lo traigan de serie.");
  await pool.end();
}

void main();
