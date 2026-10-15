"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { formatDate } from "@/lib/date-utils";

interface DropdownItem {
  id: number;
  nombre: string;
}

interface TiendaDropdownItem {
  id: number;
  nombre: string;
  ciudad: string | null;
}

interface LogImportacionClientProps {
  marcas: DropdownItem[];
  modelosPorMarca: Record<number, DropdownItem[]>;
  tiposVenta: DropdownItem[];
  estadosVehiculo: DropdownItem[];
  tiendas: TiendaDropdownItem[];
}

export default function LogImportacionClient({
  marcas,
  modelosPorMarca,
  tiposVenta,
  estadosVehiculo,
  tiendas
}: LogImportacionClientProps) {
  const router = useRouter();
  const [blocks, setBlocks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Filtros
  const [searchQuery, setSearchQuery] = useState("");
  const [actionFilter, setActionFilter] = useState("all"); // all, creado, modificado, omitido
  const [expandedBlockId, setExpandedBlockId] = useState<number | null>(null);

  // Corrección rápida
  const [correctingRecord, setCorrectingRecord] = useState<any | null>(null);
  const [editNombre, setEditNombre] = useState("");
  const [editDni, setEditDni] = useState("");
  const [editMatricula, setEditMatricula] = useState("");
  const [editBastidor, setEditBastidor] = useState("");
  const [editMarca, setEditMarca] = useState<number | "">("");
  const [editModelo, setEditModelo] = useState<number | "">("");
  const [editTienda, setEditTienda] = useState<number | "">("");
  const [editTipoVenta, setEditTipoVenta] = useState<number | "">("");
  const [editEstadoVehiculo, setEditEstadoVehiculo] = useState<number | "">("");
  const [editFechaExp, setEditFechaExp] = useState("");
  const [editFechaAfect, setEditFechaAfect] = useState("");
  const [editFechaMat, setEditFechaMat] = useState("");
  const [editFechaEntrega, setEditFechaEntrega] = useState("");
  const [savingCorrection, setSavingCorrection] = useState(false);

  useEffect(() => {
    fetchBlocks();
  }, []);

  const fetchBlocks = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/importaciones");
      const result = await res.json();
      if (result.success) {
        setBlocks(result.data);
      } else {
        setError(result.message || "Error al cargar logs");
      }
    } catch (e) {
      console.error(e);
      setError("Error de conexión");
    } finally {
      setLoading(false);
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

  const handleDeleteBlock = async (id: number) => {
    if (!window.confirm("¿Estás seguro de que deseas eliminar este bloque de importación de los registros? Esto no deshará las importaciones de la base de datos, solo eliminará el historial del log.")) {
      return;
    }
    try {
      const res = await fetch(`/api/importaciones?id=${id}`, {
        method: "DELETE"
      });
      const result = await res.json();
      if (result.success) {
        setBlocks(blocks.filter(b => b.id !== id));
        if (expandedBlockId === id) setExpandedBlockId(null);
        showNotification("Historial de importación eliminado correctamente", "success");
      } else {
        showNotification(result.message || "Error al eliminar bloque", "error");
      }
    } catch (e) {
      console.error(e);
      showNotification("Error de conexión al eliminar", "error");
    }
  };

  const handleOpenCorrection = (record: any) => {
    setCorrectingRecord(record);
    const exp = record.expediente || {};
    const client = exp.cliente || {};

    setEditNombre(client.nombre || record.cliente_nombre || "");
    setEditDni(client.dni || record.bastidor || "");
    setEditMatricula(exp.matricula || record.matricula || "");
    setEditBastidor(exp.vin || record.bastidor || "");
    setEditMarca(exp.modelo?.marca?.id_marca || "");
    setEditModelo(exp.id_modelo || "");
    setEditTienda(exp.id_tienda || "");
    setEditTipoVenta(exp.id_tipo_de_venta || "");
    setEditEstadoVehiculo(exp.id_estado_vehiculo || "");
    setEditFechaExp(exp.fecha_expediente || "");
    setEditFechaAfect(exp.fecha_afectacion || "");
    setEditFechaMat(exp.fecha_matriculacion || "");
    setEditFechaEntrega(exp.fecha_entrega || "");
  };

  const handleSaveCorrection = async () => {
    if (!editNombre.trim()) {
      showNotification("El nombre del cliente es obligatorio", "error");
      return;
    }
    setSavingCorrection(true);
    try {
      const exp = correctingRecord.expediente || {};
      const clientId = exp.id_cliente;

      // 1. Actualizar Cliente
      if (clientId) {
        const clientRes = await fetch("/api/clientes", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: clientId,
            dni: editDni.trim() || null,
            nombre: editNombre.trim(),
            tienda_id: editTienda ? Number(editTienda) : null,
            emails: [], // conserva actuales
            telefonos: [] // conserva actuales
          })
        });
        if (!clientRes.ok) {
          const cData = await clientRes.json();
          throw new Error(cData.message || "Error al guardar datos de cliente");
        }
      }

      // 2. Actualizar Expediente
      if (correctingRecord.id_expediente) {
        const expRes = await fetch("/api/expedientes", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id_expediente: correctingRecord.id_expediente,
            expediente: {
              id_modelo: editModelo ? Number(editModelo) : null,
              id_tipo_de_venta: editTipoVenta ? Number(editTipoVenta) : null,
              id_estado_vehiculo: editEstadoVehiculo ? Number(editEstadoVehiculo) : null,
              id_tienda: editTienda ? Number(editTienda) : null,
              fecha_expediente: editFechaExp || null,
              fecha_afectacion: editFechaAfect || null,
              fecha_matriculacion: editFechaMat || null,
              fecha_entrega: editFechaEntrega || null,
              matricula: editMatricula.trim() || null,
              vin: editBastidor.trim() || null
            }
          })
        });
        if (!expRes.ok) {
          const eData = await expRes.json();
          throw new Error(eData.message || "Error al guardar datos de expediente");
        }
      }

      showNotification("Expediente corregido con éxito", "success");
      setCorrectingRecord(null);
      await fetchBlocks();
      router.refresh();
    } catch (e: any) {
      console.error(e);
      showNotification(e.message || "Error de red al guardar la corrección", "error");
    } finally {
      setSavingCorrection(false);
    }
  };

  // Filtrado de bloques y registros
  const filteredBlocks = blocks.map(block => {
    const matchingRegistros = block.registros.filter((reg: any) => {
      // Filtro de búsqueda
      const q = searchQuery.toLowerCase().trim();
      const matchSearch = q === "" ||
        block.nombre_archivo.toLowerCase().includes(q) ||
        reg.cliente_nombre.toLowerCase().includes(q) ||
        (reg.matricula && reg.matricula.toLowerCase().includes(q)) ||
        (reg.bastidor && reg.bastidor.toLowerCase().includes(q));

      // Filtro de acción
      const matchAction = actionFilter === "all" || reg.tipo_accion === actionFilter;

      return matchSearch && matchAction;
    });

    return {
      ...block,
      matchingRegistros
    };
  }).filter(block => {
    // Si hay búsqueda/filtro activo, solo mostrar bloques que contengan registros coincidentes
    // O si no hay búsqueda/filtro, mostrar todos los bloques
    if (searchQuery !== "" || actionFilter !== "all") {
      return block.matchingRegistros.length > 0;
    }
    return true;
  });

  const renderChanges = (cambiosJson: string) => {
    if (!cambiosJson) return null;
    try {
      // Si no es un JSON válido (ej: mensaje plano para omitidos)
      if (!cambiosJson.trim().startsWith("{")) {
        return <span style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>{cambiosJson}</span>;
      }

      const changes = JSON.parse(cambiosJson);
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          {Object.entries(changes).map(([field, val]: any) => (
            <div key={field} style={{ fontSize: "0.85rem", display: "flex", flexWrap: "wrap", alignItems: "center", gap: "4px" }}>
              <span style={{ fontWeight: 600, color: "var(--text-secondary)" }}>{field}:</span>
              <span style={{ textDecoration: "line-through", color: "var(--danger)", padding: "0 2px", backgroundColor: "rgba(239, 68, 68, 0.08)", borderRadius: "4px" }}>
                {String(val.old)}
              </span>
              <span>→</span>
              <span style={{ color: "var(--success)", fontWeight: 600, padding: "0 4px", backgroundColor: "rgba(16, 185, 129, 0.08)", borderRadius: "4px" }}>
                {String(val.new)}
              </span>
            </div>
          ))}
        </div>
      );
    } catch (e) {
      return <span style={{ color: "var(--text-secondary)", fontSize: "0.85rem" }}>{cambiosJson}</span>;
    }
  };

  const modelosDisponibles = editMarca !== "" ? modelosPorMarca[Number(editMarca)] || [] : [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      {/* NOTIFICACIONES */}
      {success && (
        <div className="glass-panel" style={{ padding: "16px", color: "var(--success)", borderLeft: "4px solid var(--success)", background: "rgba(16, 185, 129, 0.05)", position: "fixed", top: "20px", right: "20px", zIndex: 1000 }}>
          {success}
        </div>
      )}
      {error && (
        <div className="glass-panel" style={{ padding: "16px", color: "var(--danger)", borderLeft: "4px solid var(--danger)", background: "rgba(239, 68, 68, 0.05)", position: "fixed", top: "20px", right: "20px", zIndex: 1000 }}>
          {error}
        </div>
      )}

      {/* HEADER */}
      <div>
        <h1 style={{ fontSize: "1.85rem", marginBottom: "8px" }}>Log de Importaciones</h1>
        <p style={{ color: "var(--text-secondary)" }}>
          Gestiona y supervisa el registro de todos los expedientes y clientes modificados o creados a través de cargas de archivos.
        </p>
      </div>

      {/* FILTROS Y BÚSQUEDA */}
      <div className="glass-panel" style={{ padding: "20px", display: "flex", gap: "16px", alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: "250px" }}>
          <input
            type="text"
            className="form-input"
            placeholder="Buscar por cliente, matrícula, bastidor o nombre de archivo..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <button
            onClick={() => setActionFilter("all")}
            className={`btn ${actionFilter === "all" ? "btn-primary" : "btn-secondary"}`}
            style={{ padding: "8px 16px", fontSize: "0.9rem" }}
          >
            Todos
          </button>
          <button
            onClick={() => setActionFilter("creado")}
            className={`btn ${actionFilter === "creado" ? "btn-primary" : "btn-secondary"}`}
            style={{ padding: "8px 16px", fontSize: "0.9rem", color: actionFilter === "creado" ? "#fff" : "var(--info)" }}
          >
            Creados
          </button>
          <button
            onClick={() => setActionFilter("modificado")}
            className={`btn ${actionFilter === "modificado" ? "btn-primary" : "btn-secondary"}`}
            style={{ padding: "8px 16px", fontSize: "0.9rem", color: actionFilter === "modificado" ? "#fff" : "var(--success)" }}
          >
            Modificados
          </button>
          <button
            onClick={() => setActionFilter("omitido")}
            className={`btn ${actionFilter === "omitido" ? "btn-primary" : "btn-secondary"}`}
            style={{ padding: "8px 16px", fontSize: "0.9rem", color: actionFilter === "omitido" ? "#fff" : "var(--text-muted)" }}
          >
            Omitidos
          </button>
        </div>
      </div>

      {/* LISTADO DE BLOQUES */}
      {loading ? (
        <div className="glass-panel" style={{ padding: "40px", textAlign: "center" }}>
          <p style={{ color: "var(--text-secondary)" }}>Cargando historial de importaciones...</p>
        </div>
      ) : filteredBlocks.length === 0 ? (
        <div className="glass-panel" style={{ padding: "40px", textAlign: "center" }}>
          <p style={{ color: "var(--text-muted)", fontStyle: "italic" }}>No se encontraron registros de importación coincidentes.</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {filteredBlocks.map(block => {
            const isExpanded = expandedBlockId === block.id;
            const dateObj = new Date(block.fecha);
            const formattedDate = dateObj.toLocaleDateString() + " " + dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            return (
              <div key={block.id} className="glass-panel" style={{ overflow: "hidden", transition: "all 0.3s" }}>
                {/* CABECERA DEL BLOQUE */}
                <div
                  style={{
                    padding: "20px 24px",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    cursor: "pointer",
                    backgroundColor: isExpanded ? "rgba(255, 255, 255, 0.02)" : "transparent",
                    borderBottom: isExpanded ? "1px solid var(--border-light)" : "none",
                  }}
                  onClick={() => setExpandedBlockId(isExpanded ? null : block.id)}
                >
                  <div style={{ display: "flex", gap: "16px", alignItems: "center" }}>
                    <div
                      style={{
                        width: "40px",
                        height: "40px",
                        borderRadius: "8px",
                        backgroundColor: block.tipo_archivo === "Excel" ? "rgba(16, 185, 129, 0.1)" : "rgba(59, 130, 246, 0.1)",
                        color: block.tipo_archivo === "Excel" ? "var(--success)" : "var(--info)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontWeight: 700
                      }}
                    >
                      {block.tipo_archivo === "Excel" ? "XLS" : "CSV"}
                    </div>
                    <div>
                      <h4 style={{ fontSize: "1.1rem", fontWeight: 600 }}>{block.nombre_archivo}</h4>
                      <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginTop: "2px" }}>
                        Importado por <span style={{ color: "var(--text-primary)" }}>{block.usuario?.nombre || "Usuario"}</span> el {formattedDate}
                      </p>
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: "24px", alignItems: "center" }}>
                    <div style={{ display: "flex", gap: "12px", fontSize: "0.85rem" }}>
                      <span className="badge badge-tienda" style={{ color: "var(--info)" }}>
                        {block.creados} Creados
                      </span>
                      <span className="badge badge-vendedor" style={{ color: "var(--success)" }}>
                        {block.modificados} Modificados
                      </span>
                      <span className="badge" style={{ backgroundColor: "rgba(255,255,255,0.05)", color: "var(--text-muted)" }}>
                        {block.omitidos} Omitidos
                      </span>
                    </div>

                    <div style={{ display: "flex", gap: "8px" }}>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteBlock(block.id);
                        }}
                        style={{ padding: "6px 10px", fontSize: "0.8rem", color: "var(--danger)", background: "rgba(239, 68, 68, 0.05)", border: "1px solid rgba(239, 68, 68, 0.1)" }}
                        title="Eliminar registro"
                      >
                        🗑️ Eliminar
                      </button>
                      <span style={{ transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }}>
                        ▼
                      </span>
                    </div>
                  </div>
                </div>

                {/* DETALLES DEL BLOQUE */}
                {isExpanded && (
                  <div style={{ padding: "24px" }}>
                    {block.matchingRegistros.length === 0 ? (
                      <p style={{ color: "var(--text-muted)", fontStyle: "italic", textAlign: "center" }}>
                        No hay registros coincidentes con los filtros aplicados en este bloque.
                      </p>
                    ) : (
                      <div style={{ overflowX: "auto" }}>
                        <table className="table">
                          <thead>
                            <tr>
                              <th>Cliente</th>
                              <th>DNI/NIF</th>
                              <th>Matrícula</th>
                              <th>Bastidor (VIN)</th>
                              <th>Acción</th>
                              <th>Cambios / Detalles</th>
                              <th style={{ width: "100px" }}>Acción</th>
                            </tr>
                          </thead>
                          <tbody>
                            {block.matchingRegistros.map((reg: any) => (
                              <tr key={reg.id}>
                                <td>
                                  <div style={{ fontWeight: 600 }}>{reg.cliente_nombre}</div>
                                </td>
                                <td>{reg.expediente?.cliente?.dni || reg.bastidor || "N/D"}</td>
                                <td>{reg.matricula || reg.expediente?.matricula || "N/D"}</td>
                                <td>
                                  <code style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                                    {reg.bastidor || reg.expediente?.vin || "N/D"}
                                  </code>
                                </td>
                                <td>
                                  <span
                                    className={`badge ${
                                      reg.tipo_accion === "creado"
                                        ? "badge-tienda"
                                        : reg.tipo_accion === "modificado"
                                        ? "badge-vendedor"
                                        : ""
                                    }`}
                                    style={{
                                      fontSize: "0.75rem",
                                      backgroundColor:
                                        reg.tipo_accion === "creado"
                                          ? "rgba(59, 130, 246, 0.15)"
                                          : reg.tipo_accion === "modificado"
                                          ? "rgba(16, 185, 129, 0.15)"
                                          : "rgba(255, 255, 255, 0.05)",
                                      color:
                                        reg.tipo_accion === "creado"
                                          ? "var(--info)"
                                          : reg.tipo_accion === "modificado"
                                          ? "var(--success)"
                                          : "var(--text-muted)"
                                    }}
                                  >
                                    {reg.tipo_accion.toUpperCase()}
                                  </span>
                                </td>
                                <td style={{ maxWidth: "350px" }}>
                                  {renderChanges(reg.cambios)}
                                </td>
                                <td>
                                  {reg.id_expediente ? (
                                    <button
                                      type="button"
                                      className="btn btn-secondary"
                                      onClick={() => handleOpenCorrection(reg)}
                                      style={{ padding: "6px 12px", fontSize: "0.8rem", whiteSpace: "nowrap" }}
                                    >
                                      ✏️ Corregir
                                    </button>
                                  ) : (
                                    <span style={{ fontSize: "0.8rem", color: "var(--text-muted)", fontStyle: "italic" }}>
                                      No editable
                                    </span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* MODAL DE CORRECCIÓN RÁPIDA */}
      {correctingRecord && (
        <div className="modal-backdrop" style={{ position: "fixed", top: 0, left: 0, width: "100%", height: "100%", backgroundColor: "rgba(0, 0, 0, 0.6)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1200 }}>
          <div className="glass-panel" style={{ width: "90%", maxWidth: "700px", maxHeight: "90vh", overflowY: "auto", padding: "32px", display: "flex", flexDirection: "column", gap: "24px" }}>
            <div>
              <h3 style={{ fontSize: "1.4rem", fontWeight: 600, display: "flex", alignItems: "center", gap: "8px" }}>
                ✏️ Corregir Datos de Expediente
              </h3>
              <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem", marginTop: "4px" }}>
                Corrige errores del expediente importado en bloque.
              </p>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
              {/* DATOS CLIENTE */}
              <div className="form-group" style={{ gridColumn: "span 2", marginBottom: 0 }}>
                <h4 style={{ fontSize: "0.95rem", color: "var(--primary)", borderBottom: "1px solid var(--border-light)", paddingBottom: "6px", marginBottom: "12px" }}>
                  Datos del Cliente
                </h4>
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Nombre del Cliente</label>
                <input type="text" className="form-input" value={editNombre} onChange={e => setEditNombre(e.target.value)} />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">DNI / NIF</label>
                <input type="text" className="form-input" value={editDni} onChange={e => setEditDni(e.target.value)} />
              </div>

              {/* DATOS EXPEDIENTE */}
              <div className="form-group" style={{ gridColumn: "span 2", marginBottom: 0, marginTop: "8px" }}>
                <h4 style={{ fontSize: "0.95rem", color: "var(--primary)", borderBottom: "1px solid var(--border-light)", paddingBottom: "6px", marginBottom: "12px" }}>
                  Datos del Vehículo y Expediente
                </h4>
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Matrícula</label>
                <input type="text" className="form-input" value={editMatricula} onChange={e => setEditMatricula(e.target.value)} />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Bastidor (VIN)</label>
                <input type="text" className="form-input" value={editBastidor} onChange={e => setEditBastidor(e.target.value)} />
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Marca</label>
                <select className="form-select" value={editMarca} onChange={e => { setEditMarca(e.target.value ? Number(e.target.value) : ""); setEditModelo(""); }}>
                  <option value="">Selecciona Marca</option>
                  {marcas.map(m => (
                    <option key={m.id} value={m.id}>{m.nombre}</option>
                  ))}
                </select>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Modelo</label>
                <select className="form-select" value={editModelo} onChange={e => setEditModelo(e.target.value ? Number(e.target.value) : "")} disabled={editMarca === ""}>
                  <option value="">Selecciona Modelo</option>
                  {modelosDisponibles.map(m => (
                    <option key={m.id} value={m.id}>{m.nombre}</option>
                  ))}
                </select>
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Tienda</label>
                <select className="form-select" value={editTienda} onChange={e => setEditTienda(e.target.value ? Number(e.target.value) : "")}>
                  <option value="">Selecciona Tienda</option>
                  {tiendas.map(t => (
                    <option key={t.id} value={t.id}>{t.nombre} {t.ciudad ? `(${t.ciudad})` : ""}</option>
                  ))}
                </select>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Tipo de Venta</label>
                <select className="form-select" value={editTipoVenta} onChange={e => setEditTipoVenta(e.target.value ? Number(e.target.value) : "")}>
                  <option value="">Selecciona Tipo</option>
                  {tiposVenta.map(t => (
                    <option key={t.id} value={t.id}>{t.nombre}</option>
                  ))}
                </select>
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Estado de Vehículo</label>
                <select className="form-select" value={editEstadoVehiculo} onChange={e => setEditEstadoVehiculo(e.target.value ? Number(e.target.value) : "")}>
                  <option value="">Selecciona Estado</option>
                  {estadosVehiculo.map(ev => (
                    <option key={ev.id} value={ev.id}>{ev.nombre}</option>
                  ))}
                </select>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Fecha Expediente</label>
                <input type="date" className="form-input" value={editFechaExp} onChange={e => setEditFechaExp(e.target.value)} />
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Fecha Afectación</label>
                <input type="date" className="form-input" value={editFechaAfect} onChange={e => setEditFechaAfect(e.target.value)} />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Fecha Matriculación</label>
                <input type="date" className="form-input" value={editFechaMat} onChange={e => setEditFechaMat(e.target.value)} />
              </div>

              <div className="form-group" style={{ marginBottom: 0, gridColumn: "span 2" }}>
                <label className="form-label">Fecha Entrega</label>
                <input type="date" className="form-input" value={editFechaEntrega} onChange={e => setEditFechaEntrega(e.target.value)} />
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "16px", marginTop: "12px" }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setCorrectingRecord(null)}
                disabled={savingCorrection}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleSaveCorrection}
                disabled={savingCorrection}
              >
                {savingCorrection ? "Guardando..." : "Guardar Correcciones"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
