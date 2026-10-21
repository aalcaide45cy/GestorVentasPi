import { NextResponse } from "next/server";
import { HttpError, requireSession } from "@/lib/auth/sesion";
import { manejar } from "@/lib/http";
import { encolar } from "@/lib/servicios/tareas";
import { MAX_BYTES_OCR } from "@/lib/servicios/ocr";
import { MOTORES, conMotor, type MotorOcr } from "@/lib/servicios/ocr-ajustes";
import { leerMatriculasDeFichero } from "@/lib/servicios/ocr-rejilla";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Lee las matrículas de una rejilla escaneada (PDF o imagen; el cuerpo es el fichero tal cual). No guarda nada: el usuario revisa lo leído y
 * lo envía después a `PUT /api/cotejo/rejillas`. Con `?asincrono=1&nombre=…` no espera: la lectura entra en la cola de tareas en segundo plano
 * (de una en una, por orden) y devuelve `{ tarea }`; su resultado, `{ paginas }`, sale en `/api/tareas` al terminar. Con `?motor=…` la hoja se
 * lee con ese motor de OCR solo esta vez (para releerla con otro si no salió bien).
 */
export const POST = manejar(async (req: Request) => {
  const u = await requireSession("no_invitado");
  const largo = Number(req.headers.get("content-length") ?? 0);
  if (largo > MAX_BYTES_OCR) throw new HttpError(413, "El fichero es demasiado grande (máximo 500 MB).");
  const datos = Buffer.from(await req.arrayBuffer());
  if (datos.length === 0) throw new HttpError(400, "El fichero está vacío.");
  if (datos.length > MAX_BYTES_OCR) throw new HttpError(413, "El fichero es demasiado grande (máximo 500 MB).");
  const q = new URL(req.url).searchParams;
  const pedido = q.get("motor");
  const motor = MOTORES.includes(pedido as MotorOcr) ? (pedido as MotorOcr) : undefined;
  if (q.get("asincrono") === "1") {
    const nombre = (q.get("nombre") ?? "rejilla").slice(0, 120);
    const tarea = encolar({ tipo: "rejilla", titulo: `Leer la rejilla «${nombre}»`, idUsuario: u.idUsuario }, async (ctx) => {
      ctx.avance(0, 1, "Leyendo las matrículas de la hoja…");
      const paginas = await conMotor(motor, () => leerMatriculasDeFichero(datos));
      ctx.avance(1, 1);
      return { paginas };
    });
    return NextResponse.json({ success: true, tarea: tarea.id }, { status: 202 });
  }
  const paginas = await conMotor(motor, () => leerMatriculasDeFichero(datos));
  return NextResponse.json({ success: true, data: { paginas } });
});
