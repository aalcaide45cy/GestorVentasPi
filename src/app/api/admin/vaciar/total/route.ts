import { NextResponse } from "next/server";
import { db } from "@/db";
import { requireSession } from "@/lib/auth/sesion";
import { leerJson, manejar } from "@/lib/http";
import { borrarAbsolutamenteTodo, esquemaBorradoTotal } from "@/lib/servicios/borrado-total";
import { encolar } from "@/lib/servicios/tareas";

export const dynamic = "force-dynamic";
export const maxDuration = 900;

/**
 * «Borrar absolutamente todo» (solo el administrador): deja la aplicación como de fábrica, sin Papelera, historial, documentos ni copias. Conserva solo lo
 * grabado a fuego (marcas, modelos y plantillas base) y al administrador que lo ordena. Va en la cola de tareas en segundo plano, con avance, y no se puede cancelar.
 * No lo ejecuta nadie más que quien pulsa el botón (con sus tres confirmaciones en la pantalla).
 */
export const POST = manejar(async (req: Request) => {
  const admin = await requireSession("administrador");
  const entrada = await leerJson(req, esquemaBorradoTotal);
  const tarea = encolar({ tipo: "borrado-total", titulo: "Borrar absolutamente todo", idUsuario: admin.idUsuario, cancelable: false }, async (ctx) => {
    const r = await borrarAbsolutamenteTodo(db, admin.idUsuario, entrada, ctx);
    return { ...r, detalle: ["La aplicación está como de fábrica.", r.copiaPrevia ? `Solo queda la copia previa: ${r.copiaPrevia}` : "No se ha guardado ninguna copia: no queda nada."] };
  });
  return NextResponse.json({ success: true, tarea: tarea.id }, { status: 202 });
});
