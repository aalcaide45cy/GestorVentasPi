import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { usuarios, clientes, expedientes, emailsClientes, telefonosClientes, importacionesBloques, importacionesRegistros } from "@/db/schema";
import { eq, and, ilike, sql } from "drizzle-orm";

export const dynamic = 'force-dynamic';

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
    const { updates, filename } = body;

    if (!updates || !Array.isArray(updates)) {
      return NextResponse.json({ message: "Datos inválidos" }, { status: 400 });
    }

    let processedCount = 0;
    let creadosCount = 0;
    let modificadosCount = 0;
    let omitidosCount = 0;

    // Crear el bloque de importación
    const [bloque] = await db.insert(importacionesBloques).values({
      fecha: new Date().toISOString(),
      nombre_archivo: filename || "archivo_excel.xlsx",
      tipo_archivo: "Excel",
      usuario_id: localUser.id_usuario,
      creados: 0,
      modificados: 0,
      omitidos: 0,
    }).returning();

    for (const update of updates) {
      const { id_cliente, id_expediente, nif, bastidor, matricula, f_afect, f_mat, email, f_exp, telefono, f_entrega } = update;

      if (!id_cliente || !id_expediente) {
        omitidosCount++;
        continue;
      }

      // Obtener expediente actual con su cliente
      const exp = await db.query.expedientes.findFirst({
        where: eq(expedientes.id_expediente, id_expediente),
        with: {
          cliente: true
        }
      });

      if (!exp) {
        omitidosCount++;
        continue;
      }

      // 1. Prevención de Duplicados
      let isDuplicate = false;
      const cleanBastidor = bastidor ? String(bastidor).trim() : "";
      if (cleanBastidor && cleanBastidor !== exp.vin) {
        const dupVin = await db.query.expedientes.findFirst({
          where: and(
            eq(expedientes.vin, cleanBastidor),
            sql`${expedientes.id_expediente} != ${id_expediente}`
          )
        });
        if (dupVin) {
          isDuplicate = true;
        }
      }

      const cleanMatricula = matricula ? String(matricula).split("(")[0].trim() : "";
      if (!isDuplicate && cleanMatricula && cleanMatricula !== exp.matricula) {
        const dupMat = await db.query.expedientes.findFirst({
          where: and(
            eq(expedientes.matricula, cleanMatricula),
            sql`${expedientes.id_expediente} != ${id_expediente}`
          )
        });
        if (dupMat) {
          isDuplicate = true;
        }
      }

      if (isDuplicate) {
        omitidosCount++;
        await db.insert(importacionesRegistros).values({
          bloque_id: bloque.id,
          id_expediente,
          tipo_accion: "omitido",
          cliente_nombre: exp.cliente?.nombre || "Desconocido",
          matricula: cleanMatricula || exp.matricula || "",
          bastidor: cleanBastidor || exp.vin || "",
          cambios: "Omitido para evitar duplicidad de bastidor o matrícula en otro expediente.",
        });
        continue;
      }

      // 2. Trazabilidad de cambios
      const cambios: Record<string, { old: any, new: any }> = {};
      const addCambio = (field: string, oldVal: any, newVal: any) => {
        const normOld = oldVal === undefined || oldVal === null ? "" : String(oldVal).trim();
        const normNew = newVal === undefined || newVal === null ? "" : String(newVal).trim();
        if (normNew !== "" && normNew !== normOld) {
          cambios[field] = { old: oldVal || "(Vacío)", new: newVal };
        }
      };

      // Cambios de Cliente
      const clientUpdate: any = {};
      if (nif && nif.trim()) {
        const cleanNif = nif.trim();
        if (cleanNif !== exp.cliente?.dni) {
          clientUpdate.dni = cleanNif;
          addCambio("DNI/NIF", exp.cliente?.dni, cleanNif);
        }
      }

      // Emails
      let newEmailAdded = false;
      if (email && email.trim()) {
        const cleanedEmail = email.trim();
        const existingEmail = await db.query.emailsClientes.findFirst({
          where: and(
            eq(emailsClientes.id_cliente, id_cliente),
            ilike(emailsClientes.email, cleanedEmail)
          )
        });
        if (!existingEmail) {
          newEmailAdded = true;
          addCambio("Email", "(Ninguno)", cleanedEmail);
        }
      }

      // Teléfonos
      let newTelAdded = false;
      if (telefono && String(telefono).trim()) {
        let rawTel = String(telefono).trim();
        if (rawTel.endsWith(".0")) {
          rawTel = rawTel.slice(0, -2);
        }
        const cleanedTel = rawTel.replace(/[^\d+]/g, "");
        if (cleanedTel) {
          const existingTel = await db.query.telefonosClientes.findFirst({
            where: and(
              eq(telefonosClientes.id_cliente, id_cliente),
              eq(telefonosClientes.telefono, cleanedTel)
            )
          });
          if (!existingTel) {
            newTelAdded = true;
            addCambio("Teléfono", "(Ninguno)", cleanedTel);
          }
        }
      }

      // Cambios de Expediente
      const expUpdate: any = {};
      if (cleanBastidor && cleanBastidor !== exp.vin) {
        expUpdate.vin = cleanBastidor;
        addCambio("Bastidor", exp.vin, cleanBastidor);
      }
      if (cleanMatricula && cleanMatricula !== exp.matricula) {
        expUpdate.matricula = cleanMatricula;
        addCambio("Matrícula", exp.matricula, cleanMatricula);
      }
      if (f_afect && f_afect !== exp.fecha_afectacion) {
        expUpdate.fecha_afectacion = f_afect;
        addCambio("Fecha Afectación", exp.fecha_afectacion, f_afect);
      }
      if (f_mat && f_mat !== exp.fecha_matriculacion) {
        expUpdate.fecha_matriculacion = f_mat;
        addCambio("Fecha Matriculación", exp.fecha_matriculacion, f_mat);
      }
      if (f_exp && f_exp !== exp.fecha_expediente) {
        expUpdate.fecha_expediente = f_exp;
        addCambio("Fecha Expediente", exp.fecha_expediente, f_exp);
      }
      if (f_entrega && f_entrega !== exp.fecha_entrega) {
        expUpdate.fecha_entrega = f_entrega;
        addCambio("Fecha Entrega", exp.fecha_entrega, f_entrega);
      }

      const hasChanges = Object.keys(cambios).length > 0;

      if (hasChanges) {
        // Ejecutar las actualizaciones correspondientes
        if (Object.keys(clientUpdate).length > 0) {
          await db.update(clientes).set(clientUpdate).where(eq(clientes.id, id_cliente));
        }

        if (newEmailAdded) {
          await db.insert(emailsClientes).values({
            id_cliente,
            email: email.trim(),
            tipo_email: "Principal"
          });
        }

        if (newTelAdded) {
          let rawTel = String(telefono).trim();
          if (rawTel.endsWith(".0")) {
            rawTel = rawTel.slice(0, -2);
          }
          const cleanedTel = rawTel.replace(/[^\d+]/g, "");
          await db.insert(telefonosClientes).values({
            id_cliente,
            telefono: cleanedTel,
            tipo_telefono: "Principal"
          });
        }

        if (Object.keys(expUpdate).length > 0) {
          await db.update(expedientes).set(expUpdate).where(eq(expedientes.id_expediente, id_expediente));
        }

        modificadosCount++;
        await db.insert(importacionesRegistros).values({
          bloque_id: bloque.id,
          id_expediente,
          tipo_accion: "modificado",
          cliente_nombre: exp.cliente?.nombre || "Desconocido",
          matricula: cleanMatricula || exp.matricula || "",
          bastidor: cleanBastidor || exp.vin || "",
          cambios: JSON.stringify(cambios),
        });
      } else {
        omitidosCount++;
      }

      processedCount++;
    }

    // Actualizar estadísticas del bloque
    await db.update(importacionesBloques).set({
      creados: creadosCount,
      modificados: modificadosCount,
      omitidos: omitidosCount,
    }).where(eq(importacionesBloques.id, bloque.id));

    return NextResponse.json({
      success: true,
      processedCount,
      message: `Se han procesado con éxito ${processedCount} expedientes (${modificadosCount} modificados, ${omitidosCount} omitidos/sin cambios).`
    }, { status: 200 });
  } catch (error: any) {
    console.error("Error al procesar actualizaciones de Excel:", error);
    return NextResponse.json({ message: error.message || "Error interno del servidor" }, { status: 500 });
  }
}
