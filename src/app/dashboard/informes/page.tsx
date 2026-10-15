import { redirect } from "next/navigation";
import ProximamenteF4 from "@/components/ProximamenteF4";
import { getCurrentUser } from "@/lib/auth/sesion";

export const dynamic = "force-dynamic";

export default async function InformesPage() {
  if (!(await getCurrentUser())) redirect("/login");
  return <ProximamenteF4 titulo="📊 Detalle y Análisis Estadístico" descripcion="Cuadro de mando analítico en tiempo real del rendimiento de ventas, comisiones y ratios de penetración financiera." />;
}
