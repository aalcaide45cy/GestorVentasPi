import Link from "next/link";

/** Marcador de posición: el inicio de sesión real llega en F1 (mínimo) y F2 (completo, con 2FA). */
export default function LoginPendiente() {
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px" }}>
      <div className="glow-bg" />
      <main className="glass-panel" style={{ maxWidth: "420px", width: "100%", padding: "40px", textAlign: "center" }}>
        <h1 style={{ fontSize: "1.6rem", marginBottom: "12px" }}>Iniciar sesión</h1>
        <p style={{ color: "var(--text-secondary)", marginBottom: "24px" }}>
          El inicio de sesión estará disponible en la siguiente fase.
        </p>
        <Link href="/" className="btn btn-secondary">Volver</Link>
      </main>
    </div>
  );
}
