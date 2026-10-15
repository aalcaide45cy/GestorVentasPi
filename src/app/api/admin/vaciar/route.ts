import { NextResponse } from "next/server";
import { db } from "@/db";
import { auditar } from "@/lib/auditoria";
import { requireSession } from "@/lib/auth/sesion";
import { leerJson, manejar } from "@/lib/http";
import { esquemaVaciar, vaciarBaseDeDatos } from "@/lib/servicios/mantenimiento";

export const dynamic = "force-dynamic";
export const maxDuration = 600;

/** Deja la base de datos sin datos (solo administrador): crea antes una copia previa y conserva las cuentas de acceso. */
export const POST = manejar(async (req: Request) => {
  const admin = await requireSession("administrador");
  const entrada = await leerJson(req, esquemaVaciar);
  const r = await vaciarBaseDeDatos(db, admin.idUsuario, entrada);
  await auditar({ idUsuario: admin.idUsuario, accion: "bbdd_vaciada", entidad: "backup", detalle: { copiaPrevia: r.copiaPrevia, eliminarOtrosUsuarios: entrada.eliminarOtrosUsuarios, catalogosPorDefecto: entrada.catalogosPorDefecto } });
  return NextResponse.json({ success: true, data: r });
});
