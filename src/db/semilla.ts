import { count, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { DESCRIPCION_PLANTILLA_GENERICA, NOMBRE_PLANTILLA_GENERICA, PLANTILLA_GENERICA } from "@/lib/plantillas-tarifas/generica";
import { ajustes, estadoVehiculo, marcas, modelos, plantillasTarifasVn, tipoDeVenta } from "./schema";

const ESTADOS_INICIALES = [
  { nombre: "Nuevo", clase: "VN", subtipo: null, predeterminado: true },
  { nombre: "Demo", clase: "VO", subtipo: "DEMO", predeterminado: false },
  { nombre: "KM0", clase: "VO", subtipo: "KM0", predeterminado: false },
  { nombre: "Buyback", clase: "VO", subtipo: "BUYBACK", predeterminado: false },
  { nombre: "Usado", clase: "VO", subtipo: "USADO", predeterminado: false },
] as const;

const TIPOS_VENTA_INICIALES = [
  { nombre: "Contado", categoria: "CONTADO", color: "#22c55e", orden: 1, requiereRci: false },
  { nombre: "Crédito", categoria: "CREDITO", color: "#3b82f6", orden: 2, requiereRci: true },
  { nombre: "Preference", categoria: "PREFERENCE", color: "#a855f7", orden: 3, requiereRci: true },
] as const;

/**
 * Semilla idempotente: solo inserta cuando la tabla está vacía, para no recrear
 * elementos que el administrador haya renombrado o borrado a propósito.
 * No crea usuarios (el primer administrador se crea con `npm run crear-admin`).
 */
export async function sembrar<S extends Record<string, unknown>>(db: NodePgDatabase<S>): Promise<void> {
  await db.transaction(async (tx) => {
    // Plantilla genérica de tarifas VN (Renault y Dacia): se repone y actualiza con cada versión; las que haya creado el usuario no se tocan
    await tx
      .insert(plantillasTarifasVn)
      .values({ nombre: NOMBRE_PLANTILLA_GENERICA, descripcion: DESCRIPCION_PLANTILLA_GENERICA, sistema: true, datos: PLANTILLA_GENERICA })
      .onConflictDoUpdate({ target: plantillasTarifasVn.nombre, set: { descripcion: DESCRIPCION_PLANTILLA_GENERICA, datos: PLANTILLA_GENERICA, actualizadaEn: new Date() }, setWhere: eq(plantillasTarifasVn.sistema, true) });

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
        })),
      );
    }

    const existente = await tx.select().from(ajustes).where(eq(ajustes.clave, "mostrar_botones_csv"));
    if (existente.length === 0) {
      await tx.insert(ajustes).values({ clave: "mostrar_botones_csv", valor: "true" });
    }
  });
}

interface MarcaInicial {
  nombre: string;
  /** Marca con sistema de comisiones y acceso rápido (Dacia y Renault); el resto va a «Resto de marcas». */
  comisiones: boolean;
  /** Modelos con su orden de acceso rápido (0 = sin acceso rápido). */
  modelos: [string, number][];
}

const MARCAS_INICIALES: MarcaInicial[] = [
  { nombre: "Dacia", comisiones: true, modelos: [["Sandero", 1], ["Sandero Stepway", 2], ["Jogger", 3], ["Duster", 4], ["Bigster", 5], ["Spring", 6]] },
  {
    nombre: "Renault",
    comisiones: true,
    modelos: [["Clio", 1], ["Clio CL6", 2], ["Captur", 3], ["Symbioz", 4], ["Arkana", 6], ["Austral", 6], ["Espace", 8], ["Rafale", 8], ["R5", 9], ["R4", 10], ["Twingo", 11], ["Scenic", 12], ["Megane E-Tech", 20]],
  },
  { nombre: "Hyundai", comisiones: false, modelos: [["i30", 0], ["Kona EV", 0], ["Tucson", 0]] },
  { nombre: "Peugeot", comisiones: false, modelos: [["208", 0], ["3008", 0], ["5008", 0]] },
  { nombre: "Toyota", comisiones: false, modelos: [["Corolla", 0], ["RAV4 Hybrid", 0], ["Yaris Cross", 0]] },
];

/**
 * Marcas y modelos de partida (Dacia, Renault y algunas más). Solo se cargan si no hay ninguna marca; se llama al arrancar la
 * aplicación y tras «Borrar todos los datos», no desde `sembrar` (así las pruebas siguen partiendo de un catálogo vacío).
 */
export async function sembrarCatalogoInicial<S extends Record<string, unknown>>(db: NodePgDatabase<S>): Promise<void> {
  await db.transaction(async (tx) => {
    const [{ n }] = await tx.select({ n: count() }).from(marcas);
    if (n > 0) return;
    for (const m of MARCAS_INICIALES) {
      const [marca] = await tx.insert(marcas).values({ nombre: m.nombre, activo: true, accesoRapido: m.comisiones, sistemaComisiones: m.comisiones }).returning({ id: marcas.idMarca });
      await tx.insert(modelos).values(m.modelos.map(([nombre, orden]) => ({ marcaId: marca.id, nombreModelo: nombre, accesoRapido: orden > 0, ordenAccesoRapido: orden })));
    }
  });
}
