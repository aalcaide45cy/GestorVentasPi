import { spawn } from "node:child_process";
import path from "node:path";
import { NextResponse } from "next/server";
import { z } from "zod";
import { auditar } from "@/lib/auditoria";
import { HttpError, requireSession } from "@/lib/auth/sesion";
import { leerJson, manejar } from "@/lib/http";

export const dynamic = "force-dynamic";

const enProduccion = (): boolean => process.env.NODE_ENV === "production";

/** Solo el programa (no el equipo): en la Raspberry lo vuelve a levantar Docker; en el PC de desarrollo se relanza con un script. */
export const GET = manejar(async () => {
  await requireSession("administrador");
  return NextResponse.json({ success: true, data: { disponible: enProduccion() || process.platform === "win32" } });
});

/**
 * Reinicia solo el servidor de la aplicación (no el equipo). En producción el proceso se cierra y el contenedor, con
 * `restart: unless-stopped`, arranca de nuevo; en desarrollo (Windows) se lanza `scripts/reiniciar-dev.ps1`. Solo administradores,
 * con confirmación.
 */
export const POST = manejar(async (req: Request) => {
  const admin = await requireSession("administrador");
  const entrada = await leerJson(req, z.object({ confirmar: z.literal(true) }));
  if (!entrada.confirmar) throw new HttpError(400, "Falta la confirmación");
  await auditar({ idUsuario: admin.idUsuario, accion: "reinicio_servidor_solicitado", entidad: "sistema" });
  if (enProduccion()) {
    setTimeout(() => process.exit(0), 800);
  } else if (process.platform === "win32") {
    const guion = path.join(/*turbopackIgnore: true*/ process.cwd(), "scripts", "reiniciar-dev.ps1");
    // Con `cmd /c start` el script queda fuera del árbol de este servidor (que el propio script cierra); `detached` con powershell.exe no lo ejecuta
    spawn("cmd.exe", ["/c", "start", "", "/min", "powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", guion, "-Puerto", String(process.env.PORT ?? 3000), "-Carpeta", process.cwd()], { detached: true, stdio: "ignore", windowsHide: true }).unref();
  } else {
    throw new HttpError(409, "El reinicio del servidor de desarrollo solo está preparado para Windows. Reinícialo a mano con npm run dev.");
  }
  return NextResponse.json({ success: true, data: { mensaje: "Reiniciando el servidor…" } });
});
