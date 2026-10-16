import { describe, expect, it } from "vitest";
import { HttpError } from "@/lib/auth/sesion";
import { responderError } from "./http";

const envuelto = (code: string, detail = "") => Object.assign(new Error("Failed query"), { cause: Object.assign(new Error("pg"), { code, detail }) });

describe("responderError", () => {
  it("clave que apunta a algo inexistente → 400 con mensaje claro", async () => {
    const r = responderError(envuelto("23503", 'Key (id_modelo)=(99999) is not present in table "modelos".'));
    expect(r.status).toBe(400);
    expect(JSON.stringify(await r.json())).not.toContain("modelos");
  });
  it("borrar algo en uso → 409", () => {
    expect(responderError(envuelto("23503", 'Key (id)=(1) is still referenced from table "expedientes".')).status).toBe(409);
  });
  it("duplicado → 409, obligatorio → 400, formato → 400", () => {
    expect(responderError(envuelto("23505")).status).toBe(409);
    expect(responderError(envuelto("23502")).status).toBe(400);
    expect(responderError(envuelto("22P02")).status).toBe(400);
  });
  it("un error desconocido sigue siendo 500 sin detalles; HttpError se respeta", async () => {
    const r = responderError(new Error("secreto interno"));
    expect(r.status).toBe(500);
    expect(JSON.stringify(await r.json())).not.toContain("secreto");
    expect(responderError(new HttpError(404, "No existe")).status).toBe(404);
  });
});
