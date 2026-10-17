import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { auditar } from "@/lib/auditoria";
import { HttpError, requireSession } from "@/lib/auth/sesion";
import { leerJson, manejar } from "@/lib/http";
import { asegurarCopiaReciente } from "@/lib/servicios/copias";
import { crearCopiaInterna, leerCopiaInterna, restaurarCopiaInterna } from "@/lib/servicios/copias-seccion";
import type { Seccion } from "@/lib/servicios/intercambio";

export const dynamic = "force-dynamic";
export const maxDuration = 600;

const esquema = z.object({
  id: z.number().int().positive(),
  modo: z.enum(["anadir", "actualizar", "sustituir"]),
  aplicar: z.boolean().default(false),
  confirmacion: z.string().optional(),
});

/** Restaura una sección desde una copia interna. Sin `aplicar` solo enseña la vista previa. Al aplicar se guarda antes una copia del estado actual. */
export const POST = manejar(async (req: Request) => {
  const admin = await requireSession("administrador");
  const e = await leerJson(req, esquema);
  let copiaPrevia: { nombre: string } | null = null;
  if (e.aplicar) {
    const esperada = e.modo === "sustituir" ? "SUSTITUIR" : "RESTAURAR";
    if ((e.confirmacion ?? "").trim() !== esperada) throw new HttpError(400, `Escribe ${esperada} para confirmar.`);
    const origen = await leerCopiaInterna(db, e.id);
    try {
      await crearCopiaInterna(db, origen.seccion as Seccion, admin.idUsuario, `Estado anterior a restaurar «${origen.nombre}»`, "automatica");
      const c = await asegurarCopiaReciente(db, admin.idUsuario, e.modo === "anadir" ? 15 : 0);
      copiaPrevia = { nombre: c.nombre };
    } catch (err) {
      throw new HttpError(409, `No se ha restaurado nada porque no se pudo guardar la copia previa. ${err instanceof Error ? err.message : ""}`.trim());
    }
  }
  const r = await restaurarCopiaInterna(db, admin.idUsuario, e.id, e.modo, e.aplicar);
  if (e.aplicar) await auditar({ idUsuario: admin.idUsuario, accion: "copia_interna_restaurada", entidad: r.copia.seccion, entidadId: String(e.id), detalle: { modo: e.modo, nuevos: r.informe.nuevos, actualizados: r.informe.actualizados, eliminados: r.informe.eliminados } });
  return NextResponse.json({ success: true, informe: r.informe, copia: r.copia, copiaPrevia });
});
