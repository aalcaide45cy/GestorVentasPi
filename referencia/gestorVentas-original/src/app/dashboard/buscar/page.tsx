import { syncUser } from "@/lib/auth-utils";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { clientes, expedientes } from "@/db/schema";
import { desc, or, ilike } from "drizzle-orm";
import Link from "next/link";
import { formatDate } from "@/lib/date-utils";
import ExpedientesList from "@/components/ExpedientesList";

interface SearchPageProps {
  searchParams: Promise<{ q?: string }>;
}

export default async function SearchResultsPage({ searchParams }: SearchPageProps) {
  const user = await syncUser();
  if (!user || user.rol === "invitado") {
    redirect("/dashboard");
  }

  const userRole = user.rol || "invitado";

  const queryParams = await searchParams;
  const q = queryParams.q || "";

  if (!q.trim()) {
    redirect("/dashboard");
  }

  // 1. Obtener todos los clientes que coincidan
  const matchedClientes = await db.query.clientes.findMany({
    where: or(
      ilike(clientes.nombre, `%${q}%`),
      ilike(clientes.dni, `%${q}%`)
    ),
    with: {
      emails: true,
      telefonos: true
    },
    limit: 50
  });

  // 2. Obtener expedientes y filtrar por coincidencia de matrícula, cliente, modelo o marca
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

  const matchedExpedientes = dbExpedientes.filter(exp => {
    const qLower = q.toLowerCase();
    const matriculaMatch = exp.matricula?.toLowerCase().includes(qLower);
    const clienteNameMatch = exp.cliente?.nombre?.toLowerCase().includes(qLower);
    const clienteDniMatch = exp.cliente?.dni?.toLowerCase().includes(qLower);
    const modeloMatch = exp.modelo?.nombre_modelo?.toLowerCase().includes(qLower);
    const marcaMatch = exp.modelo?.marca?.nombre?.toLowerCase().includes(qLower);
    const idMatch = String(exp.id_expediente).includes(qLower);

    return matriculaMatch || clienteNameMatch || clienteDniMatch || modeloMatch || marcaMatch || idMatch;
  });

  const totalResultados = matchedClientes.length + matchedExpedientes.length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "32px" }}>
      {/* CABECERA */}
      <div>
        <h1 style={{ fontSize: "1.85rem", marginBottom: "8px" }}>Resultados de Búsqueda</h1>
        <p style={{ color: "var(--text-secondary)" }}>
          Búsqueda general para: <strong>&ldquo;{q}&rdquo;</strong> — Se encontraron {totalResultados} resultado(s).
        </p>
      </div>

      {totalResultados === 0 ? (
        <div className="glass-panel" style={{
          padding: "60px 40px",
          textAlign: "center",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "20px"
        }}>
          <div style={{
            width: "64px",
            height: "64px",
            borderRadius: "50%",
            background: "rgba(239, 68, 68, 0.08)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--danger)",
            marginBottom: "8px"
          }}>
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
          {/* SECCIÓN 1: EXPEDIENTES COINCIDENTES */}
          {matchedExpedientes.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
              <h2 style={{ fontSize: "1.2rem", color: "var(--text-primary)", margin: 0 }}>
                📄 Expedientes Encontrados ({matchedExpedientes.length})
              </h2>
              <ExpedientesList expedientesIniciales={matchedExpedientes} userRole={userRole} />
            </div>
          )}

          {/* SECCIÓN 2: CLIENTES COINCIDENTES */}
          {matchedClientes.length > 0 && (
            <div className="glass-panel" style={{ padding: "24px", display: "flex", flexDirection: "column", gap: "20px" }}>
              <h2 style={{ fontSize: "1.2rem", color: "var(--text-primary)" }}>
                👤 Clientes Encontrados ({matchedClientes.length})
              </h2>
              <div className="table-container">
                <table className="table-premium">
                  <thead>
                    <tr>
                      <th>Nombre</th>
                      <th>DNI / NIE</th>
                      <th>Contacto</th>
                      <th>Historial</th>
                    </tr>
                  </thead>
                  <tbody>
                    {matchedClientes.map(c => (
                      <tr key={c.id}>
                        <td style={{ fontWeight: "bold", color: "var(--text-primary)" }}>{c.nombre}</td>
                        <td>{c.dni}</td>
                        <td>
                          <div style={{ fontSize: "0.85rem", display: "flex", flexDirection: "column", gap: "2px" }}>
                            {c.emails?.[0]?.email && <span>📧 {c.emails[0].email}</span>}
                            {c.telefonos?.[0]?.telefono && <span>📞 {c.telefonos[0].telefono}</span>}
                          </div>
                        </td>
                        <td>
                          <Link href="/dashboard/expedientes" style={{ fontSize: "0.85rem", color: "var(--primary)", textDecoration: "underline" }}>
                            Ver en expedientes
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
