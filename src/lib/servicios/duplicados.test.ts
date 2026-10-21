import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { clientes, expedientes, marcas, modelos } from "@/db/schema";
import { crearUsuarioPrueba, reiniciarBd } from "../../../tests/ayudas";
import { detectarDuplicados } from "./duplicados";

beforeEach(async () => {
  await reiniciarBd();
});

describe("detectar expedientes duplicados", () => {
  async function base() {
    const admin = await crearUsuarioPrueba("administrador");
    const [marca] = await db.insert(marcas).values({ nombre: "Dacia" }).returning();
    const [modelo] = await db.insert(modelos).values({ marcaId: marca.idMarca, nombreModelo: "Sandero" }).returning();
    const [ana] = await db.insert(clientes).values({ clienteId: "c-ana", nombre: "Ana Pérez" }).returning();
    const [luis] = await db.insert(clientes).values({ clienteId: "c-luis", nombre: "Luis Gil" }).returning();
    return { admin, modelo, ana, luis };
  }

  it("agrupa por bastidor, matrícula y por mismo cliente, modelo y fecha", async () => {
    const { admin, modelo, ana, luis } = await base();
    await db.insert(expedientes).values([
      { idUsuario: admin.idUsuario, idCliente: ana.id, idModelo: modelo.idModelo, vin: "VF1ABC", matricula: "1234ABC", fechaExpediente: "2026-05-01" },
      { idUsuario: admin.idUsuario, idCliente: ana.id, idModelo: modelo.idModelo, vin: "vf1 abc", matricula: "9999ZZZ", fechaExpediente: "2026-05-01" },
      { idUsuario: admin.idUsuario, idCliente: luis.id, idModelo: modelo.idModelo, vin: "OTRO", matricula: "1234-ABC", fechaExpediente: "2026-06-01" },
      { idUsuario: admin.idUsuario, idCliente: luis.id, idModelo: modelo.idModelo, vin: "N/D", matricula: "N/D", fechaExpediente: "2026-07-01" },
    ]);
    const r = await detectarDuplicados(db);
    expect(r.revisados).toBe(4);
    const por = (m: string) => r.grupos.filter((g) => g.motivo === m);
    expect(por("bastidor")).toHaveLength(1);
    expect(por("bastidor")[0].filas.map((f) => f.id)).toHaveLength(2);
    expect(por("matricula")).toHaveLength(1); // «1234ABC» y «1234-ABC» son la misma
    expect(por("pedido")).toHaveLength(1); // Ana: mismo modelo y fecha
    expect(por("cliente_modelo")).toHaveLength(1); // Luis: mismo modelo en fechas distintas
    // «N/D» no cuenta como matrícula ni bastidor repetidos
    expect(r.grupos.some((g) => g.clave === "ND")).toBe(false);
  });

  it("no cuenta las copias hechas a propósito con «Duplicar» ni los eliminados", async () => {
    const { admin, modelo, ana } = await base();
    const [original] = await db.insert(expedientes).values({ idUsuario: admin.idUsuario, idCliente: ana.id, idModelo: modelo.idModelo, vin: "VF1COPIA", fechaExpediente: "2026-05-01" }).returning();
    await db.insert(expedientes).values({ idUsuario: admin.idUsuario, idCliente: ana.id, idModelo: modelo.idModelo, vin: "VF1COPIA", fechaExpediente: "2026-05-01", copiaDe: original.idExpediente });
    await db.insert(expedientes).values({ idUsuario: admin.idUsuario, idCliente: ana.id, idModelo: modelo.idModelo, vin: "VF1COPIA", fechaExpediente: "2026-05-01", eliminadoEn: new Date() });
    expect((await detectarDuplicados(db)).grupos).toHaveLength(0);
  });
});
