import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { z } from "zod";
import { auditar } from "@/lib/auditoria";
import { HttpError, requireSession } from "@/lib/auth/sesion";
import { leerJson, manejar } from "@/lib/http";

export const dynamic = "force-dynamic";

const disponible = (): boolean => process.env.REINICIAR_HABILITADO === "1";

/** ¿Se puede reiniciar el equipo desde la aplicación? (solo si el instalador preparó el servicio del sistema). */
export const GET = manejar(async () => {
  await requireSession("administrador");
  return NextResponse.json({ success: true, data: { disponible: disponible() } });
});

/**
 * Pide al equipo (Raspberry Pi o PC) que se reinicie. La aplicación corre en un contenedor sin permisos sobre el sistema:
 * solo deja un archivo «apagar» en la carpeta compartida y un servicio del sistema, instalado por el instalador, lo ve y ejecuta
 * el apagado ordenado. Solo administradores y siempre con confirmación explícita.
 */
export const POST = manejar(async (req: Request) => {
  const admin = await requireSession("administrador");
  const entrada = await leerJson(req, z.object({ confirmar: z.literal(true) }));
  if (!entrada.confirmar) throw new HttpError(400, "Falta la confirmación");
  if (!disponible()) throw new HttpError(409, "El reinicio desde la aplicación no está activado en este equipo. Actualiza con «sudo gv actualizar» por SSH para activarlo.");
  const dir = process.env.APAGADO_DIR ?? "/control";
  await mkdir(dir, { recursive: true });
  await auditar({ idUsuario: admin.idUsuario, accion: "reinicio_solicitado", entidad: "sistema" });
  await writeFile(path.join(dir, "reiniciar"), `${new Date().toISOString()} ${admin.loginEmail}\n`, { mode: 0o666 });
  return NextResponse.json({ success: true, data: { mensaje: "Reiniciando el equipo…" } });
});
