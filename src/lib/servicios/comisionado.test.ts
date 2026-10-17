import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { expedientes } from "@/db/schema";
import { crearUsuarioPrueba, reiniciarBd } from "../../../tests/ayudas";
import { estadoComisionado, fijarComisionado } from "./comisionado";

beforeEach(reiniciarBd);

describe("comisionado desde el expediente", () => {
  it("marca, reclama, deja pendiente y vuelve a automático; solo el admin o el vendedor pueden", async () => {
    const admin = await crearUsuarioPrueba("administrador");
    const vendedor = await crearUsuarioPrueba("vendedor");
    const otro = await crearUsuarioPrueba("vendedor");
    const [e] = await db.insert(expedientes).values({ idUsuario: vendedor.idUsuario, fechaMatriculacion: "2026-09-16" }).returning();
    const id = e.idExpediente;

    const ini = await estadoComisionado(db, vendedor, id);
    expect(ini).toMatchObject({ estado: "pendiente", mes: null, mesSugerido: "2026-09", meses: [] });

    const a = await fijarComisionado(db, vendedor, { idExpediente: id, mes: "2026-09", estado: "pagado", nota: "Nómina de octubre" });
    expect(a).toMatchObject({ estado: "pagado", mes: "2026-09", meses: [{ mes: "2026-09", estado: "pagado", origen: "manual", nota: "Nómina de octubre" }] });

    expect((await fijarComisionado(db, admin, { idExpediente: id, mes: "2026-09", estado: "reclamado" })).estado).toBe("reclamado");
    expect((await fijarComisionado(db, admin, { idExpediente: id, mes: "2026-09", estado: "pendiente" })).estado).toBe("pendiente");
    expect((await fijarComisionado(db, vendedor, { idExpediente: id, mes: "2026-09", estado: "automatico" })).meses).toEqual([]);

    await expect(estadoComisionado(db, otro, id)).rejects.toMatchObject({ status: 403 });
    await expect(fijarComisionado(db, otro, { idExpediente: id, mes: "2026-09", estado: "pagado" })).rejects.toMatchObject({ status: 403 });
    await expect(estadoComisionado(db, admin, 99999)).rejects.toMatchObject({ status: 404 });
  });
});
