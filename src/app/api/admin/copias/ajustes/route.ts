import { NextResponse } from "next/server";
import { db } from "@/db";
import { auditar } from "@/lib/auditoria";
import { requireSession } from "@/lib/auth/sesion";
import { leerJsonCrudo, manejar } from "@/lib/http";
import { guardarAjustesCopias } from "@/lib/servicios/copias";

export const dynamic = "force-dynamic";

export const PUT = manejar(async (req: Request) => {
  const admin = await requireSession("administrador");
  const ajustes = await guardarAjustesCopias(db, await leerJsonCrudo(req));
  await auditar({ idUsuario: admin.idUsuario, accion: "copias_ajustes", entidad: "ajustes", detalle: { ...ajustes } });
  return NextResponse.json({ success: true, data: ajustes });
});
