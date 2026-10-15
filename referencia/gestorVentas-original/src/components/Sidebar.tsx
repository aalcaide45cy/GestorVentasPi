"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { UserButton, useClerk } from "@clerk/nextjs";
import ThemeToggle from "@/components/ThemeToggle";

interface SidebarProps {
  user: {
    nombre: string | null;
    rol?: string | null;
  };
}

export default function Sidebar({ user }: SidebarProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const { signOut } = useClerk();
  const router = useRouter();

  useEffect(() => {
    setIsMounted(true);
    const stored = localStorage.getItem("sidebar-collapsed");
    if (stored === "true") {
      setIsCollapsed(true);
    }
  }, []);

  const toggleSidebar = () => {
    const nextState = !isCollapsed;
    setIsCollapsed(nextState);
    localStorage.setItem("sidebar-collapsed", String(nextState));
  };

  const userRole = user.rol || "invitado";
  const userRoleCapitalized = userRole.charAt(0).toUpperCase() + userRole.slice(1);

  const isAdmin = userRole === "administrador";
  const isVendedorOrUp = ["administrador", "director", "jefe_zona", "jefe_tienda", "vendedor"].includes(userRole);

  // Return a placeholder structure with same dimensions during SSR to prevent layout shift
  const asideWidth = !isMounted ? "280px" : isCollapsed ? "80px" : "280px";

  return (
    <aside
      className="glass-panel"
      style={{
        width: asideWidth,
        minHeight: "calc(100vh - 32px)",
        margin: "16px 0 16px 16px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: isCollapsed ? "24px 12px" : "32px 24px",
        borderRadius: "var(--radius-lg)",
        position: "sticky",
        top: "16px",
        height: "calc(100vh - 32px)",
        zIndex: 10,
        transition: "width 0.3s cubic-bezier(0.4, 0, 0.2, 1), padding 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
        overflow: "visible",
      }}
    >
      {/* Botón de Colapsar flotante — mejorado */}
      <button
        onClick={toggleSidebar}
        style={{
          position: "absolute",
          top: "80px",
          right: isCollapsed ? "-20px" : "-18px",
          width: isCollapsed ? "40px" : "40px",
          height: "40px",
          borderRadius: "50%",
          background: "linear-gradient(135deg, var(--primary), var(--secondary))",
          border: "2px solid rgba(255,255,255,0.12)",
          color: "#fff",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          boxShadow: "0 4px 16px rgba(0,0,0,0.35), 0 0 0 3px rgba(var(--primary-rgb), 0.2)",
          zIndex: 15,
          transition: "all 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
        }}
        title={isCollapsed ? "Expandir barra lateral" : "Colapsar barra lateral"}
        onMouseEnter={e => {
          (e.currentTarget as HTMLButtonElement).style.transform = "scale(1.12)";
          (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 6px 20px rgba(0,0,0,0.45), 0 0 0 4px rgba(var(--primary-rgb), 0.3)";
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLButtonElement).style.transform = "scale(1)";
          (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 4px 16px rgba(0,0,0,0.35), 0 0 0 3px rgba(var(--primary-rgb), 0.2)";
        }}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{
            transform: isCollapsed ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 0.3s ease",
            flexShrink: 0,
          }}
        >
          <polyline points="15 18 9 12 15 6" />
        </svg>
      </button>

      <div style={{ display: "flex", flexDirection: "column", gap: "40px" }}>
        {/* CABECERA SIDEBAR (LOGO Y TEMA) */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: isCollapsed ? "center" : "space-between",
            gap: "10px",
            minHeight: "36px",
          }}
        >
          <Link
            href="/dashboard"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              color: "var(--text-primary)",
              textDecoration: "none",
            }}
          >
            <div
              style={{
                width: "36px",
                height: "36px",
                borderRadius: "8px",
                background: "linear-gradient(135deg, var(--primary), var(--secondary))",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "var(--shadow-glow)",
                flexShrink: 0,
              }}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#fff"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M3 3v18h18" />
                <path d="m19 9-5 5-4-4-3 3" />
              </svg>
            </div>
            {!isCollapsed && (
              <span
                style={{
                  fontFamily: "var(--font-title)",
                  fontWeight: 800,
                  fontSize: "1.3rem",
                  letterSpacing: "-0.02em",
                  whiteSpace: "nowrap",
                }}
              >
                GestorVentas
              </span>
            )}
          </Link>
          {!isCollapsed && <ThemeToggle />}
        </div>

        {/* PERFIL DE USUARIO EN SIDEBAR */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: isCollapsed ? "center" : "space-between",
            gap: isCollapsed ? "0" : "12px",
            padding: isCollapsed ? "8px" : "12px",
            background: "rgba(255, 255, 255, 0.03)",
            borderRadius: "var(--radius-sm)",
            border: "1px solid var(--border-light)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
              overflow: "hidden",
              flex: isCollapsed ? "none" : 1,
              justifyContent: "center",
            }}
          >
            <UserButton />
            {!isCollapsed && (
              <div style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
                <span
                  style={{
                    fontWeight: 600,
                    fontSize: "0.9rem",
                    color: "var(--text-primary)",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {user.nombre}
                </span>
                <span
                  className={`badge badge-${userRole}`}
                  style={{ alignSelf: "flex-start", marginTop: "4px", fontSize: "0.65rem" }}
                >
                  {userRoleCapitalized}
                </span>
              </div>
            )}
          </div>
          {!isCollapsed && (
            <Link
              href="/dashboard/perfil"
              style={{
                color: "var(--text-secondary)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "6px",
                borderRadius: "4px",
                background: "rgba(255, 255, 255, 0.05)",
                border: "1px solid var(--border-light)",
                cursor: "pointer",
                transition: "all 0.2s ease",
              }}
              title="Editar mis datos"
              className="glass-panel-interactive"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4z" />
              </svg>
            </Link>
          )}
        </div>

        {/* MENÚ DE NAVEGACIÓN */}
        <nav style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <Link
            href="/dashboard"
            className="glass-panel-interactive"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: isCollapsed ? "center" : "flex-start",
              gap: "12px",
              padding: "12px 16px",
              borderRadius: "var(--radius-sm)",
              fontSize: "0.95rem",
              fontWeight: 500,
              color: "var(--text-secondary)",
              background: "rgba(255, 255, 255, 0.01)",
              border: "1px solid transparent",
            }}
            title={isCollapsed ? "Dashboard" : undefined}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ flexShrink: 0 }}
            >
              <rect x="3" y="3" width="7" height="9" />
              <rect x="14" y="3" width="7" height="5" />
              <rect x="14" y="12" width="7" height="9" />
              <rect x="3" y="16" width="7" height="5" />
            </svg>
            {!isCollapsed && <span>Dashboard</span>}
          </Link>

          {isVendedorOrUp && (
            <>
              <Link
                href="/dashboard/expedientes"
                className="glass-panel-interactive"
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: isCollapsed ? "center" : "flex-start",
                  gap: "12px",
                  padding: "12px 16px",
                  borderRadius: "var(--radius-sm)",
                  fontSize: "0.95rem",
                  fontWeight: 500,
                  color: "var(--text-secondary)",
                  background: "rgba(255, 255, 255, 0.01)",
                  border: "1px solid transparent",
                }}
                title={isCollapsed ? "Expedientes" : undefined}
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ flexShrink: 0 }}
                >
                  <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
                {!isCollapsed && <span>Expedientes</span>}
              </Link>

              <Link
                href="/dashboard/clientes"
                className="glass-panel-interactive"
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: isCollapsed ? "center" : "flex-start",
                  gap: "12px",
                  padding: "12px 16px",
                  borderRadius: "var(--radius-sm)",
                  fontSize: "0.95rem",
                  fontWeight: 500,
                  color: "var(--text-secondary)",
                  background: "rgba(255, 255, 255, 0.01)",
                  border: "1px solid transparent",
                }}
                title={isCollapsed ? "Clientes" : undefined}
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ flexShrink: 0 }}
                >
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
                {!isCollapsed && <span>Clientes</span>}
              </Link>
            </>
          )}

          {isAdmin && (
            <Link
              href="/dashboard/admin"
              className="glass-panel-interactive"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: isCollapsed ? "center" : "flex-start",
                gap: "12px",
                padding: "12px 16px",
                borderRadius: "var(--radius-sm)",
                fontSize: "0.95rem",
                fontWeight: 500,
                color: "var(--text-secondary)",
                background: "rgba(255, 255, 255, 0.01)",
                border: "1px solid transparent",
              }}
              title={isCollapsed ? "Configuración" : undefined}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ flexShrink: 0 }}
              >
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
              {!isCollapsed && <span>Configuración</span>}
            </Link>
          )}

          {isVendedorOrUp && (
            <>
              <Link
                href="/dashboard/comisiones"
                className="glass-panel-interactive"
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: isCollapsed ? "center" : "flex-start",
                  gap: "12px",
                  padding: "12px 16px",
                  borderRadius: "var(--radius-sm)",
                  fontSize: "0.95rem",
                  fontWeight: 500,
                  color: "var(--text-secondary)",
                  background: "rgba(255, 255, 255, 0.01)",
                  border: "1px solid transparent",
                }}
                title={isCollapsed ? "Comisiones" : undefined}
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ flexShrink: 0 }}
                >
                  <line x1="12" y1="1" x2="12" y2="23"></line>
                  <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
                </svg>
                {!isCollapsed && <span>Comisiones</span>}
              </Link>

              <Link
                href="/dashboard/informes"
                className="glass-panel-interactive"
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: isCollapsed ? "center" : "flex-start",
                  gap: "12px",
                  padding: "12px 16px",
                  borderRadius: "var(--radius-sm)",
                  fontSize: "0.95rem",
                  fontWeight: 500,
                  color: "var(--text-secondary)",
                  background: "rgba(255, 255, 255, 0.01)",
                  border: "1px solid transparent",
                }}
                title={isCollapsed ? "Informes" : undefined}
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ flexShrink: 0 }}
                >
                  <line x1="18" y1="20" x2="18" y2="10"></line>
                  <line x1="12" y1="20" x2="12" y2="4"></line>
                  <line x1="6" y1="20" x2="6" y2="14"></line>
                </svg>
                {!isCollapsed && <span>Informes</span>}
              </Link>

              <Link
                href="/dashboard/log-importacion"
                className="glass-panel-interactive"
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: isCollapsed ? "center" : "flex-start",
                  gap: "12px",
                  padding: "12px 16px",
                  borderRadius: "var(--radius-sm)",
                  fontSize: "0.95rem",
                  fontWeight: 500,
                  color: "var(--text-secondary)",
                  background: "rgba(255, 255, 255, 0.01)",
                  border: "1px solid transparent",
                }}
                title={isCollapsed ? "Log Importación" : undefined}
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ flexShrink: 0 }}
                >
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                  <polyline points="14 2 14 8 20 8"></polyline>
                  <line x1="16" y1="13" x2="8" y2="13"></line>
                  <line x1="16" y1="17" x2="8" y2="17"></line>
                  <polyline points="10 9 9 9 8 9"></polyline>
                </svg>
                {!isCollapsed && <span>Log Importación</span>}
              </Link>
            </>
          )}
        </nav>
      </div>

      {/* FOOTER SIDEBAR */}
      <div
        style={{
          borderTop: "1px solid var(--border-light)",
          paddingTop: "20px",
          display: "flex",
          flexDirection: "column",
          gap: "16px",
        }}
      >
        <button
          onClick={async () => {
            await signOut();
            router.push("/sign-in");
          }}
          className="glass-panel-interactive"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: isCollapsed ? "center" : "flex-start",
            gap: "12px",
            padding: "12px 16px",
            borderRadius: "var(--radius-sm)",
            fontSize: "0.95rem",
            fontWeight: 500,
            color: "var(--text-secondary)",
            background: "rgba(255, 255, 255, 0.01)",
            border: "1px solid transparent",
            width: "100%",
            cursor: "pointer",
            transition: "all 0.2s ease",
          }}
          title={isCollapsed ? "Cerrar sesión" : undefined}
          onMouseEnter={e => {
            (e.currentTarget as HTMLButtonElement).style.color = "#ff4d4d";
            (e.currentTarget as HTMLButtonElement).style.background = "rgba(255, 77, 77, 0.08)";
            (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255, 77, 77, 0.2)";
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLButtonElement).style.color = "var(--text-secondary)";
            (e.currentTarget as HTMLButtonElement).style.background = "rgba(255, 255, 255, 0.01)";
            (e.currentTarget as HTMLButtonElement).style.borderColor = "transparent";
          }}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ flexShrink: 0 }}
          >
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
          {!isCollapsed && <span>Cerrar sesión</span>}
        </button>

        <div
          style={{
            textAlign: "center",
            fontSize: "0.8rem",
            color: "var(--text-muted)",
            whiteSpace: "nowrap",
            textOverflow: "ellipsis",
            overflow: "hidden",
          }}
        >
          {isCollapsed ? "v1.0" : "GestorVentas v1.0.0"}
        </div>
      </div>
    </aside>
  );
}
