import { redirect } from "next/navigation";
import { db } from "@/db";
import { esAdministrador, esRolActivo } from "@/lib/auth/permisos";
import { getCurrentUser } from "@/lib/auth/sesion";
import { cargarDatosPanel } from "@/lib/servicios/panel";
import HerramientasClient from "./HerramientasClient";

export const dynamic = "force-dynamic";

export default async function HerramientasPage() {
  const user = await getCurrentUser();
  if (!user || !esRolActivo(user.rol)) redirect("/dashboard");
  const datos = await cargarDatosPanel(db);
  return <HerramientasClient marcas={datos.marcasAccesoRapido} tiposVenta={datos.tiposVenta} vendedores={datos.vendedores} idUsuario={user.idUsuario} esAdmin={esAdministrador(user.rol)} />;
}
