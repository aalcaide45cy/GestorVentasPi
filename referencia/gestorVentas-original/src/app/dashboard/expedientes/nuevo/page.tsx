import { syncUser } from "@/lib/auth-utils";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { marcas as marcasTable, modelos as modelosTable, tipoDeVenta as tipoVentaTable, estadoVehiculo as estadoVehiculoTable } from "@/db/schema";
import NuevoExpedienteForm from "@/components/NuevoExpedienteForm";

export default async function NuevoExpedientePage() {
  const user = await syncUser();

  // Bloquear acceso a invitados
  if (!user || user.rol === "invitado") {
    redirect("/dashboard");
  }

  // === SEMBRADO AUTOMÁTICO DE DATOS MAESTROS SI LA BD ESTÁ VACÍA ===
  let dbMarcas = await db.query.marcas.findMany();
  let dbTiposVenta = await db.query.tipoDeVenta.findMany();
  let dbEstadosVehiculo = await db.query.estadoVehiculo.findMany();

  // 1. Sembrar Marcas y Modelos
  if (dbMarcas.length === 0) {
    const marcasData = [
      { nombre: "Toyota", activo: true },
      { nombre: "Hyundai", activo: true },
      { nombre: "Peugeot", activo: true },
      { nombre: "Renault", activo: true }
    ];

    const creadas = await db.insert(marcasTable).values(marcasData).returning();
    
    // Sembrar Modelos por Marca
    const modelosData = [];
    for (const marca of creadas) {
      if (marca.nombre === "Toyota") {
        modelosData.push(
          { marca_id: marca.id_marca, nombre_modelo: "RAV4 Hybrid" },
          { marca_id: marca.id_marca, nombre_modelo: "Corolla" },
          { marca_id: marca.id_marca, nombre_modelo: "Yaris Cross" }
        );
      } else if (marca.nombre === "Hyundai") {
        modelosData.push(
          { marca_id: marca.id_marca, nombre_modelo: "Tucson" },
          { marca_id: marca.id_marca, nombre_modelo: "Kona EV" },
          { marca_id: marca.id_marca, nombre_modelo: "i30" }
        );
      } else if (marca.nombre === "Peugeot") {
        modelosData.push(
          { marca_id: marca.id_marca, nombre_modelo: "208" },
          { marca_id: marca.id_marca, nombre_modelo: "3008" },
          { marca_id: marca.id_marca, nombre_modelo: "5008" }
        );
      } else if (marca.nombre === "Renault") {
        modelosData.push(
          { marca_id: marca.id_marca, nombre_modelo: "Clio" },
          { marca_id: marca.id_marca, nombre_modelo: "Captur" },
          { marca_id: marca.id_marca, nombre_modelo: "Megane E-Tech" }
        );
      }
    }
    await db.insert(modelosTable).values(modelosData);
    dbMarcas = await db.query.marcas.findMany();
  }

  // 2. Sembrar Tipos de Venta
  if (dbTiposVenta.length === 0) {
    await db.insert(tipoVentaTable).values([
      { nombre_tipo_venta: "Contado" },
      { nombre_tipo_venta: "Financiación Crédito" },
      { nombre_tipo_venta: "Financiación Preference" }
    ]);
    dbTiposVenta = await db.query.tipoDeVenta.findMany();
  }

  // 3. Sembrar Estados de Vehículo
  if (dbEstadosVehiculo.length === 0) {
    await db.insert(estadoVehiculoTable).values([
      { nombre_estado_vehiculo: "Nuevo" },
      { nombre_estado_vehiculo: "Usado" },
      { nombre_estado_vehiculo: "Buyback" },
      { nombre_estado_vehiculo: "Demo" },
      { nombre_estado_vehiculo: "Seminuevo" },
      { nombre_estado_vehiculo: "KM0" }
    ]);
    dbEstadosVehiculo = await db.query.estadoVehiculo.findMany();
  }

  // Obtener modelos agrupados por marca para el selector
  const dbModelos = await db.query.modelos.findMany();
  
  // Transformar datos a formatos simples para el componente
  const marcasDropdown = dbMarcas.map(m => ({ id: m.id_marca, nombre: m.nombre }));
  const tiposVentaDropdown = dbTiposVenta.map(t => ({ id: t.id_tipo_de_venta, nombre: t.nombre_tipo_venta }));
  const estadosVehiculoDropdown = dbEstadosVehiculo.map(ev => ({ id: ev.id_estado_vehiculo, nombre: ev.nombre_estado_vehiculo }));

  // Agrupar modelos por marca ID
  const modelosPorMarca: Record<number, { id: number; nombre: string }[]> = {};
  dbModelos.forEach(m => {
    if (m.marca_id) {
      if (!modelosPorMarca[m.marca_id]) {
        modelosPorMarca[m.marca_id] = [];
      }
      modelosPorMarca[m.marca_id].push({ id: m.id_modelo, nombre: m.nombre_modelo });
    }
  });

  // Obtener tiendas asociadas al usuario
  const userFull = await db.query.usuarios.findFirst({
    where: (u, { eq }) => eq(u.id_usuario, user.id_usuario),
    with: {
      tiendas: {
        with: {
          tienda: true
        }
      }
    }
  });

  let userStores = userFull?.tiendas.map(ut => ({
    id: ut.tienda.id_tienda,
    nombre: ut.tienda.nombre,
    ciudad: ut.tienda.ciudad
  })) || [];

  // Si no tiene tiendas asignadas y es administrador/director, o si la lista está vacía,
  // traemos todas las tiendas como fallback.
  if (userStores.length === 0 || user.rol === "administrador" || user.rol === "director") {
    const allTiendas = await db.query.tiendas.findMany();
    userStores = allTiendas.map(t => ({
      id: t.id_tienda,
      nombre: t.nombre,
      ciudad: t.ciudad
    }));
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      <div>
        <h1 style={{ fontSize: "1.85rem", marginBottom: "8px" }}>Crear Nuevo Expediente de Venta</h1>
        <p style={{ color: "var(--text-secondary)" }}>
          Completa los datos del cliente, teléfonos/correos y especifica los detalles del vehículo y venta.
        </p>
      </div>

      <NuevoExpedienteForm
        marcas={marcasDropdown}
        modelosPorMarca={modelosPorMarca}
        tiposVenta={tiposVentaDropdown}
        estadosVehiculo={estadosVehiculoDropdown}
        tiendas={userStores}
      />
    </div>
  );
}
