import { NextResponse } from "next/server";
import { cerrarSesionActual } from "@/lib/auth/sesion";
import { manejar } from "@/lib/http";

export const POST = manejar(async () => {
  await cerrarSesionActual();
  return NextResponse.json({ ok: true });
});
