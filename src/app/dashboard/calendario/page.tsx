import { redirect } from "next/navigation";
import CalendarioClient from "@/components/calendario/CalendarioClient";
import { esRolActivo } from "@/lib/auth/permisos";
import { getCurrentUser } from "@/lib/auth/sesion";

export const dynamic = "force-dynamic";

export default async function CalendarioPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!esRolActivo(user.rol)) redirect("/dashboard");
  return <CalendarioClient />;
}
