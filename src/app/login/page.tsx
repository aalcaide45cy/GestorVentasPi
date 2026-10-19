import { redirect } from "next/navigation";
import { db } from "@/db";
import { getCurrentUser } from "@/lib/auth/sesion";
import { hayUsuarios } from "@/lib/servicios/primer-arranque";
import LoginForm from "./LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const usuario = await getCurrentUser();
  if (usuario) redirect("/dashboard");
  // Instalación nueva, sin ningún usuario: en vez del acceso, la pantalla para crear al administrador
  if (!(await hayUsuarios(db).catch(() => true))) redirect("/primer-arranque");
  return <LoginForm />;
}
