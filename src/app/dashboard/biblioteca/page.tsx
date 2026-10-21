import { redirect } from "next/navigation";
import { esRolActivo } from "@/lib/auth/permisos";
import { getCurrentUser } from "@/lib/auth/sesion";
import BibliotecaClient from "./BibliotecaClient";

export const dynamic = "force-dynamic";

export default async function BibliotecaPage() {
  const user = await getCurrentUser();
  if (!user || !esRolActivo(user.rol)) redirect("/dashboard");
  return <BibliotecaClient />;
}
