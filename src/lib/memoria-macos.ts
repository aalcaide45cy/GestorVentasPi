import { execFileSync } from "node:child_process";

/**
 * Memoria de macOS. `os.freemem()` solo cuenta las páginas totalmente libres: macOS usa casi toda la RAM como caché de archivos, así que
 * en un Mac con mucha memoria «libre» salía siempre casi llena. Se calcula como la Monitor de Actividad: memoria usada = memoria de
 * apps (páginas anónimas − purgables) + memoria cableada + memoria comprimida; el resto (caché de archivos, inactiva, purgable) es
 * disponible. Si `vm_stat` no trae las páginas anónimas, se suman libres + inactivas + especulativas + purgables.
 */

export interface MemoriaMac {
  totalBytes: number;
  disponibleBytes: number;
  swapTotalBytes: number;
  swapUsadoBytes: number;
}

/** Interpreta la salida de `vm_stat` (y, si se da, la de `sysctl -n vm.swapusage`) para una RAM total conocida. */
export function calcularMemoriaMac(vmStat: string, totalBytes: number, swapUsage = ""): MemoriaMac | null {
  const tamano = vmStat.match(/page size of (\d+) bytes/);
  if (!tamano) return null;
  const pagina = Number(tamano[1]);
  const paginas = (nombre: string): number | null => {
    const m = vmStat.match(new RegExp(`^${nombre}:\\s+(\\d+)\\.?`, "m"));
    return m ? Number(m[1]) : null;
  };
  const libres = paginas("Pages free");
  if (libres === null) return null;
  const inactivas = paginas("Pages inactive") ?? 0;
  const especulativas = paginas("Pages speculative") ?? 0;
  const purgables = paginas("Pages purgeable") ?? 0;
  const anonimas = paginas("Anonymous pages");
  const cableadas = paginas("Pages wired down");
  const comprimidas = paginas("Pages occupied by compressor");

  let disponible: number;
  if (anonimas !== null && cableadas !== null) {
    const usadas = Math.max(0, anonimas - purgables) + cableadas + (comprimidas ?? 0);
    disponible = totalBytes - usadas * pagina;
  } else {
    disponible = (libres + inactivas + especulativas + purgables) * pagina;
  }
  disponible = Math.max(0, Math.min(totalBytes, disponible));

  let swapTotalBytes = 0;
  let swapUsadoBytes = 0;
  const s = swapUsage.match(/total = ([\d.]+)([MGK])\s+used = ([\d.]+)([MGK])/);
  if (s) {
    const aBytes = (v: string, u: string) => Number(v) * (u === "G" ? 1024 ** 3 : u === "M" ? 1024 ** 2 : 1024);
    swapTotalBytes = aBytes(s[1], s[2]);
    swapUsadoBytes = aBytes(s[3], s[4]);
  }
  return { totalBytes, disponibleBytes: disponible, swapTotalBytes, swapUsadoBytes };
}

let cache: { en: number; valor: MemoriaMac | null } | null = null;

/** Lee `vm_stat` (con una vigencia de 3 s, porque el indicador de la barra superior pregunta cada 5 s). `null` fuera de macOS o si falla. */
export function memoriaMacOs(totalBytes: number): MemoriaMac | null {
  if (process.platform !== "darwin") return null;
  if (cache && Date.now() - cache.en < 3000) return cache.valor;
  let valor: MemoriaMac | null = null;
  try {
    const vm = execFileSync("vm_stat", [], { encoding: "utf8", timeout: 3000 });
    let swap = "";
    try {
      swap = execFileSync("sysctl", ["-n", "vm.swapusage"], { encoding: "utf8", timeout: 3000 });
    } catch {
      /* sin datos de swap */
    }
    valor = calcularMemoriaMac(vm, totalBytes, swap);
  } catch {
    valor = null;
  }
  cache = { en: Date.now(), valor };
  return valor;
}
