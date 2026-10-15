import { redirect } from "next/navigation";
import { asc } from "drizzle-orm";
import { db } from "@/db";
import { usuarios } from "@/db/schema";
import InformesDashboard from "@/components/InformesDashboard";
import { esRolActivo } from "@/lib/auth/permisos";
import { getCurrentUser } from "@/lib/auth/sesion";
import { leerCatalogos } from "@/lib/servicios/catalogos";

export const dynamic = "force-dynamic";

export default async function InformesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!esRolActivo(user.rol)) redirect("/dashboard");
  const catalogos = await leerCatalogos(db);
  const vendedores = await db.select({ id: usuarios.idUsuario, nombre: usuarios.nombre }).from(usuarios).orderBy(asc(usuarios.nombre));
  return (
    <InformesDashboard
      vendedores={vendedores.map((v) => ({ id: v.id, nombre: v.nombre ?? `Usuario ${v.id}` }))}
      marcas={catalogos.marcas.map((m) => ({ id: m.id_marca, nombre: m.nombre }))}
      puedeElegirVendedor={user.rol !== "vendedor"}
    />
  );
}
