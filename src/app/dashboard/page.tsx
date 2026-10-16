import Link from "next/link";
import { db } from "@/db";
import QuickExpedienteCreator from "@/components/QuickExpedienteCreator";
import RecentExpedientesTable from "@/components/RecentExpedientesTable";
import { esAdministrador, esRolActivo } from "@/lib/auth/permisos";
import { getCurrentUser } from "@/lib/auth/sesion";
import { formatDate } from "@/lib/date-utils";
import { resumenPanel } from "@/lib/servicios/expedientes-lectura";
import { cargarDatosPanel } from "@/lib/servicios/panel";
import { calcularVendedorMes } from "@/lib/servicios/liquidaciones";
import { avisosRejilla } from "@/lib/servicios/rejillas";
import { etiquetaTramo, euros, nombreMes, puntos } from "@/lib/formato";

export const dynamic = "force-dynamic";

const estiloTarjeta = { padding: "24px" } as const;
const estiloCabeceraTarjeta = { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" } as const;
const estiloEtiqueta = { fontSize: "0.9rem", color: "var(--text-muted)", fontWeight: 600 } as const;
const estiloNumero = { fontSize: "1.8rem", marginBottom: "4px" } as const;
const estiloPie = { fontSize: "0.8rem", color: "var(--text-muted)" } as const;

function Icono({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span style={{ color }}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {children}
      </svg>
    </span>
  );
}

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  const esInvitado = !esRolActivo(user.rol);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "32px" }}>
      {/* Cabecera / bienvenida */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "16px" }}>
        <div>
          <h1 style={{ fontSize: "2rem", marginBottom: "8px" }}>¡Hola, {user.nombre}!</h1>
          <p style={{ color: "var(--text-secondary)" }}>
            Bienvenido al panel del Gestor de Ventas. Aquí tienes el resumen de hoy.
          </p>
        </div>
        <div style={{ fontSize: "0.9rem", color: "var(--text-muted)" }}>
          Fecha de registro: {user.fechaDeRegistro ? formatDate(user.fechaDeRegistro) : ""}
        </div>
      </div>

      {esInvitado ? (
        <div
          className="glass-panel"
          style={{
            padding: "40px",
            textAlign: "center",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "20px",
            borderLeft: "4px solid var(--warning)",
          }}
        >
          <div
            style={{
              width: "56px",
              height: "56px",
              borderRadius: "50%",
              background: "rgba(234, 179, 8, 0.1)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--warning)",
              marginBottom: "8px",
            }}
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </div>
          <h2 style={{ fontSize: "1.4rem" }}>Cuenta Pendiente de Aprobación</h2>
          <p style={{ color: "var(--text-secondary)", maxWidth: "500px", lineHeight: "1.6" }}>
            Tu usuario ha sido creado correctamente en el sistema con el rol predeterminado de <strong>Invitado</strong>. Para acceder a
            las herramientas de registro y control de ventas, solicita a un administrador que asigne tu rol definitivo (Vendedor, Jefe de
            Tienda, etc.).
          </p>
        </div>
      ) : (
        <PanelActivo userId={user.idUsuario} esAdmin={esAdministrador(user.rol)} tiendaPredeterminadaId={user.tiendaPredeterminadaId} />
      )}
    </div>
  );
}

async function PanelActivo({ userId, esAdmin, tiendaPredeterminadaId }: { userId: number; esAdmin: boolean; tiendaPredeterminadaId: number | null }) {
  const mesIso = new Date().toISOString().slice(0, 7);
  const [resumen, datos, motor, avisos] = await Promise.all([resumenPanel(db), cargarDatosPanel(db), calcularVendedorMes(db, userId, mesIso), avisosRejilla(db, esAdmin ? null : userId, mesIso)]);
  const hayPlan = motor !== null && motor.idPlan !== null;

  return (
    <>
      {/* Validación de comisiones pendiente */}
      {avisos.length > 0 && (
        <div className="glass-panel" style={{ padding: "20px 24px", borderLeft: "4px solid var(--warning)", display: "flex", flexDirection: "column", gap: "8px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
            <h3 style={{ fontSize: "1.1rem" }}>✅ Validación de comisiones pendiente ({avisos.length})</h3>
            <Link href="/dashboard/comisiones" style={{ fontSize: "0.9rem", fontWeight: 600 }}>
              Ir a validar
            </Link>
          </div>
          {avisos.slice(0, 5).map((a) => (
            <div key={`${a.tipo}-${a.idUsuario}-${a.mes}`} style={{ fontSize: "0.9rem", color: "var(--text-secondary)" }}>
              {esAdmin && a.vendedor ? <b>{a.vendedor}: </b> : null}
              {a.detalle}
            </div>
          ))}
        </div>
      )}

      {/* Métricas clave */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "20px" }}>
        <div className="glass-panel-interactive" style={estiloTarjeta}>
          <div style={estiloCabeceraTarjeta}>
            <span style={estiloEtiqueta}>OBJETIVO DEL MES</span>
            <Icono color="var(--warning)">
              <circle cx="12" cy="12" r="10" />
              <circle cx="12" cy="12" r="6" />
              <circle cx="12" cy="12" r="2" />
            </Icono>
          </div>
          <h2 style={estiloNumero}>{hayPlan ? `${puntos(motor.puntosMes)} / ${puntos(motor.objetivoX)}` : "—"}</h2>
          <p style={estiloPie}>
            {hayPlan ? `Tramo ${etiquetaTramo(motor.tramo)} · comisión estimada ${euros(motor.neto)}` : `Sin plan de comisionamiento para ${nombreMes(mesIso)}`}
          </p>
        </div>

        <div className="glass-panel-interactive" style={estiloTarjeta}>
          <div style={estiloCabeceraTarjeta}>
            <span style={estiloEtiqueta}>MES ACTUAL</span>
            <Icono color="var(--success)">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </Icono>
          </div>
          <h2 style={estiloNumero}>{resumen.mesActual}</h2>
          <p style={estiloPie}>Expedientes creados este mes</p>
        </div>

        <div className="glass-panel-interactive" style={estiloTarjeta}>
          <div style={estiloCabeceraTarjeta}>
            <span style={estiloEtiqueta}>EXPEDIENTES TOTALES</span>
            <Icono color="var(--primary)">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
              <polyline points="10 9 9 9 8 9" />
            </Icono>
          </div>
          <h2 style={estiloNumero}>{resumen.total}</h2>
          <p style={estiloPie}>Registrados en base de datos</p>
        </div>

        <div className="glass-panel-interactive" style={estiloTarjeta}>
          <div style={estiloCabeceraTarjeta}>
            <span style={estiloEtiqueta}>CLIENTES REGISTRADOS</span>
            <Icono color="var(--secondary)">
              <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <line x1="19" y1="8" x2="19" y2="14" />
              <line x1="22" y1="11" x2="16" y2="11" />
            </Icono>
          </div>
          <h2 style={estiloNumero}>{resumen.clientes}</h2>
          <p style={estiloPie}>Directorio activo</p>
        </div>

        <div className="glass-panel-interactive" style={estiloTarjeta}>
          <div style={estiloCabeceraTarjeta}>
            <span style={estiloEtiqueta}>TIPO DE PAGO</span>
            <Icono color="var(--accent)">
              <rect x="2" y="4" width="20" height="16" rx="2" />
              <line x1="2" y1="10" x2="22" y2="10" />
            </Icono>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "4px", maxHeight: "80px", overflowY: "auto" }}>
            {resumen.porTipoVenta.map((t) => (
              <div key={t.nombre} style={{ fontSize: "0.8rem", color: "var(--text-secondary)", display: "flex", justifyContent: "space-between" }}>
                <span>Expedientes {t.nombre}:</span>
                <strong style={{ color: "var(--text-primary)" }}>{t.cantidad}</strong>
              </div>
            ))}
            {resumen.porTipoVenta.length === 0 && (
              <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", margin: 0 }}>Sin tipos de venta creados</p>
            )}
          </div>
        </div>
      </div>

      {/* Expedientes recientes */}
      <div className="glass-panel" style={{ padding: "28px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
          <h3 style={{ fontSize: "1.2rem" }}>Últimos Expedientes Activos</h3>
          <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>💡 Arrastra el pedido de un cliente sobre un expediente para rellenarlo</span>
          <Link href="/dashboard/expedientes" style={{ fontSize: "0.9rem", fontWeight: 600 }}>
            Ver todos
          </Link>
        </div>
        <RecentExpedientesTable
          initialExpedientes={datos.recientes}
          tiendas={datos.tiendas}
          tiendaPredeterminadaId={tiendaPredeterminadaId}
          vendedores={datos.vendedores}
        />
      </div>

      <QuickExpedienteCreator
        marcas={datos.marcasAccesoRapido}
        tiposVenta={datos.tiposVenta}
        vendedores={datos.vendedores}
        currentUserId={userId}
      />
    </>
  );
}
