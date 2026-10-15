import { syncUser } from "@/lib/auth-utils";
import { redirect } from "next/navigation";
import { db } from "@/db";
import Link from "next/link";
import { desc } from "drizzle-orm";
import { expedientes, tiendas } from "@/db/schema";
import ExpedientesList from "@/components/ExpedientesList";

export default async function ExpedientesPage() {
  const user = await syncUser();

  if (!user || user.rol === "invitado") {
    redirect("/dashboard");
  }

  const userRole = user.rol || "invitado";
  const canCreate = ["administrador", "jefe_tienda", "vendedor"].includes(userRole);

  // Obtener tiendas para el modal de creación de clientes en la lista
  const dbTiendas = await db.query.tiendas.findMany();

  // Obtener expedientes de la base de datos con relaciones resueltas por Drizzle ORM
  const dbExpedientes = await db.query.expedientes.findMany({
    orderBy: [desc(expedientes.id_expediente)],
    with: {
      cliente: {
        with: {
          emails: true,
          telefonos: true
        }
      },
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

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "32px" }}>
      {/* CABECERA */}
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        flexWrap: "wrap",
        gap: "16px"
      }}>
        <div>
          <h1 style={{ fontSize: "1.85rem", marginBottom: "8px" }}>Control de Expedientes</h1>
          <p style={{ color: "var(--text-secondary)" }}>
            Listado completo de ventas realizadas y seguimiento de expedientes.
          </p>
        </div>

        {canCreate && (
          <Link href="/dashboard/expedientes/nuevo" className="btn btn-primary">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Nuevo Expediente
          </Link>
        )}
      </div>

      {/* CONTENIDO PRINCIPAL */}
      <ExpedientesList 
        expedientesIniciales={dbExpedientes} 
        userRole={userRole} 
        tiendas={dbTiendas} 
        tiendaPredeterminadaId={user.tienda_predeterminada_id}
        currentUserId={user.id_usuario}
        currentUserName={user.nombre}
      />
    </div>
  );
}
