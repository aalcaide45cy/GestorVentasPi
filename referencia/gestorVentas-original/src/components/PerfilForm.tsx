"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatDate } from "@/lib/date-utils";

interface EmailItem {
  email: string;
  tipo_email: string;
}

interface TelefonoItem {
  telefono: string;
  tipo_telefono: string;
}

interface TiendaItem {
  id: number;
  nombre: string;
}

interface PerfilFormProps {
  nombreInicial: string;
  rol: string;
  fechaRegistro: string;
  emailsIniciales: EmailItem[];
  telefonosIniciales: TelefonoItem[];
  todasLasTiendas: TiendaItem[];
  tiendasAsignadasIniciales: number[];
}

export default function PerfilForm({
  nombreInicial,
  rol,
  fechaRegistro,
  emailsIniciales,
  telefonosIniciales,
  todasLasTiendas,
  tiendasAsignadasIniciales
}: PerfilFormProps) {
  const router = useRouter();
  const [nombre, setNombre] = useState(nombreInicial);
  const [emails, setEmails] = useState(
    emailsIniciales.length > 0 ? emailsIniciales : [{ email: "", tipo_email: "Principal" }]
  );
  const [telefonos, setTelefonos] = useState(
    telefonosIniciales.length > 0 ? telefonosIniciales : [{ telefono: "", tipo_telefono: "Principal" }]
  );
  const [tiendasAsignadas, setTiendasAsignadas] = useState<number[]>(tiendasAsignadasIniciales);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Emails
  const addEmail = () => setEmails([...emails, { email: "", tipo_email: "Alternativo" }]);
  const removeEmail = (index: number) => setEmails(emails.filter((_, i) => i !== index));
  const handleEmailChange = (index: number, val: string) => {
    const updated = [...emails];
    updated[index].email = val;
    setEmails(updated);
  };
  const handleEmailTipoChange = (index: number, val: string) => {
    const updated = [...emails];
    updated[index].tipo_email = val;
    setEmails(updated);
  };

  // Teléfonos
  const addTelefono = () => setTelefonos([...telefonos, { telefono: "", tipo_telefono: "Alternativo" }]);
  const removeTelefono = (index: number) => setTelefonos(telefonos.filter((_, i) => i !== index));
  const handleTelefonoChange = (index: number, val: string) => {
    const updated = [...telefonos];
    updated[index].telefono = val;
    setTelefonos(updated);
  };
  const handleTelefonoTipoChange = (index: number, val: string) => {
    const updated = [...telefonos];
    updated[index].tipo_telefono = val;
    setTelefonos(updated);
  };

  // Tiendas N-a-N Checkboxes
  const handleTiendaCheckboxChange = (tiendaId: number, checked: boolean) => {
    if (checked) {
      setTiendasAsignadas([...tiendasAsignadas, tiendaId]);
    } else {
      setTiendasAsignadas(tiendasAsignadas.filter(id => id !== tiendaId));
    }
  };

  // Enviar Formulario
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    if (!nombre.trim()) {
      setError("El nombre es obligatorio");
      setLoading(false);
      return;
    }

    try {
      const response = await fetch("/api/perfil", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nombre,
          emails: emails.filter(e => e.email.trim()),
          telefonos: telefonos.filter(t => t.telefono.trim()),
          tiendas: tiendasAsignadas
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Error al actualizar perfil.");
      }

      setSuccess("¡Perfil actualizado con éxito!");
      router.refresh();
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err.message || "Ocurrió un error inesperado.");
    } finally {
      setLoading(false);
    }
  };

  const rolCapitalizado = rol.charAt(0).toUpperCase() + rol.slice(1);
  const esVendedorOrUp = ["administrador", "director", "jefe_zona", "jefe_tienda", "vendedor"].includes(rol);

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "28px" }}>
      {error && (
        <div className="glass-panel" style={{ padding: "16px", color: "var(--danger)", borderLeft: "4px solid var(--danger)", background: "rgba(239, 68, 68, 0.05)" }}>
          {error}
        </div>
      )}

      {success && (
        <div className="glass-panel" style={{ padding: "16px", color: "var(--success)", borderLeft: "4px solid var(--success)", background: "rgba(16, 185, 129, 0.05)" }}>
          {success}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "28px" }}>
        {/* SECCIÓN 1: DATOS GENERALES */}
        <div className="glass-panel" style={{ padding: "28px" }}>
          <h2 style={{ fontSize: "1.2rem", marginBottom: "20px", display: "flex", alignItems: "center", gap: "8px" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
            Datos Personales
          </h2>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "20px" }}>
            <div className="form-group">
              <label className="form-label">Nombre Completo</label>
              <input type="text" className="form-input" value={nombre} onChange={e => setNombre(e.target.value)} required />
            </div>

            <div className="form-group">
              <label className="form-label">Rol en el Sistema (Lectura)</label>
              <div style={{ padding: "12px 16px" }}>
                <span className={`badge badge-${rol}`}>
                  {rolCapitalizado}
                </span>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Fecha de Registro</label>
              <div style={{ padding: "12px 16px", color: "var(--text-secondary)", fontSize: "0.95rem" }}>
                {formatDate(fechaRegistro)}
              </div>
            </div>
          </div>
        </div>

        {/* SECCIÓN 2: DATOS DE CONTACTO DINÁMICOS */}
        <div className="glass-panel" style={{ padding: "28px" }}>
          <h2 style={{ fontSize: "1.2rem", marginBottom: "20px", display: "flex", alignItems: "center", gap: "8px" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--secondary)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
            </svg>
            Información de Contacto
          </h2>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "28px", flexWrap: "wrap" }}>
            {/* SUBFORMULARIO EMAILS */}
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                <span className="form-label" style={{ marginBottom: 0 }}>Correos Electrónicos</span>
                <button type="button" className="btn btn-secondary" onClick={addEmail} style={{ padding: "6px 12px", fontSize: "0.8rem" }}>
                  + Añadir
                </button>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {emails.map((item, idx) => (
                  <div key={idx} style={{ display: "flex", gap: "10px" }}>
                    <input type="email" className="form-input" placeholder="correo@ejemplo.com" value={item.email} onChange={e => handleEmailChange(idx, e.target.value)} style={{ flex: 2 }} required />
                    <select className="form-select" value={item.tipo_email} onChange={e => handleEmailTipoChange(idx, e.target.value)} style={{ flex: 1 }}>
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

            {/* SUBFORMULARIO TELÉFONOS */}
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                <span className="form-label" style={{ marginBottom: 0 }}>Teléfonos</span>
                <button type="button" className="btn btn-secondary" onClick={addTelefono} style={{ padding: "6px 12px", fontSize: "0.8rem" }}>
                  + Añadir
                </button>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {telefonos.map((item, idx) => (
                  <div key={idx} style={{ display: "flex", gap: "10px" }}>
                    <input type="text" className="form-input" placeholder="Ej. 600123456" value={item.telefono} onChange={e => handleTelefonoChange(idx, e.target.value)} style={{ flex: 2 }} required />
                    <select className="form-select" value={item.tipo_telefono} onChange={e => handleTelefonoTipoChange(idx, e.target.value)} style={{ flex: 1 }}>
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

        {/* SECCIÓN 3: TIENDAS (Sólo para Vendedor o superior) */}
        {esVendedorOrUp && (
          <div className="glass-panel" style={{ padding: "28px" }}>
            <h2 style={{ fontSize: "1.2rem", marginBottom: "20px", display: "flex", alignItems: "center", gap: "8px" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--info)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
                <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
              </svg>
              Tiendas Asociadas
            </h2>
            <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", marginBottom: "16px" }}>
              Selecciona las tiendas físicas en las que trabajas actualmente para poder registrar expedientes de venta en ellas.
            </p>

            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
              gap: "16px"
            }}>
              {todasLasTiendas.map(tienda => (
                <label key={tienda.id} style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  padding: "12px 16px",
                  background: "rgba(255, 255, 255, 0.02)",
                  border: "1px solid var(--border-light)",
                  borderRadius: "var(--radius-sm)",
                  cursor: "pointer",
                  userSelect: "none"
                }}>
                  <input
                    type="checkbox"
                    checked={tiendasAsignadas.includes(tienda.id)}
                    onChange={(e) => handleTiendaCheckboxChange(tienda.id, e.target.checked)}
                    style={{ width: "16px", height: "16px", cursor: "pointer" }}
                  />
                  <span style={{ fontSize: "0.95rem" }}>{tienda.nombre}</span>
                </label>
              ))}
              {todasLasTiendas.length === 0 && (
                <div style={{ color: "var(--text-muted)", fontStyle: "italic", gridColumn: "1 / -1" }}>
                  No hay tiendas creadas en el sistema. Pide a un administrador que registre una tienda.
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: "16px" }}>
        <button type="submit" className="btn btn-primary" disabled={loading} style={{ minWidth: "160px" }}>
          {loading ? "Guardando..." : "Guardar Cambios"}
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
  );
}
