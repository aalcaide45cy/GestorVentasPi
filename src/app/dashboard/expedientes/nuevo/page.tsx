import { redirect } from "next/navigation";
import { db } from "@/db";
import NuevoExpedienteForm from "@/components/NuevoExpedienteForm";
import { esRolActivo, veTodasLasTiendas } from "@/lib/auth/permisos";
import { getCurrentUser } from "@/lib/auth/sesion";
import { leerCatalogos } from "@/lib/servicios/catalogos";
import { obtenerUsuario } from "@/lib/servicios/usuarios";

export const dynamic = "force-dynamic";

export default async function NuevoExpedientePage() {
  const user = await getCurrentUser();
  if (!user || !esRolActivo(user.rol)) redirect("/dashboard");

  const [catalogos, usuario] = await Promise.all([leerCatalogos(db), obtenerUsuario(db, user.idUsuario)]);

  const modelosPorMarca: Record<number, { id: number; nombre: string }[]> = {};
  for (const m of catalogos.modelos) {
    if (m.marca_id) (modelosPorMarca[m.marca_id] ??= []).push({ id: m.id_modelo, nombre: m.nombre_modelo });
  }

  // Tiendas del usuario; administradores, directores o usuarios sin tiendas asignadas ven todas
  const propias = catalogos.tiendas.filter((t) => usuario?.tiendas.includes(t.id_tienda));
  const tiendas = propias.length === 0 || veTodasLasTiendas(user.rol) ? catalogos.tiendas : propias;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      <div>
        <h1 style={{ fontSize: "1.85rem", marginBottom: "8px" }}>Crear Nuevo Expediente de Venta</h1>
        <p style={{ color: "var(--text-secondary)" }}>
          Completa los datos del cliente, teléfonos/correos y especifica los detalles del vehículo y venta.
        </p>
      </div>

      <NuevoExpedienteForm
        marcas={catalogos.marcas.map((m) => ({ id: m.id_marca, nombre: m.nombre }))}
        modelosPorMarca={modelosPorMarca}
        tiposVenta={catalogos.tiposVenta.map((t) => ({ id: t.id_tipo_de_venta, nombre: t.nombre_tipo_venta, requiereRci: t.requiere_rci_al_matricular }))}
        estadosVehiculo={catalogos.estados.map((e) => ({ id: e.id_estado_vehiculo, nombre: e.nombre_estado_vehiculo, clase: e.clase }))}
        tiendas={tiendas.map((t) => ({ id: t.id_tienda, nombre: t.nombre, ciudad: t.ciudad }))}
      />
    </div>
  );
}
