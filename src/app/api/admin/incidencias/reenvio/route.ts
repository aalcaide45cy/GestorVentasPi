import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { auditar } from "@/lib/auditoria";
import { requireSession } from "@/lib/auth/sesion";
import { leerJson, manejar } from "@/lib/http";
import { esquemaDestino, estadoReenvio, generarClaveRecepcion, guardarDestino, probarDestino, quitarClaveRecepcion, reenviarPendientes } from "@/lib/servicios/incidencias-remotas";

export const dynamic = "force-dynamic";

/** Cómo está el reenvío de reportes entre equipos (solo el administrador). */
export const GET = manejar(async () => {
  await requireSession("administrador");
  return NextResponse.json({ success: true, data: await estadoReenvio(db) });
});

const esquema = z.discriminatedUnion("accion", [
  z.object({ accion: z.literal("generar_clave") }),
  z.object({ accion: z.literal("quitar_clave") }),
  z.object({ accion: z.literal("guardar_destino"), destino: esquemaDestino }),
  z.object({ accion: z.literal("probar") }),
  z.object({ accion: z.literal("reenviar_ahora") }),
]);

export const POST = manejar(async (req: Request) => {
  const admin = await requireSession("administrador");
  const e = await leerJson(req, esquema);
  if (e.accion === "generar_clave") {
    await generarClaveRecepcion(db);
    await auditar({ idUsuario: admin.idUsuario, accion: "incidencias_clave_recepcion_creada", entidad: "incidencias", detalle: {} });
  } else if (e.accion === "quitar_clave") {
    await quitarClaveRecepcion(db);
    await auditar({ idUsuario: admin.idUsuario, accion: "incidencias_clave_recepcion_quitada", entidad: "incidencias", detalle: {} });
  } else if (e.accion === "guardar_destino") {
    await guardarDestino(db, e.destino);
    await auditar({ idUsuario: admin.idUsuario, accion: "incidencias_destino_guardado", entidad: "incidencias", detalle: { url: e.destino.url } });
    void reenviarPendientes(db);
  } else if (e.accion === "probar") {
    await probarDestino(db);
  } else {
    await reenviarPendientes(db);
  }
  return NextResponse.json({ success: true, data: await estadoReenvio(db) });
});
