import { redirect } from "next/navigation";
import CorreoClient from "@/components/correo/CorreoClient";
import { esAdministrador, esRolActivo } from "@/lib/auth/permisos";
import { getCurrentUser } from "@/lib/auth/sesion";

export const dynamic = "force-dynamic";

export default async function CorreoPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!esRolActivo(user.rol)) redirect("/dashboard");
  return <CorreoClient esAdmin={esAdministrador(user.rol)} />;
}
