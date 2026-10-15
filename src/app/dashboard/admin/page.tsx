import { db } from "@/db";
import AdminCatalogosForm from "@/components/AdminCatalogosForm";
import AdminUsuariosList from "@/components/AdminUsuariosList";
import { esAdministrador } from "@/lib/auth/permisos";
import { getCurrentUser } from "@/lib/auth/sesion";
import { leerAjustes, leerCatalogos } from "@/lib/servicios/catalogos";
import { listarUsuarios } from "@/lib/servicios/usuarios";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const user = await getCurrentUser();

  if (!user || !esAdministrador(user.rol)) {
    return (
      <div className="glass-panel" style={{ padding: "50px", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: "24px", borderLeft: "4px solid var(--danger)", marginTop: "40px" }}>
        <div style={{ width: "60px", height: "60px", borderRadius: "50%", background: "rgba(239, 68, 68, 0.1)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--danger)" }}>
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

  const [usuarios, catalogos, ajustes] = await Promise.all([listarUsuarios(db), leerCatalogos(db), leerAjustes(db)]);

  const marcas = catalogos.marcas.map((m) => ({ ...m, modelos: catalogos.modelos.filter((mo) => mo.marca_id === m.id_marca) }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "40px" }}>
      <div>
        <h1 style={{ fontSize: "1.85rem", marginBottom: "8px" }}>Panel de Configuración y Control</h1>
        <p style={{ color: "var(--text-secondary)" }}>Administra los roles de los usuarios del sistema y supervisa el catálogo de vehículos.</p>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "40px" }}>
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
          <AdminUsuariosList usuariosIniciales={usuarios} currentUserId={user.idUsuario} />
        </div>

        <AdminCatalogosForm
          marcasIniciales={marcas}
          tiposVentaIniciales={catalogos.tiposVenta}
          estadosIniciales={catalogos.estados}
          tiendasIniciales={catalogos.tiendas}
          tiendaPredeterminadaIdInicial={user.tiendaPredeterminadaId}
          mostrarBotonesCsv={ajustes.mostrar_botones_csv !== "false"}
        />
      </div>
    </div>
  );
}
