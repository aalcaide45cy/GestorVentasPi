import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/db";
import ExpedientesList from "@/components/ExpedientesList";
import { esRolActivo, puedeCrearExpedientes } from "@/lib/auth/permisos";
import { getCurrentUser } from "@/lib/auth/sesion";
import { leerAjustes, leerCatalogos } from "@/lib/servicios/catalogos";
import { listarExpedientes } from "@/lib/servicios/expedientes-lectura";
import { listarVendedores } from "@/lib/servicios/usuarios";

export const dynamic = "force-dynamic";

export default async function ExpedientesPage() {
  const user = await getCurrentUser();
  if (!user || !esRolActivo(user.rol)) redirect("/dashboard");

  const [expedientes, catalogos, vendedores, ajustes] = await Promise.all([
    listarExpedientes(db),
    leerCatalogos(db),
    listarVendedores(db),
    leerAjustes(db),
  ]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "32px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "16px" }}>
        <div>
          <h1 style={{ fontSize: "1.85rem", marginBottom: "8px" }}>Control de Expedientes</h1>
          <p style={{ color: "var(--text-secondary)" }}>Listado completo de ventas realizadas y seguimiento de expedientes.</p>
        </div>

        {puedeCrearExpedientes(user.rol) && (
          <Link href="/dashboard/expedientes/nuevo" className="btn btn-primary">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Nuevo Expediente
          </Link>
        )}
      </div>

      <ExpedientesList
        expedientesIniciales={expedientes}
        userRole={user.rol}
        tiendas={catalogos.tiendas}
        vendedores={vendedores}
        tiendaPredeterminadaId={user.tiendaPredeterminadaId}
        currentUserName={user.nombre}
        mostrarBotonesCsv={ajustes.mostrar_botones_csv !== "false"}
      />
    </div>
  );
}
