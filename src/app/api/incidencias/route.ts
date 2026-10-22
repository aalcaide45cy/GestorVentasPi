import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { requireSession } from "@/lib/auth/sesion";
import { leerJson, manejar } from "@/lib/http";
import { prepararEvento } from "@/lib/incidencias";
import { crearIncidenciaManual, MAX_CAPTURA_BYTES, registrarIncidencia } from "@/lib/servicios/incidencias";
import { reenviarPendientes } from "@/lib/servicios/incidencias-remotas";

export const dynamic = "force-dynamic";

const evento = z.object({
  origen: z.enum(["navegador", "peticion", "aviso"]),
  nivel: z.enum(["error", "aviso"]).optional(),
  titulo: z.string().min(1).max(2000),
  detalle: z.string().max(20000).nullish(),
  ruta: z.string().max(500).nullish(),
  veces: z.number().int().min(1).max(500).optional(),
  contexto: z.record(z.string(), z.unknown()).nullish(),
});

const esquema = z.object({
  version: z.string().max(20).nullish(),
  eventos: z.array(evento).max(20).optional(),
  manual: z
    .object({
      texto: z.string().min(1).max(5000),
      ruta: z.string().max(500).nullish(),
      contexto: z.record(z.string(), z.unknown()).optional(),
      /** Captura como «data:image/png;base64,…». */
      captura: z.string().max(MAX_CAPTURA_BYTES * 2).nullish(),
    })
    .optional(),
});

/** Aviso mínimo para que un navegador roto no sature el servidor: como mucho 120 sucesos por minuto y usuario. */
const ventana = new Map<number, { desde: number; n: number }>();
function dentroDelLimite(idUsuario: number, nuevos: number): boolean {
  const ahora = Date.now();
  const v = ventana.get(idUsuario);
  if (!v || ahora - v.desde > 60_000) {
    ventana.set(idUsuario, { desde: ahora, n: nuevos });
    return true;
  }
  v.n += nuevos;
  return v.n <= 120;
}

/** Recibe los fallos que detecta el navegador (por lotes) y los avisos que una persona manda a mano, con su captura. */
export const POST = manejar(async (req: Request) => {
  const u = await requireSession();
  const entrada = await leerJson(req, esquema);
  const version = entrada.version ?? process.env.npm_package_version ?? null;
  const total = (entrada.eventos?.length ?? 0) + (entrada.manual ? 1 : 0);
  if (!dentroDelLimite(u.idUsuario, total)) return NextResponse.json({ success: true, limitado: true });
  for (const e of entrada.eventos ?? []) {
    const p = prepararEvento({ origen: e.origen, nivel: e.nivel, titulo: e.titulo, detalle: e.detalle, ruta: e.ruta, contexto: e.contexto ?? null, idUsuario: u.idUsuario, version });
    await registrarIncidencia(db, p, e.veces ?? 1);
  }
  if (entrada.manual) {
    const m = entrada.manual;
    let captura: { mime: string; datos: Buffer } | null = null;
    const trozos = m.captura ? /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(m.captura) : null;
    if (trozos) captura = { mime: trozos[1], datos: Buffer.from(trozos[2], "base64") };
    const id = await crearIncidenciaManual(db, { texto: m.texto, ruta: m.ruta ?? null, contexto: { ...(m.contexto ?? {}), avisadoPor: u.nombre ?? `usuario ${u.idUsuario}` }, idUsuario: u.idUsuario, version, captura });
    // Si este equipo manda sus reportes a un servidor principal, sale ya (y si no hay conexión se reintenta solo cada minuto)
    void reenviarPendientes(db);
    return NextResponse.json({ success: true, id }, { status: 201 });
  }
  return NextResponse.json({ success: true });
});
