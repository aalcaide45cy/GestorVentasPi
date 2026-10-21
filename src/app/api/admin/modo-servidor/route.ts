import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { z } from "zod";
import { auditar } from "@/lib/auditoria";
import { HttpError, requireSession } from "@/lib/auth/sesion";
import { leerJson, manejar } from "@/lib/http";

export const dynamic = "force-dynamic";

const modoActual = (): "desarrollo" | "normal" => (process.env.NODE_ENV === "production" ? "normal" : "desarrollo");
/** Docker (Raspberry y equipos con la imagen) siempre corre en modo normal y no se cambia desde la aplicación. */
const enContenedor = (): boolean => existsSync("/.dockerenv");

/** Modo actual del servidor y si este equipo puede cambiarlo desde la aplicación (solo el PC Windows de desarrollo). */
export const GET = manejar(async () => {
  await requireSession("administrador");
  return NextResponse.json({ success: true, data: { modo: modoActual(), disponible: process.platform === "win32" && !enContenedor() } });
});

/**
 * Cambia el servidor entre modo desarrollo y modo normal (compilado). Lanza `scripts/cambiar-modo.ps1`, que cierra este servidor, compila
 * si hace falta y lo vuelve a arrancar; la aplicación no está disponible mientras tanto y la pantalla va preguntando hasta que vuelve.
 */
export const POST = manejar(async (req: Request) => {
  const admin = await requireSession("administrador");
  const { modo } = await leerJson(req, z.object({ modo: z.enum(["desarrollo", "normal"]), confirmar: z.literal(true) }));
  if (process.platform !== "win32" || enContenedor()) throw new HttpError(409, "El cambio de modo desde la aplicación solo está preparado para el PC de desarrollo con Windows. En la Raspberry la aplicación siempre corre en modo normal.");
  if (modo === modoActual()) throw new HttpError(409, `El servidor ya está en modo ${modo}.`);
  await auditar({ idUsuario: admin.idUsuario, accion: "cambio_modo_servidor_solicitado", entidad: "sistema", detalle: { modo } });
  const guion = path.join(/*turbopackIgnore: true*/ process.cwd(), "scripts", "cambiar-modo.ps1");
  // Con `cmd /c start` el script queda fuera del árbol de este servidor (si no, al cerrar el servidor también se cerraría el script); lanzar
  // powershell.exe directamente con `detached` no llega a ejecutarlo en Windows
  spawn("cmd.exe", ["/c", "start", "", "/min", "powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", guion, "-Modo", modo === "normal" ? "build" : "dev", "-Puerto", String(process.env.PORT ?? 3000), "-Carpeta", process.cwd()], { detached: true, stdio: "ignore", windowsHide: true }).unref();
  return NextResponse.json({ success: true, data: { mensaje: modo === "normal" ? "Compilando y pasando a modo normal…" : "Pasando a modo desarrollo…" } });
});
