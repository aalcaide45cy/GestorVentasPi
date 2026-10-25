/**
 * Memoria que conviene darle a PostgreSQL según el equipo donde corre (su RAM y si es una Raspberry). Sin dependencias del servidor: lo usan la ruta de
 * administración y el panel de rendimiento. Los mismos tramos están en el instalador de la Raspberry (`instalador/gestorventas.sh`, «niveles_memoria»).
 */

export interface MemoriaBd {
  /** Memoria compartida de la base de datos para guardar tablas e índices leídos (`shared_buffers`; cambiarla exige reiniciar PostgreSQL). */
  sharedBuffers: string;
  /** Lo que se supone que el sistema guarda en caché para PostgreSQL (`effective_cache_size`; solo orienta al planificador, no reserva memoria). */
  effectiveCacheSize: string;
  /** Memoria por operación de ordenación o unión (`work_mem`). */
  workMem: string;
  /** Memoria para mantenimiento (índices, vacuum, restauraciones). */
  maintenanceWorkMem: string;
  /** Límite de memoria del contenedor de la base de datos, en instalaciones con Docker (`DB_MEM_LIMIT`). */
  limiteContenedor: string;
}

export const NOMBRES_AJUSTES_BD = ["shared_buffers", "effective_cache_size", "work_mem", "maintenance_work_mem"] as const;
export type NombreAjusteBd = (typeof NOMBRES_AJUSTES_BD)[number];

/**
 * - Raspberry de 8 GB (o equipos de menos de 12 GB): prudente, porque la base de datos comparte la memoria con la aplicación y con la lectura de pedidos.
 * - 12 a 30 GB (un Mac de 16 GB): un cuarto de la RAM.
 * - 30 GB o más (un PC de 64 GB): un cuarto de la RAM, hasta 16 GB (más no aporta).
 */
export function recomendarMemoriaBd(ramMb: number, tipoEquipo: string): MemoriaBd {
  if (tipoEquipo === "Raspberry" || ramMb < 12_000) {
    if (ramMb >= 6_000) return { sharedBuffers: "1GB", effectiveCacheSize: "4GB", workMem: "16MB", maintenanceWorkMem: "256MB", limiteContenedor: "2500m" };
    if (ramMb >= 3_000) return { sharedBuffers: "192MB", effectiveCacheSize: "1GB", workMem: "8MB", maintenanceWorkMem: "128MB", limiteContenedor: "900m" };
    return { sharedBuffers: "96MB", effectiveCacheSize: "512MB", workMem: "4MB", maintenanceWorkMem: "64MB", limiteContenedor: "500m" };
  }
  if (ramMb < 30_000) return { sharedBuffers: "4GB", effectiveCacheSize: "8GB", workMem: "64MB", maintenanceWorkMem: "1GB", limiteContenedor: "8g" };
  return { sharedBuffers: "16GB", effectiveCacheSize: "32GB", workMem: "128MB", maintenanceWorkMem: "2GB", limiteContenedor: "24g" };
}

/** Pasa «1GB», «384MB», «8192kB»… (como los devuelve PostgreSQL o se escriben en la configuración) a megabytes; `null` si no se entiende. */
export function aMegas(valor: string): number | null {
  const m = valor.trim().match(/^(\d+(?:\.\d+)?)\s*(kB|MB|GB|TB)$/i);
  if (!m) return null;
  const n = Number(m[1]);
  switch (m[2].toLowerCase()) {
    case "kb":
      return n / 1024;
    case "mb":
      return n;
    case "gb":
      return n * 1024;
    default:
      return n * 1024 * 1024;
  }
}

/** ¿Es un valor ya igual (o equivalente, como «1024MB» y «1GB») al recomendado? */
export const mismoValor = (actual: string, recomendado: string): boolean => {
  const a = aMegas(actual);
  const r = aMegas(recomendado);
  return a !== null && r !== null && Math.abs(a - r) < 1;
};

/** Las claves del archivo `.env` de una instalación con Docker para cada ajuste. */
export const VARIABLES_ENV: Record<NombreAjusteBd, string> = {
  shared_buffers: "PG_SHARED_BUFFERS",
  effective_cache_size: "PG_CACHE",
  work_mem: "PG_WORK_MEM",
  maintenance_work_mem: "PG_MAINT",
};

export const CLAVE_RECOMENDADA: Record<NombreAjusteBd, keyof MemoriaBd> = {
  shared_buffers: "sharedBuffers",
  effective_cache_size: "effectiveCacheSize",
  work_mem: "workMem",
  maintenance_work_mem: "maintenanceWorkMem",
};
