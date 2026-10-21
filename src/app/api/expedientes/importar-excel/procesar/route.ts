import { NextResponse } from "next/server";
import { db } from "@/db";
import { requireSession } from "@/lib/auth/sesion";
import { leerJson, manejar } from "@/lib/http";
import { encolar } from "@/lib/servicios/tareas";
import { esquemaProcesarExcel, procesarActualizacionesExcel } from "@/lib/servicios/importaciones";

export const dynamic = "force-dynamic";

export const POST = manejar(async (req: Request) => {
  const usuario = await requireSession("no_invitado");
  const entrada = await leerJson(req, esquemaProcesarExcel);
  // Con `?asincrono=1` no espera: entra en la cola de tareas en segundo plano (misma transaccion, con avance y cancelable: si se cancela no se cambia nada)
  if (new URL(req.url).searchParams.get("asincrono") === "1") {
    const tarea = encolar({ tipo: "importacion", titulo: `Importar «${entrada.filename || "Excel"}» (${entrada.updates.length} filas)`, idUsuario: usuario.idUsuario }, async (ctx) => {
      const r = await procesarActualizacionesExcel(db, usuario, entrada, { avance: (h, t) => ctx.avance(h, t, `Importando fila ${h + 1} de ${t}`), cancelada: ctx.cancelada });
      return { processedCount: r.procesados, message: r.mensaje };
    });
    return NextResponse.json({ success: true, tarea: tarea.id }, { status: 202 });
  }
  const r = await procesarActualizacionesExcel(db, usuario, entrada);
  return NextResponse.json({ success: true, processedCount: r.procesados, message: r.mensaje });
});
