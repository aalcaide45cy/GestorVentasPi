import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { db } from "@/db";
import { requireSesionParcial } from "@/lib/auth/sesion";
import { manejar } from "@/lib/http";
import { prepararTotp } from "@/lib/servicios/autenticacion";

export const dynamic = "force-dynamic";

async function preparar() {
  const sesion = await requireSesionParcial();
  const { secreto, url } = await prepararTotp(db, sesion.usuario.idUsuario);
  const qr = await QRCode.toDataURL(url, { margin: 1, width: 240 });
  return NextResponse.json({ secreto, qr });
}

/** Genera un secreto nuevo y su código QR (el secreto se muestra ahora y no se vuelve a mostrar). */
export const GET = manejar(preparar);
export const POST = manejar(preparar);
