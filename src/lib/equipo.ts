import { readFileSync } from "node:fs";
import os from "node:os";

/** Qué equipo es el que ejecuta la aplicación: lo que se ve en la cajita de recursos (nombre y tipo) y en el informe de rendimiento. */

export type TipoEquipo = "AMD" | "Intel" | "Apple" | "Raspberry" | "Otro";

export interface IdentidadEquipo {
  /** Nombre del equipo en la red (hostname). */
  nombre: string;
  tipo: TipoEquipo;
  /** Texto largo para el detalle: modelo, procesador, núcleos y sistema. */
  detalle: string;
}

/** Elige el tipo por el sistema, la arquitectura, el procesador y el modelo de la placa (en una Raspberry, /proc/device-tree/model). */
export function clasificarEquipo(e: { plataforma: string; arquitectura: string; procesador: string; placa: string | null }): TipoEquipo {
  if (e.plataforma === "linux" && /raspberry/i.test(e.placa ?? "")) return "Raspberry";
  // Un Mac con chip Apple («silicon») es ARM64 en macOS; un Mac con Intel sigue siendo un procesador Intel
  if (e.plataforma === "darwin") return e.arquitectura === "arm64" || /apple/i.test(e.procesador) ? "Apple" : "Intel";
  if (/\bamd\b|ryzen|epyc|athlon|threadripper/i.test(e.procesador)) return "AMD";
  if (/intel|core\(tm\)|xeon|celeron|pentium/i.test(e.procesador)) return "Intel";
  // Una placa ARM64 con Linux sin saber más: casi seguro una Raspberry Pi o parecida
  if (e.plataforma === "linux" && e.arquitectura === "arm64") return "Raspberry";
  return "Otro";
}

/**
 * Nombre del equipo. Dentro de Docker `os.hostname()` es el identificador del contenedor (12 letras y números al azar), no el nombre de
 * la Raspberry: por eso se prefiere el archivo `/host/hostname` (el `/etc/hostname` del equipo, montado en solo lectura), después la
 * variable `NOMBRE_EQUIPO`, y un nombre que parece un identificador de contenedor se descarta.
 */
export function nombreDelEquipo(entorno: { archivoHost: string | null; variable: string | undefined; hostname: string }): string {
  const limpio = (t: string | null | undefined) => (t ?? "").trim().slice(0, 60);
  const candidatos = [limpio(entorno.archivoHost), limpio(entorno.variable), limpio(entorno.hostname)];
  return candidatos.find((c) => c !== "" && !/^[0-9a-f]{12}$/i.test(c)) ?? "";
}

let cache: IdentidadEquipo | null = null;
/** Nombre que el administrador ha puesto al equipo en la aplicación (ajuste `nombre_equipo`): manda sobre el detectado. */
let nombrePuesto = "";
export const fijarNombreEquipo = (n: string): void => {
  nombrePuesto = n.trim().slice(0, 60);
};

export function identidadEquipo(): IdentidadEquipo {
  if (cache) return nombrePuesto ? { ...cache, nombre: nombrePuesto } : cache;
  const procesador = os.cpus()[0]?.model?.replace(/\s+/g, " ").trim() ?? "";
  let placa: string | null = null;
  try {
    placa = readFileSync("/proc/device-tree/model", "utf8").replace(/\0/g, "").trim() || null;
  } catch {
    /* no es una placa con device-tree */
  }
  const tipo = clasificarEquipo({ plataforma: process.platform, arquitectura: process.arch, procesador, placa });
  const sistema = process.platform === "win32" ? "Windows" : process.platform === "darwin" ? "macOS" : process.platform === "linux" ? "Linux" : process.platform;
  let archivoHost: string | null = null;
  try {
    archivoHost = readFileSync("/host/hostname", "utf8");
  } catch {
    /* sin el montaje del equipo */
  }
  cache = {
    nombre: nombreDelEquipo({ archivoHost, variable: process.env.NOMBRE_EQUIPO, hostname: os.hostname() }),
    tipo,
    detalle: [placa ?? procesador, `${os.availableParallelism()} núcleos`, `${sistema} ${process.arch}`].filter(Boolean).join(" · "),
  };
  return nombrePuesto ? { ...cache, nombre: nombrePuesto } : cache;
}
