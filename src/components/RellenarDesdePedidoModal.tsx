"use client";

import { useEffect, useState } from "react";
import Modal from "@/components/Modal";
import { useToast } from "@/components/Toast";
import { llamar, textoError } from "@/components/comisiones/api";
import { formatDate } from "@/lib/date-utils";
import type { ExpedienteDto } from "@/lib/dto";
import type { CoincidenciaCliente } from "@/lib/servicios/clientes";
import type { ResultadoPedido } from "@/lib/servicios/documentos";
import { vincularAdjuntos } from "./documentos/BotonLeerDocumento";

type CampoRelleno = "vin" | "matricula" | "fecha_expediente" | "fecha_entrega";

export type CambiosExpediente = Partial<Pick<ExpedienteDto, CampoRelleno>> & { id_cliente?: number; cliente?: ExpedienteDto["cliente"] };

interface Props {
  expediente: ExpedienteDto;
  pedido: ResultadoPedido;
  /** Posición en la cola de pedidos y navegación entre ellos. */
  posicion?: number;
  total?: number;
  alIr?: (delta: -1 | 1) => void;
  alCerrar: () => void;
  alTerminar: (cambios: CambiosExpediente, mensaje: string) => void;
}

/** Cliente elegido: «mantener» el que ya tiene el expediente, uno existente, uno nuevo o ninguno. */
type EleccionCliente = "mantener" | number | "nuevo" | "ninguno" | null;

const ETIQUETAS: Record<CampoRelleno, string> = { vin: "Bastidor", matricula: "Matrícula", fecha_expediente: "Fecha del expediente", fecha_entrega: "Fecha de entrega" };

/**
 * Pedido soltado sobre un expediente ya creado (p. ej. con los botones de acceso rápido): propone rellenar bastidor, matrícula,
 * fechas y cliente con los datos del pedido. Lo que ya está rellenado y es distinto no se pisa salvo que se marque.
 */
export default function RellenarDesdePedidoModal({ expediente, pedido, posicion = 1, total = 1, alIr, alCerrar, alTerminar }: Props) {
  const { mostrar } = useToast();
  const d = pedido.datos;
  const nuevos: Record<CampoRelleno, string | null> = { vin: d.vin, matricula: d.matricula, fecha_expediente: d.fechaExpediente, fecha_entrega: d.fechaEntrega };
  const actuales: Record<CampoRelleno, string | null> = { vin: expediente.vin, matricula: expediente.matricula, fecha_expediente: expediente.fecha_expediente, fecha_entrega: expediente.fecha_entrega };
  const campos = (Object.keys(ETIQUETAS) as CampoRelleno[]).filter((c) => nuevos[c]);
  const [aplicar, setAplicar] = useState<Record<string, boolean>>(() => Object.fromEntries(campos.map((c) => [c, !actuales[c]])));

  const tieneCliente = !!expediente.cliente;
  const [coincidencias, setCoincidencias] = useState<CoincidenciaCliente[] | null>(null);
  const [cliente, setCliente] = useState<EleccionCliente>(tieneCliente ? "mantener" : null);
  const [trabajando, setTrabajando] = useState(false);

  useEffect(() => {
    let vivo = true;
    llamar<CoincidenciaCliente[]>("/api/clientes/coincidencias", { method: "POST", cuerpo: { dni: d.dni, nombre: d.cliente } })
      .then((r) => {
        if (!vivo) return;
        setCoincidencias(r.data);
        if (!tieneCliente) {
          if (r.data.length === 1 && r.data[0].porDni) setCliente(r.data[0].id);
          else if (r.data.length === 0) setCliente(d.cliente ? "nuevo" : "ninguno");
        }
      })
      .catch((e: unknown) => {
        if (!vivo) return;
        mostrar(textoError(e), "error");
        setCoincidencias([]);
        if (!tieneCliente) setCliente(d.cliente ? "nuevo" : "ninguno");
      });
    return () => {
      vivo = false;
    };
  }, [d.dni, d.cliente, mostrar, tieneCliente]);

  const mismoCliente = tieneCliente && !!expediente.cliente?.dni && !!d.dni && expediente.cliente.dni.toUpperCase() === d.dni.toUpperCase();
  const otros = (coincidencias ?? []).filter((c) => c.id !== expediente.id_cliente);

  const aplicarCambios = async () => {
    if (cliente === null) return;
    setTrabajando(true);
    try {
      let idCliente: number | null = null;
      let datosCliente: ExpedienteDto["cliente"] = expediente.cliente;
      if (cliente === "nuevo") {
        const { data } = await llamar<{ id: number }>("/api/clientes", {
          method: "POST",
          cuerpo: {
            nombre: d.cliente,
            dni: d.dni,
            domicilio: d.domicilio,
            poblacion: d.poblacion,
            codigo_postal: d.codigoPostal,
            emails: d.email ? [{ email: d.email, tipo: "Principal" }] : [],
            telefonos: d.telefono ? [{ telefono: d.telefono, tipo: "Principal" }] : [],
          },
        });
        idCliente = data.id;
        datosCliente = { id: data.id, cliente_id: "", dni: d.dni, nombre: d.cliente, fecha_de_nacimiento: null, tienda_id: null, emails: [], telefonos: [] };
      } else if (typeof cliente === "number") {
        idCliente = cliente;
        const c = coincidencias?.find((x) => x.id === cliente);
        datosCliente = { id: cliente, cliente_id: "", dni: c?.dni ?? null, nombre: c?.nombre ?? null, fecha_de_nacimiento: null, tienda_id: null, emails: [], telefonos: [] };
      }
      const cambios: Partial<Record<CampoRelleno, string>> = {};
      for (const c of campos) if (aplicar[c]) cambios[c] = nuevos[c] as string;
      const hayCambios = Object.keys(cambios).length > 0 || idCliente !== null;
      if (hayCambios) {
        await llamar("/api/expedientes", { method: "PUT", cuerpo: { id_expediente: expediente.id_expediente, ...(idCliente !== null ? { id_cliente: idCliente } : {}), expediente: cambios } });
      }
      await vincularAdjuntos([pedido.adjunto.id], { idExpediente: expediente.id_expediente, idCliente: idCliente ?? expediente.id_cliente });
      alTerminar({ ...cambios, ...(idCliente !== null ? { id_cliente: idCliente, cliente: datosCliente } : {}) }, "Expediente completado con los datos del pedido y pedido adjuntado.");
    } catch (e) {
      mostrar(textoError(e), "error");
      setTrabajando(false);
    }
  };

  const opcion = (valor: EleccionCliente, titulo: string, detalle?: string) => (
    <label key={String(valor)} style={{ display: "flex", gap: "10px", alignItems: "flex-start", padding: "10px 12px", borderRadius: "var(--radius-sm)", cursor: "pointer", border: `1px solid ${cliente === valor ? "var(--primary)" : "var(--border-light)"}`, background: cliente === valor ? "var(--bg-surface-hover)" : "transparent" }}>
      <input type="radio" name="cliente-relleno" checked={cliente === valor} onChange={() => setCliente(valor)} style={{ marginTop: "3px", accentColor: "var(--primary)" }} />
      <span style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
        <strong style={{ fontSize: "0.9rem" }}>{titulo}</strong>
        {detalle && <span style={{ fontSize: "0.78rem", color: "var(--text-secondary)" }}>{detalle}</span>}
      </span>
    </label>
  );

  const mostrarFecha = (c: CampoRelleno, v: string | null) => (v ? (c.startsWith("fecha") ? formatDate(v) : v) : "—");

  return (
    <Modal
      titulo={
        <span style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          📄 Completar el expediente con el pedido
          {total > 1 && alIr && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "0.85rem", fontWeight: 500, color: "var(--text-secondary)" }}>
              <button type="button" className="btn btn-secondary" style={{ padding: "2px 8px" }} disabled={posicion <= 1 || trabajando} onClick={() => alIr(-1)}>
                ‹
              </button>
              {posicion} de {total}
              <button type="button" className="btn btn-secondary" style={{ padding: "2px 8px" }} disabled={posicion >= total || trabajando} onClick={() => alIr(1)}>
                ›
              </button>
            </span>
          )}
        </span>
      }
      ancho="680px"
      pie={
        <>
          <button type="button" className="btn btn-secondary" onClick={alCerrar} disabled={trabajando}>
            Cerrar (queda en la cola)
          </button>
          <button type="button" className="btn btn-primary" onClick={() => void aplicarCambios()} disabled={trabajando || cliente === null}>
            {trabajando ? "Guardando…" : "Completar expediente"}
          </button>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
        {d.retoma && (
          <div style={{ padding: "10px 12px", borderLeft: "4px solid var(--info)", background: "var(--bg-surface-tint)", fontSize: "0.88rem" }}>
            🔁 <strong>Lleva vehículo de retoma</strong>
            {d.retoma.matricula ? ` (matrícula ${d.retoma.matricula})` : ""}
            {d.retoma.texto ? `: ${d.retoma.texto}` : ""}. Esa matrícula no se usa en el expediente.
          </div>
        )}
        {campos.length > 0 ? (
          <div className="table-container">
            <table className="table-premium table-compact">
              <thead>
                <tr>
                  <th>Aplicar</th>
                  <th>Dato</th>
                  <th>Ahora</th>
                  <th>Pedido</th>
                </tr>
              </thead>
              <tbody>
                {campos.map((c) => (
                  <tr key={c}>
                    <td>
                      <input type="checkbox" checked={!!aplicar[c]} onChange={(e) => setAplicar((p) => ({ ...p, [c]: e.target.checked }))} style={{ width: "18px", height: "18px", accentColor: "var(--primary)" }} />
                    </td>
                    <td>{ETIQUETAS[c]}</td>
                    <td>{mostrarFecha(c, actuales[c])}</td>
                    <td>
                      <strong style={{ color: "var(--text-primary)" }}>{mostrarFecha(c, nuevos[c])}</strong>
                      {actuales[c] && actuales[c] !== nuevos[c] && <span style={{ color: "var(--warning)", marginLeft: "6px", fontSize: "0.78rem" }}>distinto</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ color: "var(--text-secondary)", fontSize: "0.9rem" }}>El pedido no trae bastidor, matrícula ni fechas que aplicar.</div>
        )}
        {d.avisos.length > 0 && <div style={{ color: "var(--warning)", fontSize: "0.82rem" }}>⚠️ {d.avisos[0]}</div>}

        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <strong style={{ fontSize: "0.95rem" }}>Cliente</strong>
          {coincidencias === null ? (
            <span style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>Buscando al cliente…</span>
          ) : (
            <>
              {tieneCliente && opcion("mantener", `Mantener el cliente actual: ${expediente.cliente?.nombre ?? "(sin nombre)"}`, mismoCliente ? "Coincide con el DNI del pedido." : "No se cambia el cliente del expediente.")}
              {otros.map((c) => opcion(c.id, `${tieneCliente ? "Cambiar a" : "Asociar"} ${c.nombre ?? "(sin nombre)"}${c.dni ? ` · ${c.dni}` : ""}`, c.porDni ? "Mismo DNI/NIE que el pedido" : "Mismo nombre (sin coincidir el DNI)"))}
              {d.cliente && !mismoCliente && !(coincidencias.some((c) => c.porDni)) && opcion("nuevo", `Crear el cliente ${d.cliente} con los datos del pedido`, "Nombre, DNI, teléfono, correo y dirección del pedido; con tu tienda predeterminada.")}
              {!tieneCliente && opcion("ninguno", "Dejar el expediente sin cliente")}
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
