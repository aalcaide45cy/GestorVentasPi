import { existsSync } from "node:fs";
import path from "node:path";

/** Carpeta de copias (sin crearla): la comparte el proxy y el servicio de copias. */
export function carpetaCopias(): string {
  return process.env.BACKUP_DIR ?? path.join(/*turbopackIgnore: true*/ process.cwd(), "backups");
}

/** ¿Hay una restauración en curso? El proxy responde 503 a todo salvo a `/api/salud`. */
export function enMantenimiento(): boolean {
  try {
    return existsSync(/*turbopackIgnore: true*/ path.join(/*turbopackIgnore: true*/ carpetaCopias(), ".mantenimiento"));
  } catch {
    return false;
  }
}
