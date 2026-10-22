import type { ReactNode } from "react";

/** Panel de cristal centrado con el logo y el título de la portada: lo comparten el acceso y las pantallas de `/cuenta`. */
export default function PanelAcceso({ subtitulo, ancho = "440px", children }: { subtitulo: string; ancho?: string; children: ReactNode }) {
  return (
    <div
      style={{
        minHeight: "calc(100 * var(--uvh))",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "40px 24px",
        position: "relative",
        background:
          "radial-gradient(circle at top right, rgba(99, 102, 241, 0.15), transparent 40%), radial-gradient(circle at bottom left, rgba(236, 72, 153, 0.1), transparent 40%)",
      }}
    >
      <main
        className="glass-panel"
        style={{
          maxWidth: ancho,
          width: "100%",
          padding: "48px 40px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "28px",
          boxShadow: "0 20px 50px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.05)",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "14px", textAlign: "center" }}>
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
          <p style={{ color: "var(--text-secondary)", fontSize: "0.95rem", margin: 0 }}>{subtitulo}</p>
        </div>
        {children}
      </main>
    </div>
  );
}
