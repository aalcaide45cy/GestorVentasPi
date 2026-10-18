import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { auditar } from "@/lib/auditoria";
import { requireSession } from "@/lib/auth/sesion";
import { errorJson, leerIdQuery, leerIdsParaBorrar, leerJson, leerJsonCrudo, manejar } from "@/lib/http";
import { esquemaActualizarExpediente, esquemaCrearExpediente } from "@/lib/servicios/expedientes";
import { actualizarExpedientes, crearExpediente, eliminarExpedientes, type AvisoGuardado } from "@/lib/servicios/expedientes-escritura";
import { obtenerExpediente } from "@/lib/servicios/expedientes-lectura";

export const dynamic = "force-dynamic";

export const GET = manejar(async (req: Request) => {
  await requireSession("no_invitado");
  const id = leerIdQuery(req);
  if (!id) return errorJson(400, "Falta el ID del expediente");
  const exp = await obtenerExpediente(db, id);
  if (!exp) return errorJson(404, "Expediente no encontrado");
  return NextResponse.json({ success: true, data: exp });
});

export const POST = manejar(async (req: Request) => {
  const usuario = await requireSession("crear_expedientes");
  const entrada = await leerJson(req, esquemaCrearExpediente);
  const avisos: AvisoGuardado[] = [];
  const creado = await crearExpediente(db, usuario, entrada, avisos);
  return NextResponse.json({ success: true, data: creado, avisos }, { status: 201 });
});

/** Contrato del original: `{id_expediente, expediente, id_cliente}` o `{isBulkEdit, ids, expediente}`. */
export const PUT = manejar(async (req: Request) => {
  const usuario = await requireSession("no_invitado");
  const crudo = await leerJsonCrudo(req);
  if (!crudo.expediente) return errorJson(400, "Faltan datos obligatorios para actualizar");
  const adaptado = crudo.isBulkEdit
    ? { modo: "lote", ids: crudo.ids, expediente: crudo.expediente }
    : { modo: "uno", id_expediente: crudo.id_expediente, id_cliente: crudo.id_cliente, cliente: crudo.cliente ?? undefined, expediente: crudo.expediente };
  const entrada = esquemaActualizarExpediente.parse(adaptado);
  const r = await actualizarExpedientes(db, usuario, entrada);
  return NextResponse.json(
    {
      success: true,
      message:
        entrada.modo === "lote"
          ? `${r.actualizados} expedientes actualizados correctamente`
          : "Expediente actualizado correctamente",
      impactos: r.impactos,
      cliente: r.cliente ?? null,
      avisos: r.avisos,
    },
    { status: 200 },
  );
});

export const DELETE = manejar(async (req: Request) => {
  const usuario = await requireSession("no_invitado");
  const ids = z.array(z.number().int().positive()).parse(await leerIdsParaBorrar(req));
  const n = await eliminarExpedientes(db, usuario, ids);
  await auditar({ idUsuario: usuario.idUsuario, accion: "expedientes_eliminados", entidad: "expedientes", detalle: { ids } });
  return NextResponse.json({
    success: true,
    message: n === 1 ? "Expediente eliminado correctamente" : `${n} expedientes eliminados correctamente`,
  });
});
