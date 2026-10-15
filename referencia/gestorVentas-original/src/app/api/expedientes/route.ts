import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { usuarios, clientes, emailsClientes, telefonosClientes, expedientes, usuariosTiendas, estadoVehiculo, commissionPlans, commissionPlanModelRates, modelos, commissionBrandInterventionRates } from "@/db/schema";
import { eq, ilike, inArray, and, lte, gte, lt } from "drizzle-orm";

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ message: "No autorizado" }, { status: 401 });
    }

    const url = new URL(req.url);
    const id = url.searchParams.get("id");

    if (!id) {
      return NextResponse.json({ message: "Falta el ID del expediente" }, { status: 400 });
    }

    const exp = await db.query.expedientes.findFirst({
      where: eq(expedientes.id_expediente, Number(id)),
      with: {
        cliente: true,
        modelo: true,
        tipoDeVenta: true,
        estadoVehiculo: true,
        usuario: true
      }
    });

    if (!exp) {
      return NextResponse.json({ message: "Expediente no encontrado" }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: exp });
  } catch (error: any) {
    console.error("Error al obtener expediente:", error);
    return NextResponse.json({ message: error.message || "Error interno" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ message: "No autorizado" }, { status: 401 });
    }

    // 1. Obtener los datos del body
    const body = await req.json();
    const { cliente: clienteData, expediente: expedienteData } = body;

    if (!expedienteData) {
      return NextResponse.json({ message: "Faltan datos del expediente" }, { status: 400 });
    }

    // 2. Obtener el id_usuario local a partir del clerk_id
    const localUser = await db.query.usuarios.findFirst({
      where: eq(usuarios.clerk_id, userId),
    });

    if (!localUser) {
      return NextResponse.json({ message: "Usuario local no encontrado" }, { status: 404 });
    }

    // Bloquear si es Invitado
    if (localUser.rol === "invitado") {
      return NextResponse.json({ message: "Los invitados no tienen permiso para crear expedientes" }, { status: 403 });
    }

    // 3. Ejecutar secuencialmente para insertar cliente, emails, teléfonos si se proporciona cliente
    let clienteId: number | null = null;

    if (clienteData && clienteData.nombre) {
      if (clienteData.id) {
        clienteId = Number(clienteData.id);
        // Actualizar datos básicos si cambian
        await db.update(clientes).set({
          dni: clienteData.dni || null,
          nombre: clienteData.nombre,
          fecha_de_nacimiento: clienteData.fecha_de_nacimiento || null,
          tienda_id: clienteData.tienda_id || null,
        }).where(eq(clientes.id, clienteId));
      } else {
        // Verificar si el cliente ya existe por DNI (si se proporciona)
        let clienteExistente = null;
        if (clienteData.dni) {
          clienteExistente = await db.query.clientes.findFirst({
            where: eq(clientes.dni, clienteData.dni),
          });
        }

        if (clienteExistente) {
          clienteId = clienteExistente.id;
        } else {
        // Crear nuevo cliente
        const [nuevoCliente] = await db.insert(clientes).values({
          cliente_id: crypto.randomUUID(),
          dni: clienteData.dni || null,
          nombre: clienteData.nombre,
          fecha_de_nacimiento: clienteData.fecha_de_nacimiento || null,
          tienda_id: clienteData.tienda_id || null,
        }).returning();

        clienteId = nuevoCliente.id;

        // Insertar emails del cliente
        if (clienteData.emails && clienteData.emails.length > 0) {
          await db.insert(emailsClientes).values(
            clienteData.emails.map((e: any) => ({
              id_cliente: clienteId,
              email: e.email,
              tipo_email: e.tipo_email || "Principal",
            }))
          );
        }

        // Insertar teléfonos del cliente
        if (clienteData.telefonos && clienteData.telefonos.length > 0) {
          await db.insert(telefonosClientes).values(
            clienteData.telefonos.map((t: any) => ({
              id_cliente: clienteId,
              telefono: t.telefono,
              tipo_telefono: t.tipo_telefono || "Principal",
            }))
          );
        }
      }
    }
  }

    // Determinar tienda
    let tiendaId = expedienteData.id_tienda;
    if (!tiendaId) {
      const userShops = await db.query.usuariosTiendas.findMany({
        where: eq(usuariosTiendas.id_usuario, localUser.id_usuario),
      });
      if (userShops.length === 1) {
        tiendaId = userShops[0].id_tienda;
      }
    }

    // Determinar fecha
    const fechaExp = expedienteData.fecha_expediente || new Date().toISOString().split('T')[0];

    // Determinar Estado del Vehículo
    let estadoVehiculoId = expedienteData.id_estado_vehiculo || null;
    if (!estadoVehiculoId) {
      if (expedienteData.estado_nombre === "usado") {
        const dbEstadoUsado = await db.query.estadoVehiculo.findFirst({
          where: ilike(estadoVehiculo.nombre_estado_vehiculo, "usado")
        });
        if (dbEstadoUsado) {
          estadoVehiculoId = dbEstadoUsado.id_estado_vehiculo;
        }
      } else {
        const defaultState = await db.query.estadoVehiculo.findFirst({
          where: eq(estadoVehiculo.predeterminado, true)
        });
        if (defaultState) {
          estadoVehiculoId = defaultState.id_estado_vehiculo;
        }
      }
    }

    // Determinar valor_objetivo por defecto y min_coches_multiplicador de la tasa del plan activo
    let defaultValorObjetivo = 1;
    let defaultMinCochesMultiplicador = 0;
    
    if (expedienteData.id_modelo) {
      let activePlan = await db.query.commissionPlans.findFirst({
        where: and(
          eq(commissionPlans.estado, "activo"),
          lte(commissionPlans.fecha_inicio, fechaExp),
          gte(commissionPlans.fecha_fin, fechaExp)
        ),
      });

      if (!activePlan) {
        activePlan = await db.query.commissionPlans.findFirst({
          where: and(
            lte(commissionPlans.fecha_inicio, fechaExp),
            gte(commissionPlans.fecha_fin, fechaExp)
          ),
        });
      }

      if (activePlan) {
        defaultMinCochesMultiplicador = activePlan.min_coches_multiplicador || 0;
        
        const modelObj = await db.query.modelos.findFirst({
          where: eq(modelos.id_modelo, expedienteData.id_modelo)
        });
        
        if (modelObj?.marca_id) {
          const brandIntervention = await db.query.commissionBrandInterventionRates.findFirst({
            where: and(
              eq(commissionBrandInterventionRates.id_plan, activePlan.id_plan),
              eq(commissionBrandInterventionRates.id_marca, modelObj.marca_id)
            )
          });
          if (brandIntervention && brandIntervention.valor_objetivo_defecto !== undefined && brandIntervention.valor_objetivo_defecto !== null) {
            defaultValorObjetivo = Number(brandIntervention.valor_objetivo_defecto);
          }
        }
      }
    }

    const valorObjetivoToSave = (expedienteData.valor_objetivo !== undefined && expedienteData.valor_objetivo !== null)
      ? Number(expedienteData.valor_objetivo)
      : defaultValorObjetivo;

    const minCochesMultiplicadorToSave = (expedienteData.min_coches_multiplicador !== undefined && expedienteData.min_coches_multiplicador !== null)
      ? Number(expedienteData.min_coches_multiplicador)
      : defaultMinCochesMultiplicador;

    // Crear el expediente
    const [nuevoExpediente] = await db.insert(expedientes).values({
      id_usuario: expedienteData.id_usuario || localUser.id_usuario,
      id_cliente: clienteId,
      id_modelo: expedienteData.id_modelo || null,
      id_tienda: tiendaId || null,
      fecha_expediente: fechaExp,
      fecha_afectacion: expedienteData.fecha_afectacion || null,
      fecha_matriculacion: expedienteData.fecha_matriculacion || null,
      fecha_entrega: expedienteData.fecha_entrega || null,
      fecha_rci: expedienteData.fecha_rci || null,
      fecha_facturacion: expedienteData.fecha_facturacion || null,
      matricula: expedienteData.matricula || null,
      vin: expedienteData.vin || null,
      id_tipo_de_venta: expedienteData.id_tipo_de_venta || null,
      id_estado_vehiculo: estadoVehiculoId,
      valor_objetivo: valorObjetivoToSave,
      min_coches_multiplicador: minCochesMultiplicadorToSave,
      cobrado_otra_fecha: !!expedienteData.cobrado_otra_fecha,
      fecha_cobrado: expedienteData.fecha_cobrado || null,
    }).returning();

    return NextResponse.json({ success: true, data: nuevoExpediente }, { status: 201 });
  } catch (error: any) {
    console.error("Error al guardar expediente transaccional:", error);
    return NextResponse.json({ message: error.message || "Error interno del servidor" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ message: "No autorizado" }, { status: 401 });
    }

    const localUser = await db.query.usuarios.findFirst({
      where: eq(usuarios.clerk_id, userId),
    });

    if (!localUser || localUser.rol === "invitado") {
      return NextResponse.json({ message: "No autorizado" }, { status: 403 });
    }

    const body = await req.json();
    const { id_expediente, expediente: expedienteData, id_cliente, isBulk, mes, año, tipoFecha, min_coches_multiplicador, isBulkEdit, ids } = body;

    if (isBulkEdit) {
      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return NextResponse.json({ message: "Faltan los IDs para actualizar en masa" }, { status: 400 });
      }

      const updateData: any = {};

      if (expedienteData.id_modelo !== undefined && expedienteData.id_modelo !== "") {
        updateData.id_modelo = Number(expedienteData.id_modelo);
      }
      if (expedienteData.id_tipo_de_venta !== undefined && expedienteData.id_tipo_de_venta !== "") {
        updateData.id_tipo_de_venta = Number(expedienteData.id_tipo_de_venta);
      }
      if (expedienteData.id_usuario !== undefined && expedienteData.id_usuario !== "") {
        updateData.id_usuario = Number(expedienteData.id_usuario);
      }
      if (expedienteData.fecha_expediente !== undefined && expedienteData.fecha_expediente !== "") {
        updateData.fecha_expediente = expedienteData.fecha_expediente;
      }
      if (expedienteData.fecha_afectacion !== undefined && expedienteData.fecha_afectacion !== "") {
        updateData.fecha_afectacion = expedienteData.fecha_afectacion === "" ? null : expedienteData.fecha_afectacion;
      }
      if (expedienteData.fecha_rci !== undefined && expedienteData.fecha_rci !== "") {
        updateData.fecha_rci = expedienteData.fecha_rci === "" ? null : expedienteData.fecha_rci;
      }
      if (expedienteData.fecha_matriculacion !== undefined && expedienteData.fecha_matriculacion !== "") {
        updateData.fecha_matriculacion = expedienteData.fecha_matriculacion === "" ? null : expedienteData.fecha_matriculacion;
      }
      if (expedienteData.fecha_entrega !== undefined && expedienteData.fecha_entrega !== "") {
        updateData.fecha_entrega = expedienteData.fecha_entrega === "" ? null : expedienteData.fecha_entrega;
      }
      if (expedienteData.fecha_facturacion !== undefined && expedienteData.fecha_facturacion !== "") {
        updateData.fecha_facturacion = expedienteData.fecha_facturacion === "" ? null : expedienteData.fecha_facturacion;
      }

      if (Object.keys(updateData).length === 0) {
        return NextResponse.json({ message: "No se seleccionaron datos para modificar" }, { status: 400 });
      }

      await db.update(expedientes)
        .set(updateData)
        .where(inArray(expedientes.id_expediente, ids));

      return NextResponse.json({ success: true, message: `${ids.length} expedientes actualizados correctamente` }, { status: 200 });
    }

    if (isBulk) {
      if (!mes || !año || !tipoFecha || min_coches_multiplicador === undefined) {
        return NextResponse.json({ message: "Faltan parámetros requeridos para la actualización masiva" }, { status: 400 });
      }

      const mesNum = Number(mes);
      const añoNum = Number(año);

      const startDate = `${añoNum}-${String(mesNum).padStart(2, "0")}-01`;
      let nextMes = mesNum + 1;
      let nextAño = añoNum;
      if (nextMes > 12) {
        nextMes = 1;
        nextAño = añoNum + 1;
      }
      const endDate = `${nextAño}-${String(nextMes).padStart(2, "0")}-01`;

      let columnField;
      switch (tipoFecha) {
        case "fecha_afectacion":
          columnField = expedientes.fecha_afectacion;
          break;
        case "fecha_matriculacion":
          columnField = expedientes.fecha_matriculacion;
          break;
        case "fecha_entrega":
          columnField = expedientes.fecha_entrega;
          break;
        case "fecha_rci":
          columnField = expedientes.fecha_rci;
          break;
        default:
          columnField = expedientes.fecha_expediente;
      }

      await db.update(expedientes)
        .set({ min_coches_multiplicador: Number(min_coches_multiplicador) })
        .where(
          and(
            gte(columnField, startDate),
            lt(columnField, endDate)
          )
        );

      return NextResponse.json({ success: true, message: "Expedientes actualizados en lote correctamente" }, { status: 200 });
    }

    if (!id_expediente || !expedienteData) {
      return NextResponse.json({ message: "Faltan datos obligatorios para actualizar" }, { status: 400 });
    }

    // Actualizar expediente
    await db.update(expedientes).set({
      id_usuario: expedienteData.id_usuario !== undefined
        ? (expedienteData.id_usuario ? Number(expedienteData.id_usuario) : null)
        : undefined,
      id_modelo: expedienteData.id_modelo !== undefined ? expedienteData.id_modelo : undefined,
      id_tipo_de_venta: expedienteData.id_tipo_de_venta !== undefined ? expedienteData.id_tipo_de_venta : undefined,
      id_estado_vehiculo: expedienteData.id_estado_vehiculo !== undefined ? expedienteData.id_estado_vehiculo : undefined,
      id_tienda: expedienteData.id_tienda !== undefined ? expedienteData.id_tienda : undefined,
      fecha_expediente: expedienteData.fecha_expediente !== undefined ? expedienteData.fecha_expediente : undefined,
      fecha_afectacion: expedienteData.fecha_afectacion !== undefined ? expedienteData.fecha_afectacion : undefined,
      fecha_matriculacion: expedienteData.fecha_matriculacion !== undefined ? expedienteData.fecha_matriculacion : undefined,
      fecha_entrega: expedienteData.fecha_entrega !== undefined ? expedienteData.fecha_entrega : undefined,
      fecha_rci: expedienteData.fecha_rci !== undefined ? expedienteData.fecha_rci : undefined,
      fecha_facturacion: expedienteData.fecha_facturacion !== undefined ? (expedienteData.fecha_facturacion === "" ? null : expedienteData.fecha_facturacion) : undefined,
      matricula: expedienteData.matricula !== undefined ? expedienteData.matricula : undefined,
      vin: expedienteData.vin !== undefined ? expedienteData.vin : undefined,
      id_cliente: id_cliente !== undefined ? id_cliente : undefined,
      valor_objetivo: expedienteData.valor_objetivo !== undefined ? (expedienteData.valor_objetivo !== null ? Number(expedienteData.valor_objetivo) : null) : undefined,
      min_coches_multiplicador: expedienteData.min_coches_multiplicador !== undefined ? (expedienteData.min_coches_multiplicador !== null ? Number(expedienteData.min_coches_multiplicador) : 0) : undefined,
      cobrado_otra_fecha: expedienteData.cobrado_otra_fecha !== undefined ? expedienteData.cobrado_otra_fecha : undefined,
      fecha_cobrado: expedienteData.fecha_cobrado !== undefined ? (expedienteData.fecha_cobrado === "" ? null : expedienteData.fecha_cobrado) : undefined,
      comision_cobrada: expedienteData.comision_cobrada !== undefined ? expedienteData.comision_cobrada : undefined,
      comision_coche_cobrada: expedienteData.comision_coche_cobrada !== undefined ? expedienteData.comision_coche_cobrada : undefined,
      comision_usado_cobrada: expedienteData.comision_usado_cobrada !== undefined ? expedienteData.comision_usado_cobrada : undefined,
      comision_financiacion_cobrada: expedienteData.comision_financiacion_cobrada !== undefined ? expedienteData.comision_financiacion_cobrada : undefined,
      comision_preference_cobrada: expedienteData.comision_preference_cobrada !== undefined ? expedienteData.comision_preference_cobrada : undefined,
      comision_bonus_cobrada: expedienteData.comision_bonus_cobrada !== undefined ? expedienteData.comision_bonus_cobrada : undefined,
      comision_coche_real: expedienteData.comision_coche_real !== undefined ? (expedienteData.comision_coche_real !== null ? Number(expedienteData.comision_coche_real) : null) : undefined,
      comision_financiacion_real: expedienteData.comision_financiacion_real !== undefined ? (expedienteData.comision_financiacion_real !== null ? Number(expedienteData.comision_financiacion_real) : null) : undefined,
      conceptos_adicionales: expedienteData.conceptos_adicionales !== undefined ? expedienteData.conceptos_adicionales : undefined,
    }).where(eq(expedientes.id_expediente, id_expediente));

    return NextResponse.json({ success: true, message: "Expediente actualizado correctamente" }, { status: 200 });
  } catch (error: any) {
    console.error("Error al actualizar expediente:", error);
    return NextResponse.json({ message: error.message || "Error interno del servidor" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ message: "No autorizado" }, { status: 401 });
    }

    const localUser = await db.query.usuarios.findFirst({
      where: eq(usuarios.clerk_id, userId),
    });

    if (!localUser || localUser.rol === "invitado") {
      return NextResponse.json({ message: "No autorizado" }, { status: 403 });
    }

    const url = new URL(req.url);
    const id = url.searchParams.get("id");

    if (id) {
      await db.delete(expedientes).where(eq(expedientes.id_expediente, Number(id)));
      return NextResponse.json({ success: true, message: "Expediente eliminado correctamente" }, { status: 200 });
    }

    // Si no viene ID por query string, buscar IDs en el body para borrado masivo
    try {
      const body = await req.json();
      const { ids } = body;
      if (ids && Array.isArray(ids) && ids.length > 0) {
        await db.delete(expedientes).where(inArray(expedientes.id_expediente, ids));
        return NextResponse.json({ success: true, message: `${ids.length} expedientes eliminados correctamente` }, { status: 200 });
      }
    } catch (e) {
      // Ignorar error al leer JSON si se envió una petición sin body
    }

    return NextResponse.json({ message: "Falta el ID del expediente a eliminar" }, { status: 400 });
  } catch (error: any) {
    console.error("Error al eliminar expediente:", error);
    return NextResponse.json({ message: error.message || "Error interno del servidor" }, { status: 500 });
  }
}
