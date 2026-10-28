"use client";

import { aspectoVehiculo } from "@/lib/aspecto";
import Link from "next/link";
import { useState, type CSSProperties, type ReactNode } from "react";
import NombreConFoto from "../documentos/FotoCliente";
import { IconoCliente } from "../Enlaces";
import ModalApunte from "./ModalApunte";
import { aspectoEtiqueta } from "./etiqueta-apunte";
import { useToast } from "../Toast";
import { EtiquetaEstado, EtiquetaPago, type DatosVehiculo } from "../etiquetas";
import type { ExpedienteDto } from "@/lib/dto";

export type CampoFecha = "fecha_afectacion" | "fecha_matriculacion" | "fecha_entrega" | "fecha_rci" | "fecha_facturacion";

/** Fondo alterno muy sutil de las columnas de fecha (8.4.6). */
export const FONDO_FECHA_A = "rgba(128, 128, 128, 0.03)";
export const FONDO_FECHA_B = "rgba(128, 128, 128, 0.09)";

export function BadgeTipoVenta({ exp }: { exp: ExpedienteDto }) {
  return <EtiquetaPago nombre={exp.tipoDeVenta?.nombre_tipo_venta} color={exp.tipoDeVenta?.color} />;
}

export function BadgeEstado({ exp }: { exp: ExpedienteDto }) {
  return <EtiquetaEstado nombre={exp.estadoVehiculo?.nombre_estado_vehiculo} clase={exp.estadoVehiculo?.clase} color={exp.estadoVehiculo?.color} />;
}

/** Los datos de vehículo de un expediente en el formato de las columnas estándar (VN/VO, marca, modelo, estado y pago). */
export function datosVehiculoDeExpediente(exp: ExpedienteDto | null | undefined): DatosVehiculo {
  return {
    clase: exp?.estadoVehiculo?.clase ?? null,
    marca: exp?.modelo?.marca?.nombre ?? null,
    marcaColor: aspectoVehiculo(exp?.modelo?.marca, exp?.estadoVehiculo).capsula,
    marcaPunto: aspectoVehiculo(exp?.modelo?.marca, exp?.estadoVehiculo).punto,
    marcaPuntoColor: aspectoVehiculo(exp?.modelo?.marca, exp?.estadoVehiculo).puntoColor,
    modelo: exp?.modelo?.nombre_modelo ?? null,
    estado: exp?.estadoVehiculo?.nombre_estado_vehiculo ?? null,
    estadoColor: exp?.estadoVehiculo?.color ?? null,
    tipoPago: exp?.tipoDeVenta?.nombre_tipo_venta ?? null,
    tipoPagoColor: exp?.tipoDeVenta?.color ?? null,
  };
}

export function EnlaceEditar({ id }: { id: number }) {
  return (
    <Link
      href={`/dashboard/expedientes/editar/${id}`}
      title="Editar expediente"
      style={{
        width: "28px",
        height: "28px",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#f59e0b",
        color: "#000",
        borderRadius: "var(--radius-sm)",
        fontSize: "0.85rem",
        textDecoration: "none",
        border: "none",
        boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
        cursor: "pointer",
      }}
    >
      ✏️
    </Link>
  );
}

/** Copia un texto al portapapeles (con alternativa para páginas servidas sin HTTPS, como en la red local). */
export async function copiarTexto(texto: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    try {
      const area = document.createElement("textarea");
      area.value = texto;
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(area);
      return ok;
    } catch {
      return false;
    }
  }
}

/** Texto en una sola línea: si no cabe se corta con «…», con el valor completo al pasar el ratón; doble clic lo copia entero. */
export function TextoCopiable({ texto, estilo, children }: { texto: string; estilo?: CSSProperties; children?: ReactNode }) {
  const { mostrar } = useToast();
  return (
    <span
      className="texto-copiable"
      style={estilo}
      title={`${texto}\n(doble clic para copiar)`}
      onDoubleClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        window.getSelection()?.removeAllRanges();
        void copiarTexto(texto).then((ok) => (ok ? mostrar(`Copiado: ${texto}`, "exito", 2000) : mostrar("No se ha podido copiar el valor.", "error")));
      }}
    >
      {children ?? texto}
    </span>
  );
}

interface CeldaClienteProps {
  exp: ExpedienteDto;
  alAsignar: (id: number) => void;
}

/**
 * Etiquetas de los apuntes del expediente que se han marcado para mostrarse (SEGURO, VO…), a un lado u otro del icono del cliente según el apunte.
 * Las que funcionan como semáforo se pueden pulsar: abren la ventana para cambiar su estado.
 */
export function EtiquetasApuntes({ apuntes, lado, idExpediente, cliente }: { apuntes: ExpedienteDto["apuntes"]; lado: "izquierda" | "derecha"; idExpediente: number; cliente: string }) {
  const [abierto, setAbierto] = useState<number | null>(null);
  const visibles = (apuntes ?? []).filter((a) => a.mostrar_etiqueta && a.etiqueta.trim() !== "" && a.lado === lado);
  if (visibles.length === 0) return null;
  return (
    <>
      {visibles.map((a) => {
        const semaforo = a.estados !== null && a.estado_semaforo !== null;
        const estado = semaforo ? a.estados?.[a.estado_semaforo ?? 0] : undefined;
        const aspecto = aspectoEtiqueta(a.etiqueta, a.color, a.estilo, a.colorear_emoticonos, estado);
        return semaforo ? (
          <button key={a.id} type="button" className={aspecto.clase} onClick={() => setAbierto(a.id)} title={`${a.titulo}: ${estado?.texto ?? ""}${a.comentario ? `\n📝 ${a.comentario}` : ""}\n(Pulsa para cambiarlo)`} style={{ ...aspecto.estilo, cursor: "pointer" }}>
            {aspecto.contenido}
          </button>
        ) : (
          <span key={a.id} className={aspecto.clase} title={`Apunte: ${a.titulo}`} style={aspecto.estilo}>
            {aspecto.contenido}
          </span>
        );
      })}
      {abierto !== null && (() => {
        const a = visibles.find((x) => x.id === abierto);
        return a ? <ModalApunte apunte={a} idExpediente={idExpediente} cliente={cliente} alCerrar={() => setAbierto(null)} /> : null;
      })()}
    </>
  );
}

/** Nombre del cliente (solo nombre, sin DNI) o «Sin Cliente» con botón para asignar. */
export function CeldaCliente({ exp, alAsignar }: CeldaClienteProps) {
  if (exp.cliente?.nombre) {
    return (
      <>
        <TextoCopiable texto={exp.cliente.nombre}>
          <NombreConFoto fotoId={exp.cliente.foto_id}>{exp.cliente.nombre}</NombreConFoto>
        </TextoCopiable>
        <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "5px", flexWrap: "wrap" }}>
          <EtiquetasApuntes apuntes={exp.apuntes} lado="izquierda" idExpediente={exp.id_expediente} cliente={exp.cliente.nombre} />
          <IconoCliente id={exp.cliente.id} />
          <EtiquetasApuntes apuntes={exp.apuntes} lado="derecha" idExpediente={exp.id_expediente} cliente={exp.cliente.nombre} />
        </span>
      </>
    );
  }
  return (
    <div className="celda-cliente" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
      <span style={{ color: "var(--text-muted)", fontStyle: "italic" }}>Sin Cliente</span>
      <button
        type="button"
        title="Asignar Cliente"
        onClick={() => alAsignar(exp.id_expediente)}
        style={{
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: "2px 6px",
          fontSize: "0.85rem",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--primary)",
          borderRadius: "4px",
          transition: "all 0.2s",
        }}
        className="glass-panel-interactive"
      >
        🔍
      </button>
    </div>
  );
}

interface CeldaFechaProps {
  exp: ExpedienteDto;
  campo: CampoFecha;
  nombre: string;
  fondo?: string;
  formatear: (v: string | null) => string;
  /** Lista completa de expedientes: subraya la matriculación cobrada en otra fecha y muestra la matrícula. */
  detalleMatricula?: boolean;
  alEditar: (exp: ExpedienteDto, campo: CampoFecha, nombre: string) => void;
  alBorrar: (exp: ExpedienteDto, campo: CampoFecha, nombre: string) => void;
}

/** Fecha centrada con lápiz (editar) y papelera (borrar, solo si hay fecha). */
export function CeldaFecha({ exp, campo, nombre, fondo, formatear, detalleMatricula = false, alEditar, alBorrar }: CeldaFechaProps) {
  const valor = exp[campo];
  const cobradaOtraFecha = detalleMatricula && campo === "fecha_matriculacion" && exp.cobrado_otra_fecha;
  return (
    <td style={{ textAlign: "center", backgroundColor: fondo }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "4px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}>
          <span
            style={{
              fontSize: "0.85rem",
              color: valor ? "var(--text-primary)" : "var(--text-muted)",
              fontWeight: valor ? 500 : 400,
              textDecoration: cobradaOtraFecha ? "underline" : "none",
              cursor: cobradaOtraFecha ? "help" : "default",
            }}
            title={cobradaOtraFecha && exp.fecha_cobrado ? `Fecha Cobrado: ${formatear(exp.fecha_cobrado)}` : undefined}
          >
            {formatear(valor)}
          </span>
          <div style={{ display: "flex", gap: "4px" }}>
            <button
              type="button"
              onClick={() => alEditar(exp, campo, nombre)}
              style={{
                border: "none",
                background: "rgba(255, 255, 255, 0.05)",
                cursor: "pointer",
                fontSize: "0.8rem",
                padding: "4px 6px",
                borderRadius: "4px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transition: "all 0.2s",
              }}
              title={`Modificar fecha de ${nombre}`}
              className="glass-panel-interactive"
            >
              ✏️
            </button>
            {valor && (
              <button
                type="button"
                onClick={() => alBorrar(exp, campo, nombre)}
                style={{
                  border: "none",
                  background: "rgba(239, 68, 68, 0.05)",
                  cursor: "pointer",
                  fontSize: "0.8rem",
                  padding: "4px 6px",
                  borderRadius: "4px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transition: "all 0.2s",
                }}
                title={`Eliminar fecha de ${nombre}`}
                className="glass-panel-interactive"
              >
                🗑️
              </button>
            )}
          </div>
        </div>
        {detalleMatricula && campo === "fecha_matriculacion" && exp.matricula && (
          <div
            style={{
              fontSize: "0.75rem",
              fontWeight: 600,
              color: "var(--text-secondary)",
              background: "rgba(255, 255, 255, 0.05)",
              padding: "2px 6px",
              borderRadius: "4px",
              border: "1px solid var(--border-light)",
              marginTop: "2px",
              display: "inline-block",
            }}
          >
            🚗 {exp.matricula}
          </div>
        )}
      </div>
    </td>
  );
}

/** Mensaje del error devuelto por la API (`{ message }`) o texto por defecto. */
export async function mensajeDeError(res: Response, porDefecto: string): Promise<string> {
  try {
    const datos = (await res.json()) as { message?: string };
    return datos.message || porDefecto;
  } catch {
    return porDefecto;
  }
}
