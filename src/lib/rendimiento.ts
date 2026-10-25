import { readFileSync, statfsSync } from "node:fs";
import { open, readFile, unlink } from "node:fs/promises";
import { monitorEventLoopDelay } from "node:perf_hooks";
import os from "node:os";
import path from "node:path";
import { sql } from "drizzle-orm";
import { emitirIncidencia } from "@/lib/incidencias-hook";
import { db } from "@/db";
import { carpetaCopias, enMantenimiento } from "@/lib/mantenimiento";
import { identidadEquipo, type IdentidadEquipo } from "@/lib/equipo";
import { memoriaMacOs } from "@/lib/memoria-macos";
import { aMegas } from "@/lib/memoria-bd";
import { swapPreocupa, textoConsecuenciaSwap } from "@/lib/swap";

export { swapPreocupa, textoConsecuenciaSwap };
import { consultasLentas, olvidarRendimiento, resumenPeticiones } from "@/lib/rendimiento-registro";
import { ajustesOcr } from "@/lib/servicios/ocr-ajustes";

/**
 * Diagnóstico de rendimiento para saber por qué va lento (sobre todo en la Raspberry Pi): CPU, memoria, swap, temperatura, límite por
 * temperatura o voltaje, disco (la tarjeta SD suele ser el cuello de botella), presión del sistema (PSI), la base de datos, las
 * lecturas de pedidos y las peticiones y consultas más lentas. Un muestreador anota el estado cada 30 s para ver picos y tendencias.
 * Todo se lee de /proc y /sys (solo Linux; en Windows salen menos datos) y no cambia nada.
 */

export interface Muestra {
  t: number;
  cpu: number;
  carga1: number;
  memLibrePct: number;
  swapMb: number;
  tempC: number | null;
  ioPct: number | null;
  psiCpu: number | null;
  psiIo: number | null;
  psiMem: number | null;
  procMb: number;
  lagMs: number;
}

interface Interno {
  historial: Muestra[];
  cpuAnterior: { reposo: number; total: number } | null;
  discoAnterior: { t: number; ticks: number; leidos: number; escritos: number } | null;
  cpuProcAnterior: { t: number; usuario: number; sistema: number } | null;
  lag: ReturnType<typeof monitorEventLoopDelay> | null;
  temporizador: ReturnType<typeof setInterval> | null;
  avisado: Map<string, number>;
}

const G = globalThis as unknown as { __rendimiento?: Interno };
const interno = (): Interno => (G.__rendimiento ??= { historial: [], cpuAnterior: null, discoAnterior: null, cpuProcAnterior: null, lag: null, temporizador: null, avisado: new Map() });

const MAX_MUESTRAS = 240; // 2 horas a una cada 30 s
const CADA_MS = 30_000;

function leer(ruta: string): string | null {
  try {
    return readFileSync(/*turbopackIgnore: true*/ ruta, "utf8");
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Lecturas del sistema                                                */
/* ------------------------------------------------------------------ */

function usoCpu(i: Interno): number {
  const t = os.cpus().reduce((a, c) => ({ reposo: a.reposo + c.times.idle, total: a.total + c.times.user + c.times.nice + c.times.sys + c.times.idle + c.times.irq }), { reposo: 0, total: 0 });
  const antes = i.cpuAnterior;
  i.cpuAnterior = t;
  if (!antes || t.total === antes.total) return 0;
  return Math.round(100 * (1 - (t.reposo - antes.reposo) / (t.total - antes.total)));
}

function memoria(): { totalMb: number; libreMb: number; swapTotalMb: number; swapUsadoMb: number; contenedor: { usadoMb: number; limiteMb: number | null } | null } {
  const txt = leer("/proc/meminfo");
  const kb = (clave: string): number | null => {
    const m = txt?.match(new RegExp(`^${clave}:\\s+(\\d+) kB`, "m"));
    return m ? Number(m[1]) : null;
  };
  const total = kb("MemTotal") ?? os.totalmem() / 1024;
  // En macOS `os.freemem()` solo cuenta las páginas libres del todo y la caché de archivos cuenta como usada: se calcula como Monitor de Actividad
  const mac = memoriaMacOs(os.totalmem());
  const libre = mac ? mac.disponibleBytes / 1024 : (kb("MemAvailable") ?? os.freemem() / 1024);
  const swapTotal = mac ? mac.swapTotalBytes / 1024 : (kb("SwapTotal") ?? 0);
  const swapLibre = mac ? (mac.swapTotalBytes - mac.swapUsadoBytes) / 1024 : (kb("SwapFree") ?? 0);
  // Dentro de un contenedor, lo que cuenta es el límite del propio contenedor (si lo tiene)
  const usoC = leer("/sys/fs/cgroup/memory.current") ?? leer("/sys/fs/cgroup/memory/memory.usage_in_bytes");
  const limC = (leer("/sys/fs/cgroup/memory.max") ?? leer("/sys/fs/cgroup/memory/memory.limit_in_bytes"))?.trim();
  const limite = limC && /^\d+$/.test(limC) && Number(limC) < 1e15 ? Number(limC) / 1024 / 1024 : null;
  return {
    totalMb: Math.round(total / 1024),
    libreMb: Math.round(libre / 1024),
    swapTotalMb: Math.round(swapTotal / 1024),
    swapUsadoMb: Math.round((swapTotal - swapLibre) / 1024),
    contenedor: usoC && /^\d+$/.test(usoC.trim()) ? { usadoMb: Math.round(Number(usoC.trim()) / 1024 / 1024), limiteMb: limite === null ? null : Math.round(limite) } : null,
  };
}

function temperatura(): number | null {
  const t = leer("/sys/class/thermal/thermal_zone0/temp");
  const n = t ? Number(t.trim()) : NaN;
  return Number.isFinite(n) ? Math.round(n / 100) / 10 : null;
}

export interface Limitacion {
  /** Valor crudo (bits de `get_throttled` de la Raspberry Pi). */
  valor: number;
  ahora: string[];
  desdeElArranque: string[];
}

/** La Raspberry Pi avisa de si está limitando la velocidad por poca tensión o por calor: bits de `get_throttled`. */
function limitacion(): Limitacion | null {
  for (const r of ["/sys/devices/platform/soc/soc:firmware/get_throttled", "/sys/devices/platform/soc/soc:firmware/raspberrypi-hwmon/hwmon/hwmon0/in0_lcrit_alarm"]) {
    const t = leer(r);
    if (t === null || !/^(0x)?[0-9a-fA-F]+$/.test(t.trim())) continue;
    const v = parseInt(t.trim(), 16);
    const nombres: [number, string][] = [
      [0, "tensión de alimentación baja (la fuente no da lo suficiente)"],
      [1, "frecuencia del procesador limitada"],
      [2, "velocidad reducida por temperatura o tensión"],
      [3, "límite de temperatura blando alcanzado"],
    ];
    return { valor: v, ahora: nombres.filter(([b]) => v & (1 << b)).map(([, n]) => n), desdeElArranque: nombres.filter(([b]) => v & (1 << (b + 16))).map(([, n]) => n) };
  }
  return null;
}

function presion(tipo: "cpu" | "io" | "memory"): number | null {
  const m = leer(`/proc/pressure/${tipo}`)?.match(/^some avg10=([\d.]+)/m);
  return m ? Number(m[1]) : null;
}

function disco(i: Interno): { dispositivo: string | null; ioPct: number | null; leidoMBs: number | null; escritoMBs: number | null } {
  const txt = leer("/proc/diskstats");
  if (!txt) return { dispositivo: null, ioPct: null, leidoMBs: null, escritoMBs: null };
  // Discos enteros (mmcblk0, nvme0n1, sda…), no particiones: se toma el que más tiempo lleva ocupado
  let mejor: { nombre: string; ticks: number; leidos: number; escritos: number } | null = null;
  for (const l of txt.split("\n")) {
    const c = l.trim().split(/\s+/);
    if (c.length < 14) continue;
    const nombre = c[2];
    if (!/^(mmcblk\d+|nvme\d+n\d+|sd[a-z]+|vd[a-z]+)$/.test(nombre)) continue;
    const ticks = Number(c[12]);
    if (!mejor || ticks > mejor.ticks) mejor = { nombre, ticks, leidos: Number(c[5]), escritos: Number(c[9]) };
  }
  if (!mejor) return { dispositivo: null, ioPct: null, leidoMBs: null, escritoMBs: null };
  const ahora = Date.now();
  const antes = i.discoAnterior;
  i.discoAnterior = { t: ahora, ticks: mejor.ticks, leidos: mejor.leidos, escritos: mejor.escritos };
  if (!antes || ahora <= antes.t) return { dispositivo: mejor.nombre, ioPct: null, leidoMBs: null, escritoMBs: null };
  const dt = ahora - antes.t;
  return {
    dispositivo: mejor.nombre,
    ioPct: Math.min(100, Math.round(((mejor.ticks - antes.ticks) / dt) * 100)),
    leidoMBs: Math.round((((mejor.leidos - antes.leidos) * 512) / 1024 / 1024 / (dt / 1000)) * 10) / 10,
    escritoMBs: Math.round((((mejor.escritos - antes.escritos) * 512) / 1024 / 1024 / (dt / 1000)) * 10) / 10,
  };
}

function medirMuestra(i: Interno): Muestra {
  const m = memoria();
  const d = disco(i);
  const lag = i.lag ? Math.round((i.lag.max / 1e6) * 10) / 10 : 0;
  i.lag?.reset();
  return {
    t: Date.now(),
    cpu: usoCpu(i),
    carga1: Math.round(os.loadavg()[0] * 100) / 100,
    memLibrePct: Math.round((m.libreMb / Math.max(1, m.totalMb)) * 100),
    swapMb: m.swapUsadoMb,
    tempC: temperatura(),
    ioPct: d.ioPct,
    psiCpu: presion("cpu"),
    psiIo: presion("io"),
    psiMem: presion("memory"),
    procMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
    lagMs: lag,
  };
}

/* ------------------------------------------------------------------ */
/* Muestreador                                                         */
/* ------------------------------------------------------------------ */

function avisarSiHaceFalta(i: Interno, s: Muestra, lim: Limitacion | null): void {
  const avisar = (clave: string, texto: string) => {
    const ultimo = i.avisado.get(clave) ?? 0;
    if (Date.now() - ultimo < 10 * 60_000) return; // como mucho cada 10 minutos
    i.avisado.set(clave, Date.now());
    console.warn(`Rendimiento: ${texto}`);
    emitirIncidencia({ origen: "equipo", nivel: "aviso", titulo: texto });
  };
  if (s.tempC !== null && s.tempC >= 80) avisar("temp", `temperatura alta (${s.tempC} °C): el procesador reduce la velocidad`);
  if (lim && lim.ahora.length > 0) avisar("limite", `la Raspberry está limitando la velocidad: ${lim.ahora.join("; ")}`);
  if (s.memLibrePct <= 8) avisar("mem", `poca memoria libre (${s.memLibrePct} %)`);
  if (swapPreocupa({ plataforma: process.platform, swapUsadoMb: s.swapMb, memLibrePct: s.memLibrePct })) avisar("swap", `se está usando la memoria de intercambio en disco (${s.swapMb} MB): todo va mucho más lento`);
  if ((s.psiIo ?? 0) >= 25) avisar("psi-io", `el sistema pasa un ${s.psiIo} % del tiempo esperando al disco (la tarjeta SD puede ser el cuello de botella)`);
  if ((s.ioPct ?? 0) >= 90) avisar("io", `el disco está al ${s.ioPct} % de uso`);
  if (s.cpu >= 95) avisar("cpu", `CPU al ${s.cpu} %`);
  if (s.lagMs >= 500) avisar("lag", `el servidor se quedó bloqueado ${s.lagMs} ms sin atender peticiones`);
}

/**
 * «Contar desde ahora»: olvida el historial de mediciones, las peticiones y consultas lentas anotadas y los avisos ya dados, y pone a cero los contadores de
 * PostgreSQL (el acierto de caché, que una restauración o una carga grande dejan bajo durante días). No toca ningún dato. Devuelve si PostgreSQL dejó reiniciar los suyos y, si no, cómo darle el permiso.
 */
export async function reiniciarRendimiento(): Promise<{ contadoresBd: boolean; ayuda: string | null }> {
  const i = interno();
  i.historial.length = 0;
  i.avisado.clear();
  olvidarRendimiento();
  try {
    await db.execute(sql`select pg_stat_reset()`);
    return { contadoresBd: true, ayuda: null };
  } catch {
    // Solo un administrador de PostgreSQL puede ejecutarlo: se dice cómo darle el permiso al usuario de la aplicación
    let usuario = "el usuario de la aplicación";
    let bd = "la base de datos";
    try {
      const [f] = (await db.execute(sql`select current_user as u, current_database() as b`)).rows as { u: string; b: string }[];
      usuario = f.u;
      bd = f.b;
    } catch {
      /* sin los nombres, la ayuda sale genérica */
    }
    return { contadoresBd: false, ayuda: `PostgreSQL no deja que «${usuario}» ponga a cero sus contadores. Un administrador de PostgreSQL tiene que ejecutar una vez: psql -d ${bd} -c "GRANT EXECUTE ON FUNCTION pg_stat_reset() TO ${usuario};"` };
  }
}

/** Empieza a medir el equipo cada 30 s (una sola vez por proceso). */
export function iniciarMuestreo(): void {
  const i = interno();
  if (i.temporizador) return;
  try {
    i.lag = monitorEventLoopDelay({ resolution: 20 });
    i.lag.enable();
  } catch {
    i.lag = null;
  }
  const tomar = () => {
    try {
      const s = medirMuestra(i);
      i.historial.push(s);
      if (i.historial.length > MAX_MUESTRAS) i.historial.splice(0, i.historial.length - MAX_MUESTRAS);
      avisarSiHaceFalta(i, s, limitacion());
    } catch {
      /* medir nunca debe tumbar el servidor */
    }
  };
  tomar();
  i.temporizador = setInterval(tomar, CADA_MS);
  i.temporizador.unref?.();
}

export const historial = (): Muestra[] => [...interno().historial];

/* ------------------------------------------------------------------ */
/* Base de datos                                                       */
/* ------------------------------------------------------------------ */

export interface InfoBd {
  version: string;
  tamanoMb: number;
  conexiones: { activas: number; esperando: number; ociosas: number; maximo: number };
  aciertoCachePct: number | null;
  sharedBuffers: string;
  latenciaMs: number;
  consultasActivas: { pid: number; segundos: number; estado: string; espera: string | null; sql: string }[];
  tablasGrandes: { tabla: string; mb: number; filasMuertas: number }[];
}

/** Espera a una consulta, pero no más de `ms`: el diagnóstico no puede quedarse colgado si la base de datos está bloqueada o saturada. */
function conLimite<T>(consulta: Promise<T>, ms: number, alAgotarse: T): Promise<T> {
  return new Promise((resolver, rechazar) => {
    const t = setTimeout(() => resolver(alAgotarse), ms);
    consulta.then(
      (v) => {
        clearTimeout(t);
        resolver(v);
      },
      (e) => {
        clearTimeout(t);
        rechazar(e);
      },
    );
  });
}

const LIMITE_BD_MS = 5000;

async function infoBd(): Promise<InfoBd | { error: string }> {
  return conLimite(infoBdSinLimite(), LIMITE_BD_MS, { error: `La base de datos no ha respondido en ${LIMITE_BD_MS / 1000} s: está muy ocupada o bloqueada.` });
}

async function infoBdSinLimite(): Promise<InfoBd | { error: string }> {
  try {
    const t0 = performance.now();
    await db.execute(sql`select 1`);
    const latenciaMs = Math.round((performance.now() - t0) * 10) / 10;
    const una = async <T>(q: ReturnType<typeof sql>): Promise<T[]> => (await db.execute(q)).rows as T[];
    const [gen] = await una<{ version: string; tamano: string; maximo: string; sb: string }>(sql`select version() as version, pg_database_size(current_database()) as tamano, current_setting('max_connections') as maximo, current_setting('shared_buffers') as sb`);
    const con = await una<{ state: string | null; wait_event_type: string | null; n: string }>(sql`select state, wait_event_type, count(*) as n from pg_stat_activity where datname = current_database() group by 1, 2`);
    const [cache] = await una<{ pct: string | null }>(sql`select round(100.0 * sum(blks_hit) / nullif(sum(blks_hit + blks_read), 0), 1) as pct from pg_stat_database where datname = current_database()`);
    const activas = await una<{ pid: number; seg: string; state: string; we: string | null; q: string }>(
      sql`select pid, extract(epoch from now() - query_start) as seg, state, wait_event as we, left(regexp_replace(query, '\s+', ' ', 'g'), 300) as q from pg_stat_activity where datname = current_database() and state <> 'idle' and pid <> pg_backend_pid() order by query_start limit 10`,
    );
    const tablas = await una<{ tabla: string; bytes: string; muertas: string }>(
      sql`select c.relname as tabla, pg_total_relation_size(c.oid) as bytes, coalesce(s.n_dead_tup, 0) as muertas from pg_class c left join pg_stat_user_tables s on s.relid = c.oid where c.relkind = 'r' and c.relnamespace = 'public'::regnamespace order by pg_total_relation_size(c.oid) desc limit 8`,
    );
    const cuenta = (f: (c: (typeof con)[number]) => boolean) => con.filter(f).reduce((a, c) => a + Number(c.n), 0);
    return {
      version: gen.version.split(",")[0],
      tamanoMb: Math.round(Number(gen.tamano) / 1024 / 1024),
      conexiones: { activas: cuenta((c) => c.state === "active"), esperando: cuenta((c) => c.wait_event_type === "Lock"), ociosas: cuenta((c) => c.state === "idle"), maximo: Number(gen.maximo) },
      aciertoCachePct: cache?.pct === null || cache?.pct === undefined ? null : Number(cache.pct),
      sharedBuffers: gen.sb,
      latenciaMs,
      consultasActivas: activas.map((a) => ({ pid: a.pid, segundos: Math.round(Number(a.seg) * 10) / 10, estado: a.state, espera: a.we, sql: a.q })),
      tablasGrandes: tablas.map((t) => ({ tabla: t.tabla, mb: Math.round((Number(t.bytes) / 1024 / 1024) * 10) / 10, filasMuertas: Number(t.muertas) })),
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo consultar la base de datos" };
  }
}

/* ------------------------------------------------------------------ */
/* Recursos rápidos (el indicador de la barra superior)                */
/* ------------------------------------------------------------------ */

export interface Recursos {
  cpu: number;
  memoriaUsadaPct: number;
  memoriaLibreMb: number;
  memoriaTotalMb: number;
  swapMb: number;
  tempC: number | null;
  discoLeidoMBs: number | null;
  discoEscritoMBs: number | null;
  discoPct: number | null;
  /** «ok», «aviso» o «alto»: el peor de los medidores. */
  nivel: "ok" | "aviso" | "alto";
  /** Qué medidor da el aviso, en una frase. */
  motivo: string | null;
  /** Qué equipo es: nombre, tipo (AMD, Intel, Apple, Raspberry) y detalle. */
  equipo: IdentidadEquipo;
}

const GR = globalThis as unknown as { __recursosRapidos?: Interno };

/**
 * Lectura barata para el indicador fijo de la barra superior (se pide cada pocos segundos): CPU, memoria, temperatura y lectura y
 * escritura del disco. Lleva su propio estado, para que las diferencias se calculen entre sus propias peticiones.
 */
export function recursosRapidos(): Recursos {
  const i = (GR.__recursosRapidos ??= { historial: [], cpuAnterior: null, discoAnterior: null, cpuProcAnterior: null, lag: null, temporizador: null, avisado: new Map() });
  const m = memoria();
  const d = disco(i);
  const cpu = usoCpu(i);
  const tempC = temperatura();
  const usada = 100 - Math.round((m.libreMb / Math.max(1, m.totalMb)) * 100);
  let nivel: Recursos["nivel"] = "ok";
  let motivo: string | null = null;
  const marcar = (n: "aviso" | "alto", t: string) => {
    if (nivel === "alto" || (nivel === "aviso" && n === "aviso")) return;
    nivel = n;
    motivo = t;
  };
  const lim = limitacion();
  if (lim && lim.ahora.length > 0) marcar("alto", `Limitando la velocidad: ${lim.ahora[0]}`);
  if (cpu >= 90) marcar("alto", `CPU al ${cpu} %`);
  else if (cpu >= 70) marcar("aviso", `CPU al ${cpu} %`);
  const swapMal = swapPreocupa({ plataforma: process.platform, swapUsadoMb: m.swapUsadoMb, memLibrePct: 100 - usada });
  if (usada >= 90 || swapMal) marcar("alto", swapMal ? `Usando ${m.swapUsadoMb} MB de swap (disco como memoria)` : `Memoria al ${usada} %`);
  else if (usada >= 80) marcar("aviso", `Memoria al ${usada} %`);
  if ((tempC ?? 0) >= 80) marcar("alto", `Temperatura ${tempC} °C`);
  else if ((tempC ?? 0) >= 70) marcar("aviso", `Temperatura ${tempC} °C`);
  if ((d.ioPct ?? 0) >= 90) marcar("alto", `Disco al ${d.ioPct} %`);
  else if ((d.ioPct ?? 0) >= 70) marcar("aviso", `Disco al ${d.ioPct} %`);
  return { cpu, memoriaUsadaPct: usada, memoriaLibreMb: m.libreMb, memoriaTotalMb: m.totalMb, swapMb: m.swapUsadoMb, tempC, discoLeidoMBs: d.leidoMBs, discoEscritoMBs: d.escritoMBs, discoPct: d.ioPct, nivel, motivo, equipo: identidadEquipo() };
}

/* ------------------------------------------------------------------ */
/* Instantánea                                                         */
/* ------------------------------------------------------------------ */

export interface Hallazgo {
  nivel: "alto" | "medio" | "info";
  texto: string;
}

export interface Instantanea {
  generadaEn: number;
  equipo: { plataforma: string; arquitectura: string; nucleos: number; modelo: string | null; nodo: string; arrancadoHaceMin: number; tiempoServidorMin: number; identidad: IdentidadEquipo };
  muestra: Muestra;
  memoria: ReturnType<typeof memoria>;
  disco: ReturnType<typeof disco> & { libreGb: number | null; totalGb: number | null; carpeta: string };
  limitacion: Limitacion | null;
  proceso: { rssMb: number; heapMb: number; cpuPct: number };
  lecturas: { pendientes: number; leyendo: number; motor: string; simultaneas: number } | null;
  trabajos: { restauracionEnCurso: boolean };
  bd: InfoBd | { error: string };
  hallazgos: Hallazgo[];
}

function cpuProceso(i: Interno): number {
  const u = process.cpuUsage();
  const ahora = Date.now();
  const antes = i.cpuProcAnterior;
  i.cpuProcAnterior = { t: ahora, usuario: u.user, sistema: u.system };
  if (!antes || ahora <= antes.t) return 0;
  const usado = (u.user - antes.usuario + (u.system - antes.sistema)) / 1000; // ms de CPU
  return Math.round((usado / (ahora - antes.t) / os.availableParallelism()) * 100);
}

export async function instantanea(): Promise<Instantanea> {
  const i = interno();
  iniciarMuestreo();
  const muestra = medirMuestra(i);
  const m = memoria();
  const d = disco(i);
  const lim = limitacion();
  const carpeta = carpetaCopias();
  let libreGb: number | null = null;
  let totalGb: number | null = null;
  try {
    const f = statfsSync(/*turbopackIgnore: true*/ carpeta);
    libreGb = Math.round(((f.bavail * f.bsize) / 1024 ** 3) * 10) / 10;
    totalGb = Math.round(((f.blocks * f.bsize) / 1024 ** 3) * 10) / 10;
  } catch {
    /* sin datos */
  }
  const bd = await infoBd();
  let lecturas: Instantanea["lecturas"] = null;
  try {
    const filas = await conLimite(
      db.execute(sql`select estado, count(*)::int as n from lecturas_pedidos where estado in ('pendiente', 'leyendo') group by estado`).then((r) => r.rows as { estado: string; n: number }[]),
      LIMITE_BD_MS,
      [] as { estado: string; n: number }[],
    );
    const a = ajustesOcr();
    lecturas = { pendientes: filas.find((f) => f.estado === "pendiente")?.n ?? 0, leyendo: filas.find((f) => f.estado === "leyendo")?.n ?? 0, motor: a.motor, simultaneas: a.simultaneas };
  } catch {
    lecturas = null;
  }
  const modelo = leer("/proc/device-tree/model")?.replace(/\0/g, "").trim() ?? null;
  const proceso = { rssMb: Math.round(process.memoryUsage().rss / 1024 / 1024), heapMb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024), cpuPct: cpuProceso(i) };
  const base: Omit<Instantanea, "hallazgos"> = {
    generadaEn: Date.now(),
    equipo: { plataforma: process.platform, arquitectura: process.arch, nucleos: os.availableParallelism(), modelo, nodo: process.version, arrancadoHaceMin: Math.round(os.uptime() / 60), tiempoServidorMin: Math.round(process.uptime() / 60), identidad: identidadEquipo() },
    muestra,
    memoria: m,
    disco: { ...d, libreGb, totalGb, carpeta },
    limitacion: lim,
    proceso,
    lecturas,
    trabajos: { restauracionEnCurso: enMantenimiento() },
    bd,
  };
  return { ...base, hallazgos: analizar(base, i.historial) };
}

/* ------------------------------------------------------------------ */
/* Qué parece estar pasando                                            */
/* ------------------------------------------------------------------ */

function analizar(s: Omit<Instantanea, "hallazgos">, hist: Muestra[]): Hallazgo[] {
  const h: Hallazgo[] = [];
  const reciente = hist.slice(-10);
  const max = (f: (x: Muestra) => number | null): number => Math.max(0, ...reciente.map((x) => f(x) ?? 0));
  const m = s.muestra;

  if (s.limitacion && s.limitacion.ahora.length > 0) h.push({ nivel: "alto", texto: `La Raspberry está limitando la velocidad ahora mismo: ${s.limitacion.ahora.join("; ")}. Si es por tensión, hay que cambiar la fuente de alimentación (la oficial da 5,1 V y 3 A); si es por calor, falta ventilación o disipador.` });
  else if (s.limitacion && s.limitacion.desdeElArranque.length > 0) h.push({ nivel: "medio", texto: `Desde el último arranque la Raspberry ha tenido que limitar la velocidad: ${s.limitacion.desdeElArranque.join("; ")}. Revisa la fuente de alimentación y la refrigeración.` });
  const temp = Math.max(m.tempC ?? 0, max((x) => x.tempC));
  if (temp >= 80) h.push({ nivel: "alto", texto: `Temperatura muy alta (${temp} °C): el procesador baja su velocidad. Falta refrigeración (disipador o ventilador).` });
  else if (temp >= 70) h.push({ nivel: "medio", texto: `Temperatura alta (${temp} °C): cerca del punto en que el procesador empieza a frenarse (80 °C).` });

  if (swapPreocupa({ plataforma: process.platform, swapUsadoMb: s.memoria.swapUsadoMb, memLibrePct: m.memLibrePct })) h.push({ nivel: "alto", texto: `Se está usando la memoria de intercambio (${s.memoria.swapUsadoMb} MB): ${textoConsecuenciaSwap(s.equipo.identidad.tipo)}. Baja los «Pedidos que se leen a la vez» a 1 o 2 y no leas lotes grandes mientras se usa la aplicación.` });
  else if (m.memLibrePct <= 10) h.push({ nivel: "alto", texto: `Queda muy poca memoria libre (${m.memLibrePct} %). Cualquier lectura de pedidos o copia grande puede dejar el sistema sin memoria.` });
  else if (m.memLibrePct <= 20) h.push({ nivel: "medio", texto: `Memoria libre baja (${m.memLibrePct} %).` });
  if (s.memoria.contenedor?.limiteMb && s.memoria.contenedor.usadoMb > s.memoria.contenedor.limiteMb * 0.9) h.push({ nivel: "alto", texto: `La aplicación usa ${s.memoria.contenedor.usadoMb} MB de los ${s.memoria.contenedor.limiteMb} MB que tiene permitidos: está a punto de quedarse sin memoria.` });

  const psiIo = Math.max(m.psiIo ?? 0, max((x) => x.psiIo));
  const ioPct = Math.max(m.ioPct ?? 0, max((x) => x.ioPct));
  if (psiIo >= 25 || ioPct >= 85) h.push({ nivel: "alto", texto: `El disco es el cuello de botella: los procesos pasan un ${psiIo || "—"} % del tiempo esperando al disco y este está al ${ioPct} % de uso. Es típico de una tarjeta SD lenta o saturada (copias, lecturas de pedidos o la base de datos a la vez). Una SD de clase A2 o un SSD por USB lo arregla.` });
  else if (psiIo >= 10) h.push({ nivel: "medio", texto: `El disco hace esperar bastante a los procesos (${psiIo} % del tiempo).` });

  const cpu = Math.max(m.cpu, max((x) => x.cpu));
  if (cpu >= 90) {
    const lect = s.lecturas && (s.lecturas.leyendo > 0 || s.lecturas.pendientes > 0);
    h.push({ nivel: "alto", texto: `La CPU está al ${cpu} %.${lect ? ` Hay lecturas de pedidos en marcha (${s.lecturas!.leyendo} leyendo, ${s.lecturas!.pendientes} en espera): es lo que más gasta. Baja los «Pedidos que se leen a la vez» en Configuración › BBDD › Sistema (1 o 2 en una Raspberry).` : ""}` });
  } else if (cpu >= 70) h.push({ nivel: "medio", texto: `CPU alta (${cpu} %).` });
  if (m.carga1 > s.equipo.nucleos * 1.5) h.push({ nivel: "medio", texto: `Carga media del sistema alta (${m.carga1} con ${s.equipo.nucleos} núcleos): hay más trabajo del que el equipo puede atender a la vez.` });
  const lag = Math.max(m.lagMs, max((x) => x.lagMs));
  if (lag >= 300) h.push({ nivel: "alto", texto: `El servidor se queda bloqueado hasta ${lag} ms sin atender a nadie (algo pesado ocupa el programa). Se nota como pantallas que tardan en responder.` });

  if (s.lecturas && s.lecturas.leyendo > 0 && s.equipo.arquitectura === "arm64") h.push({ nivel: "info", texto: `Hay ${s.lecturas.leyendo} pedidos leyéndose ahora (motor ${s.lecturas.motor}, ${s.lecturas.simultaneas === 0 ? "a la vez: automático" : `${s.lecturas.simultaneas} a la vez`}). Mientras lee, la aplicación va más lenta.` });
  if (s.trabajos.restauracionEnCurso) h.push({ nivel: "info", texto: "Hay una restauración de copia en curso." });

  if ("error" in s.bd) h.push({ nivel: "alto", texto: `No se puede consultar la base de datos: ${s.bd.error}` });
  else {
    if (s.bd.latenciaMs >= 50) h.push({ nivel: "alto", texto: `La base de datos tarda ${s.bd.latenciaMs} ms en responder a una consulta mínima (lo normal es menos de 5 ms).` });
    const larga = s.bd.consultasActivas.find((c) => c.segundos >= 5);
    if (larga) h.push({ nivel: "alto", texto: `Hay una consulta a la base de datos que lleva ${larga.segundos} s en marcha: ${larga.sql.slice(0, 120)}` });
    if (s.bd.conexiones.esperando > 0) h.push({ nivel: "medio", texto: `${s.bd.conexiones.esperando} consulta(s) esperando un bloqueo de otra.` });
    if (s.bd.aciertoCachePct !== null && s.bd.aciertoCachePct < 95) {
      const sbMb = aMegas(s.bd.sharedBuffers);
      // Si la base de datos cabe entera en su memoria, ese porcentaje es solo una estadística acumulada (restauraciones, cargas grandes): no falta memoria
      if (sbMb !== null && s.bd.tamanoMb < sbMb) h.push({ nivel: "info", texto: `El acierto de caché de la base de datos marca ${s.bd.aciertoCachePct} %, pero la base de datos (${s.bd.tamanoMb} MB) cabe entera en su memoria (${s.bd.sharedBuffers}): es una estadística acumulada desde el último reinicio de los contadores y se normaliza con el uso. Puedes pulsar «Contar desde ahora».` });
      else h.push({ nivel: "medio", texto: `La base de datos acierta ${s.bd.aciertoCachePct} % de las lecturas en memoria (lo sano es más del 99 %): lee mucho del disco. Puede faltar memoria para la base de datos (shared_buffers = ${s.bd.sharedBuffers}).` });
    }
    const muertas = s.bd.tablasGrandes.filter((t) => t.filasMuertas > 20000);
    if (muertas.length > 0) h.push({ nivel: "medio", texto: `Hay muchas filas muertas sin limpiar en ${muertas.map((t) => t.tabla).join(", ")}: conviene «Compactar base de datos» en Herramientas › Papelera.` });
  }
  if (s.disco.libreGb !== null && s.disco.totalGb) {
    const pct = (s.disco.libreGb / s.disco.totalGb) * 100;
    if (s.disco.libreGb < 2 || pct < 5) h.push({ nivel: "alto", texto: `Queda muy poco espacio en disco (${s.disco.libreGb} GB libres de ${s.disco.totalGb} GB): la base de datos y las copias pueden fallar o ir muy lentas.` });
    else if (pct < 15) h.push({ nivel: "medio", texto: `Queda poco espacio en disco (${s.disco.libreGb} GB libres de ${s.disco.totalGb} GB). Borra copias antiguas o purga la papelera.` });
  }
  const pet = resumenPeticiones(30, 5);
  const lenta = pet.rutas.find((r) => r.mediaMs >= 1500 && r.veces >= 3);
  if (lenta) h.push({ nivel: "medio", texto: `La ruta ${lenta.metodo} ${lenta.ruta} tarda de media ${lenta.mediaMs} ms (${lenta.veces} veces en la última media hora).` });

  if (h.length === 0) h.push({ nivel: "info", texto: "No se ve ningún problema claro ahora mismo. Si va lenta en un momento concreto, deja «Actualizar solo» activado y mira aquí justo cuando ocurra (o pulsa «Copiar informe» en ese momento y pégamelo)." });
  const orden = { alto: 0, medio: 1, info: 2 } as const;
  return h.sort((a, b) => orden[a.nivel] - orden[b.nivel]);
}

/* ------------------------------------------------------------------ */
/* Pruebas activas                                                     */
/* ------------------------------------------------------------------ */

export interface PruebaDisco {
  carpeta: string;
  escrituraMBs: number;
  lecturaMBs: number;
  escriturasSyncPorSeg: number;
  latenciaSyncMs: number;
  veredicto: string;
}

/**
 * Mide la velocidad real del disco donde viven la base de datos y las copias: escribe un archivo de prueba de 64 MB (y lo borra),
 * lo lee y hace 100 escrituras pequeñas con sincronización (lo que hace la base de datos al guardar). Solo toca su propio archivo.
 * Es asíncrona para no bloquear al servidor mientras dura (en una SD lenta pueden ser varios segundos).
 */
export async function probarDisco(): Promise<PruebaDisco> {
  const carpeta = carpetaCopias();
  const ruta = path.join(/*turbopackIgnore: true*/ carpeta, ".prueba-disco.tmp");
  const trozo = Buffer.alloc(1024 * 1024, 7);
  const MB = 64;
  try {
    let t0 = performance.now();
    const fh = await open(/*turbopackIgnore: true*/ ruta, "w", 0o600);
    for (let i = 0; i < MB; i++) await fh.write(trozo);
    await fh.sync();
    await fh.close();
    const escrituraMBs = MB / ((performance.now() - t0) / 1000);

    t0 = performance.now();
    const lectura = await readFile(/*turbopackIgnore: true*/ ruta);
    const lecturaMBs = lectura.length / 1024 / 1024 / ((performance.now() - t0) / 1000);

    const pequeno = Buffer.alloc(4096, 1);
    const fh2 = await open(/*turbopackIgnore: true*/ ruta, "r+");
    t0 = performance.now();
    const N = 100;
    for (let i = 0; i < N; i++) {
      await fh2.write(pequeno, 0, pequeno.length, i * 4096);
      await fh2.datasync();
    }
    const seg = (performance.now() - t0) / 1000;
    await fh2.close();
    const r = { carpeta, escrituraMBs: Math.round(escrituraMBs * 10) / 10, lecturaMBs: Math.round(lecturaMBs * 10) / 10, escriturasSyncPorSeg: Math.round(N / seg), latenciaSyncMs: Math.round((seg / N) * 1000 * 10) / 10 };
    const veredicto =
      r.escrituraMBs < 10 || r.latenciaSyncMs > 30
        ? "Disco MUY lento: es casi seguro la causa de la lentitud. Una tarjeta SD buena (A2) o un SSD por USB mejoraría mucho la base de datos."
        : r.escrituraMBs < 25 || r.latenciaSyncMs > 10
          ? "Disco justo: típico de una tarjeta SD normal. Aguanta, pero se nota cuando hay copias o lecturas de pedidos a la vez."
          : "Disco rápido: no parece ser el problema.";
    return { ...r, veredicto };
  } finally {
    await unlink(/*turbopackIgnore: true*/ ruta).catch(() => undefined);
  }
}

export interface PruebaBd {
  consultaMinimaMs: number;
  consultaMinimaMaxMs: number;
  contarExpedientesMs: number;
  listarClientesMs: number;
  veredicto: string;
}

/** Mide la latencia de la base de datos: 30 consultas mínimas y dos consultas típicas de la aplicación. */
export async function probarBd(): Promise<PruebaBd> {
  const tiempos: number[] = [];
  for (let i = 0; i < 30; i++) {
    const t0 = performance.now();
    await db.execute(sql`select 1`);
    tiempos.push(performance.now() - t0);
  }
  let t0 = performance.now();
  await db.execute(sql`select count(*) from expedientes`);
  const contar = performance.now() - t0;
  t0 = performance.now();
  await db.execute(sql`select id, nombre, dni from clientes order by nombre limit 200`);
  const listar = performance.now() - t0;
  const media = tiempos.reduce((a, b) => a + b, 0) / tiempos.length;
  const r = { consultaMinimaMs: Math.round(media * 10) / 10, consultaMinimaMaxMs: Math.round(Math.max(...tiempos) * 10) / 10, contarExpedientesMs: Math.round(contar * 10) / 10, listarClientesMs: Math.round(listar * 10) / 10 };
  const veredicto = r.consultaMinimaMs > 50 || r.contarExpedientesMs > 500 ? "La base de datos va lenta: mira la memoria libre, el disco y las consultas activas." : r.consultaMinimaMs > 10 ? "La base de datos responde, pero con más retraso del normal." : "La base de datos responde bien.";
  return { ...r, veredicto };
}

/* ------------------------------------------------------------------ */
/* Informe para copiar                                                 */
/* ------------------------------------------------------------------ */

const hora = (t: number) => new Date(t).toLocaleTimeString("es-ES", { hour12: false });

/** Todo lo anterior como un texto plano para pegar en una conversación o un correo. */
export function informeTexto(s: Instantanea, registroReciente: string[]): string {
  const L: string[] = [];
  const b = (x: boolean | null | undefined) => (x ? "sí" : "no");
  L.push(`INFORME DE RENDIMIENTO · ${new Date(s.generadaEn).toLocaleString("es-ES")}`);
  L.push(`Equipo: ${s.equipo.identidad.nombre || "(sin nombre)"} [${s.equipo.identidad.tipo}] · ${s.equipo.identidad.detalle} · ${s.equipo.modelo ?? "—"} · ${s.equipo.plataforma}/${s.equipo.arquitectura} · ${s.equipo.nucleos} núcleos · Node ${s.equipo.nodo} · encendido hace ${s.equipo.arrancadoHaceMin} min · servidor arrancado hace ${s.equipo.tiempoServidorMin} min`);
  L.push("");
  L.push("== Qué parece estar pasando ==");
  for (const h of s.hallazgos) L.push(`[${h.nivel.toUpperCase()}] ${h.texto}`);
  L.push("");
  L.push("== Ahora ==");
  const m = s.muestra;
  L.push(`CPU ${m.cpu} % · carga ${m.carga1} · memoria libre ${m.memLibrePct} % (${s.memoria.libreMb} de ${s.memoria.totalMb} MB) · swap usado ${s.memoria.swapUsadoMb} de ${s.memoria.swapTotalMb} MB`);
  if (s.memoria.contenedor) L.push(`Contenedor: ${s.memoria.contenedor.usadoMb} MB usados${s.memoria.contenedor.limiteMb ? ` de ${s.memoria.contenedor.limiteMb} MB` : " (sin límite)"}`);
  L.push(`Temperatura ${m.tempC ?? "—"} °C · limitación actual: ${s.limitacion ? (s.limitacion.ahora.join("; ") || "ninguna") : "sin datos"}${s.limitacion?.desdeElArranque.length ? ` · desde el arranque: ${s.limitacion.desdeElArranque.join("; ")}` : ""}`);
  L.push(`Disco ${s.disco.dispositivo ?? "—"}: uso ${s.disco.ioPct ?? "—"} % · lee ${s.disco.leidoMBs ?? "—"} MB/s · escribe ${s.disco.escritoMBs ?? "—"} MB/s · espacio libre ${s.disco.libreGb ?? "—"} de ${s.disco.totalGb ?? "—"} GB (${s.disco.carpeta})`);
  L.push(`Presión (PSI, % del tiempo esperando): CPU ${m.psiCpu ?? "—"} · disco ${m.psiIo ?? "—"} · memoria ${m.psiMem ?? "—"}`);
  L.push(`Proceso de la aplicación: ${s.proceso.rssMb} MB (heap ${s.proceso.heapMb} MB) · CPU ${s.proceso.cpuPct} % · bloqueo máximo reciente ${m.lagMs} ms`);
  if (s.lecturas) L.push(`Lecturas de pedidos: ${s.lecturas.leyendo} leyendo, ${s.lecturas.pendientes} en espera · motor ${s.lecturas.motor} · a la vez: ${s.lecturas.simultaneas === 0 ? "automático" : s.lecturas.simultaneas}`);
  L.push(`Restauración en curso: ${b(s.trabajos.restauracionEnCurso)}`);
  L.push("");
  L.push("== Base de datos ==");
  if ("error" in s.bd) L.push(`ERROR: ${s.bd.error}`);
  else {
    L.push(`${s.bd.version} · ${s.bd.tamanoMb} MB · shared_buffers ${s.bd.sharedBuffers} · respuesta mínima ${s.bd.latenciaMs} ms · acierto de caché ${s.bd.aciertoCachePct ?? "—"} %`);
    L.push(`Conexiones: ${s.bd.conexiones.activas} activas, ${s.bd.conexiones.ociosas} ociosas, ${s.bd.conexiones.esperando} esperando bloqueo (máximo ${s.bd.conexiones.maximo})`);
    for (const c of s.bd.consultasActivas) L.push(`  consulta activa ${c.segundos} s [${c.estado}${c.espera ? `/${c.espera}` : ""}]: ${c.sql}`);
    L.push(`Tablas más grandes: ${s.bd.tablasGrandes.map((t) => `${t.tabla} ${t.mb} MB${t.filasMuertas > 0 ? ` (${t.filasMuertas} filas muertas)` : ""}`).join(" · ")}`);
  }
  const pet = resumenPeticiones(30, 12);
  L.push("");
  L.push(`== Peticiones de la última media hora (${pet.total}) ==`);
  for (const r of pet.rutas) L.push(`${String(r.mediaMs).padStart(6)} ms de media · máx ${r.maxMs} ms · ${r.veces} veces${r.errores ? ` · ${r.errores} con error` : ""} · ${r.metodo} ${r.ruta}`);
  L.push("");
  L.push("== Consultas lentas recientes ==");
  const cl = consultasLentas().slice(0, 10);
  if (cl.length === 0) L.push("(ninguna por encima de 500 ms desde que arrancó el servidor)");
  for (const c of cl) L.push(`${hora(c.en)} · ${c.ms} ms · ${c.sql.slice(0, 200)}`);
  const hist = historial();
  if (hist.length > 0) {
    L.push("");
    L.push(`== Evolución (cada 30 s, últimas ${hist.length}; se muestran 12 muestras repartidas) ==`);
    L.push("hora     CPU%  carga  memLibre%  swapMB  temp   io%   psiIO  lagMs");
    const paso = Math.max(1, Math.floor(hist.length / 12));
    for (let i = 0; i < hist.length; i += paso) {
      const x = hist[i];
      L.push(`${hora(x.t)}  ${String(x.cpu).padStart(4)}  ${String(x.carga1).padStart(5)}  ${String(x.memLibrePct).padStart(9)}  ${String(x.swapMb).padStart(6)}  ${String(x.tempC ?? "—").padStart(4)}  ${String(x.ioPct ?? "—").padStart(4)}  ${String(x.psiIo ?? "—").padStart(5)}  ${String(x.lagMs).padStart(5)}`);
    }
    const pico = (f: (x: Muestra) => number | null) => Math.max(...hist.map((x) => f(x) ?? 0));
    L.push(`Picos: CPU ${pico((x) => x.cpu)} % · carga ${pico((x) => x.carga1)} · temp ${pico((x) => x.tempC)} °C · swap ${pico((x) => x.swapMb)} MB · disco ${pico((x) => x.ioPct)} % · bloqueo ${pico((x) => x.lagMs)} ms`);
  }
  L.push("");
  L.push("== Registro del servidor (avisos y errores recientes) ==");
  if (registroReciente.length === 0) L.push("(sin avisos ni errores)");
  for (const e of registroReciente) L.push(e);
  return L.join("\n");
}
