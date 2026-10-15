import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { usuarios, clientes, emailsClientes, telefonosClientes, tiendas } from "@/db/schema";
import { eq, ilike, and } from "drizzle-orm";

export async function POST(req: NextRequest) {
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
    const { items } = body;

    if (!items || !Array.isArray(items)) {
      return NextResponse.json({ message: "Formato de datos inválido" }, { status: 400 });
    }

    let importedCount = 0;
    let skippedCount = 0;

    for (const item of items) {
      if (!item.nombre) {
        skippedCount++;
        continue;
      }

      // Resolver tienda por nombre si existe
      let tiendaId: number | null = null;
      if (item.tienda_nombre) {
        const tiendaFound = await db.query.tiendas.findFirst({
          where: ilike(tiendas.nombre, item.tienda_nombre),
        });
        if (tiendaFound) {
          tiendaId = tiendaFound.id_tienda;
        }
      }

      // Buscar cliente existente por DNI o nombre
      let clienteExistente = null;
      if (item.dni) {
        clienteExistente = await db.query.clientes.findFirst({
          where: eq(clientes.dni, item.dni),
        });
      }
      if (!clienteExistente && item.nombre) {
        clienteExistente = await db.query.clientes.findFirst({
          where: ilike(clientes.nombre, item.nombre),
        });
      }

      let idCliente: number;

      if (clienteExistente) {
        // Actualizar datos si han cambiado
        const updateData: any = {};
        if (item.dni && clienteExistente.dni !== item.dni) {
          updateData.dni = item.dni;
        }
        if (item.fecha_de_nacimiento && clienteExistente.fecha_de_nacimiento !== item.fecha_de_nacimiento) {
          updateData.fecha_de_nacimiento = item.fecha_de_nacimiento;
        }
        if (tiendaId !== null && clienteExistente.tienda_id !== tiendaId) {
          updateData.tienda_id = tiendaId;
        }
        if (Object.keys(updateData).length > 0) {
          await db.update(clientes).set(updateData).where(eq(clientes.id, clienteExistente.id));
        }
        idCliente = clienteExistente.id;
        skippedCount++;
      } else {
        // Crear nuevo cliente
        const [nuevoCliente] = await db.insert(clientes).values({
          cliente_id: crypto.randomUUID(),
          dni: item.dni || null,
          nombre: item.nombre,
          fecha_de_nacimiento: item.fecha_de_nacimiento || null,
          tienda_id: tiendaId,
        }).returning();
        idCliente = nuevoCliente.id;
        importedCount++;
      }

      // Sincronizar emails
      if (item.emails && item.emails.trim().length > 0) {
        await db.delete(emailsClientes).where(eq(emailsClientes.id_cliente, idCliente));
        const emailParts = item.emails.split("|");
        const emailValues = emailParts.map((p: string) => {
          const [email, tipo] = p.split(":");
          return {
            id_cliente: idCliente,
            email: email.trim(),
            tipo_email: tipo ? tipo.trim() : "Principal",
          };
        }).filter((e: any) => e.email.length > 0);
        if (emailValues.length > 0) {
          await db.insert(emailsClientes).values(emailValues);
        }
      }

      // Sincronizar teléfonos
      if (item.telefonos && item.telefonos.trim().length > 0) {
        await db.delete(telefonosClientes).where(eq(telefonosClientes.id_cliente, idCliente));
        const telParts = item.telefonos.split("|");
        const telValues = telParts.map((p: string) => {
          const [telefono, tipo] = p.split(":");
          return {
            id_cliente: idCliente,
            telefono: telefono.trim(),
            tipo_telefono: tipo ? tipo.trim() : "Principal",
          };
        }).filter((t: any) => t.telefono.length > 0);
        if (telValues.length > 0) {
          await db.insert(telefonosClientes).values(telValues);
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: `Importación completada: ${importedCount} cliente(s) nuevos creados, ${skippedCount} actualizado(s) o saltado(s).`,
    });

  } catch (error: any) {
    console.error("Error al importar clientes:", error);
    return NextResponse.json(
      { message: error.message || "Error interno al importar clientes" },
      { status: 500 }
    );
  }
}
