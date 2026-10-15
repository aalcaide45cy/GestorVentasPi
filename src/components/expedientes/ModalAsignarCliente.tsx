"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/components/Modal";
import { useToast } from "@/components/Toast";
import type { ClienteDto, TiendaDto, VendedorDto } from "@/lib/dto";
import { mensajeDeError } from "./comun";

interface Props {
  expedienteId: number;
  /** Si se pasa la lista (no vacía) se muestra el selector «Vendedor del Expediente». */
  vendedores?: VendedorDto[];
  vendedorInicial?: number | null;
  tiendas: TiendaDto[];
  tiendaPredeterminadaId: number | null;
  alAsignado: (cliente: { id: number; nombre: string | null; dni: string | null }, idVendedor: number | null) => void;
  alCerrar: () => void;
}

function pestana(activa: boolean) {
  return {
    padding: "8px 12px",
    background: "none",
    border: "none",
    color: activa ? "var(--primary)" : "var(--text-secondary)",
    borderBottom: activa ? "2px solid var(--primary)" : "none",
    fontWeight: activa ? 700 : 400,
    cursor: "pointer",
    fontSize: "0.9rem",
  } as const;
}

/** Asigna un cliente (existente o nuevo) a un expediente que no tiene cliente. */
export default function ModalAsignarCliente({
  expedienteId,
  vendedores = [],
  vendedorInicial = null,
  tiendas,
  tiendaPredeterminadaId,
  alAsignado,
  alCerrar,
}: Props) {
  const router = useRouter();
  const { mostrar } = useToast();
  const [pestanaActiva, setPestanaActiva] = useState<"buscar" | "crear">("buscar");
  const [consulta, setConsulta] = useState("");
  const [resultados, setResultados] = useState<ClienteDto[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [idVendedor, setIdVendedor] = useState<number | null>(vendedorInicial);
  const [ocupado, setOcupado] = useState(false);

  const [nombre, setNombre] = useState("");
  const [dni, setDni] = useState("");
  const [telefono, setTelefono] = useState("");
  const [email, setEmail] = useState("");
  const [tiendaId, setTiendaId] = useState("");
  const [errorCrear, setErrorCrear] = useState<string | null>(null);

  const buscar = async (valor: string) => {
    setConsulta(valor);
    if (valor.trim().length < 2) {
      setResultados([]);
      return;
    }
    setBuscando(true);
    try {
      const res = await fetch(`/api/clientes/buscar?q=${encodeURIComponent(valor)}`);
      if (res.ok) setResultados(((await res.json()) as { data: ClienteDto[] }).data ?? []);
    } finally {
      setBuscando(false);
    }
  };

  const asignar = async (c: { id: number; nombre: string | null; dni: string | null }) => {
    setOcupado(true);
    try {
      const res = await fetch("/api/expedientes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id_expediente: expedienteId,
          expediente: vendedores.length > 0 ? { id_usuario: idVendedor } : {},
          id_cliente: c.id,
        }),
      });
      if (!res.ok) throw new Error(await mensajeDeError(res, "Error al asignar el cliente."));
      mostrar("Cliente asignado correctamente.");
      alAsignado(c, vendedores.length > 0 ? idVendedor : null);
      router.refresh();
    } catch (e) {
      mostrar(e instanceof Error ? e.message : "Error al asignar el cliente.", "error");
    } finally {
      setOcupado(false);
    }
  };

  const crearYAsignar = async () => {
    if (!nombre.trim()) {
      setErrorCrear("El nombre es obligatorio.");
      return;
    }
    setOcupado(true);
    setErrorCrear(null);
    try {
      const res = await fetch("/api/clientes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nombre,
          dni: dni || null,
          tienda_id: tiendaId ? Number(tiendaId) : null,
          emails: email ? [{ email, tipo: "Principal" }] : [],
          telefonos: telefono ? [{ telefono, tipo: "Principal" }] : [],
        }),
      });
      if (!res.ok) throw new Error(await mensajeDeError(res, "Error al crear el cliente."));
      const creado = ((await res.json()) as { data: ClienteDto }).data;
      await asignar({ id: creado.id, nombre: creado.nombre, dni: creado.dni });
    } catch (e) {
      setErrorCrear(e instanceof Error ? e.message : "Error interno al crear el cliente.");
      setOcupado(false);
    }
  };

  return (
    <Modal
      titulo="Asignar Cliente al Expediente"
      ancho="450px"
      pie={
        <>
          <button type="button" className="btn btn-secondary" onClick={alCerrar} disabled={ocupado}>
            Cancelar
          </button>
          {pestanaActiva === "crear" && (
            <button type="button" className="btn btn-primary" onClick={crearYAsignar} disabled={ocupado}>
              {ocupado ? "Creando..." : "Crear y Asignar"}
            </button>
          )}
        </>
      }
    >
      <div style={{ display: "flex", borderBottom: "1px solid var(--border-light)", gap: "8px", marginBottom: "-8px" }}>
        <button type="button" style={pestana(pestanaActiva === "buscar")} onClick={() => setPestanaActiva("buscar")}>
          Buscar Existente
        </button>
        <button
          type="button"
          style={pestana(pestanaActiva === "crear")}
          onClick={() => {
            setPestanaActiva("crear");
            if (tiendas.length > 0 && !tiendaId) {
              setTiendaId(tiendaPredeterminadaId ? String(tiendaPredeterminadaId) : String(tiendas[0].id_tienda));
            }
          }}
        >
          ➕ Crear Nuevo Cliente
        </button>
      </div>

      {pestanaActiva === "buscar" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {vendedores.length > 0 && (
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label" style={{ fontSize: "0.8rem" }}>Vendedor del Expediente</label>
              <select
                className="form-select"
                value={idVendedor ?? ""}
                onChange={(e) => setIdVendedor(e.target.value ? Number(e.target.value) : null)}
                style={{ padding: "6px 10px" }}
              >
                <option value="">Seleccionar vendedor...</option>
                {vendedores.map((v) => (
                  <option key={v.id_usuario} value={v.id_usuario}>{v.nombre}</option>
                ))}
              </select>
            </div>
          )}
          <div className="form-group" style={{ marginBottom: 0, position: "relative" }}>
            <label className="form-label">🔍 Buscar Cliente (Nombre o DNI)</label>
            <input
              type="text"
              className="form-input"
              placeholder="Escribe al menos 2 caracteres..."
              value={consulta}
              onChange={(e) => buscar(e.target.value)}
              autoFocus
            />
            {buscando && (
              <div style={{ position: "absolute", right: "12px", bottom: "10px", fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                Buscando...
              </div>
            )}
          </div>

          {resultados.length > 0 ? (
            <div
              style={{
                maxHeight: "180px",
                overflowY: "auto",
                border: "1px solid var(--border-light)",
                borderRadius: "var(--radius-sm)",
                background: "rgba(255, 255, 255, 0.02)",
              }}
            >
              {resultados.map((c) => (
                <div
                  key={c.id}
                  onClick={() => asignar({ id: c.id, nombre: c.nombre, dni: c.dni })}
                  className="glass-panel-interactive"
                  style={{
                    padding: "10px 16px",
                    cursor: "pointer",
                    borderBottom: "1px solid var(--border-light)",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    borderRadius: 0,
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600, color: "var(--text-primary)" }}>{c.nombre}</div>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>DNI: {c.dni || "N/D"}</div>
                  </div>
                  <span style={{ fontSize: "0.8rem", color: "var(--primary)", fontWeight: 600 }}>Seleccionar →</span>
                </div>
              ))}
            </div>
          ) : consulta.trim().length >= 2 && !buscando ? (
            <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)", textAlign: "center", padding: "12px" }}>
              No se encontraron clientes para &quot;{consulta}&quot;
            </div>
          ) : null}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {errorCrear && (
            <div style={{ color: "var(--danger)", fontSize: "0.8rem", padding: "6px 8px", background: "rgba(239, 68, 68, 0.05)", borderRadius: "4px" }}>
              ⚠️ {errorCrear}
            </div>
          )}
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label" style={{ fontSize: "0.8rem" }}>Nombre Completo *</label>
            <input type="text" className="form-input" placeholder="Ej. Juan Pérez" value={nombre} onChange={(e) => setNombre(e.target.value)} style={{ padding: "6px 10px" }} />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label" style={{ fontSize: "0.8rem" }}>DNI / NIE</label>
            <input type="text" className="form-input" placeholder="Ej. 12345678Z" value={dni} onChange={(e) => setDni(e.target.value)} style={{ padding: "6px 10px" }} />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label" style={{ fontSize: "0.8rem" }}>Teléfono</label>
            <input type="text" className="form-input" placeholder="Ej. 600123456" value={telefono} onChange={(e) => setTelefono(e.target.value)} style={{ padding: "6px 10px" }} />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label" style={{ fontSize: "0.8rem" }}>Email</label>
            <input type="email" className="form-input" placeholder="Ej. juan@correo.com" value={email} onChange={(e) => setEmail(e.target.value)} style={{ padding: "6px 10px" }} />
          </div>
          {tiendas.length > 0 && (
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label" style={{ fontSize: "0.8rem" }}>Tienda Asociada</label>
              <select className="form-select" value={tiendaId} onChange={(e) => setTiendaId(e.target.value)} style={{ padding: "6px 10px" }}>
                {tiendas.map((t) => (
                  <option key={t.id_tienda} value={t.id_tienda}>{t.nombre}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
