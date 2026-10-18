import { NextResponse } from "next/server";
import { db } from "@/db";
import { esAdministrador } from "@/lib/auth/permisos";
import { requireSession } from "@/lib/auth/sesion";
import { manejar } from "@/lib/http";
import { listarRejillas } from "@/lib/servicios/rejillas-visor";

export const dynamic = "force-dynamic";

/** Rejillas guardadas: el administrador ve las de todos; el resto, solo las suyas. */
export const GET = manejar(async () => {
  const u = await requireSession("no_invitado");
  return NextResponse.json({ success: true, data: await listarRejillas(db, esAdministrador(u.rol) ? null : u.idUsuario) });
});
