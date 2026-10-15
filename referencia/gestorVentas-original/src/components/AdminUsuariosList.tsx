"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatDate } from "@/lib/date-utils";

interface EmailContact {
  email: string;
}

interface TelefonoContact {
  telefono: string;
}

interface UserItem {
  id_usuario: number;
  clerk_id: string;
  nombre: string | null;
  rol: string | null;
  fecha_de_registro: string | null;
  bloqueado?: boolean | null;
  tipo_vendedor?: string;
  patron_vo?: string | null;
  emails: EmailContact[];
  telefonos: TelefonoContact[];
}

interface AdminUsuariosListProps {
  usuariosIniciales: UserItem[];
  currentUserId: string; // Clerk ID del admin actual
}

export default function AdminUsuariosList({ usuariosIniciales, currentUserId }: AdminUsuariosListProps) {
  const router = useRouter();
  const [usuarios, setUsuarios] = useState<UserItem[]>(usuariosIniciales);
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [notification, setNotification] = useState<{ text: string; type: "success" | "error" } | null>(null);

  // Sorting state
  const [sortField, setSortField] = useState<"nombre" | "fecha_de_registro" | "rol" | "bloqueado" | null>(null);
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");

  // Estados de modal
  const [modalOpen, setModalOpen] = useState<"create" | "edit" | null>(null);
  const [selectedUser, setSelectedUser] = useState<UserItem | null>(null);
  const [deleteModalUser, setDeleteModalUser] = useState<UserItem | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");

  // Campos de formulario
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [telefono, setTelefono] = useState("");
  const [rol, setRol] = useState("invitado");
  const [bloqueado, setBloqueado] = useState(false);
  const [tipoVendedor, setTipoVendedor] = useState("VN");
  const [patronVo, setPatronVo] = useState("Estándar VO");
  const [loading, setLoading] = useState(false);

  const handleSort = (field: "nombre" | "fecha_de_registro" | "rol" | "bloqueado") => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder("asc");
    }
  };

  const sortedUsuarios = [...usuarios].sort((a, b) => {
    if (!sortField) return 0;
    let aVal: any = a[sortField];
    let bVal: any = b[sortField];
    if (aVal === null || aVal === undefined) aVal = "";
    if (bVal === null || bVal === undefined) bVal = "";
    if (typeof aVal === "boolean") {
      aVal = aVal ? 1 : 0;
      bVal = bVal ? 1 : 0;
    }
    if (aVal < bVal) return sortOrder === "asc" ? -1 : 1;
    if (aVal > bVal) return sortOrder === "asc" ? 1 : -1;
    return 0;
  });

  const showNotification = (text: string, type: "success" | "error") => {
    setNotification({ text, type });
    setTimeout(() => setNotification(null), 4000);
  };

  // Abrir modal creación
  const openCreateModal = () => {
    setNombre("");
    setEmail("");
    setTelefono("");
    setRol("invitado");
    setBloqueado(false);
    setTipoVendedor("VN");
    setPatronVo("Estándar VO");
    setModalOpen("create");
  };

  // Abrir modal edición
  const openEditModal = (usr: UserItem) => {
    setSelectedUser(usr);
    setNombre(usr.nombre || "");
    setEmail(usr.emails?.[0]?.email || "");
    setTelefono(usr.telefonos?.[0]?.telefono || "");
    setRol(usr.rol || "invitado");
    setBloqueado(!!usr.bloqueado);
    setTipoVendedor(usr.tipo_vendedor || "VN");
    setPatronVo(usr.patron_vo || "Estándar VO");
    setModalOpen("edit");
  };

  const handleCloseModal = () => {
    setModalOpen(null);
    setSelectedUser(null);
  };

  // Guardar usuario (Crear o Editar)
  const handleSaveUsuario = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nombre.trim()) return;
    setLoading(true);

    try {
      if (modalOpen === "create") {
        const res = await fetch("/api/admin/usuarios", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nombre, email, telefono, rol, tipo_vendedor: tipoVendedor, patron_vo: patronVo })
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.message || "Error al crear usuario.");

        // Agregar al estado local
        setUsuarios([
          ...usuarios,
          {
            id_usuario: data.data.id_usuario,
            clerk_id: data.data.clerk_id,
            nombre: data.data.nombre,
            rol: data.data.rol,
            fecha_de_registro: data.data.fecha_de_registro,
            bloqueado: false,
            tipo_vendedor: data.data.tipo_vendedor,
            patron_vo: data.data.patron_vo,
            emails: email ? [{ email }] : [],
            telefonos: telefono ? [{ telefono }] : []
          }
        ]);
        showNotification("Usuario creado correctamente. Se sincronizará por email cuando inicie sesión.", "success");
      } else if (modalOpen === "edit" && selectedUser) {
        if (rol === "administrador" && bloqueado) {
          showNotification("No se puede suspender a un usuario con el rol de Administrador.", "error");
          setLoading(false);
          return;
        }
        const res = await fetch("/api/admin/usuarios", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id_usuario: selectedUser.id_usuario,
            nombre,
            rol,
            bloqueado,
            email,
            telefono,
            tipo_vendedor: tipoVendedor,
            patron_vo: patronVo
          })
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.message || "Error al actualizar usuario.");

        // Actualizar estado local
        setUsuarios(usuarios.map(u => u.id_usuario === selectedUser.id_usuario ? {
          ...u,
          nombre,
          rol,
          bloqueado,
          tipo_vendedor: tipoVendedor,
          patron_vo: patronVo,
          emails: email ? [{ email }] : [],
          telefonos: telefono ? [{ telefono }] : []
        } : u));

        showNotification("Usuario actualizado correctamente.", "success");
      }
      handleCloseModal();
      router.refresh();
    } catch (err: any) {
      showNotification(err.message, "error");
    } finally {
      setLoading(false);
    }
  };

  // Cambiar rol de forma rápida
  const handleRolChange = async (idUsuario: number, clerkId: string, nuevoRol: string) => {
    if (clerkId === currentUserId && nuevoRol !== "administrador") {
      showNotification("No puedes quitarte el rol de Administrador a ti mismo para evitar perder acceso.", "error");
      return;
    }
    const usr = usuarios.find(u => u.id_usuario === idUsuario);
    if (nuevoRol === "administrador" && usr?.bloqueado) {
      showNotification("No se puede asignar el rol de Administrador a un usuario suspendido.", "error");
      return;
    }
    setUpdatingId(idUsuario);

    try {
      const response = await fetch("/api/admin/usuarios", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id_usuario: idUsuario, rol: nuevoRol })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Error al cambiar rol.");

      setUsuarios(usuarios.map(u => u.id_usuario === idUsuario ? { ...u, rol: nuevoRol } : u));
      showNotification("Rol actualizado correctamente.", "success");
      router.refresh();
    } catch (error: any) {
      showNotification(error.message, "error");
    } finally {
      setUpdatingId(null);
    }
  };

  // Bloquear/Desbloquear rápido
  const handleToggleBloqueo = async (usr: UserItem) => {
    if (usr.clerk_id === currentUserId) {
      showNotification("No puedes bloquear tu propia cuenta.", "error");
      return;
    }
    if (usr.rol === "administrador") {
      showNotification("No se puede suspender a un usuario con el rol de Administrador.", "error");
      return;
    }

    const nuevoEstado = !usr.bloqueado;
    setUpdatingId(usr.id_usuario);

    try {
      const response = await fetch("/api/admin/usuarios", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id_usuario: usr.id_usuario, bloqueado: nuevoEstado })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Error al cambiar bloqueo.");

      setUsuarios(usuarios.map(u => u.id_usuario === usr.id_usuario ? { ...u, bloqueado: nuevoEstado } : u));
      showNotification(nuevoEstado ? "Usuario suspendido correctamente." : "Acceso del usuario restablecido.", "success");
      router.refresh();
    } catch (error: any) {
      showNotification(error.message, "error");
    } finally {
      setUpdatingId(null);
    }
  };

  // Eliminar usuario
  const handleEliminarUsuario = async (idUsuario: number) => {
    setUpdatingId(idUsuario);

    try {
      const response = await fetch("/api/admin/usuarios", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id_usuario: idUsuario })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Error al eliminar usuario.");

      setUsuarios(usuarios.filter(u => u.id_usuario !== idUsuario));
      showNotification("Usuario eliminado del sistema.", "success");
      setDeleteModalUser(null);
      router.refresh();
    } catch (error: any) {
      showNotification(error.message, "error");
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      {/* NOTIFICACIÓN FLOTANTE */}
      {notification && (
        <div style={{
          position: "fixed",
          top: "24px",
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 9999,
          display: "flex",
          flexDirection: "column",
          gap: "10px",
          width: "90%",
          maxWidth: "450px",
          animation: "fadeIn 0.3s ease"
        }}>
          <div className="glass-panel" style={{
            padding: "16px 20px",
            color: notification.type === "success" ? "var(--success)" : "var(--danger)",
            borderLeft: `4px solid var(--${notification.type === "success" ? "success" : "danger"})`,
            background: notification.type === "success" ? "rgba(16, 185, 129, 0.1)" : "rgba(239, 68, 68, 0.1)",
            fontWeight: 500,
            display: "flex",
            alignItems: "center",
            gap: "10px",
            boxShadow: "0 10px 25px rgba(0,0,0,0.2)"
          }}>
            <span>{notification.type === "success" ? "✓" : "⚠️"} {notification.text}</span>
          </div>
        </div>
      )}

      {/* BOTÓN ALTA USUARIO */}
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button type="button" className="btn btn-primary" onClick={openCreateModal} style={{ padding: "10px 20px" }}>
          + Registrar Nuevo Usuario
        </button>
      </div>

      {/* TABLA DE USUARIOS */}
      <div className="table-container">
        <table className="table-premium">
          <thead>
            <tr>
              <th onClick={() => handleSort("nombre")} style={{ cursor: "pointer", userSelect: "none" }}>
                Usuario{sortField === "nombre" ? (sortOrder === "asc" ? " ▲" : " ▼") : " ↕"}
              </th>
              <th>Contacto</th>
              <th onClick={() => handleSort("fecha_de_registro")} style={{ cursor: "pointer", userSelect: "none" }}>
                Fecha Ingreso{sortField === "fecha_de_registro" ? (sortOrder === "asc" ? " ▲" : " ▼") : " ↕"}
              </th>
              <th onClick={() => handleSort("bloqueado")} style={{ cursor: "pointer", userSelect: "none" }}>
                Estado{sortField === "bloqueado" ? (sortOrder === "asc" ? " ▲" : " ▼") : " ↕"}
              </th>
              <th onClick={() => handleSort("rol")} style={{ cursor: "pointer", userSelect: "none" }}>
                Rol{sortField === "rol" ? (sortOrder === "asc" ? " ▲" : " ▼") : " ↕"}
              </th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {sortedUsuarios.map((usr) => (
              <tr key={usr.id_usuario}>
                <td>
                  <div style={{ fontWeight: "bold", color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "8px" }}>
                    {usr.nombre}
                    {(usr.tipo_vendedor === "VO" || usr.rol === "vendedor") && (
                      <span className="badge badge-tienda" style={{ fontSize: "0.65rem", padding: "2px 6px" }}>
                        {usr.tipo_vendedor === "VO" ? `VO (${usr.patron_vo})` : "VN"}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontFamily: "monospace" }}>
                    ID Clerk: {usr.clerk_id.startsWith("pending_") ? "Pendiente Registro" : usr.clerk_id.substring(0, 12) + "..."}
                  </div>
                </td>
                <td>
                  <div style={{ fontSize: "0.85rem", display: "flex", flexDirection: "column", gap: "2px" }}>
                    {usr.emails?.[0]?.email && <span>📧 {usr.emails[0].email}</span>}
                    {usr.telefonos?.[0]?.telefono && <span>📞 {usr.telefonos[0].telefono}</span>}
                    {!usr.emails?.[0] && !usr.telefonos?.[0] && <span style={{ color: "var(--text-muted)" }}>Sin contacto</span>}
                  </div>
                </td>
                <td>{usr.fecha_de_registro ? formatDate(usr.fecha_de_registro) : "No registrada"}</td>
                <td>
                  <span className={`badge ${usr.bloqueado ? "badge-admin" : "badge-tienda"}`} style={{ fontSize: "0.7rem" }}>
                    {usr.bloqueado ? "🔒 Suspendido" : "🔓 Activo"}
                  </span>
                </td>
                <td>
                  <select
                    className="form-select"
                    value={usr.rol || "invitado"}
                    onChange={(e) => handleRolChange(usr.id_usuario, usr.clerk_id, e.target.value)}
                    disabled={updatingId === usr.id_usuario}
                    style={{ padding: "6px 12px", width: "150px", fontSize: "0.85rem" }}
                  >
                    <option value="administrador">Administrador</option>
                    <option value="director">Director</option>
                    <option value="jefe_zona">Jefe de Zona</option>
                    <option value="jefe_tienda">Jefe de Tienda</option>
                    <option value="vendedor">Vendedor</option>
                    <option value="invitado">Invitado</option>
                  </select>
                </td>
                <td>
                  <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                    {usr.rol !== "administrador" && (
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => handleToggleBloqueo(usr)}
                        disabled={updatingId === usr.id_usuario}
                        style={{
                          padding: "6px 10px",
                          fontSize: "0.8rem",
                          color: usr.bloqueado ? "var(--success)" : "var(--warning)",
                          cursor: "pointer"
                        }}
                        title={usr.bloqueado ? "Activar acceso" : "Suspender acceso"}
                      >
                        {usr.bloqueado ? "🔓 Activar" : "🔒 Suspender"}
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => openEditModal(usr)}
                      disabled={updatingId === usr.id_usuario}
                      style={{ padding: "6px 10px", fontSize: "0.8rem" }}
                    >
                      ✏️ Editar
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => {
                        setDeleteModalUser(usr);
                        setDeleteConfirmText("");
                      }}
                      disabled={updatingId === usr.id_usuario}
                      style={{ padding: "6px 10px", color: "var(--danger)", border: "1px solid var(--border-light)" }}
                    >
                      🗑️
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* FORMULARIO MODAL (CREAR / EDITAR) */}
      {modalOpen && (
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
            maxWidth: "500px",
            padding: "32px",
            display: "flex",
            flexDirection: "column",
            gap: "24px"
          }}>
            <h3 style={{ fontSize: "1.25rem", color: "var(--text-primary)" }}>
              {modalOpen === "create" ? "Registrar Nuevo Usuario" : "Editar Usuario"}
            </h3>

            <form onSubmit={handleSaveUsuario} style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Nombre Completo *</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Ej. Carlos Martínez"
                  value={nombre}
                  onChange={e => setNombre(e.target.value)}
                  required
                />
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Correo Electrónico</label>
                <input
                  type="email"
                  className="form-input"
                  placeholder="correo@ejemplo.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                />
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Teléfono de Contacto</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Ej. +34 600123456"
                  value={telefono}
                  onChange={e => setTelefono(e.target.value)}
                />
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Rol Asignado *</label>
                <select className="form-select" value={rol} onChange={e => setRol(e.target.value)} required>
                  <option value="administrador">Administrador</option>
                  <option value="director">Director</option>
                  <option value="jefe_zona">Jefe de Zona</option>
                  <option value="jefe_tienda">Jefe de Tienda</option>
                  <option value="vendedor">Vendedor</option>
                  <option value="invitado">Invitado</option>
                </select>
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Tipo de Vendedor *</label>
                <select className="form-select" value={tipoVendedor} onChange={e => setTipoVendedor(e.target.value)} required>
                  <option value="VN">Vehículo Nuevo (VN)</option>
                  <option value="VO">Vehículo de Ocasión (VO)</option>
                </select>
              </div>
              {tipoVendedor === "VO" && (
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Patrón de Comisionamiento VO *</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Ej. Estándar VO"
                    value={patronVo || ""}
                    onChange={e => setPatronVo(e.target.value)}
                    required
                  />
                </div>
              )}

               {modalOpen === "edit" && rol !== "administrador" && (
                <div style={{ display: "flex", alignItems: "center", gap: "10px", marginTop: "4px" }}>
                  <input
                    type="checkbox"
                    id="chkBloqueado"
                    checked={bloqueado}
                    onChange={e => setBloqueado(e.target.checked)}
                    style={{ width: "18px", height: "18px", cursor: "pointer" }}
                  />
                  <label htmlFor="chkBloqueado" style={{ cursor: "pointer", fontSize: "0.95rem", fontWeight: 500 }}>
                    Suspender acceso (Bloquear cuenta)
                  </label>
                </div>
              )}

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", marginTop: "10px" }}>
                <button type="button" className="btn btn-secondary" onClick={handleCloseModal} disabled={loading}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" disabled={loading}>
                  {loading ? "Guardando..." : "Guardar Cambios"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL DE CONFIRMACIÓN DE ELIMINACIÓN */}
      {deleteModalUser && (
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
            <h3 style={{ fontSize: "1.25rem", color: "var(--danger)", margin: 0 }}>
              ⚠️ Confirmar Eliminación de Usuario
            </h3>
            <p style={{ color: "var(--text-secondary)", fontSize: "0.95rem", lineHeight: "1.5" }}>
              ¿Estás seguro de que deseas eliminar definitivamente al usuario <strong>{deleteModalUser.nombre}</strong>?
              Esta acción no se puede deshacer.
            </p>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Escribe <strong>ELIMINAR</strong> para confirmar:</label>
              <input
                type="text"
                className="form-input"
                placeholder="ELIMINAR"
                value={deleteConfirmText}
                onChange={e => setDeleteConfirmText(e.target.value)}
                style={{ textTransform: "uppercase" }}
              />
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", marginTop: "10px" }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setDeleteModalUser(null)}
                disabled={loading}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => handleEliminarUsuario(deleteModalUser.id_usuario)}
                disabled={loading || deleteConfirmText !== "ELIMINAR"}
                style={{
                  backgroundColor: deleteConfirmText === "ELIMINAR" ? "var(--danger)" : "var(--border-light)",
                  color: "white",
                  cursor: deleteConfirmText === "ELIMINAR" ? "pointer" : "not-allowed",
                  border: "none",
                  borderRadius: "var(--radius-sm)",
                  padding: "10px 20px"
                }}
              >
                {loading ? "Eliminando..." : "Eliminar Usuario"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
