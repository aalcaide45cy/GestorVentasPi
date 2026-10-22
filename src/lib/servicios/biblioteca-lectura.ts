import { inArray } from "drizzle-orm";
import type { Ejecutor } from "@/db";
import { biblioteca } from "@/db/schema";
import { leerDatosBasicosDePedido } from "./documentos";
import { leerArchivo, renombrarSegunLectura } from "./biblioteca";
import { leerDatosBasicosDePago } from "./pagos-rci";
import { leerMesDeFichero } from "./ocr-rejilla";
import { TareaCancelada, type ContextoTarea } from "./tareas";

type TipoLegible = "pedido" | "pago_rci" | "rejilla";

export interface ResumenRenombrado {
  renombrados: number;
  /** Archivos leídos pero sin datos suficientes para ponerles nombre (no se tocan). */
  sinDatos: number;
  /** De los renombrados, los que no se pudieron leer del todo y llevan «Sin cliente» o la fecha de subida en lugar de la del documento. */
  conRespaldo: number;
  /** Cómo se llamaban y cómo se llaman ahora (hasta 200), para repasarlo. */
  cambios: { antes: string; despues: string }[];
  /** Excel y «otros»: no se leen. */
  omitidos: number;
  errores: number;
  /** Los que no se han podido renombrar y por qué (hasta 30), para decírselo al usuario. */
  fallos: { nombre: string; motivo: string }[];
}

/**
 * Pone a archivos de la biblioteca el nombre «Tipo - Cliente - Fecha» leyéndolos con OCR (pedidos y pagos de RCI) o «Rejilla - Mes Año» (rejillas, con la
 * fecha que llevan abajo a la izquierda). Va de uno en uno, informa de su avance y se puede cancelar; un archivo que no se puede leer se deja como está.
 */
export async function renombrarPorLectura(ej: Ejecutor, ids: number[], ctx?: ContextoTarea): Promise<ResumenRenombrado> {
  const filas = await ej.select({ id: biblioteca.id, categoria: biblioteca.categoria, nombre: biblioteca.nombre }).from(biblioteca).where(inArray(biblioteca.id, ids));
  const r: ResumenRenombrado = { renombrados: 0, sinDatos: 0, conRespaldo: 0, cambios: [], omitidos: 0, errores: 0, fallos: [] };
  const fallo = (nombre: string, motivo: string) => {
    if (r.fallos.length < 30) r.fallos.push({ nombre, motivo });
  };
  for (let i = 0; i < filas.length; i++) {
    if (ctx?.cancelada()) throw new TareaCancelada(`Cancelado: se han renombrado ${r.renombrados} de ${filas.length} archivos`);
    const f = filas[i];
    ctx?.avance(i, filas.length, `Leyendo «${f.nombre}» (${i + 1} de ${filas.length})`);
    // Los Excel no se leen; los demás (pedido, pago, rejilla u otros PDF y fotos) sí
    if (f.categoria === "listado") {
      r.omitidos++;
      continue;
    }
    try {
      const a = await leerArchivo(ej, f.id);
      if (!a) {
        r.errores++;
        fallo(f.nombre, "el archivo ya no está guardado");
        continue;
      }
      // Se prueba primero como el tipo que tiene (o como pedido, si es otro) y después como los demás: un PDF suelto se toma por pedido y puede ser un pago o una rejilla
      const orden = [...new Set<TipoLegible>([f.categoria === "pago_rci" || f.categoria === "rejilla" ? f.categoria : "pedido", "pedido", "pago_rci", "rejilla"])];
      let nombre: string | null = null;
      for (const tipo of orden) {
        const leido = tipo === "pedido" ? await leerDatosBasicosDePedido(ej, a.datos) : tipo === "pago_rci" ? await leerDatosBasicosDePago(a.datos).catch(() => null) : { mes: await leerMesDeFichero(a.datos) };
        nombre = leido ? await renombrarSegunLectura(ej, f.id, leido, tipo) : null;
        if (nombre) break;
      }
      // Si no se pudo leer nada, un pedido, un pago o una rejilla queda igualmente con nombre ordenado y con la fecha de subida (el original se conserva)
      if (!nombre && (f.categoria === "pedido" || f.categoria === "pago_rci" || f.categoria === "rejilla")) {
        nombre = await renombrarSegunLectura(ej, f.id, {}, f.categoria, true);
        if (nombre) r.conRespaldo++;
      }
      if (nombre) {
        r.renombrados++;
        if (r.cambios.length < 200 && nombre !== f.nombre) r.cambios.push({ antes: f.nombre, despues: nombre });
      } else {
        r.sinDatos++;
        fallo(f.nombre, "no se ha encontrado en él el cliente y la fecha (o el mes) para ponerle nombre");
      }
    } catch (e) {
      r.errores++;
      fallo(f.nombre, e instanceof Error ? e.message : "error al leerlo");
      console.warn(`No se ha podido leer «${f.nombre}» para renombrarlo:`, e instanceof Error ? e.message : e);
    }
  }
  ctx?.avance(filas.length, filas.length, "Terminado");
  return r;
}
