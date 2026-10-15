"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ModalConfirmar } from "@/components/Modal";
import { useToast } from "@/components/Toast";
import type { ExpedienteDto, TiendaDto, VendedorDto } from "@/lib/dto";
import { formatDate } from "@/lib/date-utils";
import { BadgeEstado, BadgeTipoVenta, CeldaCliente, CeldaFecha, EnlaceEditar, FONDO_FECHA_A, FONDO_FECHA_B, mensajeDeError } from "./expedientes/comun";
import ModalAsignarCliente from "./expedientes/ModalAsignarCliente";
import { useEdicionFechas } from "./expedientes/useEdicionFechas";

interface Props {
  initialExpedientes: ExpedienteDto[];
  tiendas?: TiendaDto[];
  tiendaPredeterminadaId?: number | null;
  vendedores?: VendedorDto[];
}

/** Últimos 5 expedientes del panel principal. */
export default function RecentExpedientesTable({
  initialExpedientes,
  tiendas = [],
  tiendaPredeterminadaId = null,
  vendedores = [],
}: Props) {
  const router = useRouter();
  const { mostrar } = useToast();
  const [lista, setLista] = useState<ExpedienteDto[]>(initialExpedientes);
  const [aBorrar, setABorrar] = useState<ExpedienteDto | null>(null);
  const [borrando, setBorrando] = useState(false);
  const [asignandoId, setAsignandoId] = useState<number | null>(null);

  useEffect(() => setLista(initialExpedientes), [initialExpedientes]);

  const { abrirEditar, abrirBorrar, modales } = useEdicionFechas((id, cambios) =>
    setLista((prev) => prev.map((e) => (e.id_expediente === id ? { ...e, ...cambios } : e))),
  );

  const eliminar = async () => {
    if (!aBorrar) return;
    setBorrando(true);
    try {
      const res = await fetch(`/api/expedientes?id=${aBorrar.id_expediente}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await mensajeDeError(res, "Error al eliminar el expediente"));
      setLista((prev) => prev.filter((e) => e.id_expediente !== aBorrar.id_expediente));
      mostrar("Expediente eliminado con éxito.");
      setABorrar(null);
      router.refresh();
    } catch (e) {
      mostrar(e instanceof Error ? e.message : "Error al eliminar el expediente.", "error");
    } finally {
      setBorrando(false);
    }
  };

  const celdaFecha = (exp: ExpedienteDto, campo: Parameters<typeof abrirEditar>[1], nombre: string, fondo: string) => (
    <CeldaFecha exp={exp} campo={campo} nombre={nombre} fondo={fondo} formatear={formatDate} alEditar={abrirEditar} alBorrar={abrirBorrar} />
  );

  const expedienteAsignando = lista.find((e) => e.id_expediente === asignandoId);

  return (
    <>
      <div className="table-container">
        <table className="table-premium">
          <thead>
            <tr>
              <th>Cliente</th>
              <th>Marca</th>
              <th>Modelo</th>
              <th>T. Venta</th>
              <th>Estado</th>
              <th>Vendedor</th>
              <th style={{ textAlign: "center", backgroundColor: FONDO_FECHA_A }}>F. Exp.</th>
              <th style={{ textAlign: "center", backgroundColor: FONDO_FECHA_B }}>F. Afect</th>
              <th style={{ textAlign: "center", backgroundColor: FONDO_FECHA_A }}>F. RCI</th>
              <th style={{ textAlign: "center", backgroundColor: FONDO_FECHA_B }}>F. Mat</th>
              <th style={{ textAlign: "center", backgroundColor: FONDO_FECHA_A }}>F. Entrega</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {lista.map((exp) => (
              <tr key={exp.id_expediente}>
                <td style={{ fontWeight: "bold", color: "var(--text-primary)" }}>
                  <CeldaCliente exp={exp} alAsignar={setAsignandoId} />
                </td>
                <td>
                  {exp.modelo?.marca?.nombre || <span style={{ fontStyle: "italic", color: "var(--text-muted)" }}>VO (Sin marca)</span>}
                </td>
                <td>
                  {exp.modelo ? (
                    <div style={{ fontWeight: 500, color: "var(--text-primary)" }}>{exp.modelo.nombre_modelo}</div>
                  ) : (
                    <span style={{ fontStyle: "italic", color: "var(--text-muted)" }}>VO (Sin modelo)</span>
                  )}
                </td>
                <td><BadgeTipoVenta exp={exp} /></td>
                <td><BadgeEstado exp={exp} /></td>
                <td>
                  <div style={{ fontSize: "0.9rem", fontWeight: 500 }}>{exp.usuario?.nombre || "N/D"}</div>
                </td>
                <td style={{ textAlign: "center", backgroundColor: FONDO_FECHA_A }}>
                  <span style={{ fontSize: "0.85rem" }}>{formatDate(exp.fecha_expediente)}</span>
                </td>
                {celdaFecha(exp, "fecha_afectacion", "Afectación", FONDO_FECHA_B)}
                {celdaFecha(exp, "fecha_rci", "RCI", FONDO_FECHA_A)}
                {celdaFecha(exp, "fecha_matriculacion", "Matriculación", FONDO_FECHA_B)}
                {celdaFecha(exp, "fecha_entrega", "Entrega", FONDO_FECHA_A)}
                <td>
                  <div style={{ display: "flex", gap: "8px" }}>
                    <Link
                      href={`/dashboard/expedientes/editar/${exp.id_expediente}`}
                      style={{
                        color: "var(--text-primary)",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "4px",
                        padding: "6px 12px",
                        borderRadius: "var(--radius-sm)",
                        background: "rgba(255, 255, 255, 0.05)",
                        border: "1px solid var(--border-light)",
                        cursor: "pointer",
                        fontSize: "0.8rem",
                        textDecoration: "none",
                        fontWeight: 600,
                      }}
                      className="glass-panel-interactive"
                    >
                      ✏️ Editar
                    </Link>
                    <button
                      type="button"
                      onClick={() => setABorrar(exp)}
                      style={{
                        color: "var(--danger)",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "4px",
                        padding: "6px 12px",
                        borderRadius: "var(--radius-sm)",
                        background: "rgba(239, 68, 68, 0.05)",
                        border: "1px solid rgba(239, 68, 68, 0.15)",
                        cursor: "pointer",
                        fontSize: "0.8rem",
                        fontWeight: 600,
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(239, 68, 68, 0.15)")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(239, 68, 68, 0.05)")}
                    >
                      🗑️ Eliminar
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {lista.length === 0 && (
              <tr>
                <td colSpan={12} style={{ textAlign: "center", color: "var(--text-muted)", fontStyle: "italic", padding: "20px" }}>
                  No hay expedientes de venta registrados en la base de datos.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {modales}

      {asignandoId !== null && expedienteAsignando && (
        <ModalAsignarCliente
          expedienteId={asignandoId}
          vendedores={vendedores}
          vendedorInicial={expedienteAsignando.id_usuario}
          tiendas={tiendas}
          tiendaPredeterminadaId={tiendaPredeterminadaId}
          alCerrar={() => setAsignandoId(null)}
          alAsignado={(c, idVendedor) => {
            const vendedor = vendedores.find((v) => v.id_usuario === idVendedor);
            setLista((prev) =>
              prev.map((e) =>
                e.id_expediente === asignandoId
                  ? {
                      ...e,
                      id_cliente: c.id,
                      id_usuario: idVendedor ?? e.id_usuario,
                      usuario: vendedor ? { id_usuario: vendedor.id_usuario, nombre: vendedor.nombre } : e.usuario,
                      cliente: { id: c.id, cliente_id: "", dni: c.dni, nombre: c.nombre, fecha_de_nacimiento: null, tienda_id: null, emails: [], telefonos: [] },
                    }
                  : e,
              ),
            );
            setAsignandoId(null);
          }}
        />
      )}

      {aBorrar && (
        <ModalConfirmar
          titulo="Confirmar Eliminación"
          mensaje="¿Estás seguro de que deseas eliminar permanentemente este expediente? Esta acción no se podrá deshacer."
          textoConfirmar="Eliminar Expediente"
          ocupado={borrando}
          alConfirmar={eliminar}
          alCancelar={() => setABorrar(null)}
        />
      )}
    </>
  );
}
