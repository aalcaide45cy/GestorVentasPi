"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { formatDate } from "@/lib/date-utils";
import { CLASE_BADGE_ROL, ETIQUETA_ROL, esRolActivo, normalizarRol } from "@/lib/auth/permisos";
import ListaContactos, { contactoVacio, type ContactoEdicion } from "./expedientes/ListaContactos";
import { mensajeDeError } from "./expedientes/comun";

interface Props {
  nombreInicial: string;
  rol: string;
  fechaRegistro: string;
  emailsIniciales: { email: string; tipo_email: string }[];
  telefonosIniciales: { telefono: string; tipo_telefono: string }[];
  todasLasTiendas: { id: number; nombre: string }[];
  tiendasAsignadasIniciales: number[];
}

/** «Mis Datos»: nombre, contactos y tiendas del propio usuario. */
export default function PerfilForm({ nombreInicial, rol, fechaRegistro, emailsIniciales, telefonosIniciales, todasLasTiendas, tiendasAsignadasIniciales }: Props) {
  const router = useRouter();
  const [nombre, setNombre] = useState(nombreInicial);
  const [emails, setEmails] = useState<ContactoEdicion[]>(
    emailsIniciales.length > 0 ? emailsIniciales.map((e) => ({ valor: e.email, tipo: e.tipo_email })) : [contactoVacio()],
  );
  const [telefonos, setTelefonos] = useState<ContactoEdicion[]>(
    telefonosIniciales.length > 0 ? telefonosIniciales.map((t) => ({ valor: t.telefono, tipo: t.tipo_telefono })) : [contactoVacio()],
  );
  const [tiendas, setTiendas] = useState<number[]>(tiendasAsignadasIniciales);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);

  const rolNormalizado = normalizarRol(rol);

  const enviar = async (ev: FormEvent) => {
    ev.preventDefault();
    setCargando(true);
    setError(null);
    setExito(null);
    if (!nombre.trim()) {
      setError("El nombre es obligatorio");
      setCargando(false);
      return;
    }
    try {
      const res = await fetch("/api/perfil", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nombre,
          emails: emails.filter((e) => e.valor.trim()).map((e) => ({ email: e.valor.trim(), tipo_email: e.tipo })),
          telefonos: telefonos.filter((t) => t.valor.trim()).map((t) => ({ telefono: t.valor.trim(), tipo_telefono: t.tipo })),
          tiendas,
        }),
      });
      if (!res.ok) throw new Error(await mensajeDeError(res, "Error al actualizar perfil."));
      setExito("¡Perfil actualizado con éxito!");
      router.refresh();
      setTimeout(() => setExito(null), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ocurrió un error inesperado.");
    } finally {
      setCargando(false);
    }
  };

  const titulo = (color: string, icono: React.ReactNode, texto: string) => (
    <h2 style={{ fontSize: "1.2rem", marginBottom: "20px", display: "flex", alignItems: "center", gap: "8px" }}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        {icono}
      </svg>
      {texto}
    </h2>
  );

  return (
    <form onSubmit={enviar} style={{ display: "flex", flexDirection: "column", gap: "28px" }}>
      {error && (
        <div className="glass-panel" style={{ padding: "16px", color: "var(--danger)", borderLeft: "4px solid var(--danger)", background: "rgba(239, 68, 68, 0.05)" }}>
          {error}
        </div>
      )}
      {exito && (
        <div className="glass-panel" style={{ padding: "16px", color: "var(--success)", borderLeft: "4px solid var(--success)", background: "rgba(16, 185, 129, 0.05)" }}>
          {exito}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "28px" }}>
        <div className="glass-panel" style={{ padding: "28px" }}>
          {titulo(
            "var(--primary)",
            <>
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </>,
            "Datos Personales",
          )}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "20px" }}>
            <div className="form-group">
              <label className="form-label">Nombre Completo</label>
              <input type="text" className="form-input" value={nombre} onChange={(e) => setNombre(e.target.value)} required />
            </div>
            <div className="form-group">
              <label className="form-label">Rol en el Sistema (Lectura)</label>
              <div style={{ padding: "12px 16px" }}>
                <span className={`badge ${CLASE_BADGE_ROL[rolNormalizado]}`}>{ETIQUETA_ROL[rolNormalizado]}</span>
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Fecha de Registro</label>
              <div style={{ padding: "12px 16px", color: "var(--text-secondary)", fontSize: "0.95rem" }}>{formatDate(fechaRegistro)}</div>
            </div>
          </div>
        </div>

        <div className="glass-panel" style={{ padding: "28px" }}>
          {titulo(
            "var(--secondary)",
            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />,
            "Información de Contacto",
          )}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "28px" }}>
            <ListaContactos clase="email" contactos={emails} alCambiar={setEmails} />
            <ListaContactos clase="telefono" contactos={telefonos} alCambiar={setTelefonos} />
          </div>
        </div>

        {esRolActivo(rol) && (
          <div className="glass-panel" style={{ padding: "28px" }}>
            {titulo(
              "var(--info)",
              <>
                <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
                <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
              </>,
              "Tiendas Asociadas",
            )}
            <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", marginBottom: "16px" }}>
              Selecciona las tiendas físicas en las que trabajas actualmente para poder registrar expedientes de venta en ellas.
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "16px" }}>
              {todasLasTiendas.map((t) => (
                <label
                  key={t.id}
                  style={{ display: "flex", alignItems: "center", gap: "10px", padding: "12px 16px", background: "rgba(255, 255, 255, 0.02)", border: "1px solid var(--border-light)", borderRadius: "var(--radius-sm)", cursor: "pointer", userSelect: "none" }}
                >
                  <input
                    type="checkbox"
                    checked={tiendas.includes(t.id)}
                    onChange={(e) => setTiendas((prev) => (e.target.checked ? [...prev, t.id] : prev.filter((x) => x !== t.id)))}
                    style={{ width: "16px", height: "16px", cursor: "pointer" }}
                  />
                  <span style={{ fontSize: "0.95rem" }}>{t.nombre}</span>
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
        <button type="submit" className="btn btn-primary" disabled={cargando} style={{ minWidth: "160px" }}>
          {cargando ? "Guardando..." : "Guardar Cambios"}
          {!cargando && (
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
