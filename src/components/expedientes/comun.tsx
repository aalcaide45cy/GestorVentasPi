"use client";

import { aspectoVehiculo } from "@/lib/aspecto";
import Link from "next/link";
import dynamic from "next/dynamic";
import { CLAVE_CORREO_BOTONES, leerBotonesFecha } from "@/lib/correo";
import { marcarCorreoEnviado, useCorreoEnviado } from "@/lib/correo-enviados";
import { usePreferencia } from "@/lib/preferencias";
import { useState, type CSSProperties, type ReactNode } from "react";
import NombreConFoto from "../documentos/FotoCliente";
import { IconoCliente } from "../Enlaces";
import ModalApunte from "./ModalApunte";
import { aspectoEtiqueta } from "./etiqueta-apunte";
import { useToast } from "../Toast";
import { EtiquetaEstado, EtiquetaPago, type DatosVehiculo } from "../etiquetas";
import type { ExpedienteDto } from "@/lib/dto";

const ModalCorreo = dynamic(() => import("../correo/ModalCorreo"), {
  ssr: false,
});

export type CampoFecha =
  | "fecha_afectacion"
  | "fecha_matriculacion"
  | "fecha_entrega"
  | "fecha_rci"
  | "fecha_facturacion";

/** Fondo alterno muy sutil de las columnas de fecha (8.4.6). */
export const FONDO_FECHA_A = "rgba(128, 128, 128, 0.03)";
export const FONDO_FECHA_B = "rgba(128, 128, 128, 0.09)";

export function BadgeTipoVenta({ exp }: { exp: ExpedienteDto }) {
  return (
    <EtiquetaPago
      nombre={exp.tipoDeVenta?.nombre_tipo_venta}
      color={exp.tipoDeVenta?.color}
    />
  );
}

export function BadgeEstado({ exp }: { exp: ExpedienteDto }) {
  return (
    <EtiquetaEstado
      nombre={exp.estadoVehiculo?.nombre_estado_vehiculo}
      clase={exp.estadoVehiculo?.clase}
      color={exp.estadoVehiculo?.color}
    />
  );
}

/** Los datos de vehículo de un expediente en el formato de las columnas estándar (VN/VO, marca, modelo, estado y pago). */
export function datosVehiculoDeExpediente(
  exp: ExpedienteDto | null | undefined,
): DatosVehiculo {
  return {
    clase: exp?.estadoVehiculo?.clase ?? null,
    marca: exp?.modelo?.marca?.nombre ?? null,
    marcaColor: aspectoVehiculo(exp?.modelo?.marca, exp?.estadoVehiculo)
      .capsula,
    marcaPunto: aspectoVehiculo(exp?.modelo?.marca, exp?.estadoVehiculo).punto,
    marcaPuntoColor: aspectoVehiculo(exp?.modelo?.marca, exp?.estadoVehiculo)
      .puntoColor,
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
export function TextoCopiable({
  texto,
  estilo,
  children,
}: {
  texto: string;
  estilo?: CSSProperties;
  children?: ReactNode;
}) {
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
        void copiarTexto(texto).then((ok) =>
          ok
            ? mostrar(`Copiado: ${texto}`, "exito", 2000)
            : mostrar("No se ha podido copiar el valor.", "error"),
        );
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
export function EtiquetasApuntes({
  apuntes,
  lado,
  idExpediente,
  cliente,
}: {
  apuntes: ExpedienteDto["apuntes"];
  lado: "izquierda" | "derecha";
  idExpediente: number;
  cliente: string;
}) {
  const [abierto, setAbierto] = useState<number | null>(null);
  const visibles = (apuntes ?? []).filter(
    (a) => a.mostrar_etiqueta && a.etiqueta.trim() !== "" && a.lado === lado,
  );
  if (visibles.length === 0) return null;
  return (
    <>
      {visibles.map((a) => {
        const semaforo = a.estados !== null && a.estado_semaforo !== null;
        const estado = semaforo
          ? a.estados?.[a.estado_semaforo ?? 0]
          : undefined;
        const aspecto = aspectoEtiqueta(
          a.etiqueta,
          a.color,
          a.estilo,
          a.colorear_emoticonos,
          estado,
        );
        return semaforo ? (
          <button
            key={a.id}
            type="button"
            className={aspecto.clase}
            onClick={() => setAbierto(a.id)}
            title={`${a.titulo}: ${estado?.texto ?? ""}${a.comentario ? `\n📝 ${a.comentario}` : ""}\n(Pulsa para cambiarlo)`}
            style={{ ...aspecto.estilo, cursor: "pointer" }}
          >
            {aspecto.contenido}
          </button>
        ) : (
          <span
            key={a.id}
            className={aspecto.clase}
            title={`Apunte: ${a.titulo}`}
            style={aspecto.estilo}
          >
            {aspecto.contenido}
          </span>
        );
      })}
      {abierto !== null &&
        (() => {
          const a = visibles.find((x) => x.id === abierto);
          return a ? (
            <ModalApunte
              apunte={a}
              idExpediente={idExpediente}
              cliente={cliente}
              alCerrar={() => setAbierto(null)}
            />
          ) : null;
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
          <NombreConFoto fotoId={exp.cliente.foto_id}>
            {exp.cliente.nombre}
          </NombreConFoto>
        </TextoCopiable>
        <span
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "5px",
            flexWrap: "wrap",
          }}
        >
          <EtiquetasApuntes
            apuntes={exp.apuntes}
            lado="izquierda"
            idExpediente={exp.id_expediente}
            cliente={exp.cliente.nombre}
          />
          <IconoCliente id={exp.cliente.id} />
          <EtiquetasApuntes
            apuntes={exp.apuntes}
            lado="derecha"
            idExpediente={exp.id_expediente}
            cliente={exp.cliente.nombre}
          />
        </span>
      </>
    );
  }
  return (
    <div
      className="celda-cliente"
      style={{ display: "flex", alignItems: "center", gap: "8px" }}
    >
      <span style={{ color: "var(--text-muted)", fontStyle: "italic" }}>
        Sin Cliente
      </span>
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

/** Las fechas que pueden llevar el sobre ✉️: las editables y la del pedido. */
export type CampoFechaSobre = CampoFecha | "fecha_expediente";

interface CeldaFechaProps {
  exp: ExpedienteDto;
  campo: CampoFechaSobre;
  /** Solo la fecha y, si se activa, el sobre ✉️ (sin lápiz ni papelera): la fecha del pedido no se edita desde la lista. */
  soloSobre?: boolean;
  nombre: string;
  fondo?: string;
  formatear: (v: string | null) => string;
  /** Lista completa de expedientes: subraya la matriculación cobrada en otra fecha y muestra la matrícula. */
  detalleMatricula?: boolean;
  alEditar: (exp: ExpedienteDto, campo: CampoFecha, nombre: string) => void;
  alBorrar: (exp: ExpedienteDto, campo: CampoFecha, nombre: string) => void;
}

/** Botón diminuto de la celda de fecha (poca altura, para que las filas no crezcan). */
const estiloIcono = (fondo: string): CSSProperties => ({
  border: "none",
  background: fondo,
  cursor: "pointer",
  fontSize: "0.58rem",
  lineHeight: 1,
  padding: "0 4px",
  height: "15px",
  minWidth: "20px",
  borderRadius: "999px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  transition: "all 0.2s",
});

/** Fecha centrada con lápiz (editar) y papelera (borrar, solo si hay fecha). */
export function CeldaFecha({
  exp,
  campo,
  nombre,
  fondo,
  formatear,
  detalleMatricula = false,
  soloSobre = false,
  alEditar,
  alBorrar,
}: CeldaFechaProps) {
  const valor = exp[campo];
  const [escribiendo, setEscribiendo] = useState(false);
  const { mostrar: mostrarAviso } = useToast();
  const [botones] = usePreferencia(CLAVE_CORREO_BOTONES);
  const cfg = leerBotonesFecha(botones)[campo];
  const conSobre = cfg?.activo ?? false;
  const enviadoEn = useCorreoEnviado(
    campo,
    exp.id_expediente,
    conSobre && !!valor,
  );
  const pulsarSobre = async () => {
    if (!cfg || cfg.modo === "revisar" || !cfg.id_plantilla)
      return setEscribiendo(true);
    const cabecera = { "Content-Type": "application/json" };
    try {
      const r = await fetch("/api/correo/cola", {
        method: "POST",
        headers: cabecera,
        body: JSON.stringify({
          id_plantilla: cfg.id_plantilla,
          id_expediente: exp.id_expediente,
          campo,
        }),
      });
      const j = (await r.json()) as {
        data?: { id: number; para: string };
        message?: string;
      };
      if (!r.ok || !j.data)
        throw new Error(j.message ?? "No se pudo preparar el correo");
      if (cfg.modo === "enviar") {
        const e = await fetch("/api/correo/cola", {
          method: "PATCH",
          headers: cabecera,
          body: JSON.stringify({ ids: [j.data.id], accion: "enviar" }),
        });
        const ej = (await e.json()) as {
          data?: { fallos?: string[] };
          message?: string;
        };
        if (!e.ok || ej.data?.fallos?.length)
          throw new Error(
            ej.data?.fallos?.[0] ?? ej.message ?? "No se pudo enviar",
          );
        marcarCorreoEnviado(campo, exp.id_expediente);
        mostrarAviso("Correo enviado");
      } else
        mostrarAviso(
          j.data.para
            ? "Correo añadido a la cola de Correo"
            : "Correo en la cola sin destinatario: revísalo en Correo",
          j.data.para ? "exito" : "aviso",
        );
    } catch (e) {
      mostrarAviso(
        e instanceof Error ? e.message : "No se pudo preparar el correo",
        "error",
      );
    }
  };
  const cobradaOtraFecha =
    detalleMatricula &&
    campo === "fecha_matriculacion" &&
    exp.cobrado_otra_fecha;
  return (
    <td
      style={{
        textAlign: "center",
        backgroundColor: fondo,
        height: "62px",
        padding: "4px 6px",
        verticalAlign: "middle",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "2px",
          lineHeight: 1.15,
        }}
      >
        <span
          style={{
            fontSize: "0.85rem",
            whiteSpace: "nowrap",
            color: valor ? "var(--text-primary)" : "var(--text-muted)",
            fontWeight: valor ? 500 : 400,
            textDecoration: cobradaOtraFecha ? "underline" : "none",
            cursor: cobradaOtraFecha ? "help" : "default",
          }}
          title={
            cobradaOtraFecha && exp.fecha_cobrado
              ? `Fecha Cobrado: ${formatear(exp.fecha_cobrado)}`
              : undefined
          }
        >
          {formatear(valor)}
          {campo === "fecha_entrega" && valor && exp.hora_entrega
            ? ` · ${exp.hora_entrega}`
            : ""}
        </span>
        {detalleMatricula &&
          campo === "fecha_matriculacion" &&
          exp.matricula && (
            <span
              style={{
                fontSize: "0.68rem",
                fontWeight: 600,
                color: "var(--text-secondary)",
                background: "rgba(255, 255, 255, 0.05)",
                padding: "0 5px",
                borderRadius: "4px",
                border: "1px solid var(--border-light)",
                whiteSpace: "nowrap",
              }}
            >
              🚗 {exp.matricula}
            </span>
          )}
        <div
          style={{
            display: "flex",
            gap: "3px",
            justifyContent: "center",
            marginTop: "1px",
          }}
        >
          {!soloSobre && campo !== "fecha_expediente" && (
            <button
              type="button"
              onClick={() => alEditar(exp, campo, nombre)}
              style={estiloIcono("rgba(255, 255, 255, 0.05)")}
              title={`Modificar fecha de ${nombre}`}
              className="glass-panel-interactive"
            >
              ✏️
            </button>
          )}
          {valor && conSobre && (
            <button
              type="button"
              onClick={() => void pulsarSobre()}
              style={estiloIcono(
                enviadoEn
                  ? "rgba(34, 197, 94, 0.2)"
                  : "rgba(59, 130, 246, 0.08)",
              )}
              title={
                enviadoEn
                  ? `Correo enviado el ${new Date(enviadoEn).toLocaleString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}. Pulsa para enviar otro.`
                  : `Enviar un correo con la fecha de ${nombre}`
              }
              className="glass-panel-interactive"
            >
              <svg
                width="11"
                height="11"
                viewBox="0 0 24 24"
                fill="none"
                stroke={enviadoEn ? "#16a34a" : "#3b82f6"}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <rect x="2" y="4" width="20" height="16" rx="2" />
                <path d="m22 7-10 6L2 7" />
              </svg>
            </button>
          )}
          {valor && !soloSobre && campo !== "fecha_expediente" && (
            <button
              type="button"
              onClick={() => alBorrar(exp, campo, nombre)}
              style={estiloIcono("rgba(239, 68, 68, 0.05)")}
              title={`Eliminar fecha de ${nombre}`}
              className="glass-panel-interactive"
            >
              🗑️
            </button>
          )}
        </div>
      </div>
      {escribiendo && (
        <ModalCorreo
          correo={null}
          inicial={{
            id_expediente: exp.id_expediente,
            clave: campo,
            predefinido: cfg
              ? {
                  plantilla: cfg.id_plantilla,
                  cuenta: null,
                  para: "",
                }
              : undefined,
          }}
          alCerrar={() => setEscribiendo(false)}
          alGuardar={() => setEscribiendo(false)}
        />
      )}
    </td>
  );
}

/** Mensaje del error devuelto por la API (`{ message }`) o texto por defecto. */
export async function mensajeDeError(
  res: Response,
  porDefecto: string,
): Promise<string> {
  try {
    const datos = (await res.json()) as { message?: string };
    return datos.message || porDefecto;
  } catch {
    return porDefecto;
  }
}
