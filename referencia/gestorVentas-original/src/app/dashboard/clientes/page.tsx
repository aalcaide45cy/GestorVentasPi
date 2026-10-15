import { syncUser } from "@/lib/auth-utils";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { desc } from "drizzle-orm";
import { clientes } from "@/db/schema";
import ClientesList from "@/components/ClientesList";

export default async function ClientesPage() {
  const user = await syncUser();

  if (!user || user.rol === "invitado") {
    redirect("/dashboard");
  }

  // Obtener clientes de la base de datos con sus listas de correos y teléfonos
  const dbClientes = await db.query.clientes.findMany({
    orderBy: [desc(clientes.id)],
    with: {
      emails: true,
      telefonos: true,
      expedientes: {
        with: {
          modelo: {
            with: {
              marca: true
            }
          },
          tipoDeVenta: true,
          estadoVehiculo: true
        }
      }
    }
  });

  // Obtener tiendas para asociar
  const dbTiendas = await db.query.tiendas.findMany();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "32px" }}>
      {/* CABECERA */}
      <div>
        <h1 style={{ fontSize: "1.85rem", marginBottom: "8px" }}>Base de Clientes</h1>
        <p style={{ color: "var(--text-secondary)" }}>
          Directorio de clientes registrados y su información de contacto (correos y teléfonos).
        </p>
      </div>

      {/* COMPONENTE INTERACTIVO DE CLIENTES */}
      <ClientesList
        clientesIniciales={dbClientes}
        userRole={user.rol ?? "invitado"}
        tiendas={dbTiendas.map(t => ({
          id_tienda: t.id_tienda,
          nombre: t.nombre,
          ciudad: t.ciudad
        }))}
        tiendaPredeterminadaId={user.tienda_predeterminada_id}
      />
    </div>
  );
}
