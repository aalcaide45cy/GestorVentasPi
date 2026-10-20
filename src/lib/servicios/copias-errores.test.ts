import { describe, expect, it } from "vitest";
import { mensajeConCausa } from "./copias";

describe("mensajeConCausa", () => {
  it("añade el motivo real de la base de datos que Drizzle esconde bajo «Failed query»", () => {
    const e = new Error("Failed query: insert into \"plantillas_tarifas_vn\" ...\nparams: a,b", { cause: new Error('duplicate key value violates unique constraint "plantillas_tarifas_vn_pkey"') });
    expect(mensajeConCausa(e)).toBe('Failed query: insert into "plantillas_tarifas_vn" ... — causa: duplicate key value violates unique constraint "plantillas_tarifas_vn_pkey"');
  });

  it("deja igual un error sin causa o que ya la incluye", () => {
    expect(mensajeConCausa(new Error("pg_restore ha fallado"))).toBe("pg_restore ha fallado");
    expect(mensajeConCausa(new Error("x: boom", { cause: new Error("boom") }))).toBe("x: boom");
    expect(mensajeConCausa("texto")).toBe("Error desconocido");
  });
});
