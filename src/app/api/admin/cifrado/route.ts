import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { auditar } from "@/lib/auditoria";
import { requireSession } from "@/lib/auth/sesion";
import { leerJson, manejar } from "@/lib/http";
import { cambiarCifrado, estadoCifrado } from "@/lib/servicios/cifrado-datos";
import { encolar } from "@/lib/servicios/tareas";

export const dynamic = "force-dynamic";

/** Estado del interruptor del cifrado de datos y cuántos datos hay cifrados y en claro (solo el administrador). */
export const GET = manejar(async () => {
  await requireSession("administrador");
  return NextResponse.json({ success: true, data: await estadoCifrado(db) });
});

const esquema = z.object({ activar: z.boolean() });

/** Activa o desactiva el cifrado: pone en la cola de tareas la copia previa y la conversión de lo ya guardado, y devuelve `{ tarea }`. */
export const POST = manejar(async (req: Request) => {
  const admin = await requireSession("administrador");
  const { activar } = await leerJson(req, esquema);
  const tarea = encolar({ tipo: "cifrado", titulo: activar ? "Activar el cifrado de los datos" : "Dejar los datos sin cifrar", idUsuario: admin.idUsuario }, async (ctx) => {
    const r = await cambiarCifrado(db, activar, admin.idUsuario, ctx);
    await auditar({ idUsuario: admin.idUsuario, accion: activar ? "cifrado_activado" : "cifrado_desactivado", entidad: "ajustes", detalle: { convertidos: r.convertidos, ilegibles: r.ilegibles } });
    return { ...r, detalle: [`${r.convertidos.toLocaleString("es-ES")} datos convertidos${r.ilegibles > 0 ? `, ${r.ilegibles.toLocaleString("es-ES")} no se pueden abrir con la clave de esta instalación y se han dejado como estaban` : ""}`] };
  });
  return NextResponse.json({ success: true, tarea: tarea.id }, { status: 202 });
});
