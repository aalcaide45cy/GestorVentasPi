import { NextResponse } from "next/server";
import { db } from "@/db";
import { requireSession } from "@/lib/auth/sesion";
import { leerJson, manejar } from "@/lib/http";
import { crearExpedientesDePedidos, esquemaCreacionMasiva } from "@/lib/servicios/creacion-masiva";
import { encolar } from "@/lib/servicios/tareas";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Crea de una vez los expedientes de varios pedidos leídos (`{ items, vendedorId }`): solo los que no ofrecen duda y nunca duplicados. Con
 * `?asincrono=1` entra en la cola de tareas en segundo plano y devuelve `{ tarea }`; el resultado (`creados`, `omitidos`, `detalle`) sale en
 * `/api/tareas` al terminar. Sigue aunque se cambie de pantalla o se cierre la página.
 */
export const POST = manejar(async (req: Request) => {
  const usuario = await requireSession("crear_expedientes");
  const entrada = await leerJson(req, esquemaCreacionMasiva);
  if (new URL(req.url).searchParams.get("asincrono") === "1") {
    const tarea = encolar({ tipo: "crear-expedientes", titulo: `Crear ${entrada.items.length} expediente${entrada.items.length === 1 ? "" : "s"} desde pedidos`, idUsuario: usuario.idUsuario }, (ctx) => crearExpedientesDePedidos(db, usuario, entrada, ctx));
    return NextResponse.json({ success: true, tarea: tarea.id }, { status: 202 });
  }
  return NextResponse.json({ success: true, data: await crearExpedientesDePedidos(db, usuario, entrada) });
});
