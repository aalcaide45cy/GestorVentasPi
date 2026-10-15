import { NextResponse } from "next/server";
import { db } from "@/db";
import { requireSession } from "@/lib/auth/sesion";
import { manejar } from "@/lib/http";
import { sugerencias } from "@/lib/servicios/busqueda";

export const dynamic = "force-dynamic";

export const GET = manejar(async (req: Request) => {
  await requireSession("no_invitado");
  const q = new URL(req.url).searchParams.get("q") ?? "";
  return NextResponse.json(await sugerencias(db, q));
});
