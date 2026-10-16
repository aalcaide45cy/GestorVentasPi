"use client";

import { useEffect, useState } from "react";
import Modal from "@/components/Modal";
import { useToast } from "@/components/Toast";
import { llamar, textoError } from "@/components/comisiones/api";
import type { MarcaDto, ModeloDto, TipoVentaDto } from "@/lib/dto";
import type { CoincidenciaCliente } from "@/lib/servicios/clientes";
import type { ResultadoPedido } from "@/lib/servicios/documentos";
import { vincularAdjuntos } from "./documentos/BotonLeerDocumento";

type MarcaConModelos = MarcaDto & { modelos: ModeloDto[] };

export interface EleccionRapida {
  idModelo: number | null;
  nombreModelo: string;
  tipo: TipoVentaDto;
  estadoNombre?: string;
}

interface Props {
  pedido: ResultadoPedido;
  /** Modelo y forma de pago ya elegidos (el pedido se soltó sobre un botón de acceso rápido); null si se soltó en la zona general. */
  eleccion: EleccionRapida | null;
  marcas: MarcaConModelos[];
  tiposVenta: TipoVentaDto[];
  vendedorId: number;
  alCerrar: () => void;
  alTerminar: (mensaje: string) => void;
}

type ClienteElegido = number | "nuevo" | "ninguno" | null;

const fila = (etiqueta: string, valor: string | null) => (
  <div style={{ display: "flex", gap: "8px", fontSize: "0.88rem" }}>
    <span style={{ color: "var(--text-muted)", minWidth: "78px" }}>{etiqueta}</span>
    <strong style={{ wordBreak: "break-word" }}>{valor || "—"}</strong>
  </div>
);

/**
 * Pedido soltado en el dashboard: tras leerlo, comprueba si el cliente ya existe y pregunta qué hacer (crearlo, asociar uno
 * existente o elegir entre varios) y crea el expediente con el modelo y la forma de pago, el cliente y los datos del pedido.
 */
export default function PedidoRapidoModal({ pedido, eleccion, marcas, tiposVenta, vendedorId, alCerrar, alTerminar }: Props) {
  const { mostrar } = useToast();
  const d = pedido.datos;
  const [coincidencias, setCoincidencias] = useState<CoincidenciaCliente[] | null>(null);
  const [cliente, setCliente] = useState<ClienteElegido>(null);
  const [modelo, setModelo] = useState<number | "">(d.idModelo ?? "");
  const [tipo, setTipo] = useState<number | "">(d.idTipoDeVenta ?? "");
  const [trabajando, setTrabajando] = useState(false);

  useEffect(() => {
    let vivo = true;
    llamar<CoincidenciaCliente[]>("/api/clientes/coincidencias", { method: "POST", cuerpo: { dni: d.dni, nombre: d.cliente } })
      .then((r) => {
        if (!vivo) return;
        setCoincidencias(r.data);
        // Un único cliente con el mismo DNI: se propone asociarlo directamente
        if (r.data.length === 1 && r.data[0].porDni) setCliente(r.data[0].id);
        else if (r.data.length === 0) setCliente(d.cliente ? "nuevo" : "ninguno");
      })
      .catch((e: unknown) => {
        if (!vivo) return;
        mostrar(textoError(e), "error");
        setCoincidencias([]);
        setCliente(d.cliente ? "nuevo" : "ninguno");
      });
    return () => {
      vivo = false;
    };
  }, [d.dni, d.cliente, mostrar]);

  const modelosPlanos = marcas.flatMap((m) => m.modelos.map((x) => ({ id: x.id_modelo, texto: `${m.nombre} ${x.nombre_modelo}` })));
  const idModeloFinal = eleccion ? eleccion.idModelo : modelo === "" ? null : modelo;
  const tipoFinal = eleccion ? eleccion.tipo.id_tipo_de_venta : tipo === "" ? null : tipo;
  const falta = !eleccion && (tipoFinal === null || (idModeloFinal === null && !eleccion));
  const puedeCrear = cliente !== null && !falta && !trabajando;

  const crear = async () => {
    if (cliente === null || tipoFinal === null) return;
    setTrabajando(true);
    try {
      let idCliente: number | null = null;
      if (cliente === "nuevo") {
        // La tienda es la predeterminada del usuario (la asigna el servidor)
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
      } else if (typeof cliente === "number") {
        idCliente = cliente;
      }
      const { data: creado } = await llamar<{ id_expediente: number }>("/api/expedientes", {
        method: "POST",
        cuerpo: {
          expediente: {
            id_modelo: idModeloFinal,
            id_tipo_de_venta: tipoFinal,
            estado_nombre: eleccion?.estadoNombre,
            id_usuario: vendedorId,
            vin: d.vin ?? undefined,
            matricula: d.matricula ?? undefined,
            fecha_expediente: d.fechaExpediente ?? undefined,
            fecha_entrega: d.fechaEntrega ?? undefined,
          },
        },
      });
      if (idCliente) await llamar("/api/expedientes", { method: "PUT", cuerpo: { id_expediente: creado.id_expediente, id_cliente: idCliente, expediente: {} } }).catch(() => undefined);
      await vincularAdjuntos([pedido.adjunto.id], { idExpediente: creado.id_expediente, idCliente });
      alTerminar(cliente === "nuevo" ? `Expediente creado con el cliente nuevo ${d.cliente}.` : idCliente ? "Expediente creado y asociado al cliente." : "Expediente creado sin cliente.");
    } catch (e) {
      mostrar(textoError(e), "error");
      setTrabajando(false);
    }
  };

  const opcion = (valor: ClienteElegido, titulo: string, detalle?: string) => (
    <label key={String(valor)} style={{ display: "flex", gap: "10px", alignItems: "flex-start", padding: "10px 12px", borderRadius: "var(--radius-sm)", cursor: "pointer", border: `1px solid ${cliente === valor ? "var(--primary)" : "var(--border-light)"}`, background: cliente === valor ? "var(--bg-surface-hover)" : "transparent" }}>
      <input type="radio" name="cliente-pedido" checked={cliente === valor} onChange={() => setCliente(valor)} style={{ marginTop: "3px", accentColor: "var(--primary)" }} />
      <span style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
        <strong style={{ fontSize: "0.9rem" }}>{titulo}</strong>
        {detalle && <span style={{ fontSize: "0.78rem", color: "var(--text-secondary)" }}>{detalle}</span>}
      </span>
    </label>
  );

  return (
    <Modal
      titulo="📄 Pedido leído"
      ancho="640px"
      pie={
        <>
          <button type="button" className="btn btn-secondary" onClick={alCerrar} disabled={trabajando}>
            Cancelar
          </button>
          <button type="button" className="btn btn-primary" onClick={() => void crear()} disabled={!puedeCrear}>
            {trabajando ? "Creando…" : "Crear expediente"}
          </button>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
        <div className="glass-panel" style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: "4px" }}>
          {fila("Cliente", d.cliente)}
          {fila("DNI / NIE", d.dni)}
          {fila("Teléfono", d.telefono)}
          {fila("Email", d.email)}
          {fila("Domicilio", d.domicilio)}
          {fila("Población", [d.codigoPostal, d.poblacion].filter(Boolean).join(" ") || null)}
          {fila("Vehículo", d.modeloTexto)}
          {fila("Bastidor", d.vin)}
          {fila("Matrícula", d.matricula)}
        </div>
        {d.avisos.length > 0 && <div style={{ color: "var(--warning)", fontSize: "0.82rem" }}>⚠️ {d.avisos[0]}</div>}

        {eleccion ? (
          <div style={{ fontSize: "0.88rem" }}>
            Se creará el expediente de <strong>{eleccion.nombreModelo}</strong> con pago <strong>{eleccion.tipo.nombre_tipo_venta}</strong>.
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Modelo</label>
              <select className="form-select" value={modelo} onChange={(e) => setModelo(e.target.value ? Number(e.target.value) : "")}>
                <option value="">Sin modelo</option>
                {modelosPlanos.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.texto}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Forma de pago *</label>
              <select className="form-select" value={tipo} onChange={(e) => setTipo(e.target.value ? Number(e.target.value) : "")}>
                <option value="">Elige…</option>
                {tiposVenta.map((t) => (
                  <option key={t.id_tipo_de_venta} value={t.id_tipo_de_venta}>
                    {t.nombre_tipo_venta}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {coincidencias === null ? (
            <span style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>Buscando al cliente…</span>
          ) : coincidencias.length === 0 ? (
            <>
              <div style={{ padding: "10px 12px", borderLeft: "4px solid var(--warning)", background: "var(--bg-surface-tint)", fontSize: "0.9rem" }}>
                ⚠️ <strong>{d.cliente ?? "El cliente del pedido"}</strong> no está creado todavía. ¿Quieres crearlo?
              </div>
              {d.cliente && opcion("nuevo", "Sí, crear el cliente con los datos del pedido", "Nombre, DNI, teléfono, correo y dirección del pedido; se le pone tu tienda predeterminada y se asigna al expediente.")}
              {opcion("ninguno", "No, crear el expediente sin cliente")}
            </>
          ) : (
            <>
              <div style={{ padding: "10px 12px", borderLeft: "4px solid var(--info)", background: "var(--bg-surface-tint)", fontSize: "0.9rem" }}>
                {coincidencias.length === 1 ? "Ya existe un cliente que coincide. ¿Quieres asociarlo al expediente?" : `Hay ${coincidencias.length} clientes que podrían ser él. Elige cuál es:`}
              </div>
              {coincidencias.map((c) => opcion(c.id, `${c.nombre ?? "(sin nombre)"}${c.dni ? ` · ${c.dni}` : ""}`, c.porDni ? "Mismo DNI/NIE" : "Mismo nombre (sin coincidir el DNI)"))}
              {d.cliente && opcion("nuevo", "Ninguno: crear un cliente nuevo con los datos del pedido", d.dni && coincidencias.some((c) => c.porDni) ? "Ojo: ya hay un cliente con ese DNI, no se podrá crear otro igual." : undefined)}
              {opcion("ninguno", "Crear el expediente sin cliente")}
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
