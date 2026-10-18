"use client";

import { useEffect, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import BotonApagar, { BotonReiniciarServidor } from "@/components/BotonApagar";
import ThemeToggle from "@/components/ThemeToggle";
import { useCarga } from "@/components/comisiones/useCarga";
import { CLAVE_ABIERTO, CLAVE_MOSTRAR_LABORATORIO } from "@/components/LaboratorioComisiones";
import { usePreferencia } from "@/lib/preferencias";
import { fijarMenuAbierto, useMovil } from "@/lib/movil";
import { CLASE_BADGE_ROL, ETIQUETA_ROL, esAdministrador, esRolActivo, normalizarRol } from "@/lib/auth/permisos";

interface SidebarProps {
  user: {
    nombre: string | null;
    rol?: string | null;
  };
  /** Versión instalada (la del archivo de configuración del contenedor o, en desarrollo, la del paquete). */
  version: string;
}

const iconoProps = {
  width: 18,
  height: 18,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  style: { flexShrink: 0 },
} as const;

interface EnlaceNavProps {
  href: string;
  titulo: string;
  colapsado: boolean;
  /** Contador rojo (p. ej. validaciones pendientes). */
  insignia?: number;
  children: ReactNode;
}

function EnlaceNav({ href, titulo, colapsado, insignia, children, alPulsar, activo, ayuda, punto }: EnlaceNavProps & { alPulsar?: () => void; activo?: boolean; ayuda?: string; punto?: string }) {
  const ruta = usePathname();
  if (alPulsar) {
    return (
      <button
        type="button"
        onClick={alPulsar}
        className="glass-panel-interactive"
        aria-pressed={activo}
        title={ayuda ?? titulo}
        style={{ display: "flex", alignItems: "center", justifyContent: colapsado ? "center" : "flex-start", gap: "12px", padding: "12px 16px", borderRadius: "var(--radius-sm)", fontSize: "0.95rem", fontWeight: 500, color: activo ? "var(--primary)" : "var(--text-secondary)", background: activo ? "rgba(var(--primary-rgb), 0.12)" : "rgba(255, 255, 255, 0.01)", border: "1px solid transparent", cursor: "pointer", width: "100%", textAlign: "left", fontFamily: "inherit" }}
      >
        <svg {...iconoProps}>{children}</svg>
        {!colapsado && <span>{titulo}</span>}
      </button>
    );
  }
  const enSeccion = href === "/dashboard" ? ruta === "/dashboard" : ruta === href || ruta.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      aria-current={enSeccion ? "page" : undefined}
      className="glass-panel-interactive"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: colapsado ? "center" : "flex-start",
        gap: "12px",
        padding: "12px 16px",
        borderRadius: "var(--radius-sm)",
        fontSize: "0.95rem",
        color: enSeccion ? "var(--primary)" : "var(--text-secondary)",
        fontWeight: enSeccion ? 700 : 500,
        background: enSeccion ? "rgba(var(--primary-rgb), 0.12)" : "rgba(255, 255, 255, 0.01)",
        border: "1px solid transparent",
      }}
      title={punto ?? (colapsado ? titulo : undefined)}
    >
      <svg {...iconoProps}>{children}</svg>
      {!colapsado && <span>{titulo}</span>}
      {punto && <span aria-label={punto} style={{ marginLeft: colapsado ? 0 : "auto", width: "10px", height: "10px", borderRadius: "50%", background: "var(--danger, #ef4444)", boxShadow: "0 0 6px var(--danger, #ef4444)", flexShrink: 0 }} />}
      {insignia !== undefined && insignia > 0 && (
        <span
          title={`${insignia} validación(es) de comisiones pendiente(s)`}
          style={{ marginLeft: colapsado ? 0 : "auto", background: "var(--danger, #ef4444)", color: "#fff", borderRadius: "999px", fontSize: "0.7rem", fontWeight: 700, minWidth: "20px", height: "20px", display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "0 6px" }}
        >
          {insignia}
        </span>
      )}
    </Link>
  );
}

export default function Sidebar({ user, version }: SidebarProps) {
  const [colapsadoGuardado, guardarColapsado] = usePreferencia("sidebar-collapsed");
  const movil = useMovil();
  const [labAbierto, fijarLabAbierto] = usePreferencia(CLAVE_ABIERTO);
  const [labMostrar] = usePreferencia(CLAVE_MOSTRAR_LABORATORIO);
  // En móvil el menú es un cajón: siempre con textos (la preferencia de colapsar solo vale en escritorio)
  const isCollapsed = colapsadoGuardado === "true" && !movil;
  const router = useRouter();
  const ruta = usePathname();
  const { datos: avisoCopias } = useCarga<{ excede: boolean; motivo: string | null } | null>(esAdministrador(normalizarRol(user.rol)) ? `/api/admin/copias/aviso?r=${ruta}` : null, null);

  // Al cambiar de página el cajón del móvil se cierra
  useEffect(() => {
    fijarMenuAbierto(false);
  }, [ruta]);

  const toggleSidebar = () => guardarColapsado(String(!isCollapsed));

  const rol = normalizarRol(user.rol);
  const isAdmin = esAdministrador(rol);
  const isVendedorOrUp = esRolActivo(rol);
  const { datos: avisosRejilla } = useCarga<{ total: number } | null>(isVendedorOrUp ? "/api/comisiones/rejillas/avisos" : null, null);
  const inicial = (user.nombre ?? "?").trim().charAt(0).toUpperCase() || "?";

  // En el servidor y en el primer pintado vale expandida (la preferencia es null hasta hidratar).
  const asideWidth = isCollapsed ? "80px" : "280px";

  const cerrarSesion = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      router.push("/login");
      router.refresh();
    }
  };

  return (
    <>
    <div className="menu-fondo" onClick={() => fijarMenuAbierto(false)} aria-hidden="true" />
    <aside
      className="glass-panel app-sidebar"
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
      <button type="button" className="cerrar-menu-movil" onClick={() => fijarMenuAbierto(false)} title="Cerrar el menú" aria-label="Cerrar el menú">
        ✕
      </button>

      {/* Botón flotante de colapsar (solo escritorio) */}
      <button
        className="sidebar-colapsar"
        onClick={toggleSidebar}
        style={{
          position: "absolute",
          top: "80px",
          right: isCollapsed ? "-20px" : "-18px",
          width: "40px",
          height: "40px",
          borderRadius: "50%",
          background: "linear-gradient(135deg, var(--primary), var(--secondary))",
          border: "2px solid rgba(255,255,255,0.12)",
          color: "#fff",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          boxShadow: "0 4px 16px rgba(0,0,0,0.35)",
          zIndex: 15,
          transition: "all 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
        }}
        title={isCollapsed ? "Expandir barra lateral" : "Colapsar barra lateral"}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = "scale(1.12)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = "scale(1)";
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
        {/* Cabecera: logo y tema */}
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
            style={{ display: "flex", alignItems: "center", gap: "10px", color: "var(--text-primary)", textDecoration: "none" }}
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
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
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

        {/* Usuario */}
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
            <div
              aria-hidden="true"
              style={{
                width: "32px",
                height: "32px",
                borderRadius: "50%",
                background: "linear-gradient(135deg, var(--primary), var(--secondary))",
                color: "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontFamily: "var(--font-title)",
                fontWeight: 700,
                fontSize: "0.9rem",
                flexShrink: 0,
              }}
            >
              {inicial}
            </div>
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
                  className={`badge ${CLASE_BADGE_ROL[rol]}`}
                  style={{ alignSelf: "flex-start", marginTop: "4px", fontSize: "0.65rem" }}
                >
                  {ETIQUETA_ROL[rol]}
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
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4z" />
              </svg>
            </Link>
          )}
        </div>

        {/* Navegación */}
        <nav style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <EnlaceNav href="/dashboard" titulo="Dashboard" colapsado={isCollapsed}>
            <rect x="3" y="3" width="7" height="9" />
            <rect x="14" y="3" width="7" height="5" />
            <rect x="14" y="12" width="7" height="9" />
            <rect x="3" y="16" width="7" height="5" />
          </EnlaceNav>

          {isVendedorOrUp && (
            <>
              <EnlaceNav href="/dashboard/expedientes" titulo="Expedientes" colapsado={isCollapsed}>
                <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                <polyline points="14 2 14 8 20 8" />
              </EnlaceNav>
              <EnlaceNav href="/dashboard/clientes" titulo="Clientes" colapsado={isCollapsed}>
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </EnlaceNav>
            </>
          )}

          {isAdmin && (
            <EnlaceNav href="/dashboard/admin" titulo="Configuración" colapsado={isCollapsed} punto={avisoCopias?.excede ? (avisoCopias.motivo ?? "Hay demasiadas copias de seguridad") : undefined}>
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </EnlaceNav>
          )}

          {isVendedorOrUp && (
            <>
              <EnlaceNav href="/dashboard/comisiones" titulo="Comisiones" colapsado={isCollapsed} insignia={avisosRejilla?.total}>
                <line x1="12" y1="1" x2="12" y2="23" />
                <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
              </EnlaceNav>
              <EnlaceNav href="/dashboard/cotejo-pagos" titulo="Cotejo de pagos" colapsado={isCollapsed}>
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </EnlaceNav>
              <EnlaceNav href="/dashboard/informes" titulo="Informes" colapsado={isCollapsed}>
                <line x1="18" y1="20" x2="18" y2="10" />
                <line x1="12" y1="20" x2="12" y2="4" />
                <line x1="6" y1="20" x2="6" y2="14" />
              </EnlaceNav>
              <EnlaceNav href="/dashboard/log-importacion" titulo="Log Importación" colapsado={isCollapsed}>
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
                <polyline points="10 9 9 9 8 9" />
              </EnlaceNav>
              <EnlaceNav href="/dashboard/log-lecturas" titulo="Log Lecturas" colapsado={isCollapsed}>
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <path d="M7 8h10M7 12h10M7 16h6" />
              </EnlaceNav>
            </>
          )}
          {isVendedorOrUp && labMostrar !== "false" && (
            <EnlaceNav
              href="#"
              titulo="Laboratorio"
              colapsado={isCollapsed}
              activo={labAbierto === "true"}
              ayuda="Abre o cierra el laboratorio de comisiones: toca reglas y mira cómo se mueven los puntos, el tramo y la comisión sin guardar nada"
              alPulsar={() => {
                fijarLabAbierto(labAbierto === "true" ? "false" : "true");
                if (movil) fijarMenuAbierto(false);
              }}
            >
              <path d="M9 3h6" />
              <path d="M10 3v6L4.5 19a1.5 1.5 0 0 0 1.3 2.2h12.4a1.5 1.5 0 0 0 1.3-2.2L14 9V3" />
              <path d="M7.5 15h9" />
            </EnlaceNav>
          )}
        </nav>
      </div>

      {/* Pie */}
      <div style={{ borderTop: "1px solid var(--border-light)", paddingTop: "20px", display: "flex", flexDirection: "column", gap: "16px" }}>
        {isAdmin && <BotonReiniciarServidor colapsado={isCollapsed} />}
        <button
          onClick={cerrarSesion}
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
          onMouseEnter={(e) => {
            e.currentTarget.style.color = "#ff4d4d";
            e.currentTarget.style.background = "rgba(255, 77, 77, 0.08)";
            e.currentTarget.style.borderColor = "rgba(255, 77, 77, 0.2)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = "var(--text-secondary)";
            e.currentTarget.style.background = "rgba(255, 255, 255, 0.01)";
            e.currentTarget.style.borderColor = "transparent";
          }}
        >
          <svg {...iconoProps}>
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
          {!isCollapsed && <span>Cerrar sesión</span>}
        </button>

        {isAdmin && <BotonApagar colapsado={isCollapsed} />}

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
          {isCollapsed ? `v${version.split(".").slice(0, 2).join(".")}` : `GestorVentas v${version}`}
        </div>
      </div>
    </aside>
    </>
  );
}
