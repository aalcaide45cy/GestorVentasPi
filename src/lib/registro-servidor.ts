import { appendFile, readFile, rename, stat } from "node:fs/promises";
import path from "node:path";
import { format } from "node:util";
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

const G = globalThis as unknown as { __registroServidor?: boolean; __registroBytes?: number; __registroCola?: Promise<void> };

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

/** Empieza a guardar en el archivo lo que sale por `console` (una sola vez por proceso). */
export function instalarRegistroServidor(): void {
  if (G.__registroServidor) return;
  G.__registroServidor = true;
  for (const nivel of NIVELES) {
    const original = console[nivel].bind(console);
    console[nivel] = (...args: unknown[]) => {
      original(...args);
      let texto = format(...args);
      if (texto.length > MAX_LINEA) texto = `${texto.slice(0, MAX_LINEA)}… (recortado)`;
      // En cola, para que las entradas queden en el mismo orden en que se produjeron
      const linea = `${new Date().toISOString()} [${nivel === "log" ? "INFO" : nivel.toUpperCase()}] ${texto}\n`;
      G.__registroCola = (G.__registroCola ?? Promise.resolve()).then(() => escribir(linea));
    };
  }
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
