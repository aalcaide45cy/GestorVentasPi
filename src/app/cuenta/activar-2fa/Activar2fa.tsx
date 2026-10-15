"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import PanelAcceso from "@/components/auth/PanelAcceso";
import { mensajeDeError } from "@/components/expedientes/comun";
import { descargarTexto } from "@/lib/csv-expedientes";

interface Preparacion {
  secreto: string;
  qr: string;
}

/** Activación obligatoria del doble factor: QR + código de confirmación + códigos de recuperación (se muestran una vez). */
export default function Activar2fa({ debeCambiarPassword }: { debeCambiarPassword: boolean }) {
  const router = useRouter();
  const [preparacion, setPreparacion] = useState<Preparacion | null>(null);
  const [codigo, setCodigo] = useState("");
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [codigosRecuperacion, setCodigosRecuperacion] = useState<string[] | null>(null);
  const [guardados, setGuardados] = useState(false);
  const pedido = useRef(false);

  useEffect(() => {
    // Cada petición crea un secreto nuevo: se pide una sola vez (también con el doble montaje de desarrollo).
    if (pedido.current) return;
    pedido.current = true;
    fetch("/api/auth/2fa/preparar", { method: "POST" })
      .then(async (res) => {
        if (!res.ok) throw new Error(await mensajeDeError(res, "No se pudo preparar el doble factor"));
        return (await res.json()) as Preparacion;
      })
      .then(setPreparacion)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "No se pudo preparar el doble factor"));
  }, []);

  async function confirmar(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setEnviando(true);
    try {
      const res = await fetch("/api/auth/2fa/activar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ codigo }) });
      if (!res.ok) {
        setError(await mensajeDeError(res, "No se pudo activar el doble factor"));
        return;
      }
      setCodigosRecuperacion(((await res.json()) as { codigos: string[] }).codigos);
    } catch {
      setError("No se pudo conectar con el servidor");
    } finally {
      setEnviando(false);
    }
  }

  function continuar() {
    router.push(debeCambiarPassword ? "/cuenta/cambiar-password" : "/dashboard");
    router.refresh();
  }

  if (codigosRecuperacion) {
    return (
      <PanelAcceso subtitulo="Códigos de recuperación" ancho="520px">
        <p style={{ color: "var(--text-secondary)", lineHeight: "1.6", margin: 0, textAlign: "center" }}>
          Guarda estos códigos en un lugar seguro. Cada uno sirve <strong>una sola vez</strong> si pierdes el móvil, y <strong>no se volverán a mostrar</strong>.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", width: "100%" }}>
          {codigosRecuperacion.map((c) => (
            <code key={c} style={{ padding: "10px", background: "rgba(255,255,255,0.05)", border: "1px solid var(--border-light)", borderRadius: "var(--radius-sm)", textAlign: "center", fontSize: "1.05rem", userSelect: "all" }}>
              {c}
            </code>
          ))}
        </div>
        <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", justifyContent: "center" }}>
          <button type="button" className="btn btn-secondary" onClick={() => void navigator.clipboard?.writeText(codigosRecuperacion.join("\n"))}>
            📋 Copiar
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => descargarTexto("codigos-recuperacion-gestorventas.txt", codigosRecuperacion.join("\n") + "\n", "text/plain")}>
            ⬇️ Descargar
          </button>
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer", fontSize: "0.95rem" }}>
          <input type="checkbox" checked={guardados} onChange={(e) => setGuardados(e.target.checked)} style={{ width: "18px", height: "18px" }} />
          He guardado mis códigos de recuperación
        </label>
        <button type="button" className="btn btn-primary" style={{ width: "100%" }} disabled={!guardados} onClick={continuar}>
          Continuar
        </button>
      </PanelAcceso>
    );
  }

  return (
    <PanelAcceso subtitulo="Activa la verificación en dos pasos" ancho="480px">
      <p style={{ color: "var(--text-secondary)", lineHeight: "1.6", margin: 0, textAlign: "center" }}>
        Escanea el código QR con Google Authenticator, Microsoft Authenticator o Authy y escribe el código de 6 dígitos que aparezca.
      </p>
      {preparacion ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preparacion.qr} alt="Código QR para la aplicación de autenticación" width={240} height={240} style={{ background: "#fff", borderRadius: "12px", padding: "8px" }} />
          <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", margin: 0, textAlign: "center" }}>
            ¿No puedes escanearlo? Introduce esta clave a mano:
            <br />
            <code style={{ userSelect: "all", color: "var(--text-primary)" }}>{preparacion.secreto}</code>
          </p>
          <form onSubmit={confirmar} style={{ width: "100%" }}>
            <div className="form-group">
              <label className="form-label" htmlFor="codigo">Código de 6 dígitos</label>
              <input
                id="codigo"
                className="form-input"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="000000"
                autoFocus
                required
                value={codigo}
                onChange={(e) => setCodigo(e.target.value)}
                style={{ textAlign: "center", letterSpacing: "6px", fontSize: "1.3rem" }}
              />
            </div>
            {error && (
              <p role="alert" style={{ color: "var(--danger)", fontSize: "0.9rem", marginBottom: "16px" }}>
                {error}
              </p>
            )}
            <button type="submit" className="btn btn-primary" style={{ width: "100%" }} disabled={enviando}>
              {enviando ? "Activando…" : "Activar"}
            </button>
          </form>
        </>
      ) : error ? (
        <p role="alert" style={{ color: "var(--danger)" }}>{error}</p>
      ) : (
        <p style={{ color: "var(--text-muted)" }}>Preparando…</p>
      )}
    </PanelAcceso>
  );
}
