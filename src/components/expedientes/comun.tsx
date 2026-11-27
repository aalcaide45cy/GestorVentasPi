"use client";

import { aspectoVehiculo } from "@/lib/aspecto";
import Link from "next/link";
import dynamic from "next/dynamic";
import {
  CLAVE_CORREO_BOTONES,
  NOMBRE_PLANTILLA_REENVIO_ENTREGA,
  leerBotonesFecha,
  type PlantillaDto,
} from "@/lib/correo";
import { marcarCorreoEnviado, useCorreoEnviado } from "@/lib/correo-enviados";
import { usePreferencia, CLAVE_TELEFONO_DOBLE_CLIC } from "@/lib/preferencias";
import { CAMPO_WHATSAPP, CAMPO_WHATSAPP_SEGURO } from "@/lib/whatsapp";
import ModalWhatsappSeguro from "./ModalWhatsappSeguro";
import ModalWhatsapp from "./ModalWhatsapp";
import { llamar } from "@/components/comisiones/api";
import { VistaPrevia } from "@/components/documentos/VisorAdjuntos";
import type { AdjuntoDto } from "@/lib/servicios/adjuntos";
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

/** El teléfono de la lista: según Ajustes, el doble clic selecciona el número entero (por defecto) o lo copia. */
export function TextoTelefono({ texto }: { texto: string }) {
  const [modo] = usePreferencia(CLAVE_TELEFONO_DOBLE_CLIC);
  if (modo === "copiar") return <TextoCopiable texto={texto} />;
  return (
    <span
      className="texto-copiable"
      style={{ userSelect: "text", WebkitUserSelect: "text", cursor: "text" }}
      title={`${texto}\n(doble clic para seleccionarlo entero)`}
      onDoubleClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        const rango = document.createRange();
        rango.selectNodeContents(e.currentTarget);
        const seleccion = window.getSelection();
        seleccion?.removeAllRanges();
        seleccion?.addRange(rango);
      }}
    >
      {texto}
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

/** Plantilla para un reenvío: la elegida en Ajustes; si no hay, en la fecha de entrega «Cambiar Fecha Entrega» (si existe) y, si no, la de siempre. */
async function plantillaDeReenvio(
  reenvio: number | null,
  primera: number | null,
  campo: string,
): Promise<number | null> {
  if (reenvio) return reenvio;
  if (campo !== "fecha_entrega") return primera;
  try {
    const r = await fetch("/api/correo/plantillas");
    const j = (await r.json()) as { data?: PlantillaDto[] };
    const buscada = NOMBRE_PLANTILLA_REENVIO_ENTREGA.toLowerCase();
    return (
      j.data?.find((p) => p.nombre.trim().toLowerCase() === buscada)?.id ??
      primera
    );
  } catch {
    return primera;
  }
}

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
  const [plantillaModal, setPlantillaModal] = useState<number | null>(null);
  const { mostrar: mostrarAviso } = useToast();
  const [botones] = usePreferencia(CLAVE_CORREO_BOTONES);
  const cfg = leerBotonesFecha(botones)[campo];
  const conSobre = cfg?.activo ?? false;
  const enviadoEn = useCorreoEnviado(
    campo,
    exp.id_expediente,
    conSobre && !!valor,
  );
  const [pagoRci, setPagoRci] = useState<AdjuntoDto | null>(null);
  const verPagoRci = async () => {
    try {
      const r = await llamar<AdjuntoDto[]>(`/api/adjuntos?idExpediente=${exp.id_expediente}`);
      // El más reciente de los documentos de pago del expediente
      const pago = r.data.filter((a) => a.tipo === "pago_rci").sort((a, b) => b.id - a.id)[0];
      if (pago) setPagoRci(pago);
      else mostrarAviso("Este expediente no tiene ningún documento de pago RCI.", "aviso");
    } catch (e) {
      mostrarAviso(e instanceof Error ? e.message : "No se pudo abrir el documento", "error");
    }
  };
  // En un usado el botón de WhatsApp está siempre; en un nuevo, cuando ya hay fecha de matrícula
  const conWhatsapp = campo === "fecha_matriculacion" && !soloSobre && (!!valor || exp.estadoVehiculo?.clase === "VO");
  const whatsappEn = useCorreoEnviado(CAMPO_WHATSAPP, exp.id_expediente, conWhatsapp);
  const [verWhatsapp, setVerWhatsapp] = useState(false);
  // El aviso al compañero del seguro está siempre (suele pedirse antes de matricular)
  const conSeguro = campo === "fecha_matriculacion" && !soloSobre;
  const seguroEn = useCorreoEnviado(CAMPO_WHATSAPP_SEGURO, exp.id_expediente, conSeguro);
  const [verSeguro, setVerSeguro] = useState(false);
  const pulsarSobre = async () => {
    if (!cfg || cfg.modo === "revisar" || !cfg.id_plantilla) {
      setPlantillaModal(
        cfg && enviadoEn
          ? await plantillaDeReenvio(
              cfg.id_plantilla_reenvio,
              cfg.id_plantilla,
              campo,
            )
          : (cfg?.id_plantilla ?? null),
      );
      return setEscribiendo(true);
    }
    const cabecera = { "Content-Type": "application/json" };
    try {
      const idPlantilla = enviadoEn
        ? await plantillaDeReenvio(
            cfg.id_plantilla_reenvio,
            cfg.id_plantilla,
            campo,
          )
        : cfg.id_plantilla;
      const r = await fetch("/api/correo/cola", {
        method: "POST",
        headers: cabecera,
        body: JSON.stringify({
          id_plantilla: idPlantilla,
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
            flexWrap: campo === "fecha_matriculacion" ? "nowrap" : undefined,
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
                  ? `Correo enviado el ${new Date(enviadoEn).toLocaleString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}. Pulsa para enviar el de reenvío (cambio de fecha).`
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
          {campo === "fecha_rci" && !soloSobre && (
            <button type="button" onClick={() => void verPagoRci()} style={estiloIcono("rgba(59, 130, 246, 0.08)")} title="Ver el documento de pago RCI" aria-label="Ver el documento de pago RCI" className="glass-panel-interactive">
              👁️
            </button>
          )}
          {conWhatsapp && (
            <button
              type="button"
              onClick={() => setVerWhatsapp(true)}
              style={estiloIcono(whatsappEn ? "rgba(34, 197, 94, 0.2)" : "rgba(59, 130, 246, 0.08)")}
              title={
                whatsappEn
                  ? `WhatsApp preparado el ${new Date(whatsappEn).toLocaleString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}. Pulsa para volver a abrirlo o ponerlo en azul.`
                  : "Enviar un WhatsApp al cliente con los datos del vehículo y la entrega"
              }
              aria-label="WhatsApp al cliente"
              className="glass-panel-interactive"
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={whatsappEn ? "#16a34a" : "#3b82f6"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M3 21l1.7-5.1A8.5 8.5 0 1 1 8 19.3L3 21z" />
                <path d="M9 8.5c-.3 3 3.5 6.8 6.5 6.5l.8-1.4-2-1-1 .9c-1-.4-2.4-1.8-2.8-2.8l.9-1-1-2L9 8.5z" />
              </svg>
            </button>
          )}
          {conSeguro && (
            <button
              type="button"
              onClick={() => setVerSeguro(true)}
              style={estiloIcono(seguroEn ? "rgba(34, 197, 94, 0.2)" : "rgba(59, 130, 246, 0.08)")}
              title={
                seguroEn
                  ? `Aviso del seguro preparado el ${new Date(seguroEn).toLocaleString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}. Pulsa para volver a abrirlo o ponerlo en azul.`
                  : "Enviar un WhatsApp al compañero de los seguros con los datos del cliente"
              }
              aria-label="WhatsApp para el seguro"
              className="glass-panel-interactive"
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={seguroEn ? "#16a34a" : "#3b82f6"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                <path d="m9 12 2 2 4-4" />
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
      {pagoRci && <VistaPrevia adjunto={pagoRci} alCerrar={() => setPagoRci(null)} />}
      {verSeguro && <ModalWhatsappSeguro exp={exp} alCerrar={() => setVerSeguro(false)} />}
      {verWhatsapp && <ModalWhatsapp exp={exp} alCerrar={() => setVerWhatsapp(false)} />}
      {escribiendo && (
        <ModalCorreo
          correo={null}
          inicial={{
            id_expediente: exp.id_expediente,
            clave: campo,
            es_vo: exp.estadoVehiculo?.clase === "VO",
            predefinido: cfg
              ? {
                  plantilla: plantillaModal,
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
