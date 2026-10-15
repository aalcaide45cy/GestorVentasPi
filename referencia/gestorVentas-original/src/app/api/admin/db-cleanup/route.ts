import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { sql, eq, inArray } from "drizzle-orm";
import {
  usuarios,
  clientes,
  emailsClientes,
  telefonosClientes,
  expedientes,
  tiendas,
  usuariosTiendas,
  commissionLiquidationLines,
  importacionesRegistros,
  importacionesBloques
} from "@/db/schema";

export const dynamic = 'force-dynamic';

// GET: Analizar anomalías y registros huérfanos
export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ message: "No autorizado" }, { status: 401 });
    }

    const localUser = await db.query.usuarios.findFirst({
      where: eq(usuarios.clerk_id, userId),
    });

    if (!localUser || localUser.rol !== "administrador") {
      return NextResponse.json({ message: "No autorizado" }, { status: 403 });
    }

    // 1. Obtener IDs válidos para verificación
    const dbExpedientes = await db.select({ id: expedientes.id_expediente }).from(expedientes);
    const validExpIds = new Set(dbExpedientes.map((e) => e.id));

    const dbClientes = await db.select({ id: clientes.id }).from(clientes);
    const validClientIds = new Set(dbClientes.map((c) => c.id));

    const dbUsuarios = await db.select({ id: usuarios.id_usuario }).from(usuarios);
    const validUserIds = new Set(dbUsuarios.map((u) => u.id));

    const dbTiendas = await db.select({ id: tiendas.id_tienda }).from(tiendas);
    const validTiendaIds = new Set(dbTiendas.map((t) => t.id));

    const dbImportacionesBloques = await db.select({ id: importacionesBloques.id }).from(importacionesBloques);
    const validBlockIds = new Set(dbImportacionesBloques.map((b) => b.id));

    // 2. Líneas de liquidación huérfanas o sin expediente asociado
    const allLines = await db.select({
      id_line: commissionLiquidationLines.id_line,
      id_expediente: commissionLiquidationLines.id_expediente,
      vendedor_nombre: commissionLiquidationLines.vendedor_nombre,
      cliente_nombre: commissionLiquidationLines.cliente_nombre,
      modelo_nombre: commissionLiquidationLines.modelo_nombre,
      total_generado: commissionLiquidationLines.total_generado
    }).from(commissionLiquidationLines);

    const orphanLines = allLines.filter(
      (l) => l.id_expediente === null || !validExpIds.has(l.id_expediente)
    );

    // 3. Emails de clientes huérfanos
    const allClientEmails = await db.select({
      id: emailsClientes.id_email_cliente,
      id_cliente: emailsClientes.id_cliente,
      email: emailsClientes.email
    }).from(emailsClientes);

    const orphanEmails = allClientEmails.filter(
      (e) => e.id_cliente === null || !validClientIds.has(e.id_cliente)
    );

    // 4. Teléfonos de clientes huérfanos
    const allClientTelefonos = await db.select({
      id: telefonosClientes.id_telefono_cliente,
      id_cliente: telefonosClientes.id_cliente,
      telefono: telefonosClientes.telefono
    }).from(telefonosClientes);

    const orphanTelefonos = allClientTelefonos.filter(
      (t) => t.id_cliente === null || !validClientIds.has(t.id_cliente)
    );

    // 5. Relaciones tiendas-usuarios huérfanas
    const allUserTiendas = await db.select({
      id: usuariosTiendas.id_usuario_tienda,
      id_usuario: usuariosTiendas.id_usuario,
      id_tienda: usuariosTiendas.id_tienda
    }).from(usuariosTiendas);

    const orphanUserTiendas = allUserTiendas.filter(
      (ut) => !validUserIds.has(ut.id_usuario) || !validTiendaIds.has(ut.id_tienda)
    );

    // 6. Registros de importación huérfanos
    const allImportRegistros = await db.select({
      id: importacionesRegistros.id,
      bloque_id: importacionesRegistros.bloque_id,
      id_expediente: importacionesRegistros.id_expediente,
      cliente_nombre: importacionesRegistros.cliente_nombre
    }).from(importacionesRegistros);

    const orphanImportRegistros = allImportRegistros.filter(
      (ir) =>
        (ir.bloque_id === null || !validBlockIds.has(ir.bloque_id)) ||
        (ir.id_expediente !== null && !validExpIds.has(ir.id_expediente))
    );

    return NextResponse.json({
      success: true,
      stats: {
        orphanLinesCount: orphanLines.length,
        orphanEmailsCount: orphanEmails.length,
        orphanTelefonosCount: orphanTelefonos.length,
        orphanUserTiendasCount: orphanUserTiendas.length,
        orphanImportRegistrosCount: orphanImportRegistros.length,
        totalAnomalies:
          orphanLines.length +
          orphanEmails.length +
          orphanTelefonos.length +
          orphanUserTiendas.length +
          orphanImportRegistros.length
      },
      details: {
        orphanLines,
        orphanEmails,
        orphanTelefonos,
        orphanUserTiendas,
        orphanImportRegistros
      }
    }, { status: 200 });

  } catch (error: any) {
    console.error("Error al analizar base de datos:", error);
    return NextResponse.json({ message: error.message || "Error interno del servidor" }, { status: 500 });
  }
}

// POST: Ejecutar la limpieza segura de los registros huérfanos
export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ message: "No autorizado" }, { status: 401 });
    }

    const localUser = await db.query.usuarios.findFirst({
      where: eq(usuarios.clerk_id, userId),
    });

    if (!localUser || localUser.rol !== "administrador") {
      return NextResponse.json({ message: "No autorizado" }, { status: 403 });
    }

    const body = await req.json();
    const { cleanLines, cleanEmails, cleanTelefonos, cleanUserTiendas, cleanImportRegistros } = body;

    const cleaned: Record<string, number> = {
      lines: 0,
      emails: 0,
      telefonos: 0,
      userTiendas: 0,
      importRegistros: 0
    };

    // 1. Limpiar líneas de liquidación
    if (cleanLines && Array.isArray(cleanLines) && cleanLines.length > 0) {
      await db.delete(commissionLiquidationLines).where(
        inArray(commissionLiquidationLines.id_line, cleanLines)
      );
      cleaned.lines = cleanLines.length;
    }

    // 2. Limpiar emails de clientes
    if (cleanEmails && Array.isArray(cleanEmails) && cleanEmails.length > 0) {
      await db.delete(emailsClientes).where(
        inArray(emailsClientes.id_email_cliente, cleanEmails)
      );
      cleaned.emails = cleanEmails.length;
    }

    // 3. Limpiar teléfonos de clientes
    if (cleanTelefonos && Array.isArray(cleanTelefonos) && cleanTelefonos.length > 0) {
      await db.delete(telefonosClientes).where(
        inArray(telefonosClientes.id_telefono_cliente, cleanTelefonos)
      );
      cleaned.telefonos = cleanTelefonos.length;
    }

    // 4. Limpiar relaciones de tiendas de usuarios
    if (cleanUserTiendas && Array.isArray(cleanUserTiendas) && cleanUserTiendas.length > 0) {
      await db.delete(usuariosTiendas).where(
        inArray(usuariosTiendas.id_usuario_tienda, cleanUserTiendas)
      );
      cleaned.userTiendas = cleanUserTiendas.length;
    }

    // 5. Limpiar registros de importación
    if (cleanImportRegistros && Array.isArray(cleanImportRegistros) && cleanImportRegistros.length > 0) {
      await db.delete(importacionesRegistros).where(
        inArray(importacionesRegistros.id, cleanImportRegistros)
      );
      cleaned.importRegistros = cleanImportRegistros.length;
    }

    return NextResponse.json({
      success: true,
      message: "Limpieza completada correctamente.",
      cleaned
    }, { status: 200 });

  } catch (error: any) {
    console.error("Error al ejecutar limpieza de base de datos:", error);
    return NextResponse.json({ message: error.message || "Error interno del servidor" }, { status: 500 });
  }
}
