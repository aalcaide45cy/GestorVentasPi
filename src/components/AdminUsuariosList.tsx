"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/components/Modal";
import TablaDatos, { type ColumnaTabla } from "@/components/TablaDatos";
import { useToast } from "@/components/Toast";
import { formatDate } from "@/lib/date-utils";
import type { UsuarioAdminDto } from "@/lib/dto";
import type { ResumenBorradoTotal } from "@/lib/servicios/usuarios";
import { mensajeDeError } from "./expedientes/comun";

interface Props {
  usuariosIniciales: UsuarioAdminDto[];
  currentUserId: number;
}


const ROLES_OPCIONES = [
  ["administrador", "Administrador"],
  ["director", "Director"],
  ["jefe_zona", "Jefe de Zona"],
  ["jefe_tienda", "Jefe de Tienda"],
  ["vendedor", "Vendedor"],
  ["invitado", "Invitado"],
] as const;

/** «Gestión de Usuarios y Roles»: alta con contraseña temporal, edición, suspensión y baja. */
export default function AdminUsuariosList({ usuariosIniciales, currentUserId }: Props) {
  const router = useRouter();
  const { mostrar } = useToast();
  const [usuarios, setUsuarios] = useState<UsuarioAdminDto[]>(usuariosIniciales);
  const [actualizando, setActualizando] = useState<number | null>(null);

  const [formulario, setFormulario] = useState<"crear" | "editar" | null>(null);
  const [seleccionado, setSeleccionado] = useState<UsuarioAdminDto | null>(null);
  const [aEliminar, setAEliminar] = useState<UsuarioAdminDto | null>(null);
  const [textoConfirmar, setTextoConfirmar] = useState("");
  // Borrar también todo lo del usuario (expedientes, liquidaciones…): sirve para quitar usuarios de prueba
  const [conTodoId, setConTodoId] = useState<number | null>(null);
  const [detrasDe, setDetrasDe] = useState<{ id: number; datos: ResumenBorradoTotal } | null>(null);
  const conTodo = aEliminar !== null && conTodoId === aEliminar.id_usuario;
  const detras = aEliminar !== null && detrasDe?.id === aEliminar.id_usuario ? detrasDe.datos : null;
  useEffect(() => {
    if (!aEliminar) return;
    const id = aEliminar.id_usuario;
    let vigente = true;
    void (async () => {
      try {
        const r = await fetch(`/api/admin/usuarios?resumen=${id}`, { credentials: "same-origin" });
        if (r.ok && vigente) setDetrasDe({ id, datos: ((await r.json()) as { data: ResumenBorradoTotal }).data });
      } catch {
        /* sin el resumen solo se puede borrar al usuario vacío */
      }
    })();
    return () => {
      vigente = false;
    };
  }, [aEliminar]);
  const [passwordTemporal, setPasswordTemporal] = useState<{ email: string; password: string } | null>(null);

  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [telefono, setTelefono] = useState("");
  const [rol, setRol] = useState("invitado");
  const [bloqueado, setBloqueado] = useState(false);
  const [tipoVendedor, setTipoVendedor] = useState("VN");
  const [patronVo, setPatronVo] = useState("Estándar VO");
  const [cargando, setCargando] = useState(false);

  const abrirCrear = () => {
    setNombre("");
    setEmail("");
    setTelefono("");
    setRol("invitado");
    setBloqueado(false);
    setTipoVendedor("VN");
    setPatronVo("Estándar VO");
    setFormulario("crear");
  };

  const abrirEditar = (u: UsuarioAdminDto) => {
    setSeleccionado(u);
    setNombre(u.nombre ?? "");
    setEmail(u.emails[0]?.email ?? u.login_email);
    setTelefono(u.telefonos[0]?.telefono ?? "");
    setRol(u.rol ?? "invitado");
    setBloqueado(u.bloqueado);
    setTipoVendedor(u.tipo_vendedor || "VN");
    setPatronVo(u.patron_vo || "Estándar VO");
    setFormulario("editar");
  };

  const cerrar = () => {
    setFormulario(null);
    setSeleccionado(null);
  };

  async function enviarJson(metodo: "POST" | "PUT" | "DELETE", cuerpo: object, porDefecto: string) {
    const res = await fetch("/api/admin/usuarios", { method: metodo, headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo) });
    if (!res.ok) throw new Error(await mensajeDeError(res, porDefecto));
    return (await res.json()) as { data?: UsuarioAdminDto; passwordTemporal?: string };
  }

  const guardar = async (ev: FormEvent) => {
    ev.preventDefault();
    if (!nombre.trim()) return;
    setCargando(true);
    try {
      if (formulario === "crear") {
        const r = await enviarJson(
          "POST",
          { nombre, email, telefono, rol, tipo_vendedor: tipoVendedor, patron_vo: patronVo },
          "Error al crear usuario.",
        );
        if (r.data) setUsuarios((prev) => [...prev, r.data!]);
        if (r.passwordTemporal) setPasswordTemporal({ email, password: r.passwordTemporal });
        mostrar("Usuario creado correctamente.");
      } else if (formulario === "editar" && seleccionado) {
        await enviarJson(
          "PUT",
          { id_usuario: seleccionado.id_usuario, nombre, rol, bloqueado, email, telefono, tipo_vendedor: tipoVendedor, patron_vo: patronVo },
          "Error al actualizar usuario.",
        );
        setUsuarios((prev) =>
          prev.map((u) =>
            u.id_usuario === seleccionado.id_usuario
              ? {
                  ...u,
                  nombre,
                  rol,
                  bloqueado,
                  login_email: email || u.login_email,
                  tipo_vendedor: tipoVendedor,
                  patron_vo: patronVo,
                  emails: email ? [{ email, tipo_email: "Principal" }] : [],
                  telefonos: telefono ? [{ telefono, tipo_telefono: "Principal" }] : [],
                }
              : u,
          ),
        );
        mostrar("Usuario actualizado correctamente.");
      }
      cerrar();
      router.refresh();
    } catch (e) {
      mostrar(e instanceof Error ? e.message : "Error al guardar el usuario.", "error");
    } finally {
      setCargando(false);
    }
  };

  const cambiarRol = async (u: UsuarioAdminDto, nuevoRol: string) => {
    if (u.id_usuario === currentUserId && nuevoRol !== "administrador") {
      mostrar("No puedes quitarte el rol de Administrador a ti mismo para evitar perder acceso.", "error");
      return;
    }
    if (nuevoRol === "administrador" && u.bloqueado) {
      mostrar("No se puede asignar el rol de Administrador a un usuario suspendido.", "error");
      return;
    }
    setActualizando(u.id_usuario);
    try {
      await enviarJson("PUT", { id_usuario: u.id_usuario, rol: nuevoRol }, "Error al cambiar rol.");
      setUsuarios((prev) => prev.map((x) => (x.id_usuario === u.id_usuario ? { ...x, rol: nuevoRol } : x)));
      mostrar("Rol actualizado correctamente.");
      router.refresh();
    } catch (e) {
      mostrar(e instanceof Error ? e.message : "Error al cambiar rol.", "error");
    } finally {
      setActualizando(null);
    }
  };

  const alternarBloqueo = async (u: UsuarioAdminDto) => {
    if (u.id_usuario === currentUserId) {
      mostrar("No puedes bloquear tu propia cuenta.", "error");
      return;
    }
    const nuevo = !u.bloqueado;
    setActualizando(u.id_usuario);
    try {
      await enviarJson("PUT", { id_usuario: u.id_usuario, bloqueado: nuevo }, "Error al cambiar bloqueo.");
      setUsuarios((prev) => prev.map((x) => (x.id_usuario === u.id_usuario ? { ...x, bloqueado: nuevo } : x)));
      mostrar(nuevo ? "Usuario suspendido correctamente." : "Acceso del usuario restablecido.");
      router.refresh();
    } catch (e) {
      mostrar(e instanceof Error ? e.message : "Error al cambiar bloqueo.", "error");
    } finally {
      setActualizando(null);
    }
  };

  const accionSeguridad = async (u: UsuarioAdminDto, accion: "reset_2fa" | "reset_password" | "cerrar_sesiones") => {
    const texto =
      accion === "reset_2fa"
        ? `¿Restablecer el doble factor de ${u.nombre}? Se cerrarán sus sesiones y deberá activarlo de nuevo al entrar.`
        : accion === "reset_password"
          ? `¿Crear una contraseña temporal para ${u.nombre}? Se cerrarán sus sesiones, la contraseña actual dejará de valer y tendrá que cambiarla al entrar.`
          : `¿Cerrar todas las sesiones abiertas de ${u.nombre}?`;
    if (!window.confirm(texto)) return;
    setActualizando(u.id_usuario);
    try {
      const res = await fetch("/api/admin/usuarios/seguridad", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id_usuario: u.id_usuario, accion }) });
      if (!res.ok) throw new Error(await mensajeDeError(res, "No se pudo completar la acción."));
      const r = (await res.json()) as { message?: string; passwordTemporal?: string };
      if (r.passwordTemporal) setPasswordTemporal({ email: u.login_email, password: r.passwordTemporal });
      if (accion === "reset_2fa") setUsuarios((prev) => prev.map((x) => (x.id_usuario === u.id_usuario ? { ...x, totp_activo: false } : x)));
      mostrar(r.message ?? "Hecho.");
      router.refresh();
    } catch (e) {
      mostrar(e instanceof Error ? e.message : "No se pudo completar la acción.", "error");
    } finally {
      setActualizando(null);
    }
  };

  const eliminar = async (id: number) => {
    setActualizando(id);
    try {
      await enviarJson("DELETE", { id_usuario: id, con_todo: conTodo }, "Error al eliminar usuario.");
      setUsuarios((prev) => prev.filter((u) => u.id_usuario !== id));
      mostrar("Usuario eliminado del sistema.");
      setAEliminar(null);
      router.refresh();
    } catch (e) {
      mostrar(e instanceof Error ? e.message : "Error al eliminar usuario.", "error");
    } finally {
      setActualizando(null);
    }
  };

  const columnasUsuarios: ColumnaTabla<UsuarioAdminDto>[] = [
    { clave: "usuario", etiqueta: "Usuario", valor: (u) => u.nombre ?? "", celda: (u) => (
        <>
          <div style={{ fontWeight: "bold", color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "8px" }}>
            {u.nombre}
            {(u.tipo_vendedor === "VO" || u.rol === "vendedor") && (
              <span className="badge badge-tienda" style={{ fontSize: "0.65rem", padding: "2px 6px" }}>
                {u.tipo_vendedor === "VO" ? `VO (${u.patron_vo})` : "VN"}
              </span>
            )}
          </div>
          <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontFamily: "monospace" }}>
            Acceso: {u.login_email}
            {u.totp_activo ? " · 2FA" : ""}
          </div>
        
        </>
      ) },
    { clave: "contacto", etiqueta: "Contacto", valor: (u) => u.emails[0]?.email ?? u.telefonos[0]?.telefono ?? "", celda: (u) => (
        <>
          <div style={{ fontSize: "0.85rem", display: "flex", flexDirection: "column", gap: "2px" }}>
            {u.emails[0]?.email && <span>📧 {u.emails[0].email}</span>}
            {u.telefonos[0]?.telefono && <span>📞 {u.telefonos[0].telefono}</span>}
            {!u.emails[0] && !u.telefonos[0] && <span style={{ color: "var(--text-muted)" }}>Sin contacto</span>}
          </div>
        
        </>
      ) },
    { clave: "fecha", etiqueta: "Fecha ingreso", valor: (u) => u.fecha_de_registro ?? "", celda: (u) => (<>{u.fecha_de_registro ? formatDate(u.fecha_de_registro) : "No registrada"}</>) },
    { clave: "estado", etiqueta: "Estado", valor: (u) => (u.bloqueado ? "Suspendido" : "Activo"), celda: (u) => (
        <>
          <span className={`badge ${u.bloqueado ? "badge-admin" : "badge-tienda"}`} style={{ fontSize: "0.7rem" }}>
            {u.bloqueado ? "🔒 Suspendido" : "🔓 Activo"}
          </span>
        
        </>
      ) },
    { clave: "rol", etiqueta: "Rol", valor: (u) => u.rol ?? "", celda: (u) => (
        <>
          <select
            className="form-select"
            value={u.rol || "invitado"}
            onChange={(e) => void cambiarRol(u, e.target.value)}
            disabled={actualizando === u.id_usuario}
            style={{ padding: "6px 12px", width: "150px", fontSize: "0.85rem" }}
          >
            {ROLES_OPCIONES.map(([valor, etiqueta]) => (
              <option key={valor} value={valor}>
                {etiqueta}
              </option>
            ))}
          </select>
        
        </>
      ) },
    { clave: "acciones", etiqueta: "Acciones", valor: () => "", celda: (u) => (
        <>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            {u.id_usuario !== currentUserId && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => void alternarBloqueo(u)}
                disabled={actualizando === u.id_usuario}
                style={{ padding: "6px 10px", fontSize: "0.8rem", color: u.bloqueado ? "var(--success)" : "var(--warning)", cursor: "pointer" }}
                title={u.bloqueado ? "Activar acceso" : "Suspender acceso"}
              >
                {u.bloqueado ? "🔓 Activar" : "🔒 Suspender"}
              </button>
            )}
            <button type="button" className="btn btn-secondary" onClick={() => abrirEditar(u)} disabled={actualizando === u.id_usuario} style={{ padding: "6px 10px", fontSize: "0.8rem" }}>
              ✏️ Editar
            </button>
            {u.totp_activo && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => void accionSeguridad(u, "reset_2fa")}
                disabled={actualizando === u.id_usuario}
                style={{ padding: "6px 10px", fontSize: "0.8rem" }}
                title="Restablecer el doble factor (pierde el móvil y los códigos)"
              >
                🔑 Reset 2FA
              </button>
            )}
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => void accionSeguridad(u, "reset_password")}
              disabled={actualizando === u.id_usuario}
              style={{ padding: "6px 10px", fontSize: "0.8rem" }}
              title="Crear una contraseña temporal (se muestra una sola vez) para quien la haya olvidado; tendrá que cambiarla al entrar"
            >
              🗝️ Contraseña temporal
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => void accionSeguridad(u, "cerrar_sesiones")}
              disabled={actualizando === u.id_usuario}
              style={{ padding: "6px 10px", fontSize: "0.8rem" }}
              title="Cerrar todas las sesiones abiertas de este usuario"
            >
              🚪 Cerrar sesiones
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                setAEliminar(u);
                setTextoConfirmar("");
              }}
              disabled={actualizando === u.id_usuario}
              style={{ padding: "6px 10px", color: "var(--danger)", border: "1px solid var(--border-light)" }}
            >
              🗑️
            </button>
          </div>
        
        </>
      ) },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button type="button" className="btn btn-primary" onClick={abrirCrear} style={{ padding: "10px 20px" }}>
          + Registrar Nuevo Usuario
        </button>
      </div>

      <TablaDatos<UsuarioAdminDto>
        id="usuarios-admin"
        columnas={columnasUsuarios}
        filas={usuarios}
        clave={(u) => u.id_usuario}
        placeholder="Buscar por nombre, correo, teléfono, rol…"
        vacio="No hay usuarios."
        textoExtra={(u) => `${u.login_email} ${u.emails.map((e) => e.email).join(" ")} ${u.telefonos.map((t) => t.telefono).join(" ")}`}
        pie={(fs) => ({ usuario: `${fs.length} usuario${fs.length === 1 ? "" : "s"}` })}
      />

      {formulario && (
        <Modal titulo={formulario === "crear" ? "Registrar Nuevo Usuario" : "Editar Usuario"} ancho="500px" tamanoTitulo="1.25rem">
          <form onSubmit={guardar} style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Nombre Completo *</label>
              <input type="text" className="form-input" placeholder="Ej. Carlos Martínez" value={nombre} onChange={(e) => setNombre(e.target.value)} required />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Correo Electrónico (acceso) *</label>
              <input type="email" className="form-input" placeholder="correo@ejemplo.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Teléfono de Contacto</label>
              <input type="text" className="form-input" placeholder="Ej. +34 600123456" value={telefono} onChange={(e) => setTelefono(e.target.value)} />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Rol Asignado *</label>
              <select className="form-select" value={rol} onChange={(e) => setRol(e.target.value)} required>
                {ROLES_OPCIONES.map(([valor, etiqueta]) => (
                  <option key={valor} value={valor}>
                    {etiqueta}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Tipo de Vendedor *</label>
              <select className="form-select" value={tipoVendedor} onChange={(e) => setTipoVendedor(e.target.value)} required>
                <option value="VN">Vehículo Nuevo (VN)</option>
                <option value="VO">Vehículo de Ocasión (VO)</option>
              </select>
            </div>
            {tipoVendedor === "VO" && (
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Patrón de Comisionamiento VO *</label>
                <input type="text" className="form-input" placeholder="Ej. Estándar VO" value={patronVo} onChange={(e) => setPatronVo(e.target.value)} required />
              </div>
            )}
            {formulario === "editar" && rol !== "administrador" && (
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginTop: "4px" }}>
                <input type="checkbox" id="chkBloqueado" checked={bloqueado} onChange={(e) => setBloqueado(e.target.checked)} style={{ width: "18px", height: "18px", cursor: "pointer" }} />
                <label htmlFor="chkBloqueado" style={{ cursor: "pointer", fontSize: "0.95rem", fontWeight: 500 }}>
                  Suspender acceso (Bloquear cuenta)
                </label>
              </div>
            )}
            {formulario === "crear" && (
              <p style={{ color: "var(--text-muted)", fontSize: "0.82rem", margin: 0 }}>
                Se generará una contraseña temporal que verás una sola vez; el usuario deberá cambiarla en su primer acceso.
              </p>
            )}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", marginTop: "10px" }}>
              <button type="button" className="btn btn-secondary" onClick={cerrar} disabled={cargando}>
                Cancelar
              </button>
              <button type="submit" className="btn btn-primary" disabled={cargando}>
                {cargando ? "Guardando..." : formulario === "crear" ? "Crear Usuario" : "Guardar Cambios"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {passwordTemporal && (
        <Modal
          titulo="Contraseña temporal"
          ancho="480px"
          tamanoTitulo="1.25rem"
          pie={
            <button type="button" className="btn btn-primary" onClick={() => setPasswordTemporal(null)}>
              He copiado la contraseña
            </button>
          }
        >
          <p style={{ color: "var(--text-secondary)", fontSize: "0.95rem", lineHeight: "1.5", margin: 0 }}>
            Entrega estos datos a <strong>{passwordTemporal.email}</strong>. La contraseña <strong>no se volverá a mostrar</strong> y deberá cambiarla en su primer acceso.
          </p>
          <code style={{ display: "block", padding: "14px", background: "rgba(255,255,255,0.05)", border: "1px solid var(--border-light)", borderRadius: "var(--radius-sm)", fontSize: "1.05rem", textAlign: "center", userSelect: "all" }}>
            {passwordTemporal.password}
          </code>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              void navigator.clipboard?.writeText(passwordTemporal.password).then(() => mostrar("Contraseña copiada al portapapeles."));
            }}
          >
            📋 Copiar
          </button>
        </Modal>
      )}

      {aEliminar && (
        <Modal
          titulo={<span style={{ color: "var(--danger)" }}>⚠️ Confirmar Eliminación de Usuario</span>}
          ancho="450px"
          tamanoTitulo="1.25rem"
          peligro
          pie={
            <>
              <button type="button" className="btn btn-secondary" onClick={() => setAEliminar(null)} disabled={actualizando !== null}>
                Cancelar
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => void eliminar(aEliminar.id_usuario)}
                disabled={actualizando !== null || textoConfirmar !== "ELIMINAR"}
                style={{
                  backgroundColor: textoConfirmar === "ELIMINAR" ? "var(--danger)" : "var(--border-light)",
                  color: "white",
                  cursor: textoConfirmar === "ELIMINAR" ? "pointer" : "not-allowed",
                  border: "none",
                  borderRadius: "var(--radius-sm)",
                  padding: "10px 20px",
                }}
              >
                {actualizando !== null ? "Eliminando..." : "Eliminar Usuario"}
              </button>
            </>
          }
        >
          <p style={{ color: "var(--text-secondary)", fontSize: "0.95rem", lineHeight: "1.5", margin: 0 }}>
            ¿Estás seguro de que deseas eliminar definitivamente al usuario <strong>{aEliminar.nombre}</strong>? Esta acción no se puede deshacer.
          </p>
          {detras && (detras.expedientes > 0 || detras.liquidaciones > 0 || detras.rejillas > 0 || detras.historial > 0) && (
            <div style={{ border: "1px solid var(--warning)", borderRadius: "var(--radius-sm)", padding: "10px 12px", fontSize: "0.88rem", lineHeight: 1.5 }}>
              Este usuario tiene <b>{detras.expedientes}</b> expediente(s) activo(s), <b>{detras.liquidaciones}</b> liquidación(es), <b>{detras.rejillas}</b> rejilla(s) y <b>{detras.historial}</b> apunte(s) de puntos, planes o validaciones. Mientras existan, no se puede borrar. Si es un usuario de prueba, puedes borrarlo con todo lo suyo:
              {detras.lista.length > 0 && (
                <div style={{ maxHeight: "160px", overflowY: "auto", margin: "8px 0", border: "1px solid var(--border-light)", borderRadius: "var(--radius-sm)", padding: "6px 8px" }}>
                  {detras.lista.map((x) => (
                    <div key={x.id} style={{ display: "flex", gap: "8px", justifyContent: "space-between" }}>
                      <a href={`/dashboard/expedientes/editar/${x.id}`} target="_blank" rel="noreferrer" style={{ color: "var(--primary)" }}>
                        #{x.id} · {x.cliente ?? "Sin cliente"}
                      </a>
                      <span style={{ color: "var(--text-muted)" }}>{x.matricula ?? "sin matrícula"}</span>
                    </div>
                  ))}
                  {detras.expedientes > detras.lista.length && <div style={{ color: "var(--text-muted)" }}>… y {detras.expedientes - detras.lista.length} más</div>}
                </div>
              )}
              <label style={{ display: "flex", gap: "8px", alignItems: "center", marginTop: "8px", fontWeight: 600 }}>
                <input type="checkbox" checked={conTodo} onChange={(e) => setConTodoId(e.target.checked && aEliminar ? aEliminar.id_usuario : null)} />
                Borrar también sus expedientes, liquidaciones, rejillas y puntos
              </label>
            </div>
          )}
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">
              Escribe <strong>ELIMINAR</strong> para confirmar:
            </label>
            <input type="text" className="form-input" placeholder="ELIMINAR" value={textoConfirmar} onChange={(e) => setTextoConfirmar(e.target.value)} style={{ textTransform: "uppercase" }} />
          </div>
        </Modal>
      )}
    </div>
  );
}
