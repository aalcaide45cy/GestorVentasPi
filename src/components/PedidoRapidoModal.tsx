"use client";

import { useEffect, useState } from "react";
import Modal from "@/components/Modal";
import { useToast } from "@/components/Toast";
import { llamar, textoError } from "@/components/comisiones/api";
import type { MarcaDto, ModeloDto, TipoVentaDto } from "@/lib/dto";
import { formatDate } from "@/lib/date-utils";
import type { EleccionRapida, ItemCola } from "@/lib/pedidos-cola";
import type { CoincidenciaCliente } from "@/lib/servicios/clientes";
import { vincularAdjuntos } from "./documentos/BotonLeerDocumento";

export type { EleccionRapida };
type MarcaConModelos = MarcaDto & { modelos: ModeloDto[] };

interface Props {
  item: ItemCola;
  marcas: MarcaConModelos[];
  tiposVenta: TipoVentaDto[];
  vendedorId: number;
  /** Posición del pedido en la cola y navegación entre pedidos. */
  posicion: number;
  total: number;
  alIr: (delta: -1 | 1) => void;
  alCerrar: () => void;
  alTerminar: (mensaje: string) => void;
}

type ClienteElegido = number | "nuevo" | "ninguno" | null;
type Dato = "dni" | "telefono" | "email" | "domicilio" | "poblacion" | "vin" | "fecha" | "entrega" | "matricula";

/**
 * Pedido leído en la cola: comprueba si el cliente ya existe y pregunta qué hacer (crearlo, asociar uno existente o elegir entre
 * varios); cada dato del pedido se puede aplicar o no, y crea el expediente con el modelo y la forma de pago.
 */
export default function PedidoRapidoModal({ item, marcas, tiposVenta, vendedorId, posicion, total, alIr, alCerrar, alTerminar }: Props) {
  const { mostrar } = useToast();
  const pedido = item.pedido;
  const eleccion = item.eleccion;
  const d = pedido.datos;
  const [coincidencias, setCoincidencias] = useState<CoincidenciaCliente[] | null>(null);
  const [cliente, setCliente] = useState<ClienteElegido>(null);
  const [modelo, setModelo] = useState<number | "">(d.idModelo ?? "");
  const [tipo, setTipo] = useState<number | "">(d.idTipoDeVenta ?? "");
  const [trabajando, setTrabajando] = useState(false);

  const valores: Record<Dato, string | null> = {
    dni: d.dni,
    telefono: d.telefono,
    email: d.email,
    domicilio: d.domicilio,
    poblacion: [d.codigoPostal, d.poblacion].filter(Boolean).join(" ") || null,
    vin: d.vin,
    fecha: d.fechaExpediente,
    entrega: d.fechaEntrega,
    matricula: d.matricula,
  };
  const etiquetas: Record<Dato, string> = { dni: "DNI / NIE", telefono: "Teléfono", email: "Email", domicilio: "Domicilio", poblacion: "Población", vin: "Bastidor", fecha: "Fecha del pedido", entrega: "Fecha de entrega", matricula: "Matrícula" };
  const grupos: { titulo: string; campos: Dato[] }[] = [
    { titulo: "Datos del cliente", campos: ["dni", "telefono", "email", "domicilio", "poblacion"] },
    { titulo: "Datos del expediente", campos: ["fecha", "entrega", "vin", "matricula"] },
  ];
  const [usar, setUsar] = useState<Record<Dato, boolean>>(() => Object.fromEntries((Object.keys(valores) as Dato[]).map((k) => [k, !!valores[k]])) as Record<Dato, boolean>);
  const activo = (k: Dato) => usar[k] && !!valores[k];

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
  const falta = !eleccion && tipoFinal === null;
  const puedeCrear = cliente !== null && !falta && !trabajando;
  // Pedido de un vehículo de ocasión vendido: el expediente es de usados
  const estadoNombre = eleccion?.estadoNombre ?? (d.tipoPedido === "usado" ? "usado" : undefined);

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
            dni: activo("dni") ? d.dni : null,
            domicilio: activo("domicilio") ? d.domicilio : null,
            poblacion: activo("poblacion") ? d.poblacion : null,
            codigo_postal: activo("poblacion") ? d.codigoPostal : null,
            emails: activo("email") && d.email ? [{ email: d.email, tipo: "Principal" }] : [],
            telefonos: activo("telefono") && d.telefono ? [{ telefono: d.telefono, tipo: "Principal" }] : [],
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
            estado_nombre: estadoNombre,
            id_usuario: vendedorId,
            vin: activo("vin") ? d.vin : undefined,
            matricula: activo("matricula") ? d.matricula : undefined,
            fecha_expediente: activo("fecha") ? d.fechaExpediente : undefined,
            fecha_entrega: activo("entrega") ? d.fechaEntrega : undefined,
          },
        },
      });
      if (idCliente) await llamar("/api/expedientes", { method: "PUT", cuerpo: { id_expediente: creado.id_expediente, id_cliente: idCliente, expediente: {} } }).catch(() => undefined);
      // Si el modelo no se había reconocido y el usuario lo ha elegido, la app lo aprende para la próxima vez
      if (!eleccion && d.idModelo === null && d.modeloTexto && idModeloFinal) {
        await llamar("/api/documentos/aprender-modelo", { method: "POST", cuerpo: { texto: d.modeloTexto, id_modelo: idModeloFinal } }).catch(() => undefined);
      }
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

  const textoDato = (k: Dato) => (valores[k] ? (k === "fecha" || k === "entrega" ? formatDate(valores[k] as string) : (valores[k] as string)) : null);

  return (
    <Modal
      titulo={
        <span style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          📄 Pedido leído
          {total > 1 && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "0.85rem", fontWeight: 500, color: "var(--text-secondary)" }}>
              <button type="button" className="btn btn-secondary" style={{ padding: "2px 8px" }} disabled={posicion <= 1 || trabajando} onClick={() => alIr(-1)} title="Pedido anterior de la cola">
                ‹
              </button>
              {posicion} de {total}
              <button type="button" className="btn btn-secondary" style={{ padding: "2px 8px" }} disabled={posicion >= total || trabajando} onClick={() => alIr(1)} title="Pedido siguiente de la cola">
                ›
              </button>
            </span>
          )}
        </span>
      }
      ancho="700px"
      pie={
        <>
          <button type="button" className="btn btn-secondary" onClick={alCerrar} disabled={trabajando} title="Cierra la ventana: el pedido se queda en la cola de pedidos para retomarlo después">
            Cerrar (queda en la cola)
          </button>
          <button type="button" className="btn btn-primary" onClick={() => void crear()} disabled={!puedeCrear}>
            {trabajando ? "Creando…" : "Crear expediente"}
          </button>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
        <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
          Fichero: {item.nombre}
          {d.numeroPedido ? ` · Pedido ${d.numeroPedido}` : ""}
          {d.tipoPedido === "usado" ? " · 🚗 Vehículo de ocasión vendido" : d.tipoPedido === "nuevo" ? " · Vehículo nuevo" : ""}
        </div>

        {d.retoma && (
          <div style={{ padding: "10px 12px", borderLeft: "4px solid var(--info)", background: "var(--bg-surface-tint)", fontSize: "0.88rem" }}>
            🔁 <strong>Lleva vehículo de retoma</strong>
            {d.retoma.matricula ? ` (matrícula ${d.retoma.matricula})` : ""}
            {d.retoma.texto ? `: ${d.retoma.texto}` : ""}. Esa matrícula no se usa en el expediente.
          </div>
        )}

        <div className="glass-panel" style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: "6px" }}>
          <div style={{ display: "flex", gap: "8px", fontSize: "0.9rem" }}>
            <span style={{ color: "var(--text-muted)", minWidth: "130px" }}>Cliente</span>
            <strong style={{ wordBreak: "break-word" }}>{d.cliente || "—"}</strong>
          </div>
          {grupos.map((g) => (
            <div key={g.titulo} style={{ display: "flex", flexDirection: "column", gap: "4px", marginTop: "6px" }}>
              <span style={{ fontSize: "0.72rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>{g.titulo} · marca lo que quieres aplicar</span>
              {g.campos.map((k) => (
                <label key={k} style={{ display: "flex", gap: "8px", alignItems: "center", fontSize: "0.88rem", opacity: valores[k] ? 1 : 0.5, cursor: valores[k] ? "pointer" : "default" }}>
                  <input type="checkbox" disabled={!valores[k]} checked={activo(k)} onChange={(e) => setUsar((p) => ({ ...p, [k]: e.target.checked }))} style={{ accentColor: "var(--primary)" }} />
                  <span style={{ color: "var(--text-muted)", minWidth: "120px" }}>{etiquetas[k]}</span>
                  <strong style={{ wordBreak: "break-word" }}>{textoDato(k) ?? "—"}</strong>
                </label>
              ))}
            </div>
          ))}
          <div style={{ display: "flex", gap: "8px", fontSize: "0.9rem", marginTop: "6px" }}>
            <span style={{ color: "var(--text-muted)", minWidth: "130px" }}>Vehículo</span>
            <strong style={{ wordBreak: "break-word" }}>{d.modeloTexto || "—"}</strong>
          </div>
        </div>
        {(pedido.similares ?? []).length > 0 && (
          <div style={{ color: "var(--warning)", fontSize: "0.85rem", border: "1px solid var(--warning)", borderRadius: "var(--radius-sm)", padding: "8px 10px" }}>
            ⚠️ Ya existe un expediente parecido: {(pedido.similares ?? []).map((x) => `nº ${x.idExpediente} (${x.motivo}${x.cliente ? `, ${x.cliente}` : ""})`).join("; ")}. Puedes continuar, pero comprueba que no lo duplicas.
          </div>
        )}
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
              {d.cliente && opcion("nuevo", "Sí, crear el cliente con los datos marcados del pedido", "Se le pone tu tienda predeterminada y se asigna al expediente.")}
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
