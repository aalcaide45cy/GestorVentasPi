import { redirect } from "next/navigation";
import { db } from "@/db";
import ExpedientesList from "@/components/ExpedientesList";
import { esRolActivo } from "@/lib/auth/permisos";
import { getCurrentUser } from "@/lib/auth/sesion";
import { leerAjustes, leerCatalogos } from "@/lib/servicios/catalogos";
import { LIMITE_LISTA_EXPEDIENTES, contarExpedientes, listarExpedientes } from "@/lib/servicios/expedientes-lectura";
import { listarVendedores } from "@/lib/servicios/usuarios";

export const dynamic = "force-dynamic";

export default async function ExpedientesPage() {
  const user = await getCurrentUser();
  if (!user || !esRolActivo(user.rol)) redirect("/dashboard");

  const [expedientes, totalEnBd, catalogos, vendedores, ajustes] = await Promise.all([
    listarExpedientes(db, { limite: LIMITE_LISTA_EXPEDIENTES }),
    contarExpedientes(db),
    leerCatalogos(db),
    listarVendedores(db),
    leerAjustes(db),
  ]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
        <div>
          <h1 style={{ fontSize: "1.4rem", marginBottom: "2px" }}>Control de Expedientes</h1>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem" }}>Listado completo de ventas realizadas y seguimiento de expedientes.</p>
        </div>

      </div>

      <ExpedientesList
        expedientesIniciales={expedientes}
        totalEnBd={totalEnBd}
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
