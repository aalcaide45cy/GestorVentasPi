import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { auditar } from "@/lib/auditoria";
import { requireSession } from "@/lib/auth/sesion";
import { errorJson, leerIdsParaBorrar, leerJson, manejar } from "@/lib/http";
import { actualizarCliente, crearCliente, editarClientesEnMasa, esquemaCliente, esquemaEdicionMasivaClientes, eliminarClientes } from "@/lib/servicios/clientes";

export const dynamic = "force-dynamic";

export const POST = manejar(async (req: Request) => {
  const usuario = await requireSession("no_invitado");
  const entrada = await leerJson(req, esquemaCliente);
  const cliente = await crearCliente(db, entrada, usuario.tiendaPredeterminadaId);
  return NextResponse.json({ success: true, data: cliente }, { status: 201 });
});

export const PUT = manejar(async (req: Request) => {
  await requireSession("no_invitado");
  const entrada = await leerJson(req, esquemaCliente);
  if (!entrada.id) return errorJson(400, "ID y Nombre son campos obligatorios");
  await actualizarCliente(db, entrada.id, entrada);
  return NextResponse.json({ success: true, message: "Cliente actualizado correctamente" });
});

export const PATCH = manejar(async (req: Request) => {
  const usuario = await requireSession("no_invitado");
  const entrada = await leerJson(req, esquemaEdicionMasivaClientes);
  const n = await editarClientesEnMasa(db, entrada);
  const { ids, ...cambios } = entrada;
  await auditar({ idUsuario: usuario.idUsuario, accion: "clientes_editados_en_masa", entidad: "clientes", detalle: { ids, cambios } });
  return NextResponse.json({ success: true, message: `${n} clientes modificados correctamente`, modificados: n });
});

export const DELETE = manejar(async (req: Request) => {
  const usuario = await requireSession("no_invitado");
  const ids = z.array(z.number().int().positive()).parse(await leerIdsParaBorrar(req));
  const n = await eliminarClientes(db, ids);
  await auditar({ idUsuario: usuario.idUsuario, accion: "clientes_eliminados", entidad: "clientes", detalle: { ids } });
  return NextResponse.json({
    success: true,
    message: n === 1 ? "Cliente eliminado correctamente" : `${n} clientes eliminados correctamente`,
  });
});
