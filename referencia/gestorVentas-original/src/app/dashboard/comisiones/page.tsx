import { syncUser } from "@/lib/auth-utils";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { desc } from "drizzle-orm";
import { commissionPlans } from "@/db/schema";
import ComisionesManager from "@/components/comisiones/ComisionesManager";

export default async function ComisionesPage() {
  const user = await syncUser();

  if (!user) {
    redirect("/sign-in");
  }

  // 1. Obtener todos los planes con sus liquidaciones
  const planes = await db.query.commissionPlans.findMany({
    orderBy: [desc(commissionPlans.fecha_inicio)],
    with: {
      liquidations: true
    }
  });

  // 2. Obtener todas las marcas
  const dbMarcas = await db.query.marcas.findMany();

  // 3. Obtener todos los modelos
  const dbModelos = await db.query.modelos.findMany();

  // 4. Mapear marcas y modelos a los tipos esperados por ComisionesManager
  const marcasMapped = dbMarcas.map((m) => ({
    id: m.id_marca,
    nombre: m.nombre,
    sistema_comisiones: m.sistema_comisiones,
  }));

  const modelosMapped = dbModelos.map((m) => ({
    id: m.id_modelo,
    nombre: m.nombre_modelo,
    marca_id: m.marca_id || 0,
  }));

  const isAdmin = user.rol === "administrador";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "32px" }}>
      <ComisionesManager
        initialPlanes={planes}
        marcas={marcasMapped}
        modelos={modelosMapped}
        isAdmin={isAdmin}
      />
    </div>
  );
}
