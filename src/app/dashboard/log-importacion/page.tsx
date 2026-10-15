import { redirect } from "next/navigation";
import { db } from "@/db";
import { esRolActivo } from "@/lib/auth/permisos";
import { getCurrentUser } from "@/lib/auth/sesion";
import { leerCatalogos } from "@/lib/servicios/catalogos";
import LogImportacionClient from "./LogImportacionClient";

export const dynamic = "force-dynamic";

export default async function LogImportacionPage() {
  const user = await getCurrentUser();
  if (!user || !esRolActivo(user.rol)) redirect("/dashboard");

  const c = await leerCatalogos(db);
  const modelosPorMarca: Record<number, { id: number; nombre: string }[]> = {};
  for (const m of c.modelos) {
    if (m.marca_id) (modelosPorMarca[m.marca_id] ??= []).push({ id: m.id_modelo, nombre: m.nombre_modelo });
  }

  return (
    <LogImportacionClient
      marcas={c.marcas.map((m) => ({ id: m.id_marca, nombre: m.nombre }))}
      modelosPorMarca={modelosPorMarca}
      tiposVenta={c.tiposVenta.map((t) => ({ id: t.id_tipo_de_venta, nombre: t.nombre_tipo_venta }))}
      estadosVehiculo={c.estados.map((e) => ({ id: e.id_estado_vehiculo, nombre: e.nombre_estado_vehiculo }))}
      tiendas={c.tiendas.map((t) => ({ id: t.id_tienda, nombre: t.nombre, ciudad: t.ciudad }))}
    />
  );
}
