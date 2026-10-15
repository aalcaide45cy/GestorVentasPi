import { syncUser } from "@/lib/auth-utils";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { desc } from "drizzle-orm";
import { 
  expedientes, 
  commissionPlans, 
  marcas, 
  modelos, 
  tiendas, 
  usuarios 
} from "@/db/schema";
import InformesDashboard from "@/components/informes/InformesDashboard";

export const dynamic = 'force-dynamic';

export default async function InformesPage() {
  const user = await syncUser();

  if (!user) {
    redirect("/sign-in");
  }

  // 1. Obtener todos los expedientes de la BBDD
  const dbExpedientes = await db.query.expedientes.findMany({
    orderBy: [desc(expedientes.id_expediente)],
    with: {
      cliente: true,
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

  // 2. Obtener planes de comisiones con sus tarifas y reglas
  const dbPlanes = await db.query.commissionPlans.findMany({
    with: {
      rates: true,
      rules: true,
      bonusRules: true,
      financeRules: true,
      brandInterventionRates: true,
      usedRates: true,
      financeRates: true,
      preferenceRules: true,
      voPatterns: true,
    }
  });

  // 3. Obtener catálogos
  const dbMarcas = await db.query.marcas.findMany();
  const dbModelos = await db.query.modelos.findMany();
  const dbTiendas = await db.query.tiendas.findMany();
  const dbUsuarios = await db.query.usuarios.findMany();

  return (
    <InformesDashboard 
      initialExpedientes={dbExpedientes}
      initialPlanes={dbPlanes}
      marcas={dbMarcas}
      modelos={dbModelos}
      tiendas={dbTiendas}
      usuarios={dbUsuarios}
      userRole={user.rol || "invitado"}
    />
  );
}
