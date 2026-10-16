import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { z } from "zod";
import { auditar } from "@/lib/auditoria";
import { HttpError, requireSession } from "@/lib/auth/sesion";
import { leerJson, manejar } from "@/lib/http";
import { versionDeLaApp } from "@/lib/version";

export const dynamic = "force-dynamic";

const carpeta = () => process.env.APAGADO_DIR ?? "/control";
const disponible = () => process.env.ACTUALIZAR_HABILITADO === "1";

async function leer(nombre: string): Promise<string> {
  try {
    return await readFile(path.join(/*turbopackIgnore: true*/ carpeta(), nombre), "utf8");
  } catch {
    return "";
  }
}

/** Estado de la actualización: versión instalada, si el botón está disponible y el avance (últimas líneas del registro). */
export const GET = manejar(async () => {
  await requireSession("administrador");
  const estado = (await leer("actualizacion.estado")).trim() || "inactiva";
  const lineas = (await leer("actualizacion.log")).split("\n").filter((l) => l.trim() !== "");
  return NextResponse.json({
    success: true,
    data: { disponible: disponible(), version: versionDeLaApp(), estado, registro: lineas.slice(-25) },
  });
});

/**
 * Pide al equipo que ejecute «Actualizar a la última versión» del asistente (espera a que GitHub termine de construirla y la
 * instala con copia previa). La aplicación no tiene permisos sobre el sistema: deja un archivo en la carpeta compartida y un
 * servicio del sistema, instalado por el instalador, lo atiende. Solo administradores, con confirmación.
 */
export const POST = manejar(async (req: Request) => {
  const admin = await requireSession("administrador");
  const { forzar } = await leerJson(req, z.object({ confirmar: z.literal(true), forzar: z.boolean().optional() }));
  if (!disponible()) throw new HttpError(409, "La actualización desde la aplicación no está activada en este equipo. Ejecuta una vez el instalador nuevo (o «sudo gv actualizar» por SSH) para activarla.");
  if (!forzar && (await leer("actualizacion.estado")).trim() === "en-curso") throw new HttpError(409, "Ya hay una actualización en curso.");
  await mkdir(carpeta(), { recursive: true });
  await auditar({ idUsuario: admin.idUsuario, accion: "actualizacion_solicitada", entidad: "sistema" });
  await writeFile(path.join(carpeta(), "actualizar"), `${new Date().toISOString()} ${admin.loginEmail}\n`, { mode: 0o666 });
  return NextResponse.json({ success: true, data: { mensaje: "Actualización solicitada" } });
});
