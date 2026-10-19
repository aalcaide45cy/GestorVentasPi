import { z } from "zod";
import type { Ejecutor } from "@/db";
import { HttpError } from "@/lib/auth/sesion";
import { FORMATO, INFO_SECCIONES, SECCIONES, exportarSeccion, importarSeccion, type Informe, type Modo, type Paquete, type Seccion } from "./intercambio";

/**
 * Exportar todo en un solo JSON e importarlo en lote: el archivo lleva una sección tras otra (las mismas de siempre) y al importar se
 * elige qué secciones entran y con qué modo. La vista previa se calcula aplicando todo en una transacción que se deshace, así que ya
 * cuenta con lo que las secciones anteriores crearían (por ejemplo, las marcas que necesitan los expedientes).
 */

export const FORMATO_LOTE = "gv-lote-1";

export interface Lote {
  app: "GestorVentasPi";
  formato: typeof FORMATO_LOTE;
  exportadoEn: string;
  /** Versión de la aplicación que lo exportó (informativa). */
  version?: string;
  secciones: Paquete[];
}

/** Orden en el que se importa: primero lo que otras secciones necesitan (tiendas, estados, tipos de venta, marcas y modelos). */
export const ORDEN_IMPORTACION: Seccion[] = ["tiendas", "estados", "tipos_venta", "marcas_modelos", "ajustes", "clientes_expedientes", "clientes", "expedientes", "plantillas_tarifas", "plantillas_plan", "planes", "rejillas", "usuarios"];

/**
 * Secciones que entran por defecto en «todo». «Clientes y expedientes» ya contiene lo que llevarían «Clientes» y «Expedientes» por
 * separado, así que estas dos solo se incluyen si se piden.
 */
export const SECCIONES_DE_TODO: Seccion[] = SECCIONES.filter((s) => s !== "clientes" && s !== "expedientes");

export async function exportarLote(ej: Ejecutor, secciones: Seccion[], version?: string): Promise<Lote> {
  const pedidas = ORDEN_IMPORTACION.filter((s) => secciones.includes(s));
  if (pedidas.length === 0) throw new HttpError(400, "Elige al menos una sección.");
  const paquetes: Paquete[] = [];
  for (const s of pedidas) paquetes.push(await exportarSeccion(ej, s));
  return { app: "GestorVentasPi", formato: FORMATO_LOTE, exportadoEn: new Date().toISOString(), ...(version ? { version } : {}), secciones: paquetes };
}

const esquemaLote = z.object({
  app: z.literal("GestorVentasPi", { error: "El archivo no es una exportación de GestorVentasPi." }),
  formato: z.literal(FORMATO_LOTE),
  exportadoEn: z.string().optional(),
  version: z.string().optional(),
  secciones: z.array(z.object({ seccion: z.enum(SECCIONES), datos: z.array(z.unknown()) }).passthrough()),
});

/** Acepta un archivo de lote o el de una sola sección (se trata como un lote de una). */
export function leerLote(entrada: unknown): Lote {
  const crudo = entrada as { formato?: unknown } | null;
  if (crudo && typeof crudo === "object" && crudo.formato === FORMATO) {
    const p = entrada as Paquete;
    if (!SECCIONES.includes(p.seccion) || !Array.isArray(p.datos)) throw new HttpError(400, "El archivo no es una exportación válida de GestorVentasPi.");
    return { app: "GestorVentasPi", formato: FORMATO_LOTE, exportadoEn: p.exportadoEn ?? "", secciones: [p] };
  }
  const r = esquemaLote.safeParse(entrada);
  if (!r.success) throw new HttpError(400, r.error.issues[0]?.message || "El archivo no es una exportación válida de GestorVentasPi (ni de lote ni de una sección).");
  const vistas = new Set<string>();
  for (const s of r.data.secciones) {
    if (vistas.has(s.seccion)) throw new HttpError(400, `El archivo trae dos veces la sección «${INFO_SECCIONES[s.seccion].titulo}».`);
    vistas.add(s.seccion);
  }
  return r.data as unknown as Lote;
}

export interface ResumenSeccionLote {
  seccion: Seccion;
  titulo: string;
  registros: number;
  importable: boolean;
  modos: Modo[];
  /** Modo con el que se propone importarla. */
  modoSugerido: Modo | null;
  aviso: string | null;
}

/** Qué trae el archivo, en el orden de importación. */
export function resumenLote(lote: Lote): { exportadoEn: string; version: string | null; secciones: ResumenSeccionLote[] } {
  const por = new Map(lote.secciones.map((p) => [p.seccion, p]));
  return {
    exportadoEn: lote.exportadoEn,
    version: lote.version ?? null,
    secciones: ORDEN_IMPORTACION.filter((s) => por.has(s)).map((s) => {
      const info = INFO_SECCIONES[s];
      return { seccion: s, titulo: info.titulo, registros: por.get(s)!.datos.length, importable: info.importable, modos: info.modos, modoSugerido: info.importable ? (info.modos.includes("actualizar") ? "actualizar" : "anadir") : null, aviso: info.aviso };
    }),
  };
}

export interface EleccionLote {
  seccion: Seccion;
  modo: Modo;
}

export interface ResultadoLote {
  aplicado: boolean;
  informes: Informe[];
  /** Secciones que no se pudieron procesar (con el motivo). En una importación real, cualquier fallo deshace todo. */
  fallos: { seccion: Seccion; motivo: string }[];
}

class Reversion extends Error {}

/**
 * Cotejo (`aplicar = false`) o importación real (`aplicar = true`) de las secciones elegidas, en una sola transacción: si algo falla
 * al aplicar, no queda nada a medias.
 */
export async function importarLote(ej: Ejecutor, idAdmin: number, lote: Lote, elecciones: EleccionLote[], aplicar: boolean): Promise<ResultadoLote> {
  const por = new Map(lote.secciones.map((p) => [p.seccion, p]));
  const elegidas = ORDEN_IMPORTACION.map((s) => elecciones.find((e) => e.seccion === s)).filter((e): e is EleccionLote => !!e);
  if (elegidas.length === 0) throw new HttpError(400, "Elige al menos una sección para importar.");
  for (const e of elegidas) {
    if (!por.has(e.seccion)) throw new HttpError(400, `El archivo no trae la sección «${INFO_SECCIONES[e.seccion].titulo}».`);
    if (!INFO_SECCIONES[e.seccion].importable) throw new HttpError(400, `La sección «${INFO_SECCIONES[e.seccion].titulo}» solo se puede exportar.`);
    if (!INFO_SECCIONES[e.seccion].modos.includes(e.modo)) throw new HttpError(400, `El modo «${e.modo}» no está disponible para «${INFO_SECCIONES[e.seccion].titulo}».`);
  }
  const resultado: ResultadoLote = { aplicado: false, informes: [], fallos: [] };
  try {
    await ej.transaction(async (tx) => {
      for (const e of elegidas) {
        const paquete = por.get(e.seccion)!;
        try {
          // Siempre se aplica dentro de la transacción de fuera: en el cotejo se deshace al final
          resultado.informes.push(await importarSeccion(tx, idAdmin, paquete, e.modo, true, e.seccion));
        } catch (err) {
          const motivo = err instanceof Error ? err.message : "error desconocido";
          // Al aplicar, un fallo deshace todo el lote; en el cotejo se anota y se sigue con las demás
          if (aplicar) throw new HttpError(409, `No se ha importado nada. «${INFO_SECCIONES[e.seccion].titulo}»: ${motivo}`);
          resultado.fallos.push({ seccion: e.seccion, motivo });
        }
      }
      if (!aplicar) throw new Reversion();
    });
    resultado.aplicado = aplicar;
  } catch (e) {
    if (!(e instanceof Reversion)) throw e;
  }
  for (const i of resultado.informes) i.aplicado = resultado.aplicado;
  return resultado;
}
