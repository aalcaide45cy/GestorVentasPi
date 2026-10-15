import { syncUser } from "@/lib/auth-utils";
import { redirect } from "next/navigation";
import { db } from "@/db";
import LogImportacionClient from "./LogImportacionClient";

export const dynamic = 'force-dynamic';

export default async function LogImportacionPage() {
  const user = await syncUser();

  if (!user || user.rol === "invitado") {
    redirect("/dashboard");
  }

  // Obtener catálogos para el modal de corrección
  const dbMarcas = await db.query.marcas.findMany({
    with: { modelos: true }
  });

  const dbTiposVenta = await db.query.tipoDeVenta.findMany();
  const dbEstadosVehiculo = await db.query.estadoVehiculo.findMany();
  const dbTiendas = await db.query.tiendas.findMany();

  const marcasMapeadas = dbMarcas.map(m => ({ id: m.id_marca, nombre: m.nombre }));
  const modelosPorMarca: Record<number, { id: number; nombre: string }[]> = {};
  dbMarcas.forEach(m => {
    modelosPorMarca[m.id_marca] = m.modelos.map(mod => ({ id: mod.id_modelo, nombre: mod.nombre_modelo }));
  });
  const tiposVentaMapeados = dbTiposVenta.map(t => ({ id: t.id_tipo_de_venta, nombre: t.nombre_tipo_venta }));
  const estadosVehiculoMapeados = dbEstadosVehiculo.map(ev => ({ id: ev.id_estado_vehiculo, nombre: ev.nombre_estado_vehiculo }));
  const tiendasMapeadas = dbTiendas.map(t => ({ id: t.id_tienda, nombre: t.nombre, ciudad: t.ciudad }));

  return (
    <LogImportacionClient
      marcas={marcasMapeadas}
      modelosPorMarca={modelosPorMarca}
      tiposVenta={tiposVentaMapeados}
      estadosVehiculo={estadosVehiculoMapeados}
      tiendas={tiendasMapeadas}
    />
  );
}
