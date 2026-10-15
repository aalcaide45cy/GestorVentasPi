import { syncUser } from "@/lib/auth-utils";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { eq } from "drizzle-orm";
import { expedientes } from "@/db/schema";
import EditarExpedienteForm from "@/components/EditarExpedienteForm";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EditarExpedientePage({ params }: PageProps) {
  const user = await syncUser();

  if (!user || user.rol === "invitado") {
    redirect("/dashboard");
  }

  const userRole = user.rol || undefined;

  const resolvedParams = await params;
  const idExpediente = Number(resolvedParams.id);
  if (isNaN(idExpediente)) {
    redirect("/dashboard/expedientes");
  }

  // Obtener el expediente con todas sus relaciones
  const dbExpediente = await db.query.expedientes.findFirst({
    where: eq(expedientes.id_expediente, idExpediente),
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
      }
    }
  });

  if (!dbExpediente) {
    redirect("/dashboard/expedientes");
  }

  // Obtener catálogos maestros
  const dbMarcas = await db.query.marcas.findMany({
    with: {
      modelos: true
    }
  });

  const dbTiposVenta = await db.query.tipoDeVenta.findMany();
  const dbEstadosVehiculo = await db.query.estadoVehiculo.findMany();
  const dbTiendas = await db.query.tiendas.findMany();

  // Mapeos de catálogos
  const marcasMapeadas = dbMarcas.map(m => ({
    id: m.id_marca,
    nombre: m.nombre
  }));

  const modelosPorMarca: Record<number, { id: number; nombre: string }[]> = {};
  dbMarcas.forEach(m => {
    modelosPorMarca[m.id_marca] = m.modelos.map(mod => ({
      id: mod.id_modelo,
      nombre: mod.nombre_modelo
    }));
  });

  const tiposVentaMapeados = dbTiposVenta.map(t => ({
    id: t.id_tipo_de_venta,
    nombre: t.nombre_tipo_venta
  }));

  const estadosVehiculoMapeados = dbEstadosVehiculo.map(ev => ({
    id: ev.id_estado_vehiculo,
    nombre: ev.nombre_estado_vehiculo
  }));

  const tiendasMapeadas = dbTiendas.map(t => ({
    id: t.id_tienda,
    nombre: t.nombre,
    ciudad: t.ciudad
  }));

  const dbUsuarios = await db.query.usuarios.findMany();

  const usuariosMapeados = dbUsuarios.map(u => ({
    id: u.id_usuario,
    nombre: u.nombre || `ID: ${u.id_usuario}`
  }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      <div>
        <h1 style={{ fontSize: "1.85rem", marginBottom: "8px" }}>Editar Expediente</h1>
        <p style={{ color: "var(--text-secondary)" }}>
          Modifica los datos del expediente #EXP-{String(dbExpediente.id_expediente).padStart(4, "0")} y guarda los cambios.
        </p>
      </div>

      <EditarExpedienteForm
        expediente={dbExpediente}
        marcas={marcasMapeadas}
        modelosPorMarca={modelosPorMarca}
        tiposVenta={tiposVentaMapeados}
        estadosVehiculo={estadosVehiculoMapeados}
        tiendas={tiendasMapeadas}
        userRole={userRole}
        usuarios={usuariosMapeados}
      />
    </div>
  );
}
