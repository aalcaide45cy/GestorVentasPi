import { syncUser } from "@/lib/auth-utils";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { usuarios } from "@/db/schema";
import AdminUsuariosList from "@/components/AdminUsuariosList";
import AdminCatalogosForm from "@/components/AdminCatalogosForm";

export default async function AdminPage() {
  const user = await syncUser();

  // Validar rol de administrador
  if (!user || user.rol !== "administrador") {
    return (
      <div className="glass-panel" style={{
        padding: "50px",
        textAlign: "center",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "24px",
        borderLeft: "4px solid var(--danger)",
        marginTop: "40px"
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
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </div>
        <h2 style={{ fontSize: "1.5rem" }}>Acceso Denegado</h2>
        <p style={{ color: "var(--text-secondary)", maxWidth: "450px", lineHeight: "1.6" }}>
          Esta área es exclusiva para usuarios con rol de <strong>Administrador</strong>. Tu rol actual es <strong>{(user?.rol || "invitado").toUpperCase()}</strong>.
        </p>
      </div>
    );
  }

  // 1. Obtener todos los usuarios de la base de datos con contactos
  const dbUsuarios = await db.query.usuarios.findMany({
    with: {
      emails: true,
      telefonos: true
    }
  });

  // 2. Obtener todas las marcas con sus modelos
  const dbMarcas = await db.query.marcas.findMany({
    with: {
      modelos: true
    }
  });

  // 3. Obtener tipos de venta y estados de vehículos
  const dbTiposVenta = await db.query.tipoDeVenta.findMany({
    orderBy: (tv, { asc }) => [asc(tv.orden), asc(tv.nombre_tipo_venta)]
  });
  const dbEstadosVehiculo = await db.query.estadoVehiculo.findMany();
  const dbTiendas = await db.query.tiendas.findMany();

  // Mapear marcas a estructura del componente
  const marcasMapeadas = dbMarcas.map(m => ({
    id_marca: m.id_marca,
    nombre: m.nombre,
    activo: m.activo,
    acceso_rapido: m.acceso_rapido,
    sistema_comisiones: m.sistema_comisiones,
    modelos: m.modelos.map(mod => ({
      id_modelo: mod.id_modelo,
      nombre_modelo: mod.nombre_modelo,
      acceso_rapido: mod.acceso_rapido,
      orden_acceso_rapido: mod.orden_acceso_rapido
    }))
  }));

  // Mapear tipos de venta y estados de vehículos
  const tiposVentaMapeados = dbTiposVenta.map(t => ({
    id: t.id_tipo_de_venta,
    nombre: t.nombre_tipo_venta,
    color: t.color,
    orden: t.orden
  }));

  const estadosVehiculoMapeados = dbEstadosVehiculo.map(ev => ({
    id: ev.id_estado_vehiculo,
    nombre: ev.nombre_estado_vehiculo,
    predeterminado: ev.predeterminado
  }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "40px" }}>
      {/* CABECERA */}
      <div>
        <h1 style={{ fontSize: "1.85rem", marginBottom: "8px" }}>Panel de Configuración y Control</h1>
        <p style={{ color: "var(--text-secondary)" }}>
          Administra los roles de los usuarios del sistema y supervisa el catálogo de vehículos.
        </p>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "40px" }}>
        {/* SECCIÓN 1: CONTROL DE ROLES DE USUARIOS */}
        <div className="glass-panel" style={{ padding: "32px" }}>
          <h2 style={{ fontSize: "1.25rem", marginBottom: "24px", color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "10px" }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
            Gestión de Usuarios y Roles
          </h2>

          <AdminUsuariosList
            usuariosIniciales={dbUsuarios}
            currentUserId={user.clerk_id}
          />
        </div>

        {/* SECCIÓN 2: CONTROL DE CATÁLOGOS INTERACTIVOS */}
        <div>
          <AdminCatalogosForm
            marcasIniciales={marcasMapeadas}
            tiposVentaIniciales={tiposVentaMapeados}
            estadosVehiculoIniciales={estadosVehiculoMapeados}
            tiendasIniciales={dbTiendas.map(t => ({
              id_tienda: t.id_tienda,
              nombre: t.nombre,
              ciudad: t.ciudad
            }))}
            tiendaPredeterminadaIdInicial={user.tienda_predeterminada_id}
          />
        </div>
      </div>
    </div>
  );
}
