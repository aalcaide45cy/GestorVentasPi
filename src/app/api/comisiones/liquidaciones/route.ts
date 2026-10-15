import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { auditar } from "@/lib/auditoria";
import { esAdministrador } from "@/lib/auth/permisos";
import { requireSession } from "@/lib/auth/sesion";
import { errorJson, leerIdQuery, leerJson, manejar } from "@/lib/http";
import { cambiarEstadoLiquidacion, ESTADOS_LIQUIDACION, leerLiquidacion, leerVersion, listarLiquidaciones } from "@/lib/servicios/comisiones-gestion";

export const dynamic = "force-dynamic";

/** Lista (o detalle con `?id=`, o una versión con `?version=`). El administrador ve todo; el resto, solo lo suyo. */
export const GET = manejar(async (req: Request) => {
  const u = await requireSession("no_invitado");
  const admin = esAdministrador(u.rol);
  const id = leerIdQuery(req);
  const version = leerIdQuery(req, "version");
  if (version) {
    if (!admin) return errorJson(403, "No tienes permiso");
    const v = await leerVersion(db, version);
    return v ? NextResponse.json({ success: true, data: v }) : errorJson(404, "Versión no encontrada");
  }
  if (id) {
    const d = await leerLiquidacion(db, id);
    if (!d) return errorJson(404, "Liquidación no encontrada");
    if (!admin && d.liquidacion.idUsuario !== u.idUsuario) return errorJson(403, "No tienes permiso");
    return NextResponse.json({ success: true, data: d });
  }
  const q = new URL(req.url).searchParams;
  const idPlan = leerIdQuery(req, "plan") ?? undefined;
  const usuarioQ = leerIdQuery(req, "usuario") ?? undefined;
  const idUsuario = admin ? usuarioQ : u.idUsuario;
  const mes = q.get("mes") ?? undefined;
  return NextResponse.json({ success: true, data: await listarLiquidaciones(db, { idPlan, idUsuario, mes: mes && /^\d{4}-\d{2}$/.test(mes) ? mes : undefined }) });
});

const esquemaEstado = z.object({ id: z.number().int().positive(), estado: z.enum(ESTADOS_LIQUIDACION) });

/** Revisar o cerrar una liquidación (solo administrador). */
export const PATCH = manejar(async (req: Request) => {
  const u = await requireSession("administrador");
  const { id, estado } = await leerJson(req, esquemaEstado);
  await cambiarEstadoLiquidacion(db, id, estado);
  await auditar({ idUsuario: u.idUsuario, accion: "liquidacion_estado", entidad: "commission_liquidations", entidadId: String(id), detalle: { estado } });
  return NextResponse.json({ success: true });
});
