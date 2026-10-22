import { esAnulado } from "@/lib/anulados";
import { formatDate } from "@/lib/date-utils";
import type { ExpedienteDto } from "@/lib/dto";
import { EnlaceExpediente, rutaExpediente } from "@/components/Enlaces";
import { columnasVehiculo } from "@/components/etiquetas";
import { datosVehiculoDeExpediente } from "@/components/expedientes/comun";
import type { ColumnaTabla } from "@/components/TablaDatos";

/** Un expediente del cliente con la señal de si parece repetido entre los suyos (mismo bastidor, matrícula, o mismo modelo y fecha de pedido). */
export type VentaConAviso = ExpedienteDto & { __duplicado?: string };

const normalizarClave = (t: string | null) => (t ?? "").replace(/[\s-]/g, "").toUpperCase();
const SIN_DATO_VENTA = new Set(["", "ND", "N/D", "NA", "N/A", "0"]);

export function marcarDuplicadas(lista: ExpedienteDto[]): VentaConAviso[] {
  const motivo = new Map<number, string>();
  const claves: { motivo: string; clave: (e: ExpedienteDto) => string | null }[] = [
    { motivo: "mismo bastidor", clave: (e) => (SIN_DATO_VENTA.has(normalizarClave(e.vin)) ? null : normalizarClave(e.vin)) },
    { motivo: "misma matrícula", clave: (e) => (SIN_DATO_VENTA.has(normalizarClave(e.matricula)) ? null : normalizarClave(e.matricula)) },
    { motivo: "mismo modelo y fecha de pedido", clave: (e) => (e.id_modelo && e.fecha_expediente ? `${e.id_modelo}|${e.fecha_expediente}` : null) },
  ];
  for (const c of claves) {
    const grupos = new Map<string, ExpedienteDto[]>();
    for (const e of lista) {
      const k = c.clave(e);
      if (k !== null) (grupos.get(k) ?? grupos.set(k, []).get(k)!).push(e);
    }
    for (const g of grupos.values()) if (g.length > 1) for (const e of g) if (!motivo.has(e.id_expediente)) motivo.set(e.id_expediente, `${c.motivo} que ${g.filter((o) => o !== e).map((o) => `#EXP-${String(o.id_expediente).padStart(4, "0")}`).join(", ")}`);
  }
  return lista.map((e) => ({ ...e, __duplicado: motivo.get(e.id_expediente) }));
}

/** Columnas de la tabla de expedientes (ventas) de un cliente: el código y el botón «Editar» abren el expediente. */
export const columnasVentas: ColumnaTabla<VentaConAviso>[] = [
  { clave: "codigo", etiqueta: "Código", valor: (e) => e.id_expediente, celda: (e) => <EnlaceExpediente id={e.id_expediente} />, ayuda: "Pulsa el código para abrir el expediente" },
  ...columnasVehiculo<VentaConAviso>((e) => datosVehiculoDeExpediente(e), { vacio: "N/D", punto: true }),
  { clave: "matricula", etiqueta: "Matrícula", valor: (e) => e.matricula ?? "", celda: (e) => e.matricula || "N/D" },
  { clave: "fecha", etiqueta: "Fecha pedido", valor: (e) => e.fecha_expediente ?? "", celda: (e) => (e.fecha_expediente ? formatDate(e.fecha_expediente) : "N/D") },
  { clave: "vin", etiqueta: "Bastidor", valor: (e) => e.vin ?? "", celda: (e) => e.vin || "N/D" },
  { clave: "f_afect", etiqueta: "F. afectación", valor: (e) => e.fecha_afectacion ?? "", celda: (e) => (e.fecha_afectacion ? formatDate(e.fecha_afectacion) : "—") },
  { clave: "f_rci", etiqueta: "F. RCI", valor: (e) => e.fecha_rci ?? "", celda: (e) => (e.fecha_rci ? formatDate(e.fecha_rci) : "—") },
  { clave: "f_mat", etiqueta: "F. matriculación", valor: (e) => e.fecha_matriculacion ?? "", celda: (e) => (e.fecha_matriculacion ? formatDate(e.fecha_matriculacion) : "—") },
  { clave: "f_fact", etiqueta: "F. facturación", valor: (e) => e.fecha_facturacion ?? "", celda: (e) => (e.fecha_facturacion ? formatDate(e.fecha_facturacion) : "—") },
  { clave: "f_entrega", etiqueta: "F. entrega", valor: (e) => e.fecha_entrega ?? "", celda: (e) => (e.fecha_entrega ? formatDate(e.fecha_entrega) : "—") },
  { clave: "vendedor", etiqueta: "Vendedor", valor: (e) => e.usuario?.nombre ?? "" },
  {
    clave: "situacion",
    etiqueta: "Situación",
    valor: (e) => (esAnulado(e.estado_intranet) ? "Anulado" : e.deshabilitado ? "Deshabilitado" : "Vigente"),
    celda: (e) => (esAnulado(e.estado_intranet) ? <b style={{ color: "var(--danger)" }}>Anulado</b> : e.deshabilitado ? <b style={{ color: "var(--warning)" }}>Deshabilitado</b> : <span style={{ color: "var(--text-muted)" }}>Vigente</span>),
    ayuda: "Anulado en la intranet o deshabilitado en la aplicación",
  },
  { clave: "intranet", etiqueta: "Intranet", valor: (e) => e.estado_intranet ?? "", oculta: true },
  { clave: "comentarios", etiqueta: "Comentarios", valor: (e) => e.comentarios ?? "", oculta: true },
  { clave: "aviso", etiqueta: "Aviso", valor: (e) => (e.__duplicado ? "Posible duplicado" : ""), celda: (e) => (e.__duplicado ? <span title={e.__duplicado} style={{ color: "var(--danger)", fontWeight: 700 }}>⚠️ Posible duplicado</span> : "") },
  {
    clave: "editar",
    etiqueta: "Editar",
    valor: () => "",
    celda: (e) => (
      <a href={rutaExpediente(e.id_expediente)} className="btn btn-secondary" style={{ padding: "6px 12px", fontSize: "0.8rem", display: "inline-flex", alignItems: "center", gap: "4px" }}>
        ✏️ Editar
      </a>
    ),
  },
];
