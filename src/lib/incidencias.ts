/**
 * Incidencias (lo que falla o va mal): tipos y utilidades comunes al servidor y al navegador, sin dependencias.
 */

export const ORIGENES = ["servidor", "navegador", "peticion", "aviso", "tarea", "lectura", "rendimiento", "equipo", "manual"] as const;
export type OrigenIncidencia = (typeof ORIGENES)[number];
export type NivelIncidencia = "error" | "aviso";
export const ESTADOS_INCIDENCIA = ["nueva", "revisada", "resuelta", "ignorada"] as const;
export type EstadoIncidencia = (typeof ESTADOS_INCIDENCIA)[number];

export const ETIQUETA_ORIGEN: Record<OrigenIncidencia, string> = {
  servidor: "Servidor",
  navegador: "Pantalla (navegador)",
  peticion: "Petición fallida",
  aviso: "Aviso de error mostrado",
  tarea: "Tarea en segundo plano",
  lectura: "Lectura (OCR)",
  rendimiento: "Lentitud",
  equipo: "Equipo",
  manual: "Avisado a mano",
};

export const ICONO_ORIGEN: Record<OrigenIncidencia, string> = { servidor: "🖥️", navegador: "🌐", peticion: "📡", aviso: "💬", tarea: "⚙️", lectura: "📄", rendimiento: "🐢", equipo: "🌡️", manual: "🐞" };

/** Lo que se anota de cada suceso. `contexto` solo lleva datos técnicos (nunca valores de formularios ni contraseñas). */
export interface EventoIncidencia {
  origen: OrigenIncidencia;
  nivel?: NivelIncidencia;
  titulo: string;
  detalle?: string | null;
  ruta?: string | null;
  contexto?: Record<string, unknown> | null;
  idUsuario?: number | null;
  version?: string | null;
}

const MAX_TITULO = 300;
const MAX_DETALLE = 8000;

/**
 * Quita lo que no debe quedar en un registro: correos, DNI/NIE, tarjetas y números largos, claves y tokens. Se aplica a todo texto antes de guardarlo.
 */
export function limpiarSensible(texto: string): string {
  return texto
    // Un correo acaba en un dominio con letras («ana@correo.es»): «pg@9.0» (una versión) no lo es
    .replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)*\.[A-Za-z]{2,}\b/g, "<correo>")
    .replace(/\b[XYZxyz]?\d{7,8}[A-Za-z]\b/g, "<documento>")
    .replace(/\b(?:\d[ -]?){9,}\b/g, "<número>")
    .replace(/\b(Bearer|Basic)\s+[\w.~+/=-]{10,}/gi, "$1 <token>")
    .replace(/\b(password|contrase(?:ñ|n)a|token|secret|clave|apikey|api_key)\s*[=:]\s*\S+/gi, "$1=<oculto>")
    .replace(/\b[0-9a-f]{32,}\b/gi, "<clave>");
}

export const recortar = (t: string, max: number): string => (t.length > max ? `${t.slice(0, max)}… (recortado)` : t);

export function prepararEvento(e: EventoIncidencia): EventoIncidencia {
  return {
    ...e,
    nivel: e.nivel ?? "error",
    titulo: recortar(limpiarSensible(e.titulo.replace(/\s+/g, " ").trim()), MAX_TITULO) || "(sin mensaje)",
    detalle: e.detalle ? recortar(limpiarSensible(e.detalle), MAX_DETALLE) : null,
    ruta: e.ruta ? recortar(limpiarSensible(e.ruta), 200) : null,
  };
}

/** Texto que identifica «el mismo fallo»: sin números, ids ni hexadecimales largos, para que 50 repeticiones cuenten como una. */
export function claveDeFallo(origen: string, titulo: string, ruta: string | null | undefined): string {
  const t = titulo
    .toLowerCase()
    .replace(/<[^>]*>/g, "")
    .replace(/\b[0-9a-f]{8,}\b/g, "#")
    .replace(/\d+(?:[.,]\d+)?/g, "#")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
  const r = (ruta ?? "").replace(/\?.*$/, "").replace(/\/\d+(?=\/|$)/g, "/:id");
  return `${origen}|${t}|${r}`;
}

export interface IncidenciaParaInforme {
  id: number;
  origen: OrigenIncidencia;
  nivel: NivelIncidencia;
  titulo: string;
  detalle: string | null;
  ruta: string | null;
  contexto: Record<string, unknown> | null;
  veces: number;
  primeraVez: string;
  ultimaVez: string;
  estado: EstadoIncidencia;
  nota: string | null;
  version: string | null;
}

const fecha = (iso: string): string => new Date(iso).toLocaleString("es-ES", { timeZone: "Europe/Madrid" });

/** Informe en texto (Markdown) listo para copiar y pasar a quien deba revisarlo: qué pasó, dónde, cuántas veces y los pasos previos. */
export function informeDe(lista: IncidenciaParaInforme[]): string {
  const partes = lista.map((i) => {
    const ctx = i.contexto ?? {};
    const pasos = Array.isArray(ctx.pasos) ? (ctx.pasos as unknown[]).map(String) : [];
    const resto = Object.entries(ctx).filter(([k]) => k !== "pasos");
    return [
      `## #${i.id} · ${i.nivel === "error" ? "🔴 Error" : "🟡 Aviso"} · ${ETIQUETA_ORIGEN[i.origen]}`,
      `**${i.titulo}**`,
      `- Dónde: ${i.ruta ?? "—"}`,
      `- Veces: ${i.veces} (primera ${fecha(i.primeraVez)}, última ${fecha(i.ultimaVez)})`,
      `- Estado: ${i.estado}${i.version ? ` · versión ${i.version}` : ""}`,
      ...(i.nota ? [`- Nota: ${i.nota}`] : []),
      ...resto.map(([k, v]) => `- ${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`),
      ...(i.detalle ? ["", "```", i.detalle, "```"] : []),
      ...(pasos.length > 0 ? ["", "Pasos previos (del más antiguo al más reciente):", ...pasos.map((p) => `1. ${p}`)] : []),
    ].join("\n");
  });
  return `# Incidencias de GestorVentas (${lista.length})\n\n${partes.join("\n\n---\n\n")}\n`;
}
