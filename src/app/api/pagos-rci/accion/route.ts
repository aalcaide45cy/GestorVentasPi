import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { requireSession } from "@/lib/auth/sesion";
import { leerJson, manejar } from "@/lib/http";
import { aplicarPago, candidatosDePago, deshacerPago, editarPago, esquemaAplicarPago, esquemaEditarPago, ignorarPago, reintentarPagosPendientes } from "@/lib/servicios/pagos-rci";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const esquema = z.discriminatedUnion("accion", [
  z.object({ accion: z.literal("aplicar"), datos: esquemaAplicarPago }),
  z.object({ accion: z.literal("deshacer"), id: z.number().int().positive() }),
  z.object({ accion: z.literal("editar"), datos: esquemaEditarPago }),
  z.object({ accion: z.literal("ignorar"), id: z.number().int().positive() }),
  z.object({ accion: z.literal("recuperar"), id: z.number().int().positive() }),
  z.object({ accion: z.literal("candidatos"), id: z.number().int().positive() }),
  z.object({ accion: z.literal("reintentar") }),
]);

/** Acciones sobre un pago ya subido: aplicarlo a un expediente, deshacerlo, corregir lo mal leído, ignorarlo o ver los expedientes posibles. */
export const POST = manejar(async (req: Request) => {
  const usuario = await requireSession("no_invitado");
  const e = await leerJson(req, esquema);
  switch (e.accion) {
    case "aplicar":
      return NextResponse.json({ success: true, data: await aplicarPago(db, usuario, e.datos.id, { idExpediente: e.datos.idExpediente, fechaPago: e.datos.fechaPago, motivo: "Elegido a mano" }) });
    case "deshacer":
      return NextResponse.json({ success: true, data: await deshacerPago(db, usuario, e.id) });
    case "editar":
      return NextResponse.json({ success: true, data: await editarPago(db, usuario, e.datos) });
    case "ignorar":
      return NextResponse.json({ success: true, data: await ignorarPago(db, usuario, e.id, true) });
    case "recuperar":
      return NextResponse.json({ success: true, data: await ignorarPago(db, usuario, e.id, false) });
    case "candidatos":
      return NextResponse.json({ success: true, data: await candidatosDePago(db, usuario, e.id) });
    case "reintentar":
      return NextResponse.json({ success: true, data: await reintentarPagosPendientes(db, usuario) });
  }
});
