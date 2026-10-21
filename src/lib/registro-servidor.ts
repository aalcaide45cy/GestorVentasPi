import { appendFile, readFile, rename, stat } from "node:fs/promises";
import path from "node:path";
import { format } from "node:util";
import { emitirIncidencia } from "@/lib/incidencias-hook";
import type { OrigenIncidencia } from "@/lib/incidencias";
import { carpetaCopias } from "@/lib/mantenimiento";

/**
 * Registro del servidor dentro de la aplicación: lo que el programa escribe con `console.log/info/warn/error` se guarda también en un
 * archivo (en la carpeta de copias, que sobrevive a los reinicios y a las actualizaciones) para poder verlo, copiarlo o descargarlo
 * desde Configuración › BBDD › Registro del servidor sin entrar por SSH ni usar `docker logs`. El archivo se rota al llegar a 5 MB.
 */

const MAX_BYTES = 5 * 1024 * 1024;
const MAX_LINEA = 6000;
const NIVELES = ["log", "info", "warn", "error", "debug"] as const;
export type NivelRegistro = "todo" | "avisos" | "errores";

const G = globalThis as unknown as { __registroServidor?: boolean; __registroBytes?: number; __registroCola?: Promise<void>; __registroEnConsola?: boolean };

export const rutaRegistro = (): string => path.join(/*turbopackIgnore: true*/ carpetaCopias(), ".servidor.log");

async function escribir(texto: string): Promise<void> {
  try {
    const ruta = rutaRegistro();
    G.__registroBytes = (G.__registroBytes ?? (await stat(/*turbopackIgnore: true*/ ruta).then((s) => s.size).catch(() => 0))) + Buffer.byteLength(texto);
    if (G.__registroBytes > MAX_BYTES) {
      await rename(/*turbopackIgnore: true*/ ruta, `${ruta}.1`).catch(() => undefined);
      G.__registroBytes = Buffer.byteLength(texto);
    }
    await appendFile(/*turbopackIgnore: true*/ ruta, texto, { mode: 0o600 });
  } catch {
    /* sin carpeta o sin permiso: el registro es un extra, nunca debe romper nada */
  }
}

/** Pone una línea en cola para escribirla (en el mismo orden en que se produjo). */
function anotar(nivel: string, texto: string): void {
  let t = texto;
  if (t.length > MAX_LINEA) t = `${t.slice(0, MAX_LINEA)}… (recortado)`;
  const linea = `${new Date().toISOString()} [${nivel}] ${t}\n`;
  G.__registroCola = (G.__registroCola ?? Promise.resolve()).then(() => escribir(linea));
}

/**
 * Líneas que Next escribe por cada petición («GET /api/… 200 in 12ms») o al compilar («✓ Compiled in 3ms»): meterlas llenaría el registro de ruido.
 * Las de compilar, además, en desarrollo provocarían un bucle: el archivo del registro está dentro del proyecto, Next ve que cambia, vuelve a
 * compilar, lo anota y recarga la página otra vez.
 */
const RUIDO = /^\s*(?:GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS) \/\S*\s+\d{3}\b|^\s*$|^\s*[○✓◐●⚠⨯]\s|^\s*(?:Compiled|Compiling|Ready in|Starting|Restarting|Fast Refresh)\b/;
const ANSI = /\u001b\[[0-9;]*m/g;

/**
 * Empieza a guardar en el archivo lo que escribe el servidor (una sola vez por proceso). Se engancha a `console` (con su nivel exacto) y,
 * además, a la salida estándar y de errores: así también queda anotado lo que no pasa por el `console` que se parchó (Next puede
 * sustituirlo, sobre todo en desarrollo) y lo que escribe el propio Next. Lo que ya recogió `console` no se repite.
 */
export function instalarRegistroServidor(): void {
  if (G.__registroServidor) return;
  G.__registroServidor = true;
  for (const nivel of NIVELES) {
    const original = console[nivel].bind(console);
    console[nivel] = (...args: unknown[]) => {
      G.__registroEnConsola = true;
      try {
        original(...args);
      } finally {
        G.__registroEnConsola = false;
      }
      // Lo que Next escribe con `console` (peticiones, «✓ Compiled…») también es ruido, y en desarrollo anotarlo provoca el bucle de recompilar
      const texto = format(...args);
      if (!RUIDO.test(texto.replace(ANSI, "").split(/\r?\n/)[0])) {
        anotar(nivel === "log" ? "INFO" : nivel.toUpperCase(), texto);
        if (nivel === "error") incidenciaDeLinea(texto);
      }
    };
  }
  for (const [flujo, nivel] of [[process.stdout, "INFO"], [process.stderr, "ERROR"]] as const) {
    const escribirOriginal = flujo.write.bind(flujo) as (...a: unknown[]) => boolean;
    (flujo as unknown as { write: (...a: unknown[]) => boolean }).write = (chunk: unknown, ...resto: unknown[]) => {
      try {
        if (!G.__registroEnConsola) {
          const texto = (typeof chunk === "string" ? chunk : Buffer.isBuffer(chunk) || chunk instanceof Uint8Array ? Buffer.from(chunk).toString("utf8") : "").replace(ANSI, "");
          for (const l of texto.split(/\r?\n/)) if (l.trim() !== "" && !RUIDO.test(l)) anotar(nivel, l);
        }
      } catch {
        /* anotar nunca debe romper la salida */
      }
      return escribirOriginal(chunk, ...resto);
    };
  }
}

/**
 * Lo que sale con `console.error` también es una incidencia, salvo lo que ya se anota por su cuenta (errores de la API con su ruta y los propios avisos
 * de este sistema). El origen se deduce del texto: las tareas y las lecturas fallidas tienen el suyo.
 */
export function incidenciaDeLinea(texto: string): void {
  const t = texto.replace(ANSI, "");
  // «[browser]»: el servidor de desarrollo reenvía aquí los errores de la página; ya los avisa la propia página
  if (/^(Error no controlado en la API|Petición con error|No se pudo guardar una incidencia|\[browser\])/.test(t)) return;
  const origen: OrigenIncidencia = /^Tarea «/.test(t) ? "tarea" : /^Lectura de (pedido|pago|dni)/i.test(t) ? "lectura" : "servidor";
  const [primera, ...resto] = t.split(/\r?\n/);
  // Los avisos de Node («(node:1234) DeprecationWarning: …») llegan por la misma vía pero no son errores: salen como aviso, y sin el número de proceso
  // (que cambia en cada arranque y haría que el mismo aviso no se agrupara)
  const aviso = /^\(node:\d+\) (\w*Warning)\b/.exec(primera);
  if (aviso) {
    emitirIncidencia({ origen, nivel: "aviso", titulo: primera.replace(/^\(node:\d+\) /, ""), detalle: resto.length > 0 ? resto.join("\n") : null });
    return;
  }
  emitirIncidencia({ origen, titulo: primera, detalle: resto.length > 0 ? resto.join("\n") : null });
}

const INICIO_ENTRADA = /\n(?=\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z \[)/;

/** Últimas entradas del registro (cada una con sus líneas de continuación, como un error con su traza), filtradas. */
export async function leerRegistro(opciones: { lineas?: number; nivel?: NivelRegistro; texto?: string } = {}): Promise<{ entradas: string[]; bytes: number }> {
  const max = Math.min(Math.max(opciones.lineas ?? 500, 1), 5000);
  const ruta = rutaRegistro();
  let crudo = "";
  let bytes = 0;
  for (const r of [`${ruta}.1`, ruta]) {
    try {
      const t = await readFile(/*turbopackIgnore: true*/ r, "utf8");
      bytes += Buffer.byteLength(t);
      crudo += t.endsWith("\n") || t === "" ? t : `${t}\n`;
    } catch {
      /* todavía no existe */
    }
  }
  const nivel = opciones.nivel ?? "todo";
  const q = (opciones.texto ?? "").trim().toLowerCase();
  const entradas = crudo
    .split(INICIO_ENTRADA)
    .map((e) => e.trimEnd())
    .filter((e) => e !== "")
    .filter((e) => (nivel === "errores" ? / \[ERROR\] /.test(e.slice(0, 40)) : nivel === "avisos" ? / \[(ERROR|WARN)\] /.test(e.slice(0, 40)) : true))
    .filter((e) => q === "" || e.toLowerCase().includes(q));
  return { entradas: entradas.slice(-max), bytes };
}
