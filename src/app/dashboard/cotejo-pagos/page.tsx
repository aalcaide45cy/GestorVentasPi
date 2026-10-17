import { redirect } from "next/navigation";
import CotejoPagos from "@/components/cotejo/CotejoPagos";
import { BotonesDatosSeccion } from "@/components/datos/DatosSeccion";
import { esAdministrador, esRolActivo } from "@/lib/auth/permisos";
import { getCurrentUser } from "@/lib/auth/sesion";

export const dynamic = "force-dynamic";

export default async function CotejoPagosPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!esRolActivo(user.rol)) redirect("/dashboard");
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      {esAdministrador(user.rol) && (
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <BotonesDatosSeccion seccion="rejillas" />
        </div>
      )}
      <CotejoPagos />
    </div>
  );
}
