import { count, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { DESCRIPCION_PLANTILLA_GENERICA, NOMBRE_PLANTILLA_GENERICA, PLANTILLA_GENERICA } from "@/lib/plantillas-tarifas/generica";
import catalogoInicialJson from "./catalogo-inicial.json";
import { ajustes, estadoVehiculo, marcas, modelos, plantillasPlan, plantillasTarifasVn, tipoDeVenta, apuntesPredefinidos } from "./schema";

/** Ajustes que recuerdan que ya se trajo de serie la plantilla genérica de tarifas y las plantillas base (para no volver a traerlas si se borran a mano). */
export const AJUSTE_GENERICA = "catalogo_inicial_generica";
export const AJUSTE_PLANTILLAS_BASE = "catalogo_inicial_plantillas";

const ESTADOS_INICIALES = [
  { nombre: "Nuevo", clase: "VN", subtipo: null, predeterminado: true },
  { nombre: "Demo", clase: "VO", subtipo: "DEMO", predeterminado: false },
  { nombre: "KM0", clase: "VO", subtipo: "KM0", predeterminado: false },
  { nombre: "Buyback", clase: "VO", subtipo: "BUYBACK", predeterminado: false },
  { nombre: "Usado", clase: "VO", subtipo: "USADO", predeterminado: false },
] as const;

const TIPOS_VENTA_INICIALES = [
  { nombre: "Contado", categoria: "CONTADO", color: "#ff0000", orden: 1, requiereRci: false },
  { nombre: "Crédito", categoria: "CREDITO", color: "#e69d00", orden: 2, requiereRci: true },
  { nombre: "Preference", categoria: "PREFERENCE", color: "#3b82f6", orden: 3, requiereRci: true },
] as const;

/**
 * Semilla idempotente: solo inserta cuando la tabla está vacía, para no recrear
 * elementos que el administrador haya renombrado o borrado a propósito.
 * No crea usuarios (el primer administrador se crea con `npm run crear-admin`).
 */
export async function sembrar<S extends Record<string, unknown>>(db: NodePgDatabase<S>): Promise<void> {
  await db.transaction(async (tx) => {
    // Plantilla genérica de tarifas VN (Renault y Dacia): viene de serie una sola vez por instalación. Después se puede editar y borrar a mano sin que
    // vuelva ni se pise con cada versión (la primera vez que arranca una instalación anterior se pone al día, como antes).
    const [generica] = await tx.select().from(ajustes).where(eq(ajustes.clave, AJUSTE_GENERICA));
    if (!generica) {
      await tx
        .insert(plantillasTarifasVn)
        .values({ nombre: NOMBRE_PLANTILLA_GENERICA, descripcion: DESCRIPCION_PLANTILLA_GENERICA, sistema: true, datos: PLANTILLA_GENERICA })
        .onConflictDoUpdate({ target: plantillasTarifasVn.nombre, set: { descripcion: DESCRIPCION_PLANTILLA_GENERICA, datos: PLANTILLA_GENERICA, actualizadaEn: new Date() }, setWhere: eq(plantillasTarifasVn.sistema, true) });
      await tx.insert(ajustes).values({ clave: AJUSTE_GENERICA, valor: "true" });
    }

    // Apuntes predefinidos que usa la propia aplicación (no se pueden borrar, solo editar): se vuelven a poner si faltan
    await tx
      .insert(apuntesPredefinidos)
      .values([
        {
          clave: "seguro",
          titulo: "Seguro",
          descripcion: "Estado del seguro del coche.",
          etiqueta: "SEGURO",
          color: "#2563eb",
          mostrarEtiqueta: true,
          rapido: true,
          porDefecto: true,
          semaforo: true,
          semaforoEstados: [
            { color: "#ef4444", texto: "Seguro aún no solicitado" },
            { color: "#eab308", texto: "Solicitado, póliza aún no emitida" },
            { color: "#22c55e", texto: "Póliza emitida" },
          ],
          orden: 1,
        },
        { clave: "vo-retoma", titulo: "VO de retoma", descripcion: "El cliente deja un vehículo usado de retoma.", etiqueta: "VO", color: "#f59e0b", mostrarEtiqueta: true, rapido: true, orden: 2 },
      ])
      .onConflictDoNothing();

    const [{ n: nEstados }] = await tx.select({ n: count() }).from(estadoVehiculo);
    if (nEstados === 0) {
      await tx.insert(estadoVehiculo).values(
        ESTADOS_INICIALES.map((e) => ({
          nombreEstadoVehiculo: e.nombre,
          clase: e.clase,
          subtipoVo: e.subtipo,
          predeterminado: e.predeterminado,
        })),
      );
    }

    const [{ n: nTipos }] = await tx.select({ n: count() }).from(tipoDeVenta);
    if (nTipos === 0) {
      await tx.insert(tipoDeVenta).values(
        TIPOS_VENTA_INICIALES.map((t) => ({
          nombreTipoVenta: t.nombre,
          categoria: t.categoria,
          color: t.color,
          orden: t.orden,
          requiereRciAlMatricular: t.requiereRci,
          cuentaParaTasa: t.requiereRci,
        })),
      );
    }

    const existente = await tx.select().from(ajustes).where(eq(ajustes.clave, "mostrar_botones_csv"));
    if (existente.length === 0) {
      await tx.insert(ajustes).values({ clave: "mostrar_botones_csv", valor: "true" });
    }
  });
}

/** Una marca del catálogo de partida, con sus colores y sus modelos. */
export interface MarcaInicial {
  nombre: string;
  activo: boolean;
  accesoRapido: boolean;
  sistemaComisiones: boolean;
  color: string | null;
  punto: string | null;
  puntoColor: string | null;
  modelos: { nombre: string; accesoRapido: boolean; orden: number }[];
}

/**
 * Lo que trae de serie una instalación nueva («grabado a fuego»): las marcas y los modelos con sus colores y las plantillas base de tarifas y de planes. Se
 * guarda en `catalogo-inicial.json` y se regenera desde una base de datos ya preparada con `npm run exportar-catalogo`.
 */
export interface CatalogoInicial {
  version: number;
  marcas: MarcaInicial[];
  plantillasTarifas: { nombre: string; descripcion: string | null; datos: unknown }[];
  plantillasPlan: { ambito: string; nombre: string; descripcion: string | null; datos: unknown }[];
}

export const CATALOGO_INICIAL = catalogoInicialJson as unknown as CatalogoInicial;

/**
 * Catálogo de partida: las marcas y los modelos (con sus colores) solo se cargan si no hay ninguna marca, y las plantillas base de tarifas y de planes una sola
 * vez por instalación (después se pueden editar y borrar a mano sin que vuelvan). Se llama al arrancar la aplicación y tras «Borrar todos los datos», no desde
 * `sembrar` (así las pruebas siguen partiendo de un catálogo vacío).
 */
export async function sembrarCatalogoInicial<S extends Record<string, unknown>>(db: NodePgDatabase<S>, catalogo: CatalogoInicial = CATALOGO_INICIAL): Promise<void> {
  await db.transaction(async (tx) => {
    const [{ n }] = await tx.select({ n: count() }).from(marcas);
    if (n === 0) {
      for (const m of catalogo.marcas) {
        const [marca] = await tx
          .insert(marcas)
          .values({ nombre: m.nombre, activo: m.activo, accesoRapido: m.accesoRapido, sistemaComisiones: m.sistemaComisiones, color: m.color, punto: m.punto, puntoColor: m.puntoColor })
          .returning({ id: marcas.idMarca });
        if (m.modelos.length > 0) await tx.insert(modelos).values(m.modelos.map((x) => ({ marcaId: marca.id, nombreModelo: x.nombre, accesoRapido: x.accesoRapido, ordenAccesoRapido: x.orden })));
      }
    }
    const [hecho] = await tx.select().from(ajustes).where(eq(ajustes.clave, AJUSTE_PLANTILLAS_BASE));
    if (!hecho) {
      for (const t of catalogo.plantillasTarifas) await tx.insert(plantillasTarifasVn).values({ nombre: t.nombre, descripcion: t.descripcion, sistema: true, datos: t.datos as never }).onConflictDoNothing();
      for (const t of catalogo.plantillasPlan) await tx.insert(plantillasPlan).values({ ambito: t.ambito, nombre: t.nombre, descripcion: t.descripcion, sistema: true, datos: t.datos as never }).onConflictDoNothing();
      await tx.insert(ajustes).values({ clave: AJUSTE_PLANTILLAS_BASE, valor: "true" });
    }
  });
}
