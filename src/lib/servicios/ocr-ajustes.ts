import { execFile } from "node:child_process";
import os from "node:os";
import { inArray } from "drizzle-orm";
import { db, type Ejecutor } from "@/db";
import { ajustes } from "@/db/schema";
import type { ProveedorOnnx } from "./ocr-rapido";

/** Motor de lectura de texto (OCR) y número de lecturas a la vez, a elegir en Configuración. */
export type MotorOcr = "tesseract" | "rapido-cpu" | "rapido-gpu" | "vision";

export const MOTORES: MotorOcr[] = ["tesseract", "rapido-cpu", "rapido-gpu", "vision"];

export interface AjustesOcr {
  motor: MotorOcr;
  /** Lecturas de pedidos a la vez: 0 = automático (se ajusta solo según CPU y memoria). */
  simultaneas: number;
  /** Lectura manual: tras subir los pedidos no se lee nada hasta que el usuario pulsa «Iniciar lectura». */
  lecturaManual: boolean;
}

export const MAXIMO_SIMULTANEAS = 32;
const CLAVE_MOTOR = "ocr_motor";
const CLAVE_SIMULTANEAS = "ocr_simultaneas";
const CLAVE_MANUAL = "lectura_manual";
const VIGENCIA_MS = 5000;

/** Por defecto RapidOCR en CPU: lee mejor que Tesseract y va bien tanto en la Raspberry como en un PC (si falla, se usa Tesseract). */
// En macOS el de Apple Vision (si no se puede usar, se cae solo a RapidOCR).
// La lectura es manual por defecto: el usuario pulsa «Iniciar lectura» cuando ha terminado de subir.
const DEFECTO: AjustesOcr = { motor: process.platform === "darwin" ? "vision" : "rapido-cpu", simultaneas: 0, lecturaManual: true };

const G = globalThis as unknown as { __ajustesOcr?: { valor: AjustesOcr; leidoEn: number } };

/** Ajustes ya leídos (sin esperar a la base de datos); `cargarAjustesOcr` los refresca. */
export const ajustesOcr = (): AjustesOcr => G.__ajustesOcr?.valor ?? DEFECTO;

export const esMotor = (v: unknown): v is MotorOcr => typeof v === "string" && (MOTORES as string[]).includes(v);

/** Lee los ajustes (con una vigencia corta, para no consultar la base de datos en cada hoja que se lee). */
export async function cargarAjustesOcr(ej: Ejecutor = db, forzar = false): Promise<AjustesOcr> {
  const c = G.__ajustesOcr;
  if (!forzar && c && Date.now() - c.leidoEn < VIGENCIA_MS) return c.valor;
  try {
    const filas = await ej.select().from(ajustes).where(inArray(ajustes.clave, [CLAVE_MOTOR, CLAVE_SIMULTANEAS, CLAVE_MANUAL]));
    const mapa = new Map(filas.map((f) => [f.clave, f.valor]));
    const motor = mapa.get(CLAVE_MOTOR);
    const n = Number(mapa.get(CLAVE_SIMULTANEAS));
    const manual = mapa.get(CLAVE_MANUAL);
    const valor: AjustesOcr = { motor: esMotor(motor) ? motor : DEFECTO.motor, simultaneas: Number.isInteger(n) && n >= 0 && n <= MAXIMO_SIMULTANEAS ? n : 0, lecturaManual: manual === undefined ? DEFECTO.lecturaManual : manual === "true" };
    G.__ajustesOcr = { valor, leidoEn: Date.now() };
    return valor;
  } catch {
    return c?.valor ?? DEFECTO;
  }
}

export async function guardarAjustesOcr(ej: Ejecutor, cambios: Partial<AjustesOcr>): Promise<AjustesOcr> {
  const filas: { clave: string; valor: string }[] = [];
  if (cambios.motor !== undefined) filas.push({ clave: CLAVE_MOTOR, valor: cambios.motor });
  if (cambios.simultaneas !== undefined) filas.push({ clave: CLAVE_SIMULTANEAS, valor: String(cambios.simultaneas) });
  if (cambios.lecturaManual !== undefined) filas.push({ clave: CLAVE_MANUAL, valor: String(cambios.lecturaManual) });
  for (const f of filas) await ej.insert(ajustes).values(f).onConflictDoUpdate({ target: ajustes.clave, set: { valor: f.valor } });
  return cargarAjustesOcr(ej, true);
}

export const proveedorDe = (m: MotorOcr): ProveedorOnnx | null => (m === "rapido-cpu" ? "cpu" : m === "rapido-gpu" ? "gpu" : null);

export interface EquipoOcr {
  plataforma: string;
  arquitectura: string;
  nucleos: number;
  memoriaGb: number;
  /** Nombre de la tarjeta NVIDIA si hay una utilizable (nvidia-smi la ve), o null. */
  nvidia: string | null;
  esRaspberry: boolean;
  /** La aplicación corre directamente en macOS (Apple Vision solo existe ahí). */
  macos: boolean;
}

let equipoCache: Promise<EquipoOcr> | null = null;

function nombreNvidia(): Promise<string | null> {
  return new Promise((resolver) => {
    try {
      execFile("nvidia-smi", ["--query-gpu=name", "--format=csv,noheader"], { timeout: 4000, windowsHide: true }, (error, salida) => {
        const nombre = error ? "" : salida.split("\n")[0]?.trim();
        resolver(nombre || null);
      });
    } catch {
      resolver(null);
    }
  });
}

/** Qué equipo es (para recomendar el motor): arquitectura, núcleos, memoria y si hay una GPU NVIDIA. */
export function equipoOcr(): Promise<EquipoOcr> {
  equipoCache ??= nombreNvidia().then((nvidia) => ({
    plataforma: process.platform,
    arquitectura: process.arch,
    nucleos: os.availableParallelism(),
    memoriaGb: Math.round((os.totalmem() / 1024 ** 3) * 10) / 10,
    nvidia,
    esRaspberry: process.arch === "arm64" && process.platform === "linux" && os.totalmem() < 17 * 1024 ** 3,
    macos: process.platform === "darwin",
  }));
  return equipoCache;
}

/** Motor que se recomienda para este equipo. */
export const motorRecomendado = (e: EquipoOcr): MotorOcr => (e.macos ? "vision" : e.nvidia ? "rapido-gpu" : "rapido-cpu");

/** Para pruebas: quita lo guardado en memoria. */
export function olvidarAjustesOcr(): void {
  delete G.__ajustesOcr;
}

