import { NextResponse } from "next/server";
import { db } from "@/db";
import { esAdministrador } from "@/lib/auth/permisos";
import { HttpError, requireSession } from "@/lib/auth/sesion";
import { leerJson, manejar } from "@/lib/http";
import { esquemaSimulacion, simularDesglose } from "@/lib/servicios/simulador";

export const dynamic = "force-dynamic";

/** «Desglose estimado de comisión» de un expediente tal como está en el formulario (no guarda nada). */
export const POST = manejar(async (req: Request) => {
  const u = await requireSession("no_invitado");
  const entrada = await leerJson(req, esquemaSimulacion);
  if (!esAdministrador(u.rol) && entrada.id_usuario !== u.idUsuario) throw new HttpError(403, "Solo puedes simular tus propios expedientes");
  return NextResponse.json({ success: true, data: await simularDesglose(db, entrada) });
});
