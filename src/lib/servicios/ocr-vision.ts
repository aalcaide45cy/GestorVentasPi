import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { carpetaCopias } from "@/lib/mantenimiento";
import { agruparCajas, type CajaLeida, type LineaLeida } from "./ocr-lineas";

/**
 * Motor «Apple Vision»: el reconocimiento de texto del propio macOS (el que usa «Texto en vivo»), que en un Mac con chip M usa el Neural
 * Engine. Solo funciona cuando la aplicación corre directamente en macOS (no en Docker ni en Windows o Linux). Node no puede llamar a
 * Vision por sí solo, así que se usa un programa pequeño de Swift (`herramientas/ocr-vision.swift`) que se compila una vez con `swiftc`
 * y se ejecuta una vez por página. Si algo falla, la aplicación sigue con RapidOCR (ver `ocr.ts`).
 */

const FUENTE = (): string => path.join(/*turbopackIgnore: true*/ process.cwd(), "herramientas", "ocr-vision.swift");
const TIEMPO_COMPILAR_MS = 5 * 60_000;
const TIEMPO_LEER_MS = 120_000;

export const esMacOs = (): boolean => process.platform === "darwin";

export type EjecutarVision = (programa: string, imagen: string) => Promise<string>;

function ejecutarPrograma(programa: string, argumentos: string[], tiempo: number): Promise<string> {
  return new Promise((resolver, rechazar) => {
    execFile(programa, argumentos, { timeout: tiempo, maxBuffer: 64 * 1024 * 1024 }, (error, salida, errores) => {
      if (error) rechazar(new Error(`${path.basename(programa)}: ${errores?.toString().trim().split("\n").pop() || error.message}`));
      else resolver(salida.toString());
    });
  });
}

const ejecutarPorDefecto: EjecutarVision = (programa, imagen) => ejecutarPrograma(programa, [imagen], TIEMPO_LEER_MS);

/** Lo que imprime el programa de Swift: cajas con su texto, su confianza (0 a 1) y sus coordenadas en píxeles. */
export function parsearSalidaVision(json: string): CajaLeida[] {
  let datos: { cajas?: { texto?: unknown; confianza?: unknown; x0?: unknown; y0?: unknown; x1?: unknown; y1?: unknown }[] };
  try {
    datos = JSON.parse(json) as typeof datos;
  } catch {
    throw new Error("Apple Vision ha devuelto algo que no se entiende");
  }
  if (!Array.isArray(datos.cajas)) throw new Error("Apple Vision no ha devuelto cajas de texto");
  const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  return datos.cajas
    .filter((c) => typeof c.texto === "string" && c.texto.trim() !== "")
    .map((c) => ({ texto: (c.texto as string).trim(), confianza: Math.round(num(c.confianza) * 100), x0: num(c.x0), y0: num(c.y0), x1: num(c.x1), y1: num(c.y1) }));
}

let compilacion: Promise<string> | null = null;

/** Ruta del programa compilado; lo compila si no existe (o si cambió el código fuente). Necesita `swiftc` (herramientas de Xcode). */
export function asegurarProgramaVision(): Promise<string> {
  compilacion ??= (async () => {
    if (!esMacOs()) throw new Error("Apple Vision solo está disponible en macOS");
    const fuente = FUENTE();
    if (!existsSync(/*turbopackIgnore: true*/ fuente)) throw new Error("Falta herramientas/ocr-vision.swift");
    const huella = createHash("sha256").update(readFileSync(/*turbopackIgnore: true*/ fuente)).digest("hex").slice(0, 10);
    const carpeta = path.join(/*turbopackIgnore: true*/ carpetaCopias(), ".herramientas");
    mkdirSync(carpeta, { recursive: true, mode: 0o700 });
    const programa = path.join(/*turbopackIgnore: true*/ carpeta, `ocr-vision-${huella}`);
    if (existsSync(/*turbopackIgnore: true*/ programa)) return programa;
    try {
      await ejecutarPrograma("swiftc", ["-O", fuente, "-o", programa], TIEMPO_COMPILAR_MS);
    } catch (e) {
      throw new Error(`No se pudo compilar el lector de Apple Vision (¿están instaladas las herramientas de Xcode? Ejecuta «xcode-select --install»): ${e instanceof Error ? e.message : e}`);
    }
    return programa;
  })();
  // Si falla, la próxima vez se vuelve a intentar
  compilacion.catch(() => {
    compilacion = null;
  });
  return compilacion;
}

/** ¿Se puede usar Apple Vision en este equipo? (macOS y herramienta compilable). Devuelve el motivo si no. */
export async function visionDisponible(): Promise<{ ok: true } | { ok: false; motivo: string }> {
  if (!esMacOs()) return { ok: false, motivo: "Solo está disponible cuando la aplicación corre directamente en macOS." };
  try {
    await asegurarProgramaVision();
    return { ok: true };
  } catch (e) {
    return { ok: false, motivo: e instanceof Error ? e.message : "No se pudo preparar Apple Vision" };
  }
}

export interface DependenciasVision {
  programa?: () => Promise<string>;
  ejecutar?: EjecutarVision;
}

export interface OpcionesVision {
  columnas?: boolean;
  /** Confianza mínima (0 a 100) de un texto para tomarlo. */
  confianzaMinima?: number;
}

/** Lee las imágenes con Apple Vision y devuelve el texto en líneas (de arriba abajo y de izquierda a derecha). */
export async function ocrImagenesVision(imagenes: Buffer[], opciones: OpcionesVision = {}, deps: DependenciasVision = {}): Promise<LineaLeida[]> {
  const programa = await (deps.programa ?? asegurarProgramaVision)();
  const ejecutar = deps.ejecutar ?? ejecutarPorDefecto;
  const carpeta = await mkdtemp(path.join(/*turbopackIgnore: true*/ os.tmpdir(), "gv-vision-"));
  try {
    const lineas: LineaLeida[] = [];
    for (let i = 0; i < imagenes.length; i++) {
      const ruta = path.join(/*turbopackIgnore: true*/ carpeta, `pagina-${i}.png`);
      await writeFile(/*turbopackIgnore: true*/ ruta, imagenes[i]);
      const cajas = parsearSalidaVision(await ejecutar(programa, ruta)).filter((c) => opciones.confianzaMinima === undefined || c.confianza >= opciones.confianzaMinima);
      lineas.push(...agruparCajas(cajas, opciones.columnas));
    }
    return lineas;
  } finally {
    await rm(/*turbopackIgnore: true*/ carpeta, { recursive: true, force: true }).catch(() => undefined);
  }
}
