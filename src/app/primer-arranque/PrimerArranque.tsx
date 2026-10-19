"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import PanelAcceso from "@/components/auth/PanelAcceso";
import CampoSecreto from "@/components/CampoSecreto";
import { mensajeDeError } from "@/components/expedientes/comun";

/** Crear el primer administrador de una instalación nueva. Después se pide activar el doble factor. */
export default function PrimerArranque() {
  const router = useRouter();
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [repetida, setRepetida] = useState("");
  const [codigo, setCodigo] = useState("");
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password !== repetida) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    setEnviando(true);
    try {
      const res = await fetch("/api/auth/primer-administrador", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nombre, email, password, codigo }) });
      if (!res.ok) {
        setError(await mensajeDeError(res, "No se pudo crear el administrador"));
        return;
      }
      router.push("/cuenta/activar-2fa");
      router.refresh();
    } catch {
      setError("No se pudo conectar con el servidor");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <PanelAcceso subtitulo="Primer arranque: crea el administrador" ancho="480px">
      <form onSubmit={enviar} style={{ width: "100%" }}>
        <p style={{ color: "var(--text-secondary)", fontSize: "0.88rem", lineHeight: 1.5, marginTop: 0 }}>
          Esta instalación todavía no tiene ningún usuario. Crea el administrador: después te pediremos activar el doble factor con tu aplicación de autenticación.
        </p>
        <div className="form-group">
          <label className="form-label" htmlFor="pa-nombre">Tu nombre</label>
          <input id="pa-nombre" className="form-input" type="text" autoComplete="name" autoFocus required value={nombre} onChange={(e) => setNombre(e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="pa-email">Correo electrónico (será tu usuario)</label>
          <input id="pa-email" className="form-input" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="pa-password">Contraseña (mínimo 12 caracteres)</label>
          <CampoSecreto id="pa-password" autoComplete="new-password" minLength={12} required value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="pa-repetida">Repite la contraseña</label>
          <CampoSecreto id="pa-repetida" autoComplete="new-password" minLength={12} required value={repetida} onChange={(e) => setRepetida(e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="pa-codigo">Código de primer arranque</label>
          <input id="pa-codigo" className="form-input" type="text" autoComplete="off" placeholder="XXXX-XXXX" maxLength={9} required value={codigo} onChange={(e) => setCodigo(e.target.value)} style={{ textAlign: "center", letterSpacing: "3px", fontSize: "1.2rem", textTransform: "uppercase" }} />
          <span style={{ display: "block", marginTop: "6px", fontSize: "0.78rem", color: "var(--text-muted)", lineHeight: 1.45 }}>
            Es lo que impide que otra persona se quede con tu instalación. Aparece en la terminal donde arrancó el servidor («PRIMER ARRANQUE…») y en el archivo <code>.primer-arranque.txt</code> de la carpeta de copias.
          </span>
        </div>
        {error && (
          <p role="alert" style={{ color: "var(--danger)", fontSize: "0.9rem", marginBottom: "16px" }}>
            {error}
          </p>
        )}
        <button type="submit" className="btn btn-primary" style={{ width: "100%" }} disabled={enviando}>
          {enviando ? "Creando…" : "Crear administrador"}
        </button>
      </form>
    </PanelAcceso>
  );
}
