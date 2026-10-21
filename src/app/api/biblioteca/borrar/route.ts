import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { auditar } from "@/lib/auditoria";
import { requireSession } from "@/lib/auth/sesion";
import { leerJson, manejar } from "@/lib/http";
import { eliminarArchivos } from "@/lib/servicios/biblioteca";
import { encolar, TareaCancelada, type ContextoTarea } from "@/lib/servicios/tareas";

export const dynamic = "force-dynamic";

const esquema = z.object({ ids: z.array(z.number().int().positive()).min(1) });
const LOTE = 25;

/**
 * Borra varios archivos de la biblioteca. Con `?asincrono=1` no espera: entra en la cola de tareas en segundo plano (borra por lotes, enseña su
 * avance en la barra superior y se puede cancelar) y devuelve `{ tarea }`; sin él, borra y devuelve `{ data: { borrados } }`.
 * Quitar muchos archivos grandes tarda, y una sola orden enorme bloquearía la base de datos para el resto.
 */
export const POST = manejar(async (req: Request) => {
  const u = await requireSession("no_invitado");
  const { ids } = await leerJson(req, esquema);
  const unicos = [...new Set(ids)];
  const trabajo = async (ctx?: ContextoTarea): Promise<{ borrados: number }> => {
    let borrados = 0;
    for (let i = 0; i < unicos.length; i += LOTE) {
      if (ctx?.cancelada()) throw new TareaCancelada(`Cancelada: se han borrado ${borrados} de ${unicos.length} archivos`);
      borrados += await eliminarArchivos(db, unicos.slice(i, i + LOTE));
      ctx?.avance(Math.min(i + LOTE, unicos.length), unicos.length, `Borrados ${borrados} de ${unicos.length}`);
    }
    await auditar({ idUsuario: u.idUsuario, accion: "biblioteca_eliminados", entidad: "biblioteca", detalle: { cantidad: borrados } });
    return { borrados };
  };
  if (new URL(req.url).searchParams.get("asincrono") === "1") {
    const tarea = encolar({ tipo: "biblioteca", titulo: `Borrar ${unicos.length} archivo${unicos.length === 1 ? "" : "s"} de la biblioteca`, idUsuario: u.idUsuario }, (ctx) => trabajo(ctx));
    return NextResponse.json({ success: true, tarea: tarea.id }, { status: 202 });
  }
  return NextResponse.json({ success: true, data: await trabajo() });
});
