import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/db";
import EditarExpedienteForm from "@/components/EditarExpedienteForm";
import { esRolActivo } from "@/lib/auth/permisos";
import { getCurrentUser } from "@/lib/auth/sesion";
import { leerCatalogos } from "@/lib/servicios/catalogos";
import { obtenerExpediente } from "@/lib/servicios/expedientes-lectura";
import { listarVendedores } from "@/lib/servicios/usuarios";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EditarExpedientePage({ params }: PageProps) {
  const user = await getCurrentUser();
  if (!user || !esRolActivo(user.rol)) redirect("/dashboard");

  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) redirect("/dashboard/expedientes");

  const expediente = await obtenerExpediente(db, id);
  if (!expediente) redirect("/dashboard/expedientes");

  const [catalogos, vendedores] = await Promise.all([leerCatalogos(db), listarVendedores(db)]);

  const modelosPorMarca: Record<number, { id: number; nombre: string }[]> = {};
  for (const m of catalogos.modelos) {
    if (m.marca_id) (modelosPorMarca[m.marca_id] ??= []).push({ id: m.id_modelo, nombre: m.nombre_modelo });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px", width: "100%", maxWidth: "1100px", margin: "0 auto" }}>
      <div>
        <h1 style={{ fontSize: "1.85rem", marginBottom: "8px" }}>Editar Expediente</h1>
        <p style={{ color: "var(--text-secondary)" }}>
          Modifica los datos del expediente #EXP-{String(expediente.id_expediente).padStart(4, "0")} y guarda los cambios.
        </p>
        {expediente.id_cliente && (
          <Link href={`/dashboard/clientes/${expediente.id_cliente}`} className="btn btn-secondary" title="Abre la ficha del cliente con todos sus expedientes" style={{ display: "inline-flex", alignItems: "center", gap: "6px", marginTop: "10px", padding: "6px 14px", fontSize: "0.85rem" }}>
            👤 Ver cliente{expediente.cliente?.nombre ? `: ${expediente.cliente.nombre}` : ""} y sus expedientes
          </Link>
        )}
      </div>

      <EditarExpedienteForm
        expediente={expediente}
        marcas={catalogos.marcas.map((m) => ({ id: m.id_marca, nombre: m.nombre }))}
        modelosPorMarca={modelosPorMarca}
        tiposVenta={catalogos.tiposVenta.map((t) => ({ id: t.id_tipo_de_venta, nombre: t.nombre_tipo_venta, requiereRci: t.requiere_rci_al_matricular }))}
        estadosVehiculo={catalogos.estados.map((e) => ({ id: e.id_estado_vehiculo, nombre: e.nombre_estado_vehiculo, clase: e.clase }))}
        tiendas={catalogos.tiendas.map((t) => ({ id: t.id_tienda, nombre: t.nombre, ciudad: t.ciudad }))}
        usuarios={vendedores.map((v) => ({ id: v.id_usuario, nombre: v.nombre }))}
      />
    </div>
  );
}
