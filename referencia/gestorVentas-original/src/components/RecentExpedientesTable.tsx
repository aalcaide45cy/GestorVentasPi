"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatDate } from "@/lib/date-utils";

interface Cliente {
  id: number;
  dni: string | null;
  nombre: string | null;
}

interface Marca {
  id_marca: number;
  nombre: string;
}

interface Modelo {
  id_modelo: number;
  nombre_modelo: string;
  marca?: Marca | null;
}

interface TipoDeVenta {
  id_tipo_de_venta: number;
  nombre_tipo_venta: string;
  color: string | null;
}

interface EstadoVehiculo {
  id_estado_vehiculo: number;
  nombre_estado_vehiculo: string;
}

interface Usuario {
  id_usuario: number;
  nombre: string | null;
}

interface Expediente {
  id_expediente: number;
  id_usuario: number | null;
  id_cliente: number | null;
  id_modelo: number | null;
  id_tienda: number | null;
  fecha_expediente: string | null;
  fecha_afectacion: string | null;
  fecha_matriculacion: string | null;
  fecha_entrega: string | null;
  fecha_rci: string | null;
  matricula?: string | null;
  vin?: string | null;
  cliente?: Cliente | null;
  modelo?: Modelo | null;
  tipoDeVenta?: TipoDeVenta | null;
  estadoVehiculo?: EstadoVehiculo | null;
  usuario?: Usuario | null;
}

interface Tienda {
  id_tienda: number;
  nombre: string;
}

interface Vendedor {
  id_usuario: number;
  nombre: string;
}

interface RecentExpedientesTableProps {
  initialExpedientes: Expediente[];
  tiendas?: Tienda[];
  tiendaPredeterminadaId?: number | null;
  vendedores?: Vendedor[];
}

export default function RecentExpedientesTable({ 
  initialExpedientes, 
  tiendas = [], 
  tiendaPredeterminadaId = null,
  vendedores = []
}: RecentExpedientesTableProps) {
  const router = useRouter();
  const [expedientesList, setExpedientesList] = useState<Expediente[]>(initialExpedientes);

  useEffect(() => {
    setExpedientesList(initialExpedientes);
  }, [initialExpedientes]);

  // Estados de eliminación de expediente
  const [confirmDeleteExpediente, setConfirmDeleteExpediente] = useState<Expediente | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [editDateModal, setEditDateModal] = useState<{
    expediente: Expediente;
    fieldName: "fecha_afectacion" | "fecha_matriculacion" | "fecha_entrega" | "fecha_rci";
    displayName: string;
  } | null>(null);

  const [deleteDateModal, setDeleteDateModal] = useState<{
    expediente: Expediente;
    fieldName: "fecha_afectacion" | "fecha_matriculacion" | "fecha_entrega" | "fecha_rci";
    displayName: string;
  } | null>(null);

  const [inputDate, setInputDate] = useState("");
  const [inputMatricula, setInputMatricula] = useState("");
  const [loading, setLoading] = useState(false);

  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [assigningClientExpId, setAssigningClientExpId] = useState<number | null>(null);
  const [clientSearchQuery, setClientSearchQuery] = useState("");
  const [clientSearchResults, setClientSearchResults] = useState<any[]>([]);
  const [searchingClient, setSearchingClient] = useState(false);

  // Estados de creación rápida de cliente
  const [assignClientModalTab, setAssignClientModalTab] = useState<"buscar" | "crear">("buscar");
  const [newClientNombre, setNewClientNombre] = useState("");
  const [newClientDni, setNewClientDni] = useState("");
  const [newClientEmail, setNewClientEmail] = useState("");
  const [newClientTelefono, setNewClientTelefono] = useState("");
  const [newClientTiendaId, setNewClientTiendaId] = useState("");
  const [creatingClient, setCreatingClient] = useState(false);
  const [createClientError, setCreateClientError] = useState<string | null>(null);
  // Estado para el vendedor seleccionado en el modal de asignar cliente
  const [selectedVendedorId, setSelectedVendedorId] = useState<number | null>(null);

  const handleSearchClientsForAssign = async (val: string) => {
    setClientSearchQuery(val);
    if (val.trim().length < 2) {
      setClientSearchResults([]);
      return;
    }
    setSearchingClient(true);
    try {
      const res = await fetch(`/api/clientes/buscar?q=${encodeURIComponent(val)}`);
      if (res.ok) {
        const data = await res.json();
        setClientSearchResults(data.data || []);
      }
    } catch (e) {
      console.error("Error al buscar clientes:", e);
    } finally {
      setSearchingClient(false);
    }
  };

  const handleAssignClient = async (selectedClient: any) => {
    if (!assigningClientExpId) return;
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/expedientes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id_expediente: assigningClientExpId,
          expediente: {
            id_usuario: selectedVendedorId
          },
          id_cliente: selectedClient.id
        })
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.message || "Error al asignar el cliente.");
      }

      setExpedientesList(prev => prev.map(exp => {
        if (exp.id_expediente === assigningClientExpId) {
          const newVendedorObj = vendedores.find(v => v.id_usuario === selectedVendedorId);
          return {
            ...exp,
            id_cliente: selectedClient.id,
            id_usuario: selectedVendedorId,
            usuario: newVendedorObj ? { ...exp.usuario, id_usuario: selectedVendedorId, nombre: newVendedorObj.nombre } : exp.usuario,
            cliente: {
              id: selectedClient.id,
              dni: selectedClient.dni,
              nombre: selectedClient.nombre
            }
          } as any;
        }
        return exp;
      }));

      showNotification("Cliente asignado correctamente.", "success");
      setAssigningClientExpId(null);
      setClientSearchQuery("");
      setClientSearchResults([]);
      setSelectedVendedorId(null);
      router.refresh();
    } catch (e: any) {
      showNotification(e.message || "Error al asignar el cliente.", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteExpediente = async () => {
    if (!confirmDeleteExpediente) return;
    setDeleting(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch(`/api/expedientes?id=${confirmDeleteExpediente.id_expediente}`, {
        method: "DELETE",
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || "Error al eliminar el expediente");
      }

      setExpedientesList(prev => prev.filter(e => e.id_expediente !== confirmDeleteExpediente.id_expediente));
      showNotification(`Expediente eliminado con éxito.`, "success");
      setConfirmDeleteExpediente(null);
      router.refresh();
    } catch (err: any) {
      showNotification(err.message || "Error al eliminar el expediente.", "error");
    } finally {
      setDeleting(false);
    }
  };

  const handleCreateAndAssignClient = async () => {
    if (!newClientNombre.trim()) {
      setCreateClientError("El nombre es obligatorio.");
      return;
    }
    setCreatingClient(true);
    setCreateClientError(null);
    try {
      const res = await fetch("/api/clientes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nombre: newClientNombre,
          dni: newClientDni || null,
          tienda_id: newClientTiendaId ? Number(newClientTiendaId) : null,
          emails: newClientEmail ? [{ email: newClientEmail, tipo: "Principal" }] : [],
          telefonos: newClientTelefono ? [{ telefono: newClientTelefono, tipo: "Principal" }] : []
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || "Error al crear el cliente.");
      }

      const createdClient = data.data;
      // Asignar el cliente creado al expediente
      await handleAssignClient(createdClient);

      // Limpiar formulario de creación de cliente
      setNewClientNombre("");
      setNewClientDni("");
      setNewClientEmail("");
      setNewClientTelefono("");
      setNewClientTiendaId("");
      setAssignClientModalTab("buscar");
    } catch (err: any) {
      setCreateClientError(err.message || "Error interno al crear el cliente.");
    } finally {
      setCreatingClient(false);
    }
  };

  const showNotification = (text: string, type: "success" | "error") => {
    if (type === "success") {
      setSuccess(text);
      setTimeout(() => setSuccess(null), 3000);
    } else {
      setError(text);
      setTimeout(() => setError(null), 4000);
    }
  };

  const handleOpenEditDate = (
    exp: Expediente,
    field: "fecha_afectacion" | "fecha_matriculacion" | "fecha_entrega" | "fecha_rci",
    displayName: string
  ) => {
    const today = new Date().toISOString().split("T")[0];
    setInputDate(exp[field] || today);
    setInputMatricula(exp.matricula || "");
    setEditDateModal({ expediente: exp, fieldName: field, displayName });
  };

  const handleSaveDate = async () => {
    if (!editDateModal) return;
    setLoading(true);
    setError(null);

    const { expediente, fieldName, displayName } = editDateModal;
    const updatePayload: any = {
      [fieldName]: inputDate || null,
    };

    if (fieldName === "fecha_matriculacion") {
      updatePayload.matricula = inputMatricula || null;
      if (!expediente.fecha_rci) {
        updatePayload.fecha_rci = inputDate || null;
      }
    }

    try {
      const response = await fetch("/api/expedientes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id_expediente: expediente.id_expediente,
          expediente: updatePayload,
        }),
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.message || "Error al actualizar la fecha");
      }

      setExpedientesList(prev => prev.map(e => e.id_expediente === expediente.id_expediente ? {
        ...e,
        ...updatePayload,
      } : e));

      showNotification(`Fecha de ${displayName} guardada correctamente.`, "success");
      setEditDateModal(null);
      router.refresh();
    } catch (err: any) {
      showNotification(err.message || "Ocurrió un error al guardar la fecha.", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDeleteDate = (
    exp: Expediente,
    field: "fecha_afectacion" | "fecha_matriculacion" | "fecha_entrega" | "fecha_rci",
    displayName: string
  ) => {
    setDeleteDateModal({ expediente: exp, fieldName: field, displayName });
  };

  const handleDeleteDate = async () => {
    if (!deleteDateModal) return;
    setLoading(true);
    setError(null);

    const { expediente, fieldName, displayName } = deleteDateModal;

    try {
      const response = await fetch("/api/expedientes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id_expediente: expediente.id_expediente,
          expediente: {
            [fieldName]: null,
          },
        }),
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.message || "Error al eliminar la fecha");
      }

      setExpedientesList(prev => prev.map(e => e.id_expediente === expediente.id_expediente ? {
        ...e,
        [fieldName]: null,
      } : e));

      showNotification(`Fecha de ${displayName} eliminada correctamente.`, "success");
      setDeleteDateModal(null);
      router.refresh();
    } catch (err: any) {
      showNotification(err.message || "Ocurrió un error al eliminar la fecha.", "error");
    } finally {
      setLoading(false);
    }
  };

  const renderDateField = (
    exp: Expediente,
    field: "fecha_afectacion" | "fecha_matriculacion" | "fecha_entrega" | "fecha_rci",
    displayName: string,
    backgroundColor?: string
  ) => {
    const val = exp[field];
    return (
      <td style={{ textAlign: "center", backgroundColor }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "4px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}>
            <span style={{ fontSize: "0.85rem", color: val ? "var(--text-primary)" : "var(--text-muted)", fontWeight: val ? 500 : 400 }}>
              {formatDate(val)}
            </span>
            <div style={{ display: "flex", gap: "4px" }}>
              <button
                onClick={() => handleOpenEditDate(exp, field, displayName)}
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
                  transition: "all 0.2s"
                }}
                title={`Modificar fecha de ${displayName}`}
                className="glass-panel-interactive"
              >
                ✏️
              </button>
              {val && (
                <button
                  onClick={() => handleOpenDeleteDate(exp, field, displayName)}
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
                    transition: "all 0.2s"
                  }}
                  title={`Eliminar fecha de ${displayName}`}
                  className="glass-panel-interactive"
                >
                  🗑️
                </button>
              )}
            </div>
          </div>
        </div>
      </td>
    );
  };

  return (
    <>
      {error && (
        <div className="glass-panel" style={{
          position: "fixed",
          top: "20px",
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 10000,
          boxShadow: "var(--shadow-lg)",
          padding: "12px 24px",
          color: "#ffffff",
          borderLeft: "4px solid var(--danger)",
          background: "rgba(239, 68, 68, 0.95)",
          backdropFilter: "blur(8px)",
          minWidth: "300px",
          textAlign: "center",
          animation: "fadeIn 0.3s ease"
        }}>
          ⚠️ {error}
        </div>
      )}
      {success && (
        <div className="glass-panel" style={{
          position: "fixed",
          top: "20px",
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 10000,
          boxShadow: "var(--shadow-lg)",
          padding: "12px 24px",
          color: "#ffffff",
          borderLeft: "4px solid var(--success)",
          background: "rgba(16, 185, 129, 0.95)",
          backdropFilter: "blur(8px)",
          minWidth: "300px",
          textAlign: "center",
          animation: "fadeIn 0.3s ease"
        }}>
          ✓ {success}
        </div>
      )}

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
              <th style={{ textAlign: "center", backgroundColor: "rgba(128, 128, 128, 0.03)" }}>F. Exp.</th>
              <th style={{ textAlign: "center", backgroundColor: "rgba(128, 128, 128, 0.09)" }}>F. Afect</th>
              <th style={{ textAlign: "center", backgroundColor: "rgba(128, 128, 128, 0.03)" }}>F. RCI</th>
              <th style={{ textAlign: "center", backgroundColor: "rgba(128, 128, 128, 0.09)" }}>F. Mat</th>
              <th style={{ textAlign: "center", backgroundColor: "rgba(128, 128, 128, 0.03)" }}>F. Entrega</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {expedientesList.map((exp) => (
              <tr key={exp.id_expediente}>
                <td style={{ fontWeight: "bold", color: "var(--text-primary)" }}>
                  {exp.cliente?.nombre ? (
                    exp.cliente.nombre
                  ) : (
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span style={{ color: "var(--text-muted)", fontStyle: "italic" }}>Sin Cliente</span>
                      <button
                        type="button"
                        title="Asignar Cliente"
                        onClick={() => {
                          setAssigningClientExpId(exp.id_expediente);
                          setClientSearchQuery("");
                          setClientSearchResults([]);
                          setSelectedVendedorId(exp.id_usuario || null);
                        }}
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
                          transition: "all 0.2s"
                        }}
                        className="glass-panel-interactive"
                      >
                        🔍
                      </button>
                    </div>
                  )}
                </td>
                <td>
                  {exp.modelo?.marca?.nombre || (
                    <span style={{ fontStyle: "italic", color: "var(--text-muted)" }}>VO (Sin marca)</span>
                  )}
                </td>
                <td>
                  {exp.modelo ? (
                    <div style={{ fontWeight: 500, color: "var(--text-primary)" }}>
                      {exp.modelo.nombre_modelo}
                    </div>
                  ) : (
                    <span style={{ fontStyle: "italic", color: "var(--text-muted)" }}>VO (Sin modelo)</span>
                  )}
                </td>
                <td>
                  {exp.tipoDeVenta ? (
                    <span className="badge" style={{
                      fontSize: "0.7rem",
                      padding: "3px 8px",
                      backgroundColor: exp.tipoDeVenta.color || "#3b82f6",
                      color: "#fff"
                    }}>
                      {exp.tipoDeVenta.nombre_tipo_venta}
                    </span>
                  ) : (
                    <span style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>N/D</span>
                  )}
                </td>
                <td>
                  {exp.estadoVehiculo ? (
                    <span className={`badge badge-${exp.estadoVehiculo.nombre_estado_vehiculo?.toLowerCase() === 'nuevo' ? 'tienda' : 'vendedor'}`} style={{ fontSize: "0.7rem", padding: "3px 8px" }}>
                      {exp.estadoVehiculo.nombre_estado_vehiculo}
                    </span>
                  ) : (
                    <span style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>N/D</span>
                  )}
                </td>
                <td>
                  <div style={{ fontSize: "0.9rem", fontWeight: 500 }}>{exp.usuario?.nombre || "N/D"}</div>
                </td>
                <td style={{ textAlign: "center", backgroundColor: "rgba(128, 128, 128, 0.03)" }}>
                  <span style={{ fontSize: "0.85rem" }}>{formatDate(exp.fecha_expediente)}</span>
                </td>
                {renderDateField(exp, "fecha_afectacion", "Afectación", "rgba(128, 128, 128, 0.09)")}
                {renderDateField(exp, "fecha_rci", "RCI", "rgba(128, 128, 128, 0.03)")}
                {renderDateField(exp, "fecha_matriculacion", "Matriculación", "rgba(128, 128, 128, 0.09)")}
                {renderDateField(exp, "fecha_entrega", "Entrega", "rgba(128, 128, 128, 0.03)")}
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
                        transition: "all 0.2s ease"
                      }}
                      className="glass-panel-interactive"
                    >
                      ✏️ Editar
                    </Link>
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteExpediente(exp)}
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
                        transition: "all 0.2s ease"
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = "rgba(239, 68, 68, 0.15)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = "rgba(239, 68, 68, 0.05)";
                      }}
                    >
                      🗑️ Eliminar
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {expedientesList.length === 0 && (
              <tr>
                <td colSpan={12} style={{ textAlign: "center", color: "var(--text-muted)", fontStyle: "italic", padding: "20px" }}>
                  No hay expedientes de venta registrados en la base de datos.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* MODAL PARA EDITAR FECHA */}
      {editDateModal && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: "100vw",
          height: "100vh",
          background: "rgba(0,0,0,0.6)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 999,
          backdropFilter: "blur(4px)"
        }}>
          <div className="glass-panel" style={{
            width: "100%",
            maxWidth: "400px",
            padding: "32px",
            display: "flex",
            flexDirection: "column",
            gap: "20px"
          }}>
            <h3 style={{ fontSize: "1.2rem", color: "var(--text-primary)", margin: 0 }}>
              Establecer fecha de {editDateModal.displayName}
            </h3>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Selecciona Fecha</label>
              <input
                type="date"
                className="form-input"
                value={inputDate}
                onChange={e => setInputDate(e.target.value)}
              />
            </div>

            {editDateModal.fieldName === "fecha_matriculacion" && (
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Matrícula (Opcional)</label>
                <input
                  type="text"
                  className="form-input"
                  value={inputMatricula}
                  onChange={e => setInputMatricula(e.target.value)}
                  placeholder="Ej. 1234ABC"
                />
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", marginTop: "8px" }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setEditDateModal(null)}
                disabled={loading}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleSaveDate}
                disabled={loading}
              >
                {loading ? "Guardando..." : "Aceptar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL PARA ELIMINAR FECHA */}
      {deleteDateModal && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: "100vw",
          height: "100vh",
          background: "rgba(0,0,0,0.6)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 999,
          backdropFilter: "blur(4px)"
        }}>
          <div className="glass-panel" style={{
            width: "100%",
            maxWidth: "400px",
            padding: "32px",
            display: "flex",
            flexDirection: "column",
            gap: "20px"
          }}>
            <h3 style={{ fontSize: "1.2rem", color: "var(--text-primary)", margin: 0 }}>
              ¿Eliminar fecha de {deleteDateModal.displayName}?
            </h3>
            <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", margin: 0 }}>
              Esta acción borrará la fecha registrada para este expediente. ¿Deseas continuar?
            </p>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", marginTop: "8px" }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setDeleteDateModal(null)}
                disabled={loading}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleDeleteDate}
                disabled={loading}
                style={{ backgroundColor: "var(--danger)", borderColor: "var(--danger)" }}
              >
                {loading ? "Eliminando..." : "Eliminar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {assigningClientExpId && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: "100vw",
          height: "100vh",
          background: "rgba(0,0,0,0.6)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 999,
          backdropFilter: "blur(4px)"
        }}>
          <div className="glass-panel" style={{
            width: "100%",
            maxWidth: "450px",
            padding: "32px",
            display: "flex",
            flexDirection: "column",
            gap: "20px"
          }}>
            <h3 style={{ fontSize: "1.2rem", color: "var(--text-primary)", margin: 0 }}>
              Asignar Cliente al Expediente
            </h3>

            {/* Pestañas del Modal */}
            <div style={{ display: "flex", borderBottom: "1px solid var(--border-light)", gap: "8px", marginBottom: "8px" }}>
              <button
                type="button"
                style={{
                  padding: "8px 12px",
                  background: "none",
                  border: "none",
                  color: assignClientModalTab === "buscar" ? "var(--primary)" : "var(--text-secondary)",
                  borderBottom: assignClientModalTab === "buscar" ? "2px solid var(--primary)" : "none",
                  fontWeight: assignClientModalTab === "buscar" ? 700 : 400,
                  cursor: "pointer",
                  fontSize: "0.9rem"
                }}
                onClick={() => setAssignClientModalTab("buscar")}
              >
                Buscar Existente
              </button>
              <button
                type="button"
                style={{
                  padding: "8px 12px",
                  background: "none",
                  border: "none",
                  color: assignClientModalTab === "crear" ? "var(--primary)" : "var(--text-secondary)",
                  borderBottom: assignClientModalTab === "crear" ? "2px solid var(--primary)" : "none",
                  fontWeight: assignClientModalTab === "crear" ? 700 : 400,
                  cursor: "pointer",
                  fontSize: "0.9rem"
                }}
                onClick={() => {
                  setAssignClientModalTab("crear");
                  if (tiendas && tiendas.length > 0 && !newClientTiendaId) {
                    setNewClientTiendaId(tiendaPredeterminadaId ? String(tiendaPredeterminadaId) : String(tiendas[0].id_tienda));
                  }
                }}
              >
                ➕ Crear Nuevo Cliente
              </button>
            </div>

            {assignClientModalTab === "buscar" ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                {vendedores.length > 0 && (
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label" style={{ fontSize: "0.8rem" }}>Vendedor del Expediente</label>
                    <select
                      className="form-select"
                      value={selectedVendedorId || ""}
                      onChange={e => setSelectedVendedorId(e.target.value ? Number(e.target.value) : null)}
                      style={{ padding: "6px 10px" }}
                    >
                      <option value="">Seleccionar vendedor...</option>
                      {vendedores.map(v => (
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
                    value={clientSearchQuery}
                    onChange={e => handleSearchClientsForAssign(e.target.value)}
                    autoFocus
                  />
                  {searchingClient && (
                    <div style={{ position: "absolute", right: "12px", bottom: "10px", fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                      Buscando...
                    </div>
                  )}
                </div>

                {clientSearchResults.length > 0 ? (
                  <div style={{
                    maxHeight: "180px",
                    overflowY: "auto",
                    border: "1px solid var(--border-light)",
                    borderRadius: "var(--radius-sm)",
                    background: "rgba(255, 255, 255, 0.02)"
                  }}>
                    {clientSearchResults.map(c => (
                      <div
                        key={c.id}
                        onClick={() => handleAssignClient(c)}
                        className="glass-panel-interactive"
                        style={{
                          padding: "10px 16px",
                          cursor: "pointer",
                          borderBottom: "1px solid var(--border-light)",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          borderRadius: 0
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
                ) : clientSearchQuery.trim().length >= 2 && !searchingClient ? (
                  <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)", textAlign: "center", padding: "12px" }}>
                    No se encontraron clientes para "{clientSearchQuery}"
                  </div>
                ) : null}
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                {createClientError && (
                  <div style={{ color: "var(--danger)", fontSize: "0.8rem", padding: "6px 8px", background: "rgba(239, 68, 68, 0.05)", borderRadius: "4px" }}>
                    ⚠️ {createClientError}
                  </div>
                )}
                
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" style={{ fontSize: "0.8rem" }}>Nombre Completo *</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Ej. Juan Pérez"
                    value={newClientNombre}
                    onChange={e => setNewClientNombre(e.target.value)}
                    style={{ padding: "6px 10px" }}
                  />
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" style={{ fontSize: "0.8rem" }}>DNI / NIE</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Ej. 12345678Z"
                    value={newClientDni}
                    onChange={e => setNewClientDni(e.target.value)}
                    style={{ padding: "6px 10px" }}
                  />
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" style={{ fontSize: "0.8rem" }}>Teléfono</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Ej. 600123456"
                    value={newClientTelefono}
                    onChange={e => setNewClientTelefono(e.target.value)}
                    style={{ padding: "6px 10px" }}
                  />
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" style={{ fontSize: "0.8rem" }}>Email</label>
                  <input
                    type="email"
                    className="form-input"
                    placeholder="Ej. juan@correo.com"
                    value={newClientEmail}
                    onChange={e => setNewClientEmail(e.target.value)}
                    style={{ padding: "6px 10px" }}
                  />
                </div>

                {tiendas.length > 0 && (
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label" style={{ fontSize: "0.8rem" }}>Tienda Asociada</label>
                    <select
                      className="form-select"
                      value={newClientTiendaId}
                      onChange={e => setNewClientTiendaId(e.target.value)}
                      style={{ padding: "6px 10px" }}
                    >
                      {tiendas.map(t => (
                        <option key={t.id_tienda} value={t.id_tienda}>{t.nombre}</option>
                      ))}
                    </select>
                  </div>
                )}
                {vendedores.length > 0 && (
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label" style={{ fontSize: "0.8rem" }}>Vendedor del Expediente</label>
                    <select
                      className="form-select"
                      value={selectedVendedorId || ""}
                      onChange={e => setSelectedVendedorId(e.target.value ? Number(e.target.value) : null)}
                      style={{ padding: "6px 10px" }}
                    >
                      <option value="">Seleccionar vendedor...</option>
                      {vendedores.map(v => (
                        <option key={v.id_usuario} value={v.id_usuario}>{v.nombre}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", marginTop: "8px" }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setAssigningClientExpId(null);
                  setClientSearchQuery("");
                  setClientSearchResults([]);
                  setNewClientNombre("");
                  setNewClientDni("");
                  setNewClientEmail("");
                  setNewClientTelefono("");
                  setNewClientTiendaId("");
                  setAssignClientModalTab("buscar");
                  setCreateClientError(null);
                  setSelectedVendedorId(null);
                }}
                disabled={loading || creatingClient}
              >
                Cancelar
              </button>
              {assignClientModalTab === "crear" && (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleCreateAndAssignClient}
                  disabled={creatingClient}
                >
                  {creatingClient ? "Creando..." : "Crear y Asignar"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal de Confirmación de Eliminación de Expediente */}
      {confirmDeleteExpediente && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: "100vw",
          height: "100vh",
          background: "rgba(0,0,0,0.6)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 999,
          backdropFilter: "blur(4px)"
        }}>
          <div className="glass-panel" style={{
            width: "100%",
            maxWidth: "400px",
            padding: "32px",
            display: "flex",
            flexDirection: "column",
            gap: "20px"
          }}>
            <h3 style={{ fontSize: "1.2rem", color: "var(--text-primary)", margin: 0 }}>
              ¿Eliminar Expediente?
            </h3>
            <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", margin: 0, lineHeight: "1.5" }}>
              ¿Estás seguro de que deseas eliminar permanentemente el expediente <strong>#EXP-{String(confirmDeleteExpediente.id_expediente).padStart(4, "0")}</strong>?
              Esta acción no se puede deshacer.
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px" }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setConfirmDeleteExpediente(null)}
                disabled={deleting}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={handleDeleteExpediente}
                disabled={deleting}
                style={{
                  background: "var(--danger)",
                  borderColor: "var(--danger)",
                  color: "#ffffff"
                }}
              >
                {deleting ? "Eliminando..." : "Eliminar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
