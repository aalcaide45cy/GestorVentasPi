import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { HttpError, requireSession } from "@/lib/auth/sesion";
import { leerJson, manejar } from "@/lib/http";
import { esquemaCuenta } from "@/lib/correo";
import {
  eliminarCuenta,
  guardarCuenta,
  listarCuentas,
  probarCuenta,
} from "@/lib/servicios/correo";

export const dynamic = "force-dynamic";

const idDe = (req: Request): number => {
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0)
    throw new HttpError(400, "Falta la cuenta");
  return id;
};

/** Mis cuentas de correo (sin contraseñas). */
export const GET = manejar(async () => {
  const u = await requireSession("no_invitado");
  return NextResponse.json({ success: true, data: await listarCuentas(db, u) });
});
export const POST = manejar(async (req: Request) => {
  const u = await requireSession("no_invitado");
  return NextResponse.json({
    success: true,
    data: await guardarCuenta(db, u, null, await leerJson(req, esquemaCuenta)),
  });
});
export const PUT = manejar(async (req: Request) => {
  const u = await requireSession("no_invitado");
  return NextResponse.json({
    success: true,
    data: await guardarCuenta(
      db,
      u,
      idDe(req),
      await leerJson(req, esquemaCuenta),
    ),
  });
});
export const DELETE = manejar(async (req: Request) => {
  const u = await requireSession("no_invitado");
  await eliminarCuenta(db, u, idDe(req));
  return NextResponse.json({ success: true, data: null });
});
/** Envía un correo de prueba desde la cuenta. */
export const PATCH = manejar(async (req: Request) => {
  const u = await requireSession("no_invitado");
  const e = await leerJson(
    req,
    z.object({ destino: z.string().max(255).optional() }),
  );
  return NextResponse.json({
    success: true,
    data: { mensaje: await probarCuenta(db, u, idDe(req), e.destino) },
  });
});
