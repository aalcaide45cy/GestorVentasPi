import { and, eq, inArray, ne } from "drizzle-orm";
import { z } from "zod";
import type { Ejecutor } from "@/db";
import {
  correoCola,
  correoCuentas,
  correoPlantillas,
  potenciales,
} from "@/db/schema";
import { HttpError, type UsuarioActual } from "@/lib/auth/sesion";
import { hayFirma, rellenarPlantilla } from "@/lib/correo";
import { crearCorreo, htmlDeFirma } from "./correo";
import {
  cotejarPotenciales,
  hayBajaDeLaMismaPersona,
  datosDePotencial,
  listarPotenciales,
} from "./potenciales";

/**
 * Envío de correos a clientes potenciales por lotes: se eligen personas, una plantilla y una cuenta, y se deja cada correo individual (a una
 * sola persona, sin copia oculta) en la cola de correo, con una pausa entre uno y otro. Quien ha comprado, se ha dado de baja, no tiene correo
 * o ya ha recibido esa plantilla por ese presupuesto se deja fuera; y justo antes de cada envío se vuelve a comprobar.
 */

export const esquemaLote = z.object({
  ids: z.array(z.number().int().positive()).max(3000).default([]),
  /** Todos los potenciales que ve esta persona (en vez de una lista de ids). */
  todos: z.boolean().default(false),
  id_plantilla: z.number().int().positive(),
  id_cuenta: z.number().int().positive(),
  /** Espera entre correos: entre estos dos valores, en segundos. */
  espera: z.number().int().min(1).max(3600).default(25),
  espera_max: z.number().int().min(1).max(3600).optional(),
  lote: z.string().trim().max(60).default(""),
  modo: z.enum(["previsualizar", "borradores", "programar"]),
});
export type EntradaLote = z.input<typeof esquemaLote>;

export interface ResultadoLote {
  lote: string;
  incluidos: number;
  excluidos: {
    compraron: number;
    posibles: number;
    baja: number;
    sinCorreo: number;
    yaEnviado: number;
  };
  /** Cómo quedaría el correo de la primera persona (solo al previsualizar). */
  ejemplo: { para: string; asunto: string; cuerpo: string } | null;
  /** Correos creados en la cola (al borradores o programar). */
  creados: number;
}

export async function prepararLote(
  ej: Ejecutor,
  u: UsuarioActual,
  entrada: EntradaLote,
): Promise<ResultadoLote> {
  const e = esquemaLote.parse(entrada);
  if (!e.todos && e.ids.length === 0)
    throw new HttpError(400, "Elige a quién escribir");
  const [plantilla] = await ej
    .select()
    .from(correoPlantillas)
    .where(eq(correoPlantillas.id, e.id_plantilla));
  if (!plantilla) throw new HttpError(404, "Plantilla no encontrada");
  const [cuenta] = await ej
    .select()
    .from(correoCuentas)
    .where(
      and(
        eq(correoCuentas.id, e.id_cuenta),
        eq(correoCuentas.idUsuario, u.idUsuario),
      ),
    );
  if (!cuenta) throw new HttpError(404, "Cuenta de correo no encontrada");
  if (!cuenta.activa)
    throw new HttpError(400, "La cuenta de envío está desactivada");

  const visibles = await listarPotenciales(ej, u);
  const elegidos = e.todos
    ? visibles
    : visibles.filter((p) => e.ids.includes(p.id));
  // Se vuelve a cotejar con los expedientes justo ahora
  await cotejarPotenciales(
    ej,
    elegidos.map((p) => p.id),
  );
  const frescos = await ej
    .select({ id: potenciales.id, estado: potenciales.estado })
    .from(potenciales)
    .where(
      inArray(
        potenciales.id,
        elegidos.length ? elegidos.map((p) => p.id) : [0],
      ),
    );
  const estado = new Map(frescos.map((f) => [f.id, f.estado]));
  // A quién ya se le escribió con esta plantilla por su último presupuesto (en cola, programado o enviado)
  const yaTienen = await ej
    .select({ p: correoCola.idPotencial, pr: correoCola.idPresupuesto })
    .from(correoCola)
    .where(
      and(
        eq(correoCola.idPlantilla, e.id_plantilla),
        ne(correoCola.estado, "cancelado"),
        ne(correoCola.estado, "error"),
      ),
    );
  const clavesYa = new Set(yaTienen.map((y) => `${y.p}:${y.pr}`));

  const r: ResultadoLote = {
    lote: e.lote || `Lote ${new Date().toLocaleDateString("es-ES")}`,
    incluidos: 0,
    excluidos: {
      compraron: 0,
      posibles: 0,
      baja: 0,
      sinCorreo: 0,
      yaEnviado: 0,
    },
    ejemplo: null,
    creados: 0,
  };
  const incluir: { id: number; idPresupuesto: number | null }[] = [];
  for (const p of elegidos) {
    const st = estado.get(p.id) ?? p.estado;
    if (st === "baja" || (await hayBajaDeLaMismaPersona(ej, p)))
      r.excluidos.baja++;
    else if (st === "compro") r.excluidos.compraron++;
    else if (st === "posible") r.excluidos.posibles++;
    else if (!p.email) r.excluidos.sinCorreo++;
    else if (clavesYa.has(`${p.id}:${p.ultimo?.id ?? null}`))
      r.excluidos.yaEnviado++;
    else incluir.push({ id: p.id, idPresupuesto: p.ultimo?.id ?? null });
  }
  r.incluidos = incluir.length;

  if (e.modo === "previsualizar") {
    if (incluir[0]) {
      const d = await datosDePotencial(
        ej,
        incluir[0].id,
        incluir[0].idPresupuesto,
      );
      const elegida = await htmlDeFirma(ej, plantilla.idFirma);
      const firma = hayFirma(elegida) ? elegida : cuenta.firma;
      const datos = {
        ...d.datos,
        firma,
        hoy: new Date().toLocaleDateString("es-ES"),
      };
      const base =
        plantilla.conFirma && firma && !plantilla.cuerpo.includes("{firma}")
          ? `${plantilla.cuerpo}<p></p>{firma}`
          : plantilla.cuerpo;
      r.ejemplo = {
        para: d.email,
        asunto: rellenarPlantilla(plantilla.asunto, datos, false),
        cuerpo: rellenarPlantilla(base, datos, true),
      };
    }
    return r;
  }

  for (const x of incluir) {
    const c = await crearCorreo(ej, u, {
      id_plantilla: e.id_plantilla,
      id_cuenta: e.id_cuenta,
      id_potencial: x.id,
      id_presupuesto: x.idPresupuesto,
      lote: r.lote,
      espera: e.espera,
      espera_max: e.espera_max ?? null,
      programar: e.modo === "programar",
    });
    if (c) r.creados++;
  }
  return r;
}
