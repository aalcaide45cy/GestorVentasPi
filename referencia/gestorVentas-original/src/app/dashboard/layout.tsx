import { redirect } from "next/navigation";
import { syncUser } from "@/lib/auth-utils";
import GlobalSearch from "@/components/GlobalSearch";
import Sidebar from "@/components/Sidebar";

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export default async function DashboardLayout({ children }: DashboardLayoutProps) {
  const user = await syncUser();

  if (!user) {
    redirect("/sign-in");
  }

  if (user.bloqueado) {
    return (
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        background: "var(--bg-app)",
        color: "var(--text-primary)",
        padding: "20px"
      }}>
        <div className="glass-panel" style={{
          padding: "50px",
          textAlign: "center",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "24px",
          borderLeft: "4px solid var(--danger)",
          maxWidth: "500px"
        }}>
          <div style={{
            width: "60px",
            height: "60px",
            borderRadius: "50%",
            background: "rgba(239, 68, 68, 0.1)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--danger)"
          }}>
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
          </div>
          <h2 style={{ fontSize: "1.5rem" }}>Cuenta Suspendida</h2>
          <p style={{ color: "var(--text-secondary)", lineHeight: "1.6" }}>
            Tu acceso al sistema ha sido suspendido por un administrador. Si crees que esto es un error, por favor contacta con la dirección.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      display: "flex",
      minHeight: "100vh",
      background: "var(--bg-app)",
      position: "relative"
    }}>
      <div className="glow-bg"></div>

      {/* SIDEBAR LATERAL */}
      <Sidebar user={user} />

      {/* ÁREA DE CONTENIDO PRINCIPAL */}
      <main style={{
        flex: 1,
        padding: "32px",
        overflowY: "auto",
        maxHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        gap: "32px"
      }}>
        {/* CABECERA SUPERIOR DE ACCIONES */}
        <div style={{
          display: "flex",
          justifyContent: "flex-end",
          alignItems: "center",
          width: "100%",
          paddingBottom: "16px",
          borderBottom: "1px solid var(--border-light)",
          marginBottom: "-8px"
        }}>
          <GlobalSearch />
        </div>

        {children}
      </main>
    </div>
  );
}
