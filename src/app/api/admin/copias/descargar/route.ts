import { NextResponse } from "next/server";
import { db } from "@/db";
import { auditar } from "@/lib/auditoria";
import { requireSession } from "@/lib/auth/sesion";
import { errorJson, leerIdQuery, manejar } from "@/lib/http";
import { abrirCopia } from "@/lib/servicios/copias";

export const dynamic = "force-dynamic";

/** Descarga la copia desde el navegador (flujo, sin cargarla en memoria). */
export const GET = manejar(async (req: Request) => {
  const admin = await requireSession("administrador");
  const id = leerIdQuery(req);
  if (!id) return errorJson(400, "Falta el ID de la copia");
  const { nombre, tamano, flujo } = await abrirCopia(db, id);
  await auditar({ idUsuario: admin.idUsuario, accion: "copia_descargada", entidad: "copias_seguridad", entidadId: id });
  return new NextResponse(flujo, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Length": String(tamano),
      "Content-Disposition": `attachment; filename="${nombre}"`,
      "Cache-Control": "no-store",
    },
  });
});
