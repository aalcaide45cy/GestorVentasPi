import { redirect } from "next/navigation";
import CalendarioClient from "@/components/calendario/CalendarioClient";
import { esRolActivo } from "@/lib/auth/permisos";
import { getCurrentUser } from "@/lib/auth/sesion";
import { db } from "@/db";
import { leerCatalogos } from "@/lib/servicios/catalogos";

export const dynamic = "force-dynamic";

export default async function CalendarioPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!esRolActivo(user.rol)) redirect("/dashboard");
  const c = await leerCatalogos(db);
  return <CalendarioClient sugerencias={{ tiposVenta: c.tiposVenta.map((t) => t.nombre_tipo_venta), estados: c.estados.map((e) => e.nombre_estado_vehiculo), marcas: c.marcas.map((m) => m.nombre) }} />;
}
