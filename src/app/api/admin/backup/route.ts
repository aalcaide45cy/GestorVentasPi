import { NextResponse } from "next/server";
import { db } from "@/db";
import { auditar } from "@/lib/auditoria";
import { requireSession } from "@/lib/auth/sesion";
import { leerJson, manejar } from "@/lib/http";
import { esquemaCopia, exportarCopia, restaurarCopia } from "@/lib/servicios/backup";

export const dynamic = "force-dynamic";

export const GET = manejar(async () => {
  const admin = await requireSession("administrador");
  const copia = await exportarCopia(db);
  await auditar({ idUsuario: admin.idUsuario, accion: "copia_exportada", entidad: "backup" });
  return NextResponse.json(copia);
});

export const POST = manejar(async (req: Request) => {
  const admin = await requireSession("administrador");
  const copia = await leerJson(req, esquemaCopia);
  await restaurarCopia(db, admin, copia);
  await auditar({ idUsuario: admin.idUsuario, accion: "copia_restaurada", entidad: "backup" });
  return NextResponse.json({
    success: true,
    message: "Copia de seguridad restaurada correctamente y secuencias de base de datos reiniciadas.",
  });
});
