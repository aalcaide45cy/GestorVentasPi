import Link from "next/link";
import type { ReactNode } from "react";
import { columnasVehiculo, type DatosVehiculo } from "@/components/etiquetas";
import type { ColumnaTabla } from "@/components/TablaDatos";
import type { ExpedienteDto } from "@/lib/dto";
import { TextoCopiable, datosVehiculoDeExpediente } from "./comun";

const fechaCorta = (f: string | null | undefined) => (f ? f.split("-").reverse().join("/") : "—");
const guion = <span style={{ color: "var(--text-muted)" }}>—</span>;

/** Claves de las 19 columnas de la lista de Expedientes, en su orden (la matrícula es una más, opcional, que no está en la lista). */
export const CLAVES_EXPEDIENTE = ["cliente", "telefono", "email", "clase", "punto", "marca", "modelo", "marcaModelo", "tipoPago", "estado", "vendedor", "fecha_expediente", "fecha_afectacion", "fecha_rci", "fecha_matriculacion", "fecha_facturacion", "fecha_entrega", "estado_intranet", "cobro"] as const;

/** Lo que se ve al abrir la tabla si no se dice otra cosa: como la lista de Expedientes («Marca y modelo», «Estado intranet» y «Comisionado» ocultas). */
const VISIBLES_POR_DEFECTO: string[] = CLAVES_EXPEDIENTE.filter((c) => c !== "marcaModelo" && c !== "estado_intranet" && c !== "cobro");

interface Opciones<T> {
  /** Columna «Cliente» de esa tabla (cada una la pinta a su manera, con su enlace al expediente). */
  cliente: ColumnaTabla<T>;
  /** Datos del vehículo si no salen tal cual del expediente (por ejemplo, cuando solo hay lo que da el servidor). */
  vehiculo?: (fila: T) => DatosVehiculo;
  /** Columnas propias de esa tabla, tras el cliente. Siempre salen (con lo que se indique en `visibles`). */
  propias?: ColumnaTabla<T>[];
  /** Columnas propias que van después de las del expediente (por ejemplo, lo que aporta cada coche a la comisión). */
  propiasAlFinal?: ColumnaTabla<T>[];
  /** Claves que se ven al abrir la tabla; las demás empiezan ocultas pero se activan en «Columnas y vistas». Todas las propias cuentan. */
  visibles?: string[];
}

/**
 * Las mismas 19 columnas de la lista de Expedientes (Cliente, Teléfono, Email, VN/VO, punto de marca, Marca, Modelo, Marca y modelo,
 * Tipo de pago, Estado, Vendedor, F. Exp., F. Afect, F. RCI, F. Mat, F. FAC., F. Entrega, Estado intranet y Comisionado) para
 * cualquier tabla cuyas filas tengan un expediente. El gestor de columnas de cada tabla deja ocultar, ordenar y guardar vistas.
 */
export function columnasExpediente<T>(exp: (fila: T) => ExpedienteDto | undefined, opciones: Opciones<T>): ColumnaTabla<T>[] {
  const vehiculo = opciones.vehiculo ?? ((f: T) => datosVehiculoDeExpediente(exp(f)));
  const visibles = new Set([...(opciones.visibles ?? VISIBLES_POR_DEFECTO), ...(opciones.propias ?? []).map((c) => c.clave)]);
  const v = new Map(columnasVehiculo<T>(vehiculo, { punto: true }).map((c) => [c.clave, c]));
  const fecha = (clave: string, etiqueta: string, campo: "fecha_expediente" | "fecha_afectacion" | "fecha_rci" | "fecha_matriculacion" | "fecha_facturacion" | "fecha_entrega", ayuda: string): ColumnaTabla<T> => ({
    clave,
    etiqueta,
    valor: (f) => exp(f)?.[campo] ?? "",
    celda: (f) => fechaCorta(exp(f)?.[campo]),
    ayuda,
  });
  const resto: ColumnaTabla<T>[] = [
    { clave: "telefono", etiqueta: "Teléfono", valor: (f) => exp(f)?.cliente?.telefonos[0]?.telefono ?? "", celda: (f) => (exp(f)?.cliente?.telefonos[0]?.telefono ? <TextoCopiable texto={exp(f)?.cliente?.telefonos[0]?.telefono ?? ""} /> : guion), ayuda: "Primer teléfono del cliente" },
    { clave: "email", etiqueta: "Email", valor: (f) => exp(f)?.cliente?.emails[0]?.email ?? "", celda: (f) => (exp(f)?.cliente?.emails[0]?.email ? <TextoCopiable texto={exp(f)?.cliente?.emails[0]?.email ?? ""} /> : guion), ayuda: "Primer correo del cliente" },
    v.get("clase")!,
    v.get("punto")!,
    v.get("marca")!,
    v.get("modelo")!,
    v.get("marcaModelo")!,
    v.get("tipoPago")!,
    v.get("estado")!,
    { clave: "vendedor", etiqueta: "Vendedor", valor: (f) => exp(f)?.usuario?.nombre ?? "", celda: (f) => exp(f)?.usuario?.nombre ?? guion, ayuda: "Comercial al que pertenece el expediente" },
    fecha("fecha_expediente", "F. Exp.", "fecha_expediente", "Fecha en que se hizo el pedido"),
    fecha("fecha_afectacion", "F. Afect", "fecha_afectacion", "Fecha de afectación del vehículo al pedido"),
    fecha("fecha_rci", "F. RCI", "fecha_rci", "Fecha de contratación de la financiación"),
    fecha("fecha_matriculacion", "F. Mat", "fecha_matriculacion", "Fecha de matriculación (en un VN cuenta para comisionar)"),
    fecha("fecha_facturacion", "F. FAC.", "fecha_facturacion", "Fecha de facturación"),
    fecha("fecha_entrega", "F. Entrega", "fecha_entrega", "Fecha de entrega al cliente"),
    {
      clave: "estado_intranet",
      etiqueta: "Estado intranet",
      valor: (f) => exp(f)?.estado_intranet ?? "",
      celda: (f): ReactNode => {
        const estado = exp(f)?.estado_intranet;
        if (!estado) return guion;
        const anulado = /anulad/i.test(estado);
        return (
          <span className="badge" title={`Estado del expediente en la intranet del fabricante: ${estado}`} style={{ fontSize: "0.75rem", ...(anulado ? { backgroundColor: "rgba(239, 68, 68, 0.12)", color: "var(--danger)", border: "1px solid rgba(239, 68, 68, 0.3)" } : { backgroundColor: "rgba(128, 128, 128, 0.1)", color: "var(--text-secondary)", border: "1px solid var(--border-light)" }) }}>
            {estado}
          </span>
        );
      },
      ayuda: "Estado en la intranet del fabricante (Archivado, Anulado…), importado de sus listados",
    },
    {
      clave: "cobro",
      etiqueta: "Comisionado",
      valor: (f) => (exp(f)?.comisionado?.estado === "pagado" ? "Comisionado" : exp(f)?.comisionado?.estado === "reclamado" ? "Reclamado" : "Pendiente"),
      celda: (f) => {
        const c = exp(f)?.comisionado;
        if (c?.estado === "pagado") return <span className="badge" title="Comisión pagada según el Cotejo de pagos" style={{ fontSize: "0.75rem", backgroundColor: "rgba(16, 185, 129, 0.15)", color: "var(--success)", border: "1px solid rgba(16, 185, 129, 0.3)" }}>💰 Comisionado {c.mes.split("-").reverse().join("/")}</span>;
        if (c?.estado === "reclamado") return <span className="badge" title="Comisión reclamada a la empresa" style={{ fontSize: "0.75rem", backgroundColor: "rgba(245, 158, 11, 0.12)", color: "var(--warning)", border: "1px solid rgba(245, 158, 11, 0.25)" }}>⚠️ Reclamado</span>;
        return <span className="badge" title="Todavía no está marcado como pagado en el Cotejo de pagos" style={{ fontSize: "0.75rem", backgroundColor: "rgba(128, 128, 128, 0.1)", color: "var(--text-muted)", border: "1px solid var(--border-light)" }}>Pendiente</span>;
      },
      alinear: "center",
      ayuda: "Si la comisión del coche ya aparece como pagada en el Cotejo de pagos",
    },
  ];
  const todas = [opciones.cliente, ...(opciones.propias ?? []), ...resto];
  const cuerpo = todas.map((c) => ({ ...c, oculta: !visibles.has(c.clave) }));
  return [...cuerpo, ...(opciones.propiasAlFinal ?? [])];
}

/** La matrícula como columna propia (no está en la lista de Expedientes, pero ayuda a reconocer el coche). */
export function columnaMatricula<T>(matricula: (fila: T) => string | null | undefined): ColumnaTabla<T> {
  return { clave: "matricula", etiqueta: "Matrícula", valor: (f) => matricula(f) ?? "", celda: (f) => (matricula(f) ? <TextoCopiable texto={matricula(f) ?? ""} /> : "—") };
}

/** «Cliente» con enlace al expediente, para las tablas cuyas filas son expedientes tal cual. */
export const columnaClienteExpediente: ColumnaTabla<ExpedienteDto> = {
  clave: "cliente",
  etiqueta: "Cliente",
  valor: (e) => e.cliente?.nombre ?? "Sin cliente",
  celda: (e) => (
    <Link href={`/dashboard/expedientes/editar/${e.id_expediente}`} style={{ color: "inherit", fontWeight: 600 }} title="Abrir el expediente">
      {e.cliente?.nombre ?? "Sin cliente"}
    </Link>
  ),
  ancho: 150,
};
