import { redirect } from "next/navigation";
import { db } from "@/db";
import ClientesList from "@/components/ClientesList";
import { esRolActivo } from "@/lib/auth/permisos";
import { getCurrentUser } from "@/lib/auth/sesion";
import { leerCatalogos } from "@/lib/servicios/catalogos";
import { LIMITE_LISTA_CLIENTES, contarClientes, listarClientes } from "@/lib/servicios/clientes";

export const dynamic = "force-dynamic";

export default async function ClientesPage() {
  const user = await getCurrentUser();
  if (!user || !esRolActivo(user.rol)) redirect("/dashboard");

  const [clientes, totalEnBd, catalogos] = await Promise.all([listarClientes(db, { limite: LIMITE_LISTA_CLIENTES }), contarClientes(db), leerCatalogos(db)]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "32px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "12px" }}>
        <div>
          <h1 style={{ fontSize: "1.85rem", marginBottom: "8px" }}>Base de Clientes</h1>
          <p style={{ color: "var(--text-secondary)" }}>Directorio de clientes registrados y su información de contacto (correos y teléfonos).</p>
        </div>
      </div>

      <ClientesList clientesIniciales={clientes} totalEnBd={totalEnBd} userRole={user.rol} tiendas={catalogos.tiendas} tiendaPredeterminadaId={user.tiendaPredeterminadaId} />
    </div>
  );
}
