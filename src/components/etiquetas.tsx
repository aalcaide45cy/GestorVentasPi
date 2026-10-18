"use client";

import type { ReactNode } from "react";
import type { ColumnaTabla } from "@/components/TablaDatos";

/**
 * Cómo se enseñan en TODA la aplicación el tipo de vehículo (VN / VO), su estado, la forma de pago, la marca y el modelo: las
 * mismas etiquetas redondeadas y coloreadas y las mismas columnas, con los mismos nombres, en cualquier tabla.
 */

const ESTILO_ETIQUETA = { fontSize: "0.7rem", padding: "3px 8px" } as const;
const VACIO = <span style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>N/D</span>;

/** VN o VO, con la etiqueta redondeada (verde azulado para nuevo, ámbar para usado), como el estado del vehículo. */
export function EtiquetaClase({ clase }: { clase: string | null | undefined }) {
  if (clase !== "VN" && clase !== "VO") return VACIO;
  return (
    <span className={`badge badge-${clase === "VN" ? "tienda" : "vendedor"}`} style={ESTILO_ETIQUETA} title={clase === "VN" ? "Vehículo nuevo" : "Vehículo usado"}>
      {clase}
    </span>
  );
}

/** Estado del vehículo (Nuevo, Usado, KM0…) con su color; sin color propio, el de su clase. */
export function EtiquetaEstado({ nombre, clase, color }: { nombre: string | null | undefined; clase?: string | null; color?: string | null }) {
  if (!nombre) return VACIO;
  if (color) {
    return (
      <span className="badge" style={{ ...ESTILO_ETIQUETA, backgroundColor: color, color: "#fff" }}>
        {nombre}
      </span>
    );
  }
  return (
    <span className={`badge badge-${clase === "VO" ? "vendedor" : "tienda"}`} style={ESTILO_ETIQUETA}>
      {nombre}
    </span>
  );
}

/** Forma de pago (Contado, Crédito, Preference…) con su color. */
export function EtiquetaPago({ nombre, color }: { nombre: string | null | undefined; color?: string | null }) {
  if (!nombre) return VACIO;
  return (
    <span className="badge" style={{ ...ESTILO_ETIQUETA, backgroundColor: color || "#3b82f6", color: "#fff" }}>
      {nombre}
    </span>
  );
}

/** Lo que una tabla necesita saber de un vehículo para enseñarlo de forma estándar. */
export interface DatosVehiculo {
  clase?: string | null;
  marca?: string | null;
  modelo?: string | null;
  estado?: string | null;
  estadoColor?: string | null;
  tipoPago?: string | null;
  tipoPagoColor?: string | null;
  /** Marca y modelo ya juntos en un texto (cuando el origen no los separa). */
  marcaModelo?: string | null;
}

export type ColumnaVehiculo = "clase" | "marca" | "modelo" | "marcaModelo" | "estado" | "tipoPago";

interface OpcionesColumnas {
  /** Qué enseñar cuando no hay dato (por defecto, un guion). */
  vacio?: ReactNode;
  /** Columnas que no se ofrecen en esta tabla. */
  sin?: ColumnaVehiculo[];
  /** Columnas que empiezan ocultas (se pueden activar en «Columnas y vistas»). */
  ocultas?: ColumnaVehiculo[];
}

/**
 * Las columnas estándar de un vehículo: «VN / VO», «Marca», «Modelo», «Marca y modelo» (oculta, junta las dos), «Estado» y
 * «Tipo de pago». Todas las tablas que hablan de coches las usan para verse y ordenarse igual.
 */
export function columnasVehiculo<T>(datos: (fila: T) => DatosVehiculo, opciones: OpcionesColumnas = {}): ColumnaTabla<T>[] {
  const vacio = opciones.vacio ?? <span style={{ color: "var(--text-muted)" }}>—</span>;
  const sin = new Set(opciones.sin ?? []);
  // «Marca y modelo» empieza oculta (ya están Marca y Modelo por separado), salvo que esas dos no se ofrezcan
  const ocultas = new Set<ColumnaVehiculo>([...(sin.has("marca") && sin.has("modelo") ? [] : (["marcaModelo"] as ColumnaVehiculo[])), ...(opciones.ocultas ?? [])]);
  const juntos = (d: DatosVehiculo) => d.marcaModelo ?? [d.marca, d.modelo].filter(Boolean).join(" ");
  const texto = (v: string | null | undefined): ReactNode => (v ? v : vacio);
  const todas: Record<ColumnaVehiculo, ColumnaTabla<T>> = {
    clase: { clave: "clase", etiqueta: "VN / VO", valor: (f) => datos(f).clase ?? "", celda: (f) => (datos(f).clase ? <EtiquetaClase clase={datos(f).clase} /> : vacio), alinear: "center", ayuda: "Nuevo (VN) o usado (VO)" },
    marca: { clave: "marca", etiqueta: "Marca", valor: (f) => datos(f).marca ?? "", celda: (f) => texto(datos(f).marca) },
    modelo: { clave: "modelo", etiqueta: "Modelo", valor: (f) => datos(f).modelo ?? "", celda: (f) => texto(datos(f).modelo) },
    marcaModelo: { clave: "marcaModelo", etiqueta: "Marca y modelo", valor: (f) => juntos(datos(f)), celda: (f) => texto(juntos(datos(f))), ayuda: "La marca y el modelo juntos en una sola columna" },
    estado: { clave: "estado", etiqueta: "Estado", valor: (f) => datos(f).estado ?? "", celda: (f) => (datos(f).estado ? <EtiquetaEstado nombre={datos(f).estado} clase={datos(f).clase} color={datos(f).estadoColor} /> : vacio), alinear: "center", ayuda: "Estado del vehículo, con el mismo color que en la lista de expedientes" },
    tipoPago: { clave: "tipoPago", etiqueta: "Tipo de pago", valor: (f) => datos(f).tipoPago ?? "", celda: (f) => (datos(f).tipoPago ? <EtiquetaPago nombre={datos(f).tipoPago} color={datos(f).tipoPagoColor} /> : vacio), alinear: "center", ayuda: "Forma de pago del expediente" },
  };
  return (["clase", "marca", "modelo", "marcaModelo", "estado", "tipoPago"] as ColumnaVehiculo[])
    .filter((c) => !sin.has(c))
    .map((c) => ({ ...todas[c], ...(ocultas.has(c) ? { oculta: true } : {}) }));
}
