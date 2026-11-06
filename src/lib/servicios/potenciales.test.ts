import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import {
  clientes,
  emailsClientes,
  expedientes,
  telefonosClientes,
} from "@/db/schema";
import { eq } from "drizzle-orm";
import type { DatosPresupuesto } from "@/lib/documentos/presupuesto";
import { crearUsuarioPrueba, reiniciarBd } from "../../../tests/ayudas";
import {
  cambiarPotencial,
  claveNombre,
  cotejarPotenciales,
  eliminarPotencial,
  leerPotencial,
  listarPotenciales,
  registrarPresupuesto,
  resumenPotenciales,
} from "./potenciales";

beforeEach(reiniciarBd);

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);
const presupuesto = (o: Partial<DatosPresupuesto> = {}): DatosPresupuesto => ({
  esPresupuesto: true,
  numero: "7001-00",
  referencia: null,
  fecha: "2026-11-06",
  hora: "11:56",
  cliente: "Ana Perez Ruiz",
  telefono: "600111222",
  email: "ana@ejemplo.test",
  poblacion: "Getafe",
  provincia: "Madrid",
  codigoPostal: "28901",
  modeloTexto: "RENAULT Symbioz evolution ECO-G 90 kw (120CV)D2WZ NCH66XS",
  color: "azul rayo",
  totalCentimos: 2501063,
  vendedor: "Vendedor",
  avisos: [],
  ...o,
});

describe("clientes potenciales", () => {
  it("guarda el cliente con su presupuesto (marca y modelo del texto), y un segundo presupuesto de la misma persona se suma a ella", async () => {
    const ana = await crearUsuarioPrueba("vendedor", "Ana");
    const r1 = await registrarPresupuesto(
      db,
      ana,
      "p1.png",
      PNG,
      presupuesto(),
    );
    expect(r1).toMatchObject({ resultado: "nuevo", nuevoPotencial: true });
    expect(r1.potencial.ultimo).toMatchObject({
      numero: "7001-00",
      marca: "Renault",
      modelo: "Symbioz",
      total_centimos: 2501063,
    });
    expect(r1.potencial.estado).toBe("activo");
    const r2 = await registrarPresupuesto(
      db,
      ana,
      "p2.png",
      PNG,
      presupuesto({
        numero: "7002-00",
        fecha: "2026-11-07",
        modeloTexto: "DACIA SANDERO stepway extreme Eco-G 120",
      }),
    );
    expect(r2.nuevoPotencial).toBe(false);
    expect(r2.potencial.n_presupuestos).toBe(2);
    expect(r2.potencial.ultimo?.modelo).toBe("Sandero Stepway");
    expect(await listarPotenciales(db, ana)).toHaveLength(1);
    // El mismo número no se carga dos veces
    const r3 = await registrarPresupuesto(
      db,
      ana,
      "p1.png",
      PNG,
      presupuesto(),
    );
    expect(r3.resultado).toBe("repetido");
    expect((await leerPotencial(db, ana, r1.potencial.id)).n_presupuestos).toBe(
      2,
    );
  });

  it("si ya tiene expediente (por correo o teléfono) ha comprado; por solo el nombre es «posible»; los anulados no cuentan", async () => {
    const ana = await crearUsuarioPrueba("vendedor", "Ana");
    const [c1] = await db
      .insert(clientes)
      .values({ clienteId: "c1", nombre: "Ana Perez Ruiz" })
      .returning();
    await db
      .insert(emailsClientes)
      .values({ idCliente: c1.id, email: "ANA@ejemplo.test" });
    const [e1] = await db
      .insert(expedientes)
      .values({ idUsuario: ana.idUsuario, idCliente: c1.id })
      .returning();
    const compra = await registrarPresupuesto(
      db,
      ana,
      "a.png",
      PNG,
      presupuesto(),
    );
    expect(compra.potencial).toMatchObject({
      estado: "compro",
      id_expediente: e1.idExpediente,
    });
    expect(compra.aviso).toMatch(/ha comprado/);

    // Por teléfono (con otro formato)
    const [c2] = await db
      .insert(clientes)
      .values({ clienteId: "c2", nombre: "Otro Nombre Distinto" })
      .returning();
    await db
      .insert(telefonosClientes)
      .values({ idCliente: c2.id, telefono: "+34 611 222 333" });
    const [e2] = await db
      .insert(expedientes)
      .values({ idUsuario: ana.idUsuario, idCliente: c2.id })
      .returning();
    const tel = await registrarPresupuesto(
      db,
      ana,
      "b.png",
      PNG,
      presupuesto({
        numero: "7003-00",
        cliente: "Luis Gil",
        email: "luis@ejemplo.test",
        telefono: "611222333",
        codigoPostal: "28000",
      }),
    );
    expect(tel.potencial).toMatchObject({
      estado: "compro",
      id_expediente: e2.idExpediente,
    });

    // Solo el nombre: posible; y si dices que no es la misma persona, vuelve a activo
    const [c3] = await db
      .insert(clientes)
      .values({ clienteId: "c3", nombre: "Perez Lopez, Marta" })
      .returning();
    await db
      .insert(expedientes)
      .values({ idUsuario: ana.idUsuario, idCliente: c3.id });
    const nom = await registrarPresupuesto(
      db,
      ana,
      "c.png",
      PNG,
      presupuesto({
        numero: "7004-00",
        cliente: "Marta Perez Lopez",
        email: "marta@ejemplo.test",
        telefono: "622333444",
        codigoPostal: "28100",
      }),
    );
    expect(nom.potencial.estado).toBe("posible");
    expect(
      (
        await cambiarPotencial(db, ana, nom.potencial.id, {
          accion: "no_es_comprador",
        })
      ).estado,
    ).toBe("activo");

    // Un expediente anulado en la intranet no cuenta como compra
    const [c4] = await db
      .insert(clientes)
      .values({ clienteId: "c4", nombre: "Pedro Anulado" })
      .returning();
    await db
      .insert(emailsClientes)
      .values({ idCliente: c4.id, email: "pedro@ejemplo.test" });
    const [e4] = await db
      .insert(expedientes)
      .values({
        idUsuario: ana.idUsuario,
        idCliente: c4.id,
        estadoIntranet: "Anulado",
      })
      .returning();
    const anulado = await registrarPresupuesto(
      db,
      ana,
      "d.png",
      PNG,
      presupuesto({
        numero: "7005-00",
        cliente: "Pedro Anulado",
        email: "pedro@ejemplo.test",
        telefono: "633444555",
        codigoPostal: "28200",
      }),
    );
    expect(anulado.potencial.estado).toBe("activo");
    // …y si luego se cierra la venta, el cotejo lo detecta (solo lectura sobre los expedientes)
    await db
      .update(expedientes)
      .set({ estadoIntranet: "Archivado" })
      .where(eq(expedientes.idExpediente, e4.idExpediente));
    expect(await cotejarPotenciales(db, [anulado.potencial.id])).toMatchObject({
      compraron: 1,
      cambiados: 1,
    });
    expect((await db.select().from(expedientes)).length).toBe(4);
  });

  it("las bajas no se tocan, se pueden reactivar, y cada vendedor solo ve los suyos", async () => {
    const ana = await crearUsuarioPrueba("vendedor", "Ana");
    const berta = await crearUsuarioPrueba("vendedor", "Berta");
    const admin = await crearUsuarioPrueba("administrador", "Admin");
    const r = await registrarPresupuesto(db, ana, "a.png", PNG, presupuesto());
    const id = r.potencial.id;
    expect(await listarPotenciales(db, berta)).toHaveLength(0);
    expect(await listarPotenciales(db, admin)).toHaveLength(1);
    await expect(leerPotencial(db, berta, id)).rejects.toThrow(/no encontrado/);
    const baja = await cambiarPotencial(db, ana, id, { accion: "baja" });
    expect(baja).toMatchObject({
      estado: "baja",
      baja_motivo: "Dada de baja a mano",
    });
    await cotejarPotenciales(db);
    expect((await leerPotencial(db, ana, id)).estado).toBe("baja");
    expect((await resumenPotenciales(db, ana)).baja).toBe(1);
    expect(
      (await cambiarPotencial(db, ana, id, { accion: "reactivar" })).estado,
    ).toBe("activo");
    await eliminarPotencial(db, ana, id);
    expect(await listarPotenciales(db, admin)).toHaveLength(0);
  });

  it("compara nombres sin importar acentos, mayúsculas ni el orden", () => {
    expect(claveNombre("López Pérez, ANA")).toBe(
      claveNombre("ana lopez perez"),
    );
  });
});
