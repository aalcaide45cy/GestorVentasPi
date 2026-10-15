import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/sesion";
import LoginForm from "./LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const usuario = await getCurrentUser();
  if (usuario) redirect("/dashboard");
  return <LoginForm />;
}
