import { and, eq, gte } from "drizzle-orm";
import { db, type Ejecutor } from "@/db";
import { copiasSeguridad } from "@/db/schema";
import { anotarError, aplicarRetencion, crearCopia, leerAjustesCopias } from "./copias";
import { borrarEnDrive, estadoDrive, subirCopiaADrive } from "./drive";

const REINTENTO_MS = 30 * 60 * 1000;
let ultimoIntentoFallido = 0;
let ocupado = false;

/**
 * Hace la copia automática del día si ya pasó la hora configurada y todavía no hay una de hoy.
 * Devuelve el nombre de la copia creada o null si no tocaba. Un fallo se anota y se reintenta a los 30 min.
 */
export async function copiaAutomaticaSiToca(ej: Ejecutor, ahora = new Date(), respetarEspera = false): Promise<string | null> {
  const a = await leerAjustesCopias(ej);
  if (!a.automatica) return null;
  const [h, m] = a.hora.split(":").map(Number);
  const hoyALaHora = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate(), h, m, 0, 0);
  if (ahora < hoyALaHora) return null;
  const hechas = await ej.select({ id: copiasSeguridad.id }).from(copiasSeguridad).where(and(eq(copiasSeguridad.tipo, "auto"), gte(copiasSeguridad.creadaEn, hoyALaHora))).limit(1);
  if (hechas.length > 0) return null;
  if (respetarEspera && Date.now() - ultimoIntentoFallido < REINTENTO_MS) return null;

  try {
    const copia = await crearCopia(ej, "auto", null);
    await anotarError(ej, null);
    const retencion = await aplicarRetencion(ej);
    const drive = await estadoDrive(ej);
    if (drive.conectado) {
      try {
        if (a.driveAutomatica && !drive.requiereReconexion) await subirCopiaADrive(ej, copia.id);
        if (retencion.driveFileIds.length > 0 && !drive.requiereReconexion) await borrarEnDrive(ej, retencion.driveFileIds);
      } catch (e) {
        await anotarError(ej, `Copia local hecha, pero Google Drive falló: ${e instanceof Error ? e.message : "error desconocido"}`);
      }
    }
    return copia.nombre;
  } catch (e) {
    ultimoIntentoFallido = Date.now();
    await anotarError(ej, e instanceof Error ? e.message : "La copia automática ha fallado");
    return null;
  }
}

/** Arranca el planificador (una comprobación por minuto). Se llama una vez desde `instrumentation.ts`. */
export function iniciarPlanificador(): void {
  const g = globalThis as unknown as { __planificadorCopias?: ReturnType<typeof setInterval> };
  if (g.__planificadorCopias) return;
  g.__planificadorCopias = setInterval(() => {
    if (ocupado) return;
    ocupado = true;
    copiaAutomaticaSiToca(db, new Date(), true)
      .catch((e: unknown) => console.error("Planificador de copias:", e instanceof Error ? e.message : e))
      .finally(() => {
        ocupado = false;
      });
  }, 60 * 1000);
  g.__planificadorCopias.unref?.();
}
