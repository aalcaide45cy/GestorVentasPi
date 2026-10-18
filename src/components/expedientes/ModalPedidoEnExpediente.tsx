"use client";

import { useEffect, useState } from "react";
import Modal from "@/components/Modal";
import { useToast } from "@/components/Toast";
import { llamar, textoError } from "@/components/comisiones/api";
import { formatDate } from "@/lib/date-utils";
import type { CoincidenciaCliente } from "@/lib/servicios/clientes";
import type { ResultadoPedido } from "@/lib/servicios/documentos";
import VisorPedido from "../documentos/VisorPedido";

/** Lo que el formulario del expediente tiene ahora, para compararlo con el pedido. */
export interface ValoresActuales {
  idModelo: number | "";
  modelo: string;
  idTipoVenta: number | "";
  tipoVenta: string;
  vin: string;
  matricula: string;
  fExp: string;
  fEntrega: string;
  fMat: string;
  /** El expediente ya tiene un cliente asociado. */
  idCliente: number | null;
  dni: string;
  nombre: string;
  telefono: string;
  email: string;
}

/** Nombres legibles de lo que propone el pedido (el modelo y el tipo de pago salen del catálogo). */
export interface NombresPedido {
  modelo: string | null;
  tipoVenta: string | null;
}

export type EleccionCliente = { modo: "mantener" } | { modo: "ninguno" } | { modo: "existente"; id: number } | { modo: "nuevo" };

/** Lo que el usuario ha decidido aplicar. El formulario lo vuelca en sus campos; no se guarda hasta pulsar «Guardar Cambios». */
export interface CambiosDelPedido {
  idModelo?: number;
  idTipoVenta?: number;
  vin?: string;
  matricula?: string;
  fExp?: string;
  fEntrega?: string;
  fMat?: string;
  cliente: EleccionCliente;
  /** Con «mantener»: los datos del pedido que se añaden al cliente actual. Con «nuevo»: todos los del pedido. */
  datosCliente: { dni?: string; nombre?: string; telefono?: string; email?: string };
}

type Clave = "modelo" | "tipoVenta" | "vin" | "matricula" | "fExp" | "fEntrega" | "fMat" | "dni" | "nombre" | "telefono" | "email";

interface Fila {
  clave: Clave;
  etiqueta: string;
  actual: string;
  pedido: string;
  esFecha?: boolean;
  /** Fila que solo se puede aplicar si el pedido trae un valor del catálogo (modelo o tipo de pago reconocidos). */
  sinAplicar?: string;
}

interface Props {
  pedido: ResultadoPedido;
  actuales: ValoresActuales;
  nombres: NombresPedido;
  alAplicar: (cambios: CambiosDelPedido) => Promise<void>;
  alCancelar: () => void;
}

const norm = (t: string) => t.replace(/\s+/g, "").toUpperCase();

/**
 * Pedido leído en «Editar expediente»: vista previa de todos los datos que trae (vehículo, venta y cliente) frente a los del expediente,
 * con una casilla para cada uno y la elección del cliente (mantener, asociar uno existente o crear uno nuevo). Al aplicar se rellena
 * el formulario; el expediente se guarda después con «Guardar Cambios».
 */
export default function ModalPedidoEnExpediente({ pedido, actuales, nombres, alAplicar, alCancelar }: Props) {
  const { mostrar } = useToast();
  const d = pedido.datos;
  const [verPdf, setVerPdf] = useState(false);
  const [trabajando, setTrabajando] = useState(false);

  const filas: Fila[] = [
    { clave: "modelo", etiqueta: "Marca y modelo", actual: actuales.modelo, pedido: nombres.modelo ?? "", sinAplicar: d.idModelo === null && (d.modeloTexto || d.modeloPropuesto) ? `«${d.modeloTexto ?? d.modeloPropuesto}» no coincide con ningún modelo del catálogo` : undefined },
    { clave: "tipoVenta", etiqueta: "Tipo de pago", actual: actuales.tipoVenta, pedido: nombres.tipoVenta ?? "" },
    { clave: "vin", etiqueta: "Bastidor (VIN)", actual: actuales.vin, pedido: d.vin ?? "" },
    { clave: "matricula", etiqueta: "Matrícula", actual: actuales.matricula, pedido: d.matricula ?? "" },
    { clave: "fExp", etiqueta: "Fecha del expediente", actual: actuales.fExp, pedido: d.fechaExpediente ?? "", esFecha: true },
    { clave: "fEntrega", etiqueta: "Fecha de entrega", actual: actuales.fEntrega, pedido: d.fechaEntrega ?? "", esFecha: true },
    { clave: "fMat", etiqueta: "Fecha de matriculación", actual: actuales.fMat, pedido: d.fechaMatriculacion ?? "", esFecha: true },
  ];
  const filasCliente: Fila[] = [
    { clave: "dni", etiqueta: "DNI / NIE", actual: actuales.dni, pedido: d.dni ?? "" },
    { clave: "nombre", etiqueta: "Nombre", actual: actuales.nombre, pedido: d.cliente ?? "" },
    { clave: "telefono", etiqueta: "Teléfono", actual: actuales.telefono, pedido: d.telefono ?? "" },
    { clave: "email", etiqueta: "Correo", actual: actuales.email, pedido: d.email ?? "" },
  ];

  const distinto = (f: Fila) => f.pedido !== "" && norm(f.actual) !== norm(f.pedido);
  const aplicable = (f: Fila) => f.pedido !== "" && !f.sinAplicar && distinto(f);
  const [marcado, setMarcado] = useState<Record<string, boolean>>(() => Object.fromEntries([...filas, ...filasCliente].map((f) => [f.clave, aplicable(f) && f.actual.trim() === ""])));

  const tieneCliente = actuales.idCliente !== null || actuales.nombre.trim() !== "";
  const [coincidencias, setCoincidencias] = useState<CoincidenciaCliente[] | null>(null);
  const [cliente, setCliente] = useState<EleccionCliente | null>(tieneCliente ? { modo: "mantener" } : null);

  useEffect(() => {
    let vivo = true;
    llamar<CoincidenciaCliente[]>("/api/clientes/coincidencias", { method: "POST", cuerpo: { dni: d.dni, nombre: d.cliente } })
      .then((r) => {
        if (!vivo) return;
        setCoincidencias(r.data);
        if (!tieneCliente) {
          if (r.data.length === 1 && r.data[0].porDni) setCliente({ modo: "existente", id: r.data[0].id });
          else if (r.data.length === 0) setCliente(d.cliente ? { modo: "nuevo" } : { modo: "ninguno" });
        }
      })
      .catch((e: unknown) => {
        if (!vivo) return;
        mostrar(textoError(e), "error");
        setCoincidencias([]);
        if (!tieneCliente) setCliente(d.cliente ? { modo: "nuevo" } : { modo: "ninguno" });
      });
    return () => {
      vivo = false;
    };
  }, [d.dni, d.cliente, mostrar, tieneCliente]);

  const otros = (coincidencias ?? []).filter((c) => c.id !== actuales.idCliente);
  const mismoDni = actuales.dni !== "" && d.dni !== null && norm(actuales.dni) === norm(d.dni);

  const marcarTodo = (valor: boolean, soloVacios = false) =>
    setMarcado(Object.fromEntries([...filas, ...filasCliente].map((f) => [f.clave, valor && aplicable(f) && (!soloVacios || f.actual.trim() === "")])));

  const aplicar = async () => {
    if (cliente === null) return;
    setTrabajando(true);
    try {
      const cambios: CambiosDelPedido = { cliente, datosCliente: {} };
      if (marcado.modelo && aplicable(filas[0]) && d.idModelo) cambios.idModelo = d.idModelo;
      if (marcado.tipoVenta && aplicable(filas[1]) && d.idTipoDeVenta) cambios.idTipoVenta = d.idTipoDeVenta;
      if (marcado.vin && aplicable(filas[2])) cambios.vin = d.vin ?? undefined;
      if (marcado.matricula && aplicable(filas[3])) cambios.matricula = d.matricula ?? undefined;
      if (marcado.fExp && aplicable(filas[4])) cambios.fExp = d.fechaExpediente ?? undefined;
      if (marcado.fEntrega && aplicable(filas[5])) cambios.fEntrega = d.fechaEntrega ?? undefined;
      if (marcado.fMat && aplicable(filas[6])) cambios.fMat = d.fechaMatriculacion ?? undefined;
      if (cliente.modo === "nuevo") cambios.datosCliente = { dni: d.dni ?? undefined, nombre: d.cliente ?? undefined, telefono: d.telefono ?? undefined, email: d.email ?? undefined };
      if (cliente.modo === "mantener") {
        if (marcado.dni && aplicable(filasCliente[0])) cambios.datosCliente.dni = d.dni ?? undefined;
        if (marcado.nombre && aplicable(filasCliente[1])) cambios.datosCliente.nombre = d.cliente ?? undefined;
        if (marcado.telefono && aplicable(filasCliente[2])) cambios.datosCliente.telefono = d.telefono ?? undefined;
        if (marcado.email && aplicable(filasCliente[3])) cambios.datosCliente.email = d.email ?? undefined;
      }
      await alAplicar(cambios);
    } catch (e) {
      mostrar(textoError(e), "error");
      setTrabajando(false);
    }
  };

  const valorTexto = (f: Fila, v: string) => (v === "" ? "—" : f.esFecha ? formatDate(v) : v);

  const tabla = (lista: Fila[], deshabilitadas = false) => (
    <div className="table-container">
      <table className="table-premium table-compact">
        <thead>
          <tr>
            <th style={{ width: "60px" }}>Aplicar</th>
            <th>Dato</th>
            <th>Ahora</th>
            <th>Pedido</th>
          </tr>
        </thead>
        <tbody>
          {lista.map((f) => (
            <tr key={f.clave} style={{ opacity: f.pedido === "" || f.sinAplicar || deshabilitadas ? 0.55 : 1 }}>
              <td>
                <input type="checkbox" checked={!!marcado[f.clave] && aplicable(f) && !deshabilitadas} disabled={!aplicable(f) || deshabilitadas} onChange={(e) => setMarcado((p) => ({ ...p, [f.clave]: e.target.checked }))} style={{ width: "18px", height: "18px", accentColor: "var(--primary)" }} />
              </td>
              <td>{f.etiqueta}</td>
              <td>{valorTexto(f, f.actual)}</td>
              <td>
                <strong style={{ color: "var(--text-primary)" }}>{valorTexto(f, f.pedido)}</strong>
                {f.sinAplicar && <span style={{ display: "block", color: "var(--warning)", fontSize: "0.75rem" }}>{f.sinAplicar}</span>}
                {!f.sinAplicar && f.pedido !== "" && !distinto(f) && <span style={{ color: "var(--success)", marginLeft: "6px", fontSize: "0.75rem" }}>igual</span>}
                {!f.sinAplicar && distinto(f) && f.actual.trim() !== "" && <span style={{ color: "var(--warning)", marginLeft: "6px", fontSize: "0.75rem" }}>distinto</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const opcion = (valor: EleccionCliente, titulo: string, detalle?: string) => {
    const activa = cliente !== null && cliente.modo === valor.modo && (valor.modo !== "existente" || (cliente.modo === "existente" && cliente.id === valor.id));
    return (
      <label key={valor.modo === "existente" ? `e${valor.id}` : valor.modo} style={{ display: "flex", gap: "10px", alignItems: "flex-start", padding: "10px 12px", borderRadius: "var(--radius-sm)", cursor: "pointer", border: `1px solid ${activa ? "var(--primary)" : "var(--border-light)"}`, background: activa ? "var(--bg-surface-hover)" : "transparent" }}>
        <input type="radio" name="cliente-pedido" checked={activa} onChange={() => setCliente(valor)} style={{ marginTop: "3px", accentColor: "var(--primary)" }} />
        <span style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
          <strong style={{ fontSize: "0.9rem" }}>{titulo}</strong>
          {detalle && <span style={{ fontSize: "0.78rem", color: "var(--text-secondary)" }}>{detalle}</span>}
        </span>
      </label>
    );
  };

  const hayAlgo = [...filas, ...filasCliente].some(aplicable);
  return (
    <Modal
      titulo="📄 Completar el expediente con el pedido"
      ancho={verPdf ? "min(96vw, 1500px)" : "min(96vw, 760px)"}
      pie={
        <>
          <button type="button" className="btn btn-secondary" onClick={() => setVerPdf((v) => !v)} title="Muestra el PDF del pedido al lado de los datos para decidir qué aplicar mirando el original">
            {verPdf ? "🙈 Ocultar el PDF" : "👁 Ver el PDF"}
          </button>
          <button type="button" className="btn btn-secondary" onClick={alCancelar} disabled={trabajando}>
            Cancelar
          </button>
          <button type="button" className="btn btn-primary" onClick={() => void aplicar()} disabled={trabajando || cliente === null}>
            {trabajando ? "Aplicando…" : "Aplicar al expediente"}
          </button>
        </>
      }
    >
      <div style={{ display: "flex", gap: "20px", alignItems: "flex-start" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "14px", flex: "1 1 0", minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: "0.88rem", color: "var(--text-secondary)" }}>
            Marca lo que quieres tomar del pedido. Lo que ya está rellenado y es distinto no se marca solo. Se rellena el formulario y lo guardas con «Guardar Cambios».
          </p>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <button type="button" className="btn btn-secondary" style={{ padding: "2px 10px", fontSize: "0.78rem" }} onClick={() => marcarTodo(true)}>
              Marcar todo
            </button>
            <button type="button" className="btn btn-secondary" style={{ padding: "2px 10px", fontSize: "0.78rem" }} onClick={() => marcarTodo(true, true)}>
              Solo los vacíos
            </button>
            <button type="button" className="btn btn-secondary" style={{ padding: "2px 10px", fontSize: "0.78rem" }} onClick={() => marcarTodo(false)}>
              Ninguno
            </button>
          </div>
          {d.retoma && (
            <div style={{ padding: "10px 12px", borderLeft: "4px solid var(--info)", background: "var(--bg-surface-tint)", fontSize: "0.88rem" }}>
              🔁 <strong>Lleva vehículo de retoma</strong>
              {d.retoma.matricula ? ` (matrícula ${d.retoma.matricula})` : ""}
              {d.retoma.texto ? `: ${d.retoma.texto}` : ""}. Esa matrícula no se usa en el expediente.
            </div>
          )}
          <strong style={{ fontSize: "0.95rem" }}>Vehículo y venta</strong>
          {tabla(filas)}
          {!hayAlgo && <div style={{ color: "var(--text-secondary)", fontSize: "0.88rem" }}>El pedido no trae nada nuevo para el vehículo y la venta.</div>}
          {d.avisos.length > 0 && <div style={{ color: "var(--warning)", fontSize: "0.82rem" }}>⚠️ {d.avisos[0]}</div>}

          <strong style={{ fontSize: "0.95rem" }}>Cliente</strong>
          {coincidencias === null ? (
            <span style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>Buscando al cliente…</span>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {tieneCliente && opcion({ modo: "mantener" }, `Mantener el cliente actual: ${actuales.nombre || "(sin nombre)"}`, mismoDni ? "Coincide con el DNI del pedido." : "Se queda como está, salvo los datos que marques abajo.")}
              {otros.map((c) => opcion({ modo: "existente", id: c.id }, `${tieneCliente ? "Cambiar a" : "Asociar"} ${c.nombre ?? "(sin nombre)"}${c.dni ? ` · ${c.dni}` : ""}`, c.porDni ? "Mismo DNI/NIE que el pedido" : "Mismo nombre (sin coincidir el DNI)"))}
              {d.cliente && !mismoDni && !coincidencias.some((c) => c.porDni) && opcion({ modo: "nuevo" }, `Crear el cliente ${d.cliente} con los datos del pedido`, "Se rellenan su nombre, DNI, teléfono y correo en el formulario; el cliente se crea al pulsar «Guardar Cambios».")}
              {!tieneCliente && opcion({ modo: "ninguno" }, "Dejar el expediente sin cliente")}
            </div>
          )}
          {cliente?.modo === "mantener" && (
            <>
              <span style={{ fontSize: "0.82rem", color: "var(--text-secondary)" }}>Datos del cliente actual que se pueden completar con el pedido:</span>
              {tabla(filasCliente)}
            </>
          )}
        </div>
        {verPdf && <VisorPedido idAdjunto={pedido.adjunto.id} nombre={pedido.adjunto.nombre} />}
      </div>
    </Modal>
  );
}
