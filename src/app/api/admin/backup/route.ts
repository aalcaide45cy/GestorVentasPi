import { NextResponse } from "next/server";
import { db } from "@/db";
import { auditar } from "@/lib/auditoria";
import { requireSession } from "@/lib/auth/sesion";
import { leerJson, manejar } from "@/lib/http";
import { HttpError } from "@/lib/auth/sesion";
import { esquemaCopia, exportarCopia, restaurarCopia } from "@/lib/servicios/backup";
import { asegurarCopiaReciente } from "@/lib/servicios/copias";

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
  // Restaurar sustituye todos los datos: antes siempre se guarda una copia nueva del estado actual
  try {
    await asegurarCopiaReciente(db, admin.idUsuario, 0);
  } catch (err) {
    throw new HttpError(409, `No se ha restaurado nada porque no se pudo hacer la copia de seguridad previa. ${err instanceof Error ? err.message : ""}`.trim());
  }
  await restaurarCopia(db, admin, copia);
  await auditar({ idUsuario: admin.idUsuario, accion: "copia_restaurada", entidad: "backup" });
  return NextResponse.json({
    success: true,
    message: "Copia de seguridad restaurada correctamente y secuencias de base de datos reiniciadas.",
  });
});
