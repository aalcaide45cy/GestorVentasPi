"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import PanelAcceso from "@/components/auth/PanelAcceso";
import { mensajeDeError } from "@/components/expedientes/comun";

type Paso = "password" | "codigo" | "suspendida" | "recuperar";

/** Acceso en dos pasos: correo + contraseña y, si el usuario tiene 2FA, código de 6 dígitos o de recuperación. */
export default function LoginForm() {
  const router = useRouter();
  const [paso, setPaso] = useState<Paso>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [codigo, setCodigo] = useState("");
  const [usarRecuperacion, setUsarRecuperacion] = useState(false);
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);
  // «He olvidado la contraseña»: código del autenticador + contraseña nueva
  const [nueva, setNueva] = useState("");
  const [repetida, setRepetida] = useState("");
  const [aviso, setAviso] = useState("");

  async function enviarRecuperacion(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (nueva !== repetida) {
      setError("Las contraseñas nuevas no coinciden.");
      return;
    }
    setEnviando(true);
    try {
      const res = await fetch("/api/auth/recuperar-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, codigo, nueva }) });
      if (!res.ok) {
        setError(await mensajeDeError(res, "No se pudo cambiar la contraseña"));
        return;
      }
      setNueva("");
      setRepetida("");
      setCodigo("");
      setUsarRecuperacion(false);
      setPaso("password");
      setAviso("Contraseña cambiada. Entra con la nueva (el código del autenticador de ahora ya está usado: espera al siguiente).");
    } catch {
      setError("No se pudo conectar con el servidor");
    } finally {
      setEnviando(false);
    }
  }

  async function enviarPassword(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setEnviando(true);
    try {
      const res = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
      if (res.status === 403) {
        setPaso("suspendida");
        return;
      }
      if (!res.ok) {
        setError(await mensajeDeError(res, "No se pudo iniciar sesión"));
        return;
      }
      const datos = (await res.json()) as { requiere: "2fa" | "activar_2fa" };
      setPassword("");
      if (datos.requiere === "activar_2fa") {
        router.push("/cuenta/activar-2fa");
        router.refresh();
      } else {
        setPaso("codigo");
      }
    } catch {
      setError("No se pudo conectar con el servidor");
    } finally {
      setEnviando(false);
    }
  }

  async function enviarCodigo(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setEnviando(true);
    try {
      const res = await fetch("/api/auth/verificar-2fa", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ codigo }) });
      if (!res.ok) {
        setError(await mensajeDeError(res, "No se pudo verificar el código"));
        return;
      }
      const datos = (await res.json()) as { debeCambiarPassword: boolean };
      router.push(datos.debeCambiarPassword ? "/cuenta/cambiar-password" : "/dashboard");
      router.refresh();
    } catch {
      setError("No se pudo conectar con el servidor");
    } finally {
      setEnviando(false);
    }
  }

  async function volver() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    setPaso("password");
    setCodigo("");
    setUsarRecuperacion(false);
    setError("");
  }

  if (paso === "recuperar") {
    return (
      <PanelAcceso subtitulo="Recuperar la contraseña">
        <form onSubmit={enviarRecuperacion} style={{ width: "100%" }}>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.88rem", lineHeight: 1.5, marginTop: 0 }}>
            Escribe tu correo, el código de 6 cifras de tu aplicación de autenticación y la contraseña nueva. No necesitas la contraseña antigua.
          </p>
          <div className="form-group">
            <label className="form-label" htmlFor="rec-email">Correo electrónico</label>
            <input id="rec-email" className="form-input" type="email" autoComplete="username" autoFocus required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="rec-codigo">{usarRecuperacion ? "Código de recuperación" : "Código de tu aplicación de autenticación"}</label>
            <input
              id="rec-codigo"
              className="form-input"
              type="text"
              autoComplete="one-time-code"
              inputMode={usarRecuperacion ? "text" : "numeric"}
              maxLength={usarRecuperacion ? 9 : 6}
              placeholder={usarRecuperacion ? "XXXX-XXXX" : "000000"}
              required
              value={codigo}
              onChange={(e) => setCodigo(e.target.value)}
              style={{ textAlign: "center", letterSpacing: usarRecuperacion ? "2px" : "6px", fontSize: "1.3rem" }}
            />
            <button
              type="button"
              onClick={() => {
                setUsarRecuperacion(!usarRecuperacion);
                setCodigo("");
              }}
              style={{ background: "none", border: "none", color: "var(--primary)", cursor: "pointer", textDecoration: "underline", fontSize: "0.85rem", marginTop: "6px", padding: 0 }}
            >
              {usarRecuperacion ? "Usar el código de la aplicación" : "Usar un código de recuperación"}
            </button>
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="rec-nueva">Nueva contraseña (mínimo 12 caracteres)</label>
            <input id="rec-nueva" className="form-input" type="password" autoComplete="new-password" minLength={12} required value={nueva} onChange={(e) => setNueva(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="rec-repetida">Repite la nueva contraseña</label>
            <input id="rec-repetida" className="form-input" type="password" autoComplete="new-password" minLength={12} required value={repetida} onChange={(e) => setRepetida(e.target.value)} />
          </div>
          {error && (
            <p role="alert" style={{ color: "var(--danger)", fontSize: "0.9rem", marginBottom: "16px" }}>
              {error}
            </p>
          )}
          <button type="submit" className="btn btn-primary" style={{ width: "100%" }} disabled={enviando}>
            {enviando ? "Guardando…" : "Cambiar la contraseña"}
          </button>
        </form>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "10px", fontSize: "0.9rem" }}>
          <button
            type="button"
            onClick={() => {
              setPaso("password");
              setError("");
              setCodigo("");
              setUsarRecuperacion(false);
            }}
            style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer" }}
          >
            Volver al inicio de sesión
          </button>
        </div>
        <details style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
          <summary style={{ cursor: "pointer", color: "var(--text-muted)" }}>¿No tienes el autenticador ni los códigos de recuperación?</summary>
          <div style={{ marginTop: "8px", lineHeight: 1.55, display: "flex", flexDirection: "column", gap: "8px" }}>
            <span>
              <b>Si hay otro administrador:</b> que entre en Configuración › Usuarios y te ponga una contraseña temporal (y te restablezca el doble factor).
            </span>
            <span>
              <b>Si eres el único administrador:</b> desde el equipo donde está instalada la aplicación (la Raspberry, por SSH), en la carpeta de instalación:
            </span>
            <code style={{ display: "block", padding: "8px 10px", background: "var(--bg-surface-tint)", borderRadius: "var(--radius-sm)", wordBreak: "break-all" }}>./scripts/reset-password.sh tu@correo.com</code>
            <code style={{ display: "block", padding: "8px 10px", background: "var(--bg-surface-tint)", borderRadius: "var(--radius-sm)", wordBreak: "break-all" }}>./scripts/reset-2fa.sh tu@correo.com</code>
          </div>
        </details>
      </PanelAcceso>
    );
  }

  if (paso === "suspendida") {
    return (
      <PanelAcceso subtitulo="Cuenta Suspendida">
        <p style={{ color: "var(--text-secondary)", lineHeight: "1.6", textAlign: "center", margin: 0 }}>
          Tu acceso al sistema ha sido suspendido por un administrador. Si crees que esto es un error, por favor contacta con la dirección.
        </p>
        <button type="button" className="btn btn-secondary" onClick={() => setPaso("password")}>
          Volver
        </button>
      </PanelAcceso>
    );
  }

  if (paso === "codigo") {
    return (
      <PanelAcceso subtitulo="Verificación en dos pasos">
        <form onSubmit={enviarCodigo} style={{ width: "100%" }}>
          <div className="form-group">
            <label className="form-label" htmlFor="codigo">
              {usarRecuperacion ? "Código de recuperación" : "Código de tu aplicación de autenticación"}
            </label>
            <input
              id="codigo"
              className="form-input"
              type="text"
              autoComplete="one-time-code"
              inputMode={usarRecuperacion ? "text" : "numeric"}
              maxLength={usarRecuperacion ? 9 : 6}
              placeholder={usarRecuperacion ? "XXXX-XXXX" : "000000"}
              autoFocus
              required
              value={codigo}
              onChange={(e) => setCodigo(e.target.value)}
              style={{ textAlign: "center", letterSpacing: usarRecuperacion ? "2px" : "6px", fontSize: "1.3rem" }}
            />
          </div>
          {error && (
            <p role="alert" style={{ color: "var(--danger)", fontSize: "0.9rem", marginBottom: "16px" }}>
              {error}
            </p>
          )}
          <button type="submit" className="btn btn-primary" style={{ width: "100%" }} disabled={enviando}>
            {enviando ? "Verificando…" : "Verificar"}
          </button>
        </form>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "10px", fontSize: "0.9rem" }}>
          <button
            type="button"
            onClick={() => {
              setUsarRecuperacion(!usarRecuperacion);
              setCodigo("");
              setError("");
            }}
            style={{ background: "none", border: "none", color: "var(--primary)", cursor: "pointer", textDecoration: "underline" }}
          >
            {usarRecuperacion ? "Usar el código de la aplicación" : "Usar un código de recuperación"}
          </button>
          <button type="button" onClick={() => void volver()} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer" }}>
            Volver al inicio de sesión
          </button>
        </div>
      </PanelAcceso>
    );
  }

  return (
    <PanelAcceso subtitulo="Inicia sesión para continuar">
      <form onSubmit={enviarPassword} style={{ width: "100%" }}>
        <div className="form-group">
          <label className="form-label" htmlFor="email">Correo electrónico</label>
          <input id="email" className="form-input" type="email" autoComplete="username" autoFocus required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="password">Contraseña</label>
          <input id="password" className="form-input" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        {aviso && (
          <p role="status" style={{ color: "var(--success)", fontSize: "0.9rem", marginBottom: "16px" }}>
            {aviso}
          </p>
        )}
        {error && (
          <p role="alert" style={{ color: "var(--danger)", fontSize: "0.9rem", marginBottom: "16px" }}>
            {error}
          </p>
        )}
        <button type="submit" className="btn btn-primary" style={{ width: "100%" }} disabled={enviando}>
          {enviando ? "Entrando…" : "Entrar"}
        </button>
      </form>
      <div style={{ marginTop: "16px", textAlign: "center" }}>
        <button
          type="button"
          onClick={() => {
            setPaso("recuperar");
            setError("");
            setAviso("");
          }}
          style={{ background: "none", border: "none", color: "var(--primary)", cursor: "pointer", textDecoration: "underline", fontSize: "0.9rem" }}
        >
          ¿Has olvidado la contraseña?
        </button>
      </div>
    </PanelAcceso>
  );
}
