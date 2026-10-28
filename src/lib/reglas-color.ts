import { z } from "zod";
import type { ExpedienteDto } from "./dto";

/**
 * Reglas para colorear las filas de la lista de Expedientes: cada regla tiene un color, una intensidad y una o varias condiciones (sobre fechas, estados,
 * marca, vendedor…). Gana la primera regla activa, por orden, cuyas condiciones se cumplan. Se guardan en el navegador (Configuración › Expedientes › Colores de fila).
 */

export const CAMPOS_REGLA = [
  { id: "estado_intranet", etiqueta: "Estado intranet", tipo: "texto" },
  { id: "tipo_venta", etiqueta: "Tipo de venta", tipo: "texto" },
  { id: "estado", etiqueta: "Estado del vehículo", tipo: "texto" },
  { id: "clase", etiqueta: "VN / VO", tipo: "texto" },
  { id: "marca", etiqueta: "Marca", tipo: "texto" },
  { id: "modelo", etiqueta: "Modelo", tipo: "texto" },
  { id: "vendedor", etiqueta: "Vendedor", tipo: "texto" },
  { id: "cliente", etiqueta: "Cliente", tipo: "texto" },
  { id: "apunte", etiqueta: "Apunte", tipo: "texto" },
  { id: "matricula", etiqueta: "Matrícula", tipo: "texto" },
  { id: "bastidor", etiqueta: "Bastidor", tipo: "texto" },
  { id: "comisionado", etiqueta: "Comisionado", tipo: "texto" },
  { id: "fecha_expediente", etiqueta: "Fecha de pedido", tipo: "fecha" },
  { id: "fecha_afectacion", etiqueta: "Fecha de afectación", tipo: "fecha" },
  { id: "fecha_rci", etiqueta: "Fecha RCI", tipo: "fecha" },
  { id: "fecha_matriculacion", etiqueta: "Fecha de matriculación", tipo: "fecha" },
  { id: "fecha_facturacion", etiqueta: "Fecha de facturación", tipo: "fecha" },
  { id: "fecha_entrega", etiqueta: "Fecha de entrega", tipo: "fecha" },
] as const;
export type CampoRegla = (typeof CAMPOS_REGLA)[number]["id"];

export const OPERADORES_TEXTO = [
  { id: "es", etiqueta: "es", conValor: true },
  { id: "no_es", etiqueta: "no es", conValor: true },
  { id: "contiene", etiqueta: "contiene", conValor: true },
  { id: "no_contiene", etiqueta: "no contiene", conValor: true },
  { id: "vacio", etiqueta: "está vacío", conValor: false },
  { id: "no_vacio", etiqueta: "no está vacío", conValor: false },
] as const;
export const OPERADORES_FECHA = [
  { id: "tiene", etiqueta: "tiene fecha", conValor: false },
  { id: "no_tiene", etiqueta: "no tiene fecha", conValor: false },
  { id: "hace_max", etiqueta: "es de hoy o de hace como máximo (días)", conValor: true },
  { id: "hace_mas", etiqueta: "es de hace más de (días)", conValor: true },
  { id: "es_hoy", etiqueta: "es de hoy", conValor: false },
] as const;
export const OPERADORES = [...OPERADORES_TEXTO, ...OPERADORES_FECHA];

export const FUERZAS_REGLA = { suave: 0.1, media: 0.18, fuerte: 0.32 } as const;

export const esquemaCondicion = z.object({
  campo: z.enum(CAMPOS_REGLA.map((c) => c.id) as [CampoRegla, ...CampoRegla[]]),
  operador: z.enum(OPERADORES.map((o) => o.id) as [string, ...string[]]),
  valor: z.string().max(200),
});
/** Combinación de las condiciones de un grupo: se cumplen todas, alguna, o ninguna. */
export const COMBINACIONES = ["todas", "alguna", "ninguna"] as const;
export const esquemaGrupo = z.object({
  combinar: z.enum(COMBINACIONES),
  condiciones: z.array(esquemaCondicion).max(12),
});
export type GrupoCondiciones = z.infer<typeof esquemaGrupo>;

export const esquemaRegla = z.object({
  id: z.string().min(1).max(60),
  nombre: z.string().max(80),
  activa: z.boolean(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  fuerza: z.enum(["suave", "media", "fuerte"]),
  /** Grupo principal de condiciones: cómo se combinan (todas, alguna o ninguna) y cuáles son. */
  combinar: z.enum(COMBINACIONES),
  condiciones: z.array(esquemaCondicion).max(12),
  /** Más grupos de condiciones (cada uno con su propia combinación), unidos al principal con `unir`. Las reglas de antes no los tienen. */
  grupos: z.array(esquemaGrupo).max(10).optional(),
  /** Cómo se unen los grupos entre sí: «y» (se cumplen todos) u «o» (se cumple alguno). Por defecto, «y». */
  unir: z.enum(["y", "o"]).optional(),
});
export const esquemaReglas = z.array(esquemaRegla).max(50);
export const esquemaEsquemas = z.array(z.object({ nombre: z.string().min(1).max(80), reglas: esquemaReglas })).max(50);

export type Condicion = z.infer<typeof esquemaCondicion>;
export type ReglaColor = z.infer<typeof esquemaRegla>;
export interface EsquemaReglas {
  nombre: string;
  reglas: ReglaColor[];
}

export const tipoDeCampo = (campo: CampoRegla): "texto" | "fecha" => CAMPOS_REGLA.find((c) => c.id === campo)?.tipo ?? "texto";
export const operadoresDe = (campo: CampoRegla) => (tipoDeCampo(campo) === "fecha" ? OPERADORES_FECHA : OPERADORES_TEXTO);
export const operadorConValor = (id: string) => OPERADORES.find((o) => o.id === id)?.conValor ?? false;

export const idRegla = (): string => `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export function reglaNueva(): ReglaColor {
  return { id: idRegla(), nombre: "Nueva regla", activa: true, color: "#3b82f6", fuerza: "media", combinar: "todas", condiciones: [{ campo: "estado_intranet", operador: "es", valor: "" }] };
}

/** La regla que había antes de existir este gestor («pedidos de hoy y de los últimos N días»), a partir de lo que cada persona tenía configurado. */
export function reglaPedidosRecientes(dias: number, color: string, fuerza: string | null): ReglaColor {
  return {
    id: "pedidos-recientes",
    nombre: "Pedidos recientes",
    activa: dias > 0,
    color: /^#[0-9a-f]{6}$/i.test(color) ? color : "#3b82f6",
    fuerza: fuerza === "suave" || fuerza === "fuerte" ? fuerza : "media",
    combinar: "todas",
    condiciones: [{ campo: "fecha_expediente", operador: "hace_max", valor: String(Math.max(1, dias)) }],
  };
}

/** Lee las reglas guardadas; si no hay ninguna guardada válida, devuelve `porDefecto`. */
export function leerReglas(guardado: string | null, porDefecto: ReglaColor[]): ReglaColor[] {
  if (guardado === null || guardado === "") return porDefecto;
  try {
    const r = esquemaReglas.safeParse(JSON.parse(guardado));
    return r.success ? r.data : porDefecto;
  } catch {
    return porDefecto;
  }
}

export function leerEsquemas(guardado: string | null): EsquemaReglas[] {
  try {
    const r = esquemaEsquemas.safeParse(guardado ? JSON.parse(guardado) : []);
    return r.success ? r.data : [];
  } catch {
    return [];
  }
}

/** Texto de un archivo importado: reglas sueltas o un esquema con nombre. Devuelve `null` si no es válido. */
export function leerImportacion(texto: string): { nombre: string | null; reglas: ReglaColor[] } | null {
  try {
    const v: unknown = JSON.parse(texto);
    const objeto = z.object({ nombre: z.string().max(80).optional(), reglas: esquemaReglas }).safeParse(v);
    if (objeto.success) return { nombre: objeto.data.nombre ?? null, reglas: objeto.data.reglas };
    const lista = esquemaReglas.safeParse(v);
    return lista.success ? { nombre: null, reglas: lista.data } : null;
  } catch {
    return null;
  }
}

export const aArchivoDeReglas = (nombre: string, reglas: ReglaColor[]): string => JSON.stringify({ nombre, tipo: "reglas-color-expedientes", reglas }, null, 2);

const sinAcentos = (t: string): string => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

function diasDesde(fecha: string, hoy: string): number {
  const f = Date.UTC(+fecha.slice(0, 4), +fecha.slice(5, 7) - 1, +fecha.slice(8, 10));
  const h = Date.UTC(+hoy.slice(0, 4), +hoy.slice(5, 7) - 1, +hoy.slice(8, 10));
  return Math.round((h - f) / 86400000);
}

function valorDeTexto(e: ExpedienteDto, campo: CampoRegla): string {
  switch (campo) {
    case "estado_intranet":
      return e.estado_intranet ?? "";
    case "tipo_venta":
      return e.tipoDeVenta?.nombre_tipo_venta ?? "";
    case "estado":
      return e.estadoVehiculo?.nombre_estado_vehiculo ?? "";
    case "clase":
      return e.estadoVehiculo?.clase ?? "";
    case "marca":
      return e.modelo?.marca?.nombre ?? "";
    case "modelo":
      return e.modelo?.nombre_modelo ?? "";
    case "vendedor":
      return e.usuario?.nombre ?? "";
    case "cliente":
      return e.cliente?.nombre ?? "";
    case "matricula":
      return e.matricula ?? "";
    case "bastidor":
      return e.vin ?? "";
    case "comisionado":
      return e.comisionado?.estado === "pagado" ? "Comisionado" : e.comisionado?.estado === "reclamado" ? "Reclamado" : "Pendiente";
    default:
      return "";
  }
}

function cumple(e: ExpedienteDto, c: Condicion, hoy: string): boolean {
  if (tipoDeCampo(c.campo) === "fecha") {
    const f = (e as unknown as Record<string, string | null>)[c.campo] ?? null;
    const n = Number(c.valor);
    switch (c.operador) {
      case "tiene":
        return !!f;
      case "no_tiene":
        return !f;
      case "es_hoy":
        return !!f && diasDesde(f, hoy) === 0;
      case "hace_max":
        return !!f && Number.isFinite(n) && diasDesde(f, hoy) >= 0 && diasDesde(f, hoy) <= n;
      case "hace_mas":
        return !!f && Number.isFinite(n) && diasDesde(f, hoy) > n;
      default:
        return false;
    }
  }
  const q = sinAcentos(c.valor);
  // Un expediente puede tener varios apuntes: «es» y «contiene» se cumplen si alguno coincide; «no es» y «no contiene», si ninguno
  if (c.campo === "apunte") {
    const titulos = (e.apuntes ?? []).map((a) => sinAcentos(a.titulo));
    switch (c.operador) {
      case "es":
        return titulos.includes(q);
      case "no_es":
        return !titulos.includes(q);
      case "contiene":
        return q !== "" && titulos.some((t) => t.includes(q));
      case "no_contiene":
        return q === "" || !titulos.some((t) => t.includes(q));
      case "vacio":
        return titulos.length === 0;
      case "no_vacio":
        return titulos.length > 0;
      default:
        return false;
    }
  }
  const v = sinAcentos(valorDeTexto(e, c.campo));
  switch (c.operador) {
    case "es":
      return v === q;
    case "no_es":
      return v !== q;
    case "contiene":
      return q !== "" && v.includes(q);
    case "no_contiene":
      return q === "" || !v.includes(q);
    case "vacio":
      return v === "";
    case "no_vacio":
      return v !== "";
    default:
      return false;
  }
}

/** Fondo (con transparencia, para tema claro y oscuro) de una regla. */
export function fondoDeRegla(r: Pick<ReglaColor, "color" | "fuerza">): string {
  const n = parseInt(r.color.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${FUERZAS_REGLA[r.fuerza]})`;
}

/** Si un expediente cumple un grupo de condiciones: todas, alguna o ninguna. Un grupo sin condiciones no cuenta (`null`). */
function cumpleGrupo(e: ExpedienteDto, g: GrupoCondiciones, hoy: string): boolean | null {
  if (g.condiciones.length === 0) return null;
  if (g.combinar === "todas") return g.condiciones.every((c) => cumple(e, c, hoy));
  if (g.combinar === "alguna") return g.condiciones.some((c) => cumple(e, c, hoy));
  return !g.condiciones.some((c) => cumple(e, c, hoy));
}

/** Los grupos de condiciones de una regla: el principal (`combinar` + `condiciones`) y los que se hayan añadido. */
export const gruposDeRegla = (r: Pick<ReglaColor, "combinar" | "condiciones" | "grupos">): GrupoCondiciones[] => [{ combinar: r.combinar, condiciones: r.condiciones }, ...(r.grupos ?? [])];

/** Si un expediente cumple una regla: sus grupos de condiciones, unidos con «y» (todos) u «o» (alguno). Una regla sin ninguna condición no se aplica. */
export function cumpleRegla(e: ExpedienteDto, r: ReglaColor, hoy: string): boolean {
  const resultados = gruposDeRegla(r).map((g) => cumpleGrupo(e, g, hoy)).filter((x): x is boolean => x !== null);
  if (resultados.length === 0) return false;
  return (r.unir ?? "y") === "o" ? resultados.some(Boolean) : resultados.every(Boolean);
}

/** La primera regla activa (con condiciones) que cumple el expediente, o `null`. `hoy` es la fecha local `AAAA-MM-DD`. */
export function reglaQueAplica(e: ExpedienteDto, reglas: ReglaColor[], hoy: string): ReglaColor | null {
  for (const r of reglas) {
    if (!r.activa) continue;
    if (cumpleRegla(e, r, hoy)) return r;
  }
  return null;
}

/** Texto de una condición: «Estado intranet es «Matriculación»». */
export function textoDeCondicion(c: Condicion): string {
  const campo = CAMPOS_REGLA.find((x) => x.id === c.campo)?.etiqueta ?? c.campo;
  const op = OPERADORES.find((o) => o.id === c.operador);
  return `${campo} ${op?.etiqueta ?? c.operador}${op?.conValor ? ` «${c.valor}»` : ""}`;
}

/** Texto de un grupo: las condiciones unidas con «y» (todas), «o» (alguna) o «ninguna de: …». */
export function textoDeGrupo(g: GrupoCondiciones): string {
  const partes = g.condiciones.map(textoDeCondicion);
  if (partes.length === 0) return "";
  if (g.combinar === "ninguna") return `ninguna de: ${partes.join("; ")}`;
  return partes.join(g.combinar === "todas" ? " y " : " o ");
}

/** Frase que explica cuándo se aplica una regla (para la leyenda bajo la tabla y el resumen de Configuración): los grupos de condiciones unidos con «y» u «o». */
export function textoDeRegla(r: Pick<ReglaColor, "combinar" | "condiciones" | "grupos" | "unir">): string {
  const grupos = gruposDeRegla(r).filter((g) => g.condiciones.length > 0);
  if (grupos.length === 0) return "Sin condiciones";
  if (grupos.length === 1) return textoDeGrupo(grupos[0]);
  return grupos.map((g) => `(${textoDeGrupo(g)})`).join((r.unir ?? "y") === "o" ? " O " : " Y ");
}
