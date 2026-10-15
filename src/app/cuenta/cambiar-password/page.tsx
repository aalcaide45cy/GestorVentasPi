import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/sesion";
import CambiarPassword from "./CambiarPassword";

export const dynamic = "force-dynamic";

export default async function CambiarPasswordPage() {
  const usuario = await getCurrentUser();
  if (!usuario) redirect("/login");
  if (!usuario.totpActivo) redirect("/cuenta/activar-2fa");
  return <CambiarPassword obligatorio={usuario.debeCambiarPassword} />;
}
