import { redirect } from "next/navigation";
import { getSesionActual } from "@/lib/auth/sesion";
import Activar2fa from "./Activar2fa";

export const dynamic = "force-dynamic";

export default async function Activar2faPage() {
  const sesion = await getSesionActual();
  if (!sesion || sesion.usuario.bloqueado) redirect("/login");
  // Con el 2FA ya activo no hay nada que activar: se entra al panel o se pide el código en /login.
  if (sesion.usuario.totpActivo) redirect(sesion.mfaVerificado ? "/dashboard" : "/login");
  return <Activar2fa debeCambiarPassword={sesion.usuario.debeCambiarPassword} />;
}
