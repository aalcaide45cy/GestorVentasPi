import { NextResponse } from "next/server";
import { db } from "@/db";
import { esAdministrador } from "@/lib/auth/permisos";
import { HttpError, requireSession } from "@/lib/auth/sesion";
import { manejar } from "@/lib/http";
import { usuarioObjetivo } from "@/lib/servicios/alcance-comisiones";
import { datosContraste } from "@/lib/servicios/contraste-rejillas";

export const dynamic = "force-dynamic";

/** Rejillas guardadas frente a expedientes. `?usuario=ID` elige vendedor; `?usuario=todos` junta a todos (solo administrador). Solo lectura. */
export const GET = manejar(async (req: Request) => {
  const u = await requireSession("no_invitado");
  if (new URL(req.url).searchParams.get("usuario") === "todos") {
    if (!esAdministrador(u.rol)) throw new HttpError(403, "Solo un administrador puede ver las rejillas de todos los vendedores");
    return NextResponse.json({ success: true, data: await datosContraste(db, null) });
  }
  return NextResponse.json({ success: true, data: await datosContraste(db, usuarioObjetivo(u, req)) });
});
