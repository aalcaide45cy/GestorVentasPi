import { NextResponse } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HttpError } from "@/lib/auth/sesion";
import { manejar } from "./http";
import type { EventoIncidencia } from "./incidencias";
import { instalarReceptorIncidencias } from "./incidencias-hook";

const recibidos: EventoIncidencia[] = [];
afterEach(() => {
  recibidos.length = 0;
  instalarReceptorIncidencias(() => undefined);
});

describe("la API avisa de sus fallos", () => {
  it("un error inesperado (500) se anota con su ruta y su traza; los errores previstos (4xx) no", async () => {
    instalarReceptorIncidencias((e) => recibidos.push(e));
    const espia = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const roto = manejar(async (req: Request) => {
      void req;
      throw new Error("Se ha roto algo de verdad");
    });
    const r = await roto(new Request("http://localhost/api/expedientes/123", { method: "POST" }));
    expect(r.status).toBe(500);
    expect(recibidos).toHaveLength(1);
    expect(recibidos[0]).toMatchObject({ origen: "servidor", titulo: "Se ha roto algo de verdad", ruta: "POST /api/expedientes/:id" });
    expect(recibidos[0].detalle).toContain("Se ha roto algo de verdad");

    const previsto = manejar(async (req: Request) => {
      void req;
      throw new HttpError(404, "No existe");
    });
    expect((await previsto(new Request("http://localhost/api/x"))).status).toBe(404);
    const bien = manejar(async (req: Request) => (void req, NextResponse.json({ ok: true })));
    expect((await bien(new Request("http://localhost/api/x"))).status).toBe(200);
    expect(recibidos).toHaveLength(1);
    espia.mockRestore();
  });
});
