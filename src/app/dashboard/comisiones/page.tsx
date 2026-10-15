import { redirect } from "next/navigation";
import ProximamenteF4 from "@/components/ProximamenteF4";
import { getCurrentUser } from "@/lib/auth/sesion";

export const dynamic = "force-dynamic";

export default async function ComisionesPage() {
  if (!(await getCurrentUser())) redirect("/login");
  return <ProximamenteF4 titulo="Planes de Comisionamiento" descripcion="Configura periodos mensuales, tramos de objetivos y calcula las liquidaciones de los vendedores." />;
}
