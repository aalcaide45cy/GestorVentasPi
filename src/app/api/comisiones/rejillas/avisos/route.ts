import { NextResponse } from "next/server";
import { db } from "@/db";
import { esAdministrador } from "@/lib/auth/permisos";
import { requireSession } from "@/lib/auth/sesion";
import { manejar } from "@/lib/http";
import { avisosRejilla } from "@/lib/servicios/rejillas";

export const dynamic = "force-dynamic";

const mesActual = () => new Date().toISOString().slice(0, 7);

/** Avisos de validación pendiente: el administrador ve los de todos; el resto, los suyos. */
export const GET = manejar(async () => {
  const u = await requireSession("no_invitado");
  const avisos = await avisosRejilla(db, esAdministrador(u.rol) ? null : u.idUsuario, mesActual());
  return NextResponse.json({ success: true, data: { total: avisos.length, avisos } });
});
