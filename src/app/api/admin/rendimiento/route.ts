import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth/sesion";
import { leerJson, manejar } from "@/lib/http";
import { historial, informeTexto, instantanea, probarBd, probarDisco } from "@/lib/rendimiento";
import { consultasLentas, resumenPeticiones } from "@/lib/rendimiento-registro";
import { leerRegistro } from "@/lib/registro-servidor";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Diagnóstico de rendimiento (solo administrador): estado del equipo, base de datos, lecturas, peticiones y consultas lentas.
 * Con `?informe=1` devuelve todo como texto plano para copiar y pegar.
 */
export const GET = manejar(async (req: Request) => {
  await requireSession("administrador");
  const s = await instantanea();
  if (new URL(req.url).searchParams.get("informe") === "1") {
    const { entradas } = await leerRegistro({ nivel: "avisos", lineas: 40 });
    return new NextResponse(informeTexto(s, entradas), { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
  }
  return NextResponse.json({ success: true, data: { instantanea: s, historial: historial(), peticiones: resumenPeticiones(30, 12), consultasLentas: consultasLentas().slice(0, 10) } }, { headers: { "Cache-Control": "no-store" } });
});

/** Pruebas activas: `{ prueba: "disco" }` (escribe y lee un archivo de 64 MB que borra) o `{ prueba: "bd" }`. */
export const POST = manejar(async (req: Request) => {
  await requireSession("administrador");
  const { prueba } = await leerJson(req, z.object({ prueba: z.enum(["disco", "bd"]) }));
  return NextResponse.json({ success: true, data: prueba === "disco" ? await probarDisco() : await probarBd() }, { headers: { "Cache-Control": "no-store" } });
});
