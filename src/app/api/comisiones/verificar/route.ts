import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { expedientes } from "@/db/schema";
import { esAdministrador } from "@/lib/auth/permisos";
import { HttpError, requireSession } from "@/lib/auth/sesion";
import { leerJson, manejar } from "@/lib/http";
import { mesDeQuery, usuarioObjetivo } from "@/lib/servicios/alcance-comisiones";
import { cotejo, esquemaMarcarCobro, marcarCobro } from "@/lib/servicios/comisiones-gestion";

export const dynamic = "force-dynamic";

/** Cotejo de cobros de un vendedor y mes. */
export const GET = manejar(async (req: Request) => {
  const u = await requireSession("no_invitado");
  return NextResponse.json({ success: true, data: await cotejo(db, usuarioObjetivo(u, req), mesDeQuery(req)) });
});

/** Marca o desmarca «cobrado» en un concepto (administrador o dueño del expediente). */
export const POST = manejar(async (req: Request) => {
  const u = await requireSession("no_invitado");
  const entrada = await leerJson(req, esquemaMarcarCobro);
  if (!esAdministrador(u.rol)) {
    const [e] = await db.select({ idUsuario: expedientes.idUsuario }).from(expedientes).where(eq(expedientes.idExpediente, entrada.idExpediente));
    if (!e || e.idUsuario !== u.idUsuario) throw new HttpError(403, "No tienes permiso sobre este expediente");
  }
  await marcarCobro(db, entrada);
  return NextResponse.json({ success: true });
});
