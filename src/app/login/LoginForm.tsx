"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setEnviando(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const datos = (await res.json().catch(() => ({}))) as { message?: string };
        setError(datos.message ?? "No se pudo iniciar sesión");
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
    <main
      className="glass-panel"
      style={{
        maxWidth: "440px",
        width: "100%",
        padding: "48px 40px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "28px",
        boxShadow: "0 20px 50px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.05)",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "14px" }}>
        <div
          style={{
            width: "56px",
            height: "56px",
            borderRadius: "14px",
            background: "linear-gradient(135deg, var(--primary), var(--secondary))",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 0 30px rgba(99, 102, 241, 0.4)",
          }}
        >
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 3v18h18" />
            <path d="m19 9-5 5-4-4-3 3" />
          </svg>
        </div>
        <h1 style={{ fontSize: "2rem", fontWeight: 800, margin: 0 }}>GestorVentas</h1>
        <p style={{ color: "var(--text-secondary)", fontSize: "0.95rem", margin: 0 }}>Inicia sesión para continuar</p>
      </div>

      <form onSubmit={enviar} style={{ width: "100%" }}>
        <div className="form-group">
          <label className="form-label" htmlFor="email">Correo electrónico</label>
          <input
            id="email"
            className="form-input"
            type="email"
            autoComplete="username"
            autoFocus
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="password">Contraseña</label>
          <input
            id="password"
            className="form-input"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {error && (
          <p role="alert" style={{ color: "var(--danger)", fontSize: "0.9rem", marginBottom: "16px" }}>
            {error}
          </p>
        )}
        <button type="submit" className="btn btn-primary" style={{ width: "100%" }} disabled={enviando}>
          {enviando ? "Entrando…" : "Entrar"}
        </button>
      </form>
    </main>
  );
}
