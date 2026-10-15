import { syncUser } from "@/lib/auth-utils";
import Link from "next/link";
import { db } from "@/db";
import { expedientes, clientes, marcas, modelos, tiendas } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import QuickExpedienteCreator from "@/components/QuickExpedienteCreator";
import RecentExpedientesTable from "@/components/RecentExpedientesTable";
import { formatDate } from "@/lib/date-utils";

export default async function DashboardPage() {
  const user = await syncUser();

  if (!user) {
    return null;
  }

  const userRole = user.rol || "invitado";
  const isInvitado = userRole === "invitado";

  // Consultar datos reales de la BD
  const dbExpedientesAll = await db.query.expedientes.findMany({
    with: {
      tipoDeVenta: true
    }
  });
  const dbClientesAll = await db.query.clientes.findMany();
  const dbTiposVenta = await db.query.tipoDeVenta.findMany({
    orderBy: (tv, { asc }) => [asc(tv.orden), asc(tv.nombre_tipo_venta)]
  });
  const dbTiendas = await db.query.tiendas.findMany({
    orderBy: (t, { asc }) => [asc(t.nombre)]
  });

  const expedientesCount = dbExpedientesAll.length;
  const clientesCount = dbClientesAll.length;

  // Calcular expedientes creados en el mes actual
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1; // 1-12

  const expedientesMesActual = dbExpedientesAll.filter(exp => {
    if (!exp.fecha_expediente) return false;
    const dateParts = exp.fecha_expediente.split("-");
    const expYear = parseInt(dateParts[0], 10);
    const expMonth = parseInt(dateParts[1], 10);
    return expYear === currentYear && expMonth === currentMonth;
  }).length;

  // Calcular expedientes según método de pago
  const conteoTiposPago: Record<string, number> = {};
  dbTiposVenta.forEach(tv => {
    conteoTiposPago[tv.nombre_tipo_venta] = 0;
  });
  dbExpedientesAll.forEach(exp => {
    if (exp.tipoDeVenta) {
      conteoTiposPago[exp.tipoDeVenta.nombre_tipo_venta] = (conteoTiposPago[exp.tipoDeVenta.nombre_tipo_venta] || 0) + 1;
    }
  });

  // Obtener los 5 últimos expedientes para mostrar en el feed de actividad
  const dbExpedientesRecientes = await db.query.expedientes.findMany({
    orderBy: [desc(expedientes.id_expediente)],
    limit: 5,
    with: {
      cliente: true,
      modelo: {
        with: {
          marca: true
        }
      },
      tipoDeVenta: true,
      estadoVehiculo: true,
      usuario: true
    }
  });

  // Marcas y modelos con acceso rápido ordenados por orden_acceso_rapido
  const dbMarcasAccesoRapido = await db.query.marcas.findMany({
    where: eq(marcas.acceso_rapido, true),
    with: {
      modelos: {
        where: (m, { eq }) => eq(m.acceso_rapido, true),
        orderBy: (m, { asc }) => [asc(m.orden_acceso_rapido), asc(m.nombre_modelo)]
      }
    }
  });

  const dbUsuarios = await db.query.usuarios.findMany({
    orderBy: (u, { asc }) => [asc(u.nombre)]
  });

  const vendedoresMapeados = dbUsuarios
    .filter(u => u.rol !== "invitado")
    .map(u => ({
      id_usuario: u.id_usuario,
      nombre: u.nombre || `ID: ${u.id_usuario}`
    }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "32px" }}>
      {/* CABECERA / BIENVENIDA */}
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        flexWrap: "wrap",
        gap: "16px"
      }}>
        <div>
          <h1 style={{ fontSize: "2rem", marginBottom: "8px" }}>¡Hola, {user.nombre}!</h1>
          <p style={{ color: "var(--text-secondary)" }}>
            Bienvenido al panel del Gestor de Ventas. Aquí tienes el resumen de hoy.
          </p>
        </div>
        <div style={{ fontSize: "0.9rem", color: "var(--text-muted)" }}>
          Fecha de registro: {user.fecha_de_registro ? formatDate(user.fecha_de_registro) : ""}
        </div>
      </div>

      {isInvitado ? (
        /* VISTA PARA ROL INVITADO */
        <div className="glass-panel" style={{
          padding: "40px",
          textAlign: "center",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "20px",
          borderLeft: "4px solid var(--warning)"
        }}>
          <div style={{
            width: "56px",
            height: "56px",
            borderRadius: "50%",
            background: "rgba(234, 179, 8, 0.1)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--warning)",
            marginBottom: "8px"
          }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </div>
          <h2 style={{ fontSize: "1.4rem" }}>Cuenta Pendiente de Aprobación</h2>
          <p style={{ color: "var(--text-secondary)", maxWidth: "500px", lineHeight: "1.6" }}>
            Tu usuario ha sido creado correctamente en el sistema con el rol predeterminado de <strong>Invitado</strong>.
            Para acceder a las herramientas de registro y control de ventas, solicita a un administrador que asigne tu rol definitivo (Vendedor, Jefe de Tienda, etc.).
          </p>
        </div>
      ) : (
        /* VISTA PARA ROLES ACTIVOS */
        <>
          {/* MÉTRICAS CLAVE (GRIDS DE TARJETAS) */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: "20px"
          }}>
            <div className="glass-panel-interactive" style={{ padding: "24px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                <span style={{ fontSize: "0.9rem", color: "var(--text-muted)", fontWeight: 600 }}>MES ACTUAL</span>
                <span style={{ color: "var(--success)" }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                    <line x1="16" y1="2" x2="16" y2="6" />
                    <line x1="8" y1="2" x2="8" y2="6" />
                    <line x1="3" y1="10" x2="21" y2="10" />
                  </svg>
                </span>
              </div>
              <h2 style={{ fontSize: "1.8rem", marginBottom: "4px" }}>{expedientesMesActual}</h2>
              <p style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>Expedientes creados este mes</p>
            </div>

            <div className="glass-panel-interactive" style={{ padding: "24px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                <span style={{ fontSize: "0.9rem", color: "var(--text-muted)", fontWeight: 600 }}>EXPEDIENTES TOTALES</span>
                <span style={{ color: "var(--primary)" }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="16" y1="13" x2="8" y2="13" />
                    <line x1="16" y1="17" x2="8" y2="17" />
                    <polyline points="10 9 9 9 8 9" />
                  </svg>
                </span>
              </div>
              <h2 style={{ fontSize: "1.8rem", marginBottom: "4px" }}>{expedientesCount}</h2>
              <p style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>Registrados en base de datos</p>
            </div>

            <div className="glass-panel-interactive" style={{ padding: "24px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                <span style={{ fontSize: "0.9rem", color: "var(--text-muted)", fontWeight: 600 }}>CLIENTES REGISTRADOS</span>
                <span style={{ color: "var(--secondary)" }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <line x1="19" y1="8" x2="19" y2="14" />
                    <line x1="22" y1="11" x2="16" y2="11" />
                  </svg>
                </span>
              </div>
              <h2 style={{ fontSize: "1.8rem", marginBottom: "4px" }}>{clientesCount}</h2>
              <p style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>Directorio activo</p>
            </div>

            <div className="glass-panel-interactive" style={{ padding: "24px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                <span style={{ fontSize: "0.9rem", color: "var(--text-muted)", fontWeight: 600 }}>TIPO DE PAGO</span>
                <span style={{ color: "var(--accent)" }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="4" width="20" height="16" rx="2" />
                    <line x1="2" y1="10" x2="22" y2="10" />
                  </svg>
                </span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "4px", maxHeight: "80px", overflowY: "auto" }}>
                {Object.entries(conteoTiposPago).map(([nombre, cantidad]) => (
                  <div key={nombre} style={{ fontSize: "0.8rem", color: "var(--text-secondary)", display: "flex", justifyContent: "space-between" }}>
                    <span>Expedientes {nombre}:</span>
                    <strong style={{ color: "var(--text-primary)" }}>{cantidad}</strong>
                  </div>
                ))}
                {Object.keys(conteoTiposPago).length === 0 && (
                  <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", margin: 0 }}>Sin tipos de venta creados</p>
                )}
              </div>
            </div>
          </div>

          {/* EXPEDIENTES RECIENTES */}
          <div className="glass-panel" style={{ padding: "28px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
              <h3 style={{ fontSize: "1.2rem" }}>Últimos Expedientes Activos</h3>
              <Link href="/dashboard/expedientes" style={{ fontSize: "0.9rem", fontWeight: 600 }}>
                Ver todos
              </Link>
            </div>

            <RecentExpedientesTable 
              initialExpedientes={dbExpedientesRecientes} 
              tiendas={dbTiendas} 
              tiendaPredeterminadaId={user.tienda_predeterminada_id} 
              vendedores={vendedoresMapeados}
            />
          </div>

          <QuickExpedienteCreator 
            marcas={dbMarcasAccesoRapido} 
            tiposVenta={dbTiposVenta} 
            vendedores={vendedoresMapeados}
            currentUserId={user.id_usuario}
          />
        </>
      )}
    </div>
  );
}
