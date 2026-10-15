"use client";

import type { FilaExcel } from "@/lib/excel-expedientes";
import { formatDate } from "@/lib/date-utils";
import type { ExpedienteCandidato } from "@/lib/servicios/importaciones";

export interface ConflictoExcel {
  rowIdx: number;
  id_cliente: number;
  client: { nombre: string | null; dni: string | null };
  expedientes: ExpedienteCandidato[];
  data: FilaExcel;
}

interface Props {
  conflicto: ConflictoExcel;
  indice: number;
  total: number;
  alElegir: (idExpediente: number) => void;
  alOmitir: () => void;
  alCancelarTodo: () => void;
}

const guion = <span style={{ color: "var(--text-muted)" }}>-</span>;

/** Una fila del Excel coincide con varios expedientes del cliente: el usuario elige el correcto. */
export default function ModalConflictoExcel({ conflicto, indice, total, alElegir, alOmitir, alCancelarTodo }: Props) {
  const d = conflicto.data;
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="modal-overlay"
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0, 0, 0, 0.6)",
        backdropFilter: "blur(4px)",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        zIndex: 9999,
        padding: "20px",
      }}
    >
      <div
        className="modal-content glass-panel"
        style={{
          background: "var(--bg-card)",
          border: "1px solid var(--border-light)",
          borderRadius: "var(--radius-md)",
          padding: "24px",
          width: "100%",
          maxWidth: "850px",
          maxHeight: "90vh",
          overflowY: "auto",
          boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.3), 0 10px 10px -5px rgba(0, 0, 0, 0.2)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "16px",
            borderBottom: "1px solid var(--border-light)",
            paddingBottom: "12px",
          }}
        >
          <h3 style={{ margin: 0, fontSize: "1.25rem", display: "flex", alignItems: "center", gap: "8px" }}>
            <span>⚠️ Resolviendo Múltiples Expedientes</span>
            <span style={{ fontSize: "0.85rem", color: "var(--text-secondary)", fontWeight: "normal" }}>
              (Conflicto {indice + 1} de {total})
            </span>
          </h3>
          <button
            type="button"
            onClick={alCancelarTodo}
            style={{ background: "none", border: "none", color: "var(--text-secondary)", cursor: "pointer", fontSize: "1.2rem" }}
          >
            ✕
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <p style={{ margin: 0, fontSize: "0.95rem", color: "var(--text-secondary)" }}>
            El cliente <strong style={{ color: "var(--text-primary)" }}>{conflicto.client.nombre}</strong> ({conflicto.client.dni || "Sin NIF"}) tiene
            múltiples expedientes asignados en la app. Selecciona el expediente correcto para actualizarlo con los datos del Excel.
          </p>

          <div style={{ backgroundColor: "rgba(255, 255, 255, 0.02)", border: "1px solid var(--border-light)", borderRadius: "var(--radius-sm)", padding: "16px" }}>
            <div
              style={{
                fontSize: "0.8rem",
                color: "var(--text-secondary)",
                fontWeight: 600,
                textTransform: "uppercase",
                marginBottom: "8px",
                borderBottom: "1px solid rgba(255,255,255,0.03)",
                paddingBottom: "4px",
              }}
            >
              Datos del Archivo Excel:
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "12px", fontSize: "0.88rem" }}>
              <div><strong>NIF:</strong> <span style={{ color: "var(--primary)" }}>{d.nif || "-"}</span></div>
              <div><strong>Email:</strong> <span style={{ color: "var(--primary)" }}>{d.email || "-"}</span></div>
              <div><strong>Bastidor:</strong> <span style={{ color: "var(--primary)" }}>{d.bastidor || "-"}</span></div>
              <div><strong>Matrícula:</strong> <span style={{ color: "var(--primary)" }}>{d.matricula || "-"}</span></div>
              <div><strong>F. Afectación:</strong> <span style={{ color: "var(--primary)" }}>{formatDate(d.f_afect) || "-"}</span></div>
              <div><strong>F. Matriculación:</strong> <span style={{ color: "var(--primary)" }}>{formatDate(d.f_mat) || "-"}</span></div>
            </div>
          </div>

          <div>
            <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)", fontWeight: 600, textTransform: "uppercase", marginBottom: "8px" }}>
              Expedientes Existentes en la App:
            </div>
            <div className="table-container" style={{ border: "1px solid var(--border-light)", borderRadius: "var(--radius-sm)" }}>
              <table className="table-premium" style={{ fontSize: "0.85rem", width: "100%" }}>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Marca/Modelo</th>
                    <th>VIN (Bastidor)</th>
                    <th>Matrícula</th>
                    <th>F. Afect.</th>
                    <th>F. Mat.</th>
                    <th>F. Exp.</th>
                    <th style={{ textAlign: "center" }}>Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {conflicto.expedientes.map((e) => (
                    <tr key={e.id_expediente} style={{ cursor: "pointer" }} onClick={() => alElegir(e.id_expediente)}>
                      <td style={{ fontWeight: 600 }}>#{e.id_expediente}</td>
                      <td>
                        <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>{e.marca}</span> {e.modelo}
                      </td>
                      <td style={{ fontFamily: "monospace" }}>{e.vin || guion}</td>
                      <td style={{ fontWeight: 600 }}>{e.matricula || guion}</td>
                      <td>{formatDate(e.fecha_afectacion) || guion}</td>
                      <td>{formatDate(e.fecha_matriculacion) || guion}</td>
                      <td>{formatDate(e.fecha_expediente) || guion}</td>
                      <td style={{ textAlign: "center" }}>
                        <button
                          type="button"
                          onClick={(ev) => {
                            ev.stopPropagation();
                            alElegir(e.id_expediente);
                          }}
                          className="btn btn-primary"
                          style={{ padding: "4px 8px", fontSize: "0.75rem", borderRadius: "var(--radius-sm)" }}
                        >
                          Seleccionar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", marginTop: "12px", borderTop: "1px solid var(--border-light)", paddingTop: "16px" }}>
            <button type="button" onClick={alCancelarTodo} className="btn btn-secondary" style={{ padding: "8px 16px", fontSize: "0.85rem" }}>
              Cancelar Todo
            </button>
            <button
              type="button"
              onClick={alOmitir}
              className="btn btn-secondary"
              style={{
                padding: "8px 16px",
                fontSize: "0.85rem",
                backgroundColor: "rgba(239, 68, 68, 0.08)",
                border: "1px solid rgba(239, 68, 68, 0.2)",
                color: "var(--danger)",
              }}
            >
              Omitir este Registro
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
