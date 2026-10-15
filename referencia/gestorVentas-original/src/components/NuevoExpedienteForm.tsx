"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

interface DropdownItem {
  id: number;
  nombre: string;
}

interface TiendaDropdownItem {
  id: number;
  nombre: string;
  ciudad: string | null;
}

interface NuevoExpedienteFormProps {
  marcas: DropdownItem[];
  modelosPorMarca: Record<number, DropdownItem[]>;
  tiposVenta: DropdownItem[];
  estadosVehiculo: DropdownItem[];
  tiendas: TiendaDropdownItem[];
}

export default function NuevoExpedienteForm({
  marcas,
  modelosPorMarca,
  tiposVenta,
  estadosVehiculo,
  tiendas
}: NuevoExpedienteFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Estado del Cliente
  const [dni, setDni] = useState("");
  const [nombre, setNombre] = useState("");
  const [fechaNacimiento, setFechaNacimiento] = useState("");
  const [tiendaId, setTiendaId] = useState(tiendas.length === 1 ? String(tiendas[0].id) : "");

  // Subformularios Dinámicos de Emails y Teléfonos
  const [emails, setEmails] = useState([{ email: "", tipo: "Principal" }]);
  const [telefonos, setTelefonos] = useState([{ telefono: "", tipo: "Principal" }]);

  // Estados para buscar y asignar cliente
  const [busquedaCliente, setBusquedaCliente] = useState("");
  const [resultadosClientes, setResultadosClientes] = useState<any[]>([]);
  const [buscandoCliente, setBuscandoCliente] = useState(false);
  const [clienteAsignado, setClienteAsignado] = useState<any | null>(null);

  // Estados para modal de duplicidad de cliente
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [duplicateClientInfo, setDuplicateClientInfo] = useState<any | null>(null);

  const handleBuscarCliente = async (val: string) => {
    setBusquedaCliente(val);
    if (val.trim().length < 2) {
      setResultadosClientes([]);
      return;
    }
    setBuscandoCliente(true);
    try {
      const res = await fetch(`/api/clientes/buscar?q=${encodeURIComponent(val)}`);
      if (res.ok) {
        const data = await res.json();
        setResultadosClientes(data.data || []);
      }
    } catch (e) {
      console.error("Error al buscar cliente:", e);
    } finally {
      setBuscandoCliente(false);
    }
  };

  const handleSeleccionarCliente = (c: any) => {
    setClienteAsignado(c);
    setDni(c.dni || "");
    setNombre(c.nombre || "");
    setFechaNacimiento(c.fecha_de_nacimiento || "");
    setTiendaId(c.tienda_id ? String(c.tienda_id) : "");
    
    // Mapear emails y teléfonos
    if (c.emails && c.emails.length > 0) {
      setEmails(c.emails.map((e: any) => ({ email: e.email, tipo: e.tipo_email || "Principal" })));
    } else {
      setEmails([{ email: "", tipo: "Principal" }]);
    }

    if (c.telefonos && c.telefonos.length > 0) {
      setTelefonos(c.telefonos.map((t: any) => ({ telefono: t.telefono, tipo: t.tipo_telefono || "Principal" })));
    } else {
      setTelefonos([{ telefono: "", tipo: "Principal" }]);
    }

    setBusquedaCliente("");
    setResultadosClientes([]);
  };

  const handleDesasignarCliente = () => {
    setClienteAsignado(null);
    setDni("");
    setNombre("");
    setFechaNacimiento("");
    setTiendaId(tiendas.length === 1 ? String(tiendas[0].id) : "");
    setEmails([{ email: "", tipo: "Principal" }]);
    setTelefonos([{ telefono: "", tipo: "Principal" }]);
  };

  const isClienteModificado = () => {
    if (!clienteAsignado) return false;
    
    const oriDni = clienteAsignado.dni || "";
    const oriNombre = clienteAsignado.nombre || "";
    const oriFechaNac = clienteAsignado.fecha_de_nacimiento || "";
    const oriTiendaId = clienteAsignado.tienda_id ? String(clienteAsignado.tienda_id) : "";
    
    if (dni !== oriDni) return true;
    if (nombre !== oriNombre) return true;
    if (fechaNacimiento !== oriFechaNac) return true;
    if (tiendaId !== oriTiendaId) return true;
    
    const currentEmails = emails.filter(e => e.email.trim() !== "");
    const originalEmails = clienteAsignado.emails || [];
    if (currentEmails.length !== originalEmails.length) return true;
    for (let i = 0; i < currentEmails.length; i++) {
      const curr = currentEmails[i];
      const orig = originalEmails[i];
      if (!orig) return true;
      if (curr.email !== orig.email) return true;
      const currTipo = curr.tipo || "Principal";
      const origTipo = orig.tipo_email || orig.tipo || "Principal";
      if (currTipo !== origTipo) return true;
    }

    const currentTelefonos = telefonos.filter(t => t.telefono.trim() !== "");
    const originalTelefonos = clienteAsignado.telefonos || [];
    if (currentTelefonos.length !== originalTelefonos.length) return true;
    for (let i = 0; i < currentTelefonos.length; i++) {
      const curr = currentTelefonos[i];
      const orig = originalTelefonos[i];
      if (!orig) return true;
      if (curr.telefono !== orig.telefono) return true;
      const currTipo = curr.tipo || "Principal";
      const origTipo = orig.tipo_telefono || orig.tipo || "Principal";
      if (currTipo !== origTipo) return true;
    }

    return false;
  };

  const handleGuardarCambiosCliente = async () => {
    if (!clienteAsignado) return;
    setLoading(true);
    setError(null);
    try {
      const body = {
        id: clienteAsignado.id,
        dni,
        nombre,
        fecha_de_nacimiento: fechaNacimiento || null,
        tienda_id: tiendaId ? Number(tiendaId) : null,
        emails: emails.filter(e => e.email.trim() !== "").map(e => ({ email: e.email, tipo: e.tipo })),
        telefonos: telefonos.filter(t => t.telefono.trim() !== "").map(t => ({ telefono: t.telefono, tipo: t.tipo }))
      };
      
      const res = await fetch("/api/clientes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || "Error al actualizar los datos del cliente.");
      }
      
      setClienteAsignado({
        ...clienteAsignado,
        dni,
        nombre,
        fecha_de_nacimiento: fechaNacimiento || null,
        tienda_id: tiendaId ? Number(tiendaId) : null,
        emails: emails.filter(e => e.email.trim() !== "").map(e => ({ email: e.email, tipo_email: e.tipo })),
        telefonos: telefonos.filter(t => t.telefono.trim() !== "").map(t => ({ telefono: t.telefono, tipo_telefono: t.tipo }))
      });
      
      alert("✅ Datos del cliente actualizados correctamente.");
    } catch (err: any) {
      setError(err.message || "Ocurrió un error al guardar los cambios del cliente.");
    } finally {
      setLoading(false);
    }
  };

  // Estado del Vehículo y Expediente
  const [marcaSeleccionada, setMarcaSeleccionada] = useState<number | "">("");
  const [modeloSeleccionado, setModeloSeleccionado] = useState<number | "">("");
  const [tipoVentaSeleccionado, setTipoVentaSeleccionado] = useState<number | "">("");
  const [estadoVehiculoSeleccionado, setEstadoVehiculoSeleccionado] = useState<number | "">("");

  const [fechaExpediente, setFechaExpediente] = useState(new Date().toISOString().split("T")[0]);
  const [fechaAfectacion, setFechaAfectacion] = useState("");
  const [fechaRci, setFechaRci] = useState("");
  const [fechaMatriculacion, setFechaMatriculacion] = useState("");
  const [fechaFacturacion, setFechaFacturacion] = useState("");
  const [fechaEntrega, setFechaEntrega] = useState("");
  const [matricula, setMatricula] = useState("");
  const [vin, setVin] = useState("");

  // Gestión de Emails Dinámicos
  const addEmail = () => setEmails([...emails, { email: "", tipo: "Alternativo" }]);
  const removeEmail = (index: number) => setEmails(emails.filter((_, i) => i !== index));
  const handleEmailChange = (index: number, val: string) => {
    const updated = [...emails];
    updated[index].email = val;
    setEmails(updated);
  };
  const handleEmailTipoChange = (index: number, val: string) => {
    const updated = [...emails];
    updated[index].tipo = val;
    setEmails(updated);
  };

  // Gestión de Teléfonos Dinámicos
  const addTelefono = () => setTelefonos([...telefonos, { telefono: "", tipo: "Alternativo" }]);
  const removeTelefono = (index: number) => setTelefonos(telefonos.filter((_, i) => i !== index));
  const handleTelefonoChange = (index: number, val: string) => {
    const updated = [...telefonos];
    updated[index].telefono = val;
    setTelefonos(updated);
  };
  const handleTelefonoTipoChange = (index: number, val: string) => {
    const updated = [...telefonos];
    updated[index].tipo = val;
    setTelefonos(updated);
  };

  // Obtener modelos de la marca seleccionada
  const modelosDisponibles = marcaSeleccionada !== "" ? modelosPorMarca[Number(marcaSeleccionada)] || [] : [];

  // Control de cambios sin guardar
  const checkIsDirty = () => {
    if (success) return false;

    if (dni !== "") return true;
    if (nombre !== "") return true;
    if (fechaNacimiento !== "") return true;
    const defaultTiendaId = tiendas.length === 1 ? String(tiendas[0].id) : "";
    if (tiendaId !== defaultTiendaId) return true;
    if (emails.some(e => e.email !== "")) return true;
    if (telefonos.some(t => t.telefono !== "")) return true;
    if (marcaSeleccionada !== "") return true;
    if (modeloSeleccionado !== "") return true;
    if (tipoVentaSeleccionado !== "") return true;
    if (estadoVehiculoSeleccionado !== "") return true;
    if (matricula !== "") return true;
    if (vin !== "") return true;
    const today = new Date().toISOString().split("T")[0];
    if (fechaExpediente !== today) return true;
    if (fechaAfectacion !== "") return true;
    if (fechaRci !== "") return true;
    if (fechaMatriculacion !== "") return true;
    if (fechaFacturacion !== "") return true;
    if (fechaEntrega !== "") return true;

    return false;
  };

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (checkIsDirty()) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);

    const handleAnchorClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const anchor = target.closest("a");
      if (anchor && anchor.href && anchor.host === window.location.host) {
        if (checkIsDirty()) {
          const confirmLeave = window.confirm("Tienes cambios sin guardar en el expediente. ¿Estás seguro de que deseas salir sin guardar?");
          if (!confirmLeave) {
            e.preventDefault();
            e.stopPropagation();
          }
        }
      }
    };
    document.addEventListener("click", handleAnchorClick, true);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("click", handleAnchorClick, true);
    };
  }, [dni, nombre, fechaNacimiento, tiendaId, emails, telefonos, marcaSeleccionada, modeloSeleccionado, tipoVentaSeleccionado, estadoVehiculoSeleccionado, matricula, vin, fechaExpediente, fechaAfectacion, fechaRci, fechaMatriculacion, fechaEntrega, success]);

  const executeSave = async (clientToUse: any | null, forceCreateNew: boolean = false) => {
    setLoading(true);
    setError(null);
    try {
      let clienteData = null;
      if (clientToUse) {
        clienteData = {
          id: clientToUse.id,
          dni: clientToUse.dni || dni.trim() || null,
          nombre: clientToUse.nombre || nombre.trim(),
          fecha_de_nacimiento: clientToUse.fecha_de_nacimiento || fechaNacimiento || null,
          tienda_id: clientToUse.tienda_id || (tiendaId ? Number(tiendaId) : null),
          emails: emails.filter(em => em.email),
          telefonos: telefonos.filter(t => t.telefono)
        };
      } else if (nombre.trim() && !forceCreateNew && clienteAsignado) {
        clienteData = {
          id: clienteAsignado.id,
          dni: dni.trim() || null,
          nombre: nombre.trim(),
          fecha_de_nacimiento: fechaNacimiento || null,
          tienda_id: tiendaId ? Number(tiendaId) : null,
          emails: emails.filter(em => em.email),
          telefonos: telefonos.filter(t => t.telefono)
        };
      } else if (nombre.trim()) {
        clienteData = {
          dni: dni.trim() || null,
          nombre: nombre.trim(),
          fecha_de_nacimiento: fechaNacimiento || null,
          tienda_id: tiendaId ? Number(tiendaId) : null,
          emails: emails.filter(em => em.email),
          telefonos: telefonos.filter(t => t.telefono)
        };
      }

      const response = await fetch("/api/expedientes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cliente: clienteData,
          expediente: {
            id_modelo: modeloSeleccionado ? Number(modeloSeleccionado) : null,
            id_tipo_de_venta: tipoVentaSeleccionado ? Number(tipoVentaSeleccionado) : null,
            id_estado_vehiculo: estadoVehiculoSeleccionado ? Number(estadoVehiculoSeleccionado) : null,
            id_tienda: tiendaId ? Number(tiendaId) : null,
            fecha_expediente: fechaExpediente || null,
            fecha_afectacion: fechaAfectacion || null,
            fecha_rci: fechaRci || null,
            fecha_matriculacion: fechaMatriculacion || null,
            fecha_facturacion: fechaFacturacion || null,
            fecha_entrega: fechaEntrega || null,
            matricula: matricula || null,
            vin: vin || null
          }
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Error al guardar el expediente.");
      }

      setSuccess(true);
      setTimeout(() => {
        router.push("/dashboard/expedientes");
      }, 2000);
    } catch (err: any) {
      setError(err.message || "Error al guardar.");
    } finally {
      setLoading(false);
    }
  };

  // Envío del Formulario
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    // Validar: el nombre del cliente solo es obligatorio si se especifica algún dato de cliente
    const tieneDatosCliente = dni.trim() !== "" ||
                              fechaNacimiento.trim() !== "" ||
                              emails.some(em => em.email.trim() !== "") ||
                              telefonos.some(t => t.telefono.trim() !== "");

    if (tieneDatosCliente && !nombre.trim()) {
      setError("El Nombre Completo del cliente es obligatorio si deseas registrar o asociar un cliente.");
      setLoading(false);
      return;
    }

    // Verificar si existe el cliente
    if (nombre.trim() && !clienteAsignado) {
      try {
        const checkRes = await fetch("/api/clientes/verificar-existencia", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dni: dni.trim() || null, nombre: nombre.trim() })
        });
        if (checkRes.ok) {
          const checkData = await checkRes.json();
          if (checkData.exists) {
            setDuplicateClientInfo(checkData.cliente);
            setShowDuplicateModal(true);
            setLoading(false);
            return;
          }
        }
      } catch (err) {
        console.error("Error al comprobar duplicado de cliente", err);
      }
    }

    await executeSave(clienteAsignado);
  };

  if (success) {
    return (
      <div className="glass-panel" style={{ padding: "40px", textAlign: "center", borderLeft: "4px solid var(--success)" }}>
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--success)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: "16px" }}>
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
          <polyline points="22 4 12 14.01 9 11.01" />
        </svg>
        <h2 style={{ fontSize: "1.5rem", marginBottom: "8px" }}>¡Expediente Creado!</h2>
        <p style={{ color: "var(--text-secondary)" }}>El expediente y los datos del cliente se han guardado con éxito. Redirigiendo...</p>
      </div>
    );
  }

  return (
    <>
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "32px" }}>
      {error && (
        <div className="glass-panel" style={{ padding: "16px", color: "var(--danger)", borderLeft: "4px solid var(--danger)", background: "rgba(239, 68, 68, 0.05)" }}>
          <strong style={{ display: "block", marginBottom: "4px" }}>Error:</strong>
          {error}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "32px" }}>
        {/* SECCIÓN 1: DATOS DEL CLIENTE */}
        <div className="glass-panel" style={{ padding: "32px" }}>
          <h2 style={{ fontSize: "1.25rem", marginBottom: "24px", color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "10px" }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
            Datos del Cliente
          </h2>

          {clienteAsignado ? (
            <div className="glass-panel" style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "16px 20px",
              marginBottom: "24px",
              background: "rgba(6, 182, 212, 0.05)",
              borderLeft: "4px solid var(--secondary)"
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <span style={{ fontSize: "1.5rem" }}>👤</span>
                <div>
                  <div style={{ fontWeight: 700, color: "var(--text-primary)" }}>Cliente Asociado: {clienteAsignado.nombre}</div>
                  <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>DNI / NIE: {clienteAsignado.dni}</div>
                </div>
              </div>
              <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                {isClienteModificado() && (
                  <button
                    type="button"
                    className="btn"
                    onClick={handleGuardarCambiosCliente}
                    disabled={loading}
                    style={{
                      padding: "8px 16px",
                      fontSize: "0.85rem",
                      backgroundColor: "var(--success)",
                      color: "white",
                      border: "none",
                      borderRadius: "var(--radius-sm)",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "6px"
                    }}
                  >
                    💾 Guardar Cambios de Cliente
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={handleDesasignarCliente}
                  style={{ padding: "6px 12px", fontSize: "0.8rem", color: "var(--danger)" }}
                >
                  ❌ Desasignar Cliente
                </button>
              </div>
            </div>
          ) : (
            <div className="form-group" style={{ position: "relative", marginBottom: "24px" }}>
              <label className="form-label">🔍 Buscar Cliente Existente (DNI o Nombre)</label>
              <input
                type="text"
                className="form-input"
                placeholder="Escribe DNI o Nombre... (Ej. Juan)"
                value={busquedaCliente}
                onChange={e => handleBuscarCliente(e.target.value)}
              />
              {buscandoCliente && (
                <div style={{ position: "absolute", right: "16px", bottom: "12px", fontSize: "0.8rem", color: "var(--text-muted)" }}>
                  Buscando...
                </div>
              )}
              {resultadosClientes.length > 0 && (
                <div className="glass-panel" style={{
                  position: "absolute",
                  top: "100%",
                  left: 0,
                  right: 0,
                  background: "var(--bg-surface)",
                  border: "1px solid var(--border-light)",
                  borderRadius: "var(--radius-sm)",
                  boxShadow: "var(--shadow-lg)",
                  zIndex: 99,
                  maxHeight: "220px",
                  overflowY: "auto",
                  marginTop: "4px"
                }}>
                  {resultadosClientes.map((c) => (
                    <div
                      key={c.id}
                      onClick={() => handleSeleccionarCliente(c)}
                      className="glass-panel-interactive"
                      style={{
                        padding: "12px 16px",
                        borderBottom: "1px solid var(--border-light)",
                        borderRadius: 0,
                        fontSize: "0.9rem",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center"
                      }}
                    >
                      <span style={{ fontWeight: 600 }}>{c.nombre}</span>
                      <span style={{ fontSize: "0.8rem", color: "var(--text-muted)", fontFamily: "monospace" }}>{c.dni}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "20px" }}>
            <div className="form-group">
              <label className="form-label">DNI / NIE</label>
              <input type="text" className="form-input" value={dni} onChange={e => setDni(e.target.value)} placeholder="Ej. 12345678Z" />
            </div>
            <div className="form-group">
              <label className="form-label">Nombre Completo *</label>
              <input type="text" className="form-input" value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Ej. Juan Pérez Gómez" />
            </div>
            <div className="form-group">
              <label className="form-label">Fecha de Nacimiento</label>
              <input type="date" className="form-input" value={fechaNacimiento} onChange={e => setFechaNacimiento(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Tienda</label>
              <select
                className="form-select"
                value={tiendaId}
                onChange={e => setTiendaId(e.target.value)}
              >
                <option value="">Selecciona Tienda</option>
                {tiendas.map(t => (
                  <option key={t.id} value={t.id}>
                    {t.nombre} {t.ciudad ? `(${t.ciudad})` : ""}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "32px", marginTop: "16px", flexWrap: "wrap" }}>
            {/* SUBFORMULARIO EMAILS CLIENTE */}
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                <span className="form-label" style={{ marginBottom: 0 }}>Correos Electrónicos</span>
                <button type="button" className="btn btn-secondary" onClick={addEmail} style={{ padding: "6px 12px", fontSize: "0.8rem", borderRadius: "var(--radius-sm)" }}>
                  + Añadir
                </button>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {emails.map((item, idx) => (
                  <div key={idx} style={{ display: "flex", gap: "10px" }}>
                    <input type="email" className="form-input" placeholder="correo@ejemplo.com" value={item.email} onChange={e => handleEmailChange(idx, e.target.value)} style={{ flex: 2 }} />
                    <select className="form-select" value={item.tipo} onChange={e => handleEmailTipoChange(idx, e.target.value)} style={{ flex: 1 }}>
                      <option value="Principal">Principal</option>
                      <option value="Trabajo">Trabajo</option>
                      <option value="Personal">Personal</option>
                      <option value="Otro">Otro</option>
                    </select>
                    {emails.length > 1 && (
                      <button type="button" className="btn btn-secondary" onClick={() => removeEmail(idx)} style={{ padding: "10px", color: "var(--danger)", border: "1px solid var(--border-light)" }}>
                        🗑️
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* SUBFORMULARIO TELÉFONOS CLIENTE */}
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                <span className="form-label" style={{ marginBottom: 0 }}>Teléfonos de Contacto</span>
                <button type="button" className="btn btn-secondary" onClick={addTelefono} style={{ padding: "6px 12px", fontSize: "0.8rem", borderRadius: "var(--radius-sm)" }}>
                  + Añadir
                </button>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {telefonos.map((item, idx) => (
                  <div key={idx} style={{ display: "flex", gap: "10px" }}>
                    <input type="text" className="form-input" placeholder="Ej. 600123456" value={item.telefono} onChange={e => handleTelefonoChange(idx, e.target.value)} style={{ flex: 2 }} />
                    <select className="form-select" value={item.tipo} onChange={e => handleTelefonoTipoChange(idx, e.target.value)} style={{ flex: 1 }}>
                      <option value="Principal">Principal</option>
                      <option value="Móvil">Móvil</option>
                      <option value="Fijo">Fijo</option>
                      <option value="Trabajo">Trabajo</option>
                    </select>
                    {telefonos.length > 1 && (
                      <button type="button" className="btn btn-secondary" onClick={() => removeTelefono(idx)} style={{ padding: "10px", color: "var(--danger)", border: "1px solid var(--border-light)" }}>
                        🗑️
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* SECCIÓN 2: DETALLES DEL VEHÍCULO Y EXPEDIENTE */}
        <div className="glass-panel" style={{ padding: "32px" }}>
          <h2 style={{ fontSize: "1.25rem", marginBottom: "24px", color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "10px" }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--secondary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
              <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
            </svg>
            Detalles de la Venta y Vehículo
          </h2>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "20px" }}>
            <div className="form-group">
              <label className="form-label">Marca</label>
              <select className="form-select" value={marcaSeleccionada} onChange={e => { setMarcaSeleccionada(e.target.value ? Number(e.target.value) : ""); setModeloSeleccionado(""); }}>
                <option value="">Selecciona Marca</option>
                {marcas.map(m => (
                  <option key={m.id} value={m.id}>{m.nombre}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Modelo</label>
              <select className="form-select" value={modeloSeleccionado} onChange={e => setModeloSeleccionado(e.target.value ? Number(e.target.value) : "")} disabled={!marcaSeleccionada}>
                <option value="">Selecciona Modelo</option>
                {modelosDisponibles.map(m => (
                  <option key={m.id} value={m.id}>{m.nombre}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Tipo de Venta</label>
              <select className="form-select" value={tipoVentaSeleccionado} onChange={e => setTipoVentaSeleccionado(e.target.value ? Number(e.target.value) : "")}>
                <option value="">Selecciona Tipo</option>
                {tiposVenta.map(t => (
                  <option key={t.id} value={t.id}>{t.nombre}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Estado de Vehículo</label>
              <select className="form-select" value={estadoVehiculoSeleccionado} onChange={e => setEstadoVehiculoSeleccionado(e.target.value ? Number(e.target.value) : "")}>
                <option value="">Selecciona Estado</option>
                {estadosVehiculo.map(ev => (
                  <option key={ev.id} value={ev.id}>{ev.nombre}</option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "20px", marginTop: "16px" }}>
            <div className="form-group">
              <label className="form-label">Matrícula</label>
              <input type="text" className="form-input" value={matricula} onChange={e => setMatricula(e.target.value)} placeholder="Ej. 1234BBB" />
            </div>
            <div className="form-group">
              <label className="form-label">Número de Bastidor (VIN)</label>
              <input type="text" className="form-input" value={vin} onChange={e => setVin(e.target.value)} placeholder="Ej. WBA..." />
            </div>
            <div className="form-group">
              <label className="form-label">Fecha Expediente</label>
              <input type="date" className="form-input" value={fechaExpediente} onChange={e => setFechaExpediente(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Fecha Afectación</label>
              <input type="date" className="form-input" value={fechaAfectacion} onChange={e => setFechaAfectacion(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Fecha RCI (Financiación)</label>
              <input type="date" className="form-input" value={fechaRci} onChange={e => setFechaRci(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Fecha Matriculación</label>
              <input type="date" className="form-input" value={fechaMatriculacion} onChange={e => setFechaMatriculacion(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Fecha Facturación (VO)</label>
              <input type="date" className="form-input" value={fechaFacturacion} onChange={e => setFechaFacturacion(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Fecha Entrega</label>
              <input type="date" className="form-input" value={fechaEntrega} onChange={e => setFechaEntrega(e.target.value)} />
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: "16px", marginTop: "8px" }}>
        <button type="button" className="btn btn-secondary" onClick={() => router.back()} disabled={loading}>
          Cancelar
        </button>
        <button type="submit" className="btn btn-primary" disabled={loading}>
          {loading ? "Guardando..." : "Crear Expediente"}
          {!loading && (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
              <polyline points="17 21 17 13 7 13 7 21" />
              <polyline points="7 3 7 8 15 8" />
            </svg>
          )}
        </button>
      </div>
    </form>

    {showDuplicateModal && duplicateClientInfo && (
      <div className="modal-backdrop" style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        backgroundColor: "rgba(0, 0, 0, 0.6)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000
      }}>
        <div className="glass-panel" style={{
          width: "90%",
          maxWidth: "500px",
          padding: "32px",
          display: "flex",
          flexDirection: "column",
          gap: "24px",
          textAlign: "center"
        }}>
          <h3 style={{ fontSize: "1.4rem", fontWeight: 600, color: "var(--warning)" }}>
            ⚠️ Cliente Ya Registrado
          </h3>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.95rem", lineHeight: "1.5" }}>
            Se ha encontrado un cliente existente en la base de datos que coincide con el DNI o Nombre ingresado:
            <br />
            <strong style={{ color: "var(--text-primary)" }}>{duplicateClientInfo.nombre}</strong> {duplicateClientInfo.dni ? `(${duplicateClientInfo.dni})` : ""}
            <br /><br />
            ¿Qué deseas hacer?
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginTop: "8px" }}>
            <button
              type="button"
              className="btn btn-primary"
              onClick={async () => {
                setShowDuplicateModal(false);
                setClienteAsignado(duplicateClientInfo);
                setNombre(duplicateClientInfo.nombre || "");
                setDni(duplicateClientInfo.dni || "");
                await executeSave(duplicateClientInfo);
              }}
              style={{ width: "100%", justifyContent: "center" }}
            >
              🤝 Usar Cliente Existente
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={async () => {
                setShowDuplicateModal(false);
                await executeSave(null, true);
              }}
              style={{ width: "100%", justifyContent: "center" }}
            >
              🆕 Crear Uno Nuevo de Todos Modos
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                setShowDuplicateModal(false);
                setDuplicateClientInfo(null);
              }}
              style={{
                width: "100%",
                justifyContent: "center",
                backgroundColor: "rgba(239, 68, 68, 0.1)",
                color: "var(--danger)",
                border: "1px solid rgba(239, 68, 68, 0.2)"
              }}
            >
              Cancelar
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
