import Link from "next/link";

export default function Home() {
  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      minHeight: "100vh",
      padding: "40px 24px",
      position: "relative",
      background: "radial-gradient(circle at top right, rgba(99, 102, 241, 0.15), transparent 40%), radial-gradient(circle at bottom left, rgba(236, 72, 153, 0.1), transparent 40%)",
      overflow: "hidden"
    }}>
      {/* Círculos de brillo flotantes */}
      <div style={{
        position: "absolute",
        top: "20%",
        right: "10%",
        width: "350px",
        height: "350px",
        borderRadius: "50%",
        background: "var(--primary)",
        filter: "blur(130px)",
        opacity: 0.12,
        zIndex: 0,
        pointerEvents: "none"
      }}></div>
      <div style={{
        position: "absolute",
        bottom: "15%",
        left: "5%",
        width: "300px",
        height: "300px",
        borderRadius: "50%",
        background: "var(--secondary)",
        filter: "blur(120px)",
        opacity: 0.08,
        zIndex: 0,
        pointerEvents: "none"
      }}></div>

      <main className="glass-panel" style={{
        maxWidth: "800px",
        width: "100%",
        padding: "56px 48px",
        textAlign: "center",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "40px",
        zIndex: 1,
        boxShadow: "0 20px 50px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.05)"
      }}>
        {/* Cabecera / Branding */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "16px" }}>
          <div style={{
            width: "64px",
            height: "64px",
            borderRadius: "16px",
            background: "linear-gradient(135deg, var(--primary), var(--secondary))",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 0 30px rgba(99, 102, 241, 0.4)",
            marginBottom: "8px"
          }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 3v18h18" />
              <path d="m19 9-5 5-4-4-3 3" />
            </svg>
          </div>
          <h1 style={{
            fontSize: "2.8rem",
            fontWeight: 800,
            margin: 0,
            background: "linear-gradient(to right, #ffffff, rgba(255,255,255,0.7))",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent"
          }}>
            GestorVentas
          </h1>
          <div style={{
            height: "2px",
            width: "60px",
            background: "linear-gradient(to right, var(--primary), var(--secondary))",
            borderRadius: "1px"
          }} />
        </div>

        {/* Mensaje Principal */}
        <p style={{
          color: "var(--text-secondary)",
          fontSize: "1.15rem",
          lineHeight: "1.75",
          maxWidth: "600px",
          margin: 0
        }}>
          La plataforma inteligente de control y seguimiento de operaciones comerciales. Diseñado específicamente para concesionarios y gestores de venta premium.
        </p>

        {/* Tarjetas Informativas */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: "20px",
          width: "100%",
          textAlign: "left",
          marginTop: "12px"
        }}>
          <div className="glass-panel" style={{ padding: "20px", background: "rgba(255,255,255,0.01)", border: "1px solid rgba(255,255,255,0.03)" }}>
            <div style={{ color: "var(--primary)", fontWeight: "bold", fontSize: "1.2rem", marginBottom: "8px" }}>📊 KPIs en Tiempo Real</div>
            <div style={{ fontSize: "0.88rem", color: "var(--text-secondary)", lineHeight: "1.4" }}>
              Visualiza tramos de comisión, objetivos mensuales del equipo y estadísticas de ventas de un vistazo.
            </div>
          </div>
          <div className="glass-panel" style={{ padding: "20px", background: "rgba(255,255,255,0.01)", border: "1px solid rgba(255,255,255,0.03)" }}>
            <div style={{ color: "var(--secondary)", fontWeight: "bold", fontSize: "1.2rem", marginBottom: "8px" }}>⚙️ Reglas de Comisión</div>
            <div style={{ fontSize: "0.88rem", color: "var(--text-secondary)", lineHeight: "1.4" }}>
              Configura de forma flexible reglas de crédito y preference para automatizar el cálculo de comisiones.
            </div>
          </div>
          <div className="glass-panel" style={{ padding: "20px", background: "rgba(255,255,255,0.01)", border: "1px solid rgba(255,255,255,0.03)" }}>
            <div style={{ color: "var(--success)", fontWeight: "bold", fontSize: "1.2rem", marginBottom: "8px" }}>🔐 Acceso Protegido</div>
            <div style={{ fontSize: "0.88rem", color: "var(--text-secondary)", lineHeight: "1.4" }}>
              Seguridad avanzada con roles definidos y un sistema de registro privado únicamente por invitación.
            </div>
          </div>
        </div>

        {/* Botón de Entrada */}
        <div style={{ width: "100%", display: "flex", justifyContent: "center", marginTop: "8px" }}>
          <Link href="/dashboard" className="btn btn-primary" style={{
            padding: "14px 40px",
            fontSize: "1.1rem",
            borderRadius: "var(--radius-md)",
            display: "inline-flex",
            alignItems: "center",
            gap: "12px",
            boxShadow: "0 10px 25px rgba(99, 102, 241, 0.25)"
          }}>
            Ingresar al Sistema
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </Link>
        </div>

        {/* Tags de Roles */}
        <div style={{
          display: "flex",
          justifyContent: "center",
          gap: "12px",
          flexWrap: "wrap",
          paddingTop: "24px",
          borderTop: "1px solid var(--border-light)",
          width: "100%"
        }}>
          <span className="badge badge-admin" style={{ padding: "6px 12px" }}>Administrador</span>
          <span className="badge badge-director" style={{ padding: "6px 12px" }}>Director</span>
          <span className="badge badge-zona" style={{ padding: "6px 12px" }}>Jefe Zona</span>
          <span className="badge badge-tienda" style={{ padding: "6px 12px" }}>Tienda</span>
          <span className="badge badge-vendedor" style={{ padding: "6px 12px" }}>Vendedor</span>
        </div>
      </main>
    </div>
  );
}

