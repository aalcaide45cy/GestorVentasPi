"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import PanelAcceso from "@/components/auth/PanelAcceso";
import { mensajeDeError } from "@/components/expedientes/comun";

/** Cambio de contraseña (obligatorio tras un alta o un restablecimiento). Mínimo 12 caracteres. */
export default function CambiarPassword({ obligatorio }: { obligatorio: boolean }) {
  const router = useRouter();
  const [actual, setActual] = useState("");
  // Quien no recuerda la contraseña actual puede usar el código del autenticador
  const [conCodigo, setConCodigo] = useState(false);
  const [codigo, setCodigo] = useState("");
  const [nueva, setNueva] = useState("");
  const [repetida, setRepetida] = useState("");
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (nueva !== repetida) {
      setError("Las contraseñas nuevas no coinciden.");
      return;
    }
    setEnviando(true);
    try {
      const res = await fetch("/api/auth/cambiar-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(conCodigo ? { codigo, nueva } : { actual, nueva }) });
      if (!res.ok) {
        setError(await mensajeDeError(res, "No se pudo cambiar la contraseña"));
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("No se pudo conectar con el servidor");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <PanelAcceso subtitulo={obligatorio ? "Debes elegir una contraseña nueva para continuar" : "Cambiar contraseña"}>
      <form onSubmit={enviar} style={{ width: "100%" }}>
        {conCodigo ? (
          <div className="form-group">
            <label className="form-label" htmlFor="codigo">Código de tu aplicación de autenticación (o de recuperación)</label>
            <input id="codigo" className="form-input" type="text" autoComplete="one-time-code" inputMode="numeric" maxLength={9} placeholder="000000" autoFocus required value={codigo} onChange={(e) => setCodigo(e.target.value)} style={{ textAlign: "center", letterSpacing: "6px", fontSize: "1.3rem" }} />
          </div>
        ) : (
          <div className="form-group">
            <label className="form-label" htmlFor="actual">{obligatorio ? "Contraseña temporal" : "Contraseña actual"}</label>
            <input id="actual" className="form-input" type="password" autoComplete="current-password" autoFocus required value={actual} onChange={(e) => setActual(e.target.value)} />
          </div>
        )}
        <button
          type="button"
          onClick={() => {
            setConCodigo(!conCodigo);
            setError("");
          }}
          style={{ background: "none", border: "none", color: "var(--primary)", cursor: "pointer", textDecoration: "underline", fontSize: "0.85rem", margin: "-6px 0 14px", padding: 0 }}
        >
          {conCodigo ? "Usar la contraseña actual" : "No recuerdo la contraseña actual: usar el código del autenticador"}
        </button>
        <div className="form-group">
          <label className="form-label" htmlFor="nueva">Nueva contraseña (mínimo 12 caracteres)</label>
          <input id="nueva" className="form-input" type="password" autoComplete="new-password" minLength={12} required value={nueva} onChange={(e) => setNueva(e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="repetida">Repite la nueva contraseña</label>
          <input id="repetida" className="form-input" type="password" autoComplete="new-password" minLength={12} required value={repetida} onChange={(e) => setRepetida(e.target.value)} />
        </div>
        {error && (
          <p role="alert" style={{ color: "var(--danger)", fontSize: "0.9rem", marginBottom: "16px" }}>
            {error}
          </p>
        )}
        <div style={{ display: "flex", gap: "12px" }}>
          {!obligatorio && (
            <button type="button" className="btn btn-secondary" onClick={() => router.back()} disabled={enviando}>
              Cancelar
            </button>
          )}
          <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={enviando}>
            {enviando ? "Guardando…" : "Cambiar contraseña"}
          </button>
        </div>
      </form>
    </PanelAcceso>
  );
}
