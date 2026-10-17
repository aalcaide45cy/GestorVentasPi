import { redirect } from "next/navigation";
import { db } from "@/db";
import CotejoPagos from "@/components/cotejo/CotejoPagos";
import MiMes from "@/components/cotejo/MiMes";
import { BotonesDatosSeccion } from "@/components/datos/DatosSeccion";
import { esAdministrador, esRolActivo } from "@/lib/auth/permisos";
import { getCurrentUser } from "@/lib/auth/sesion";
import { LIMITE_LISTA_EXPEDIENTES, listarExpedientes } from "@/lib/servicios/expedientes-lectura";
import { listarVendedores } from "@/lib/servicios/usuarios";

export const dynamic = "force-dynamic";

export default async function CotejoPagosPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!esRolActivo(user.rol)) redirect("/dashboard");
  const [expedientes, vendedores] = await Promise.all([listarExpedientes(db, { limite: LIMITE_LISTA_EXPEDIENTES }), listarVendedores(db)]);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      {esAdministrador(user.rol) && (
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <BotonesDatosSeccion seccion="rejillas" />
        </div>
      )}
      <MiMes expedientes={expedientes} vendedores={vendedores.map((v) => v.nombre)} nombreActual={user.nombre ?? ""} esAdministrador={esAdministrador(user.rol)} />
      <CotejoPagos />
    </div>
  );
}
