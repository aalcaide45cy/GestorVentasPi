import { redirect } from "next/navigation";
import { db } from "@/db";
import TablaClientesEncontrados from "@/components/TablaClientesEncontrados";
import ExpedientesList from "@/components/ExpedientesList";
import { esRolActivo } from "@/lib/auth/permisos";
import { getCurrentUser } from "@/lib/auth/sesion";
import { resultadosBusqueda } from "@/lib/servicios/busqueda";
import { leerAjustes, leerCatalogos } from "@/lib/servicios/catalogos";
import { listarVendedores } from "@/lib/servicios/usuarios";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{ q?: string }>;
}

export default async function ResultadosBusquedaPage({ searchParams }: Props) {
  const user = await getCurrentUser();
  if (!user || !esRolActivo(user.rol)) redirect("/dashboard");

  const q = (await searchParams).q ?? "";
  if (!q.trim()) redirect("/dashboard");

  const [{ clientes, expedientes }, catalogos, vendedores, ajustes] = await Promise.all([
    resultadosBusqueda(db, q),
    leerCatalogos(db),
    listarVendedores(db),
    leerAjustes(db),
  ]);
  const total = clientes.length + expedientes.length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "32px" }}>
      <div>
        <h1 style={{ fontSize: "1.85rem", marginBottom: "8px" }}>Resultados de Búsqueda</h1>
        <p style={{ color: "var(--text-secondary)" }}>
          Búsqueda general para: <strong>&ldquo;{q}&rdquo;</strong> — Se encontraron {total} resultado(s).
        </p>
      </div>

      {total === 0 ? (
        <div className="glass-panel" style={{ padding: "60px 40px", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: "20px" }}>
          <div style={{ width: "64px", height: "64px", borderRadius: "50%", background: "rgba(239, 68, 68, 0.08)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--danger)", marginBottom: "8px" }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </div>
          <h2 style={{ fontSize: "1.4rem" }}>No se encontraron coincidencias</h2>
          <p style={{ color: "var(--text-secondary)", maxWidth: "460px", lineHeight: "1.6" }}>
            Prueba a buscar por una matrícula diferente, el nombre completo de un cliente, su DNI o el modelo del vehículo.
          </p>
        </div>
      ) : (
        <>
          {expedientes.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
              <h2 style={{ fontSize: "1.2rem", color: "var(--text-primary)", margin: 0 }}>📄 Expedientes Encontrados ({expedientes.length})</h2>
              <ExpedientesList
                expedientesIniciales={expedientes}
                userRole={user.rol}
                tiendas={catalogos.tiendas}
                vendedores={vendedores}
                tiendaPredeterminadaId={user.tiendaPredeterminadaId}
                currentUserName={null}
                recordarFiltros={false}
                mostrarBotonesCsv={ajustes.mostrar_botones_csv !== "false"}
              />
            </div>
          )}

          {clientes.length > 0 && (
            <div className="glass-panel" style={{ padding: "24px", display: "flex", flexDirection: "column", gap: "20px" }}>
              <h2 style={{ fontSize: "1.2rem", color: "var(--text-primary)" }}>👤 Clientes Encontrados ({clientes.length})</h2>
              <TablaClientesEncontrados clientes={clientes} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
