import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { adjuntos, clientes, expedientes, pagosRci, tipoDeVenta } from "@/db/schema";
import { crearUsuarioPrueba, reiniciarBd } from "../../../tests/ayudas";
import { aplicarPago, buscarExpedienteDePago, deshacerPago, editarPago, ignorarPago, listarPagos, procesarPago } from "./pagos-rci";

beforeEach(reiniciarBd);

const PDF = Buffer.from("%PDF-1.4\n%prueba\n");
const pagoTexto = (o: { op?: string; fecha?: string; nif?: string; vin?: string; mat?: string } = {}) => `Nº: ${o.op ?? "202600072629"}
DETALLE DE LA LIQUIDACIÓN DE PAGO
RCI Banque S.A., Sucursal en España
NÚMERO DE OPERACIÓN  FECHA DE PAGO  PUNTO DE RED
${o.op ?? "202600072629"}  ${o.fecha ?? "10/10/2026"}  5081
DATOS VEHÍCULO
Marca  Modelo  Matrícula  Fecha Matriculación  Número de Chasis
DACIA  SANDERO STEPWAY  ${o.mat ?? ""}  ${o.vin ?? "UU1DJF00477657076"}
DATOS ADQUIRIENTE
Nombre y Apellidos/Razón Social:  Francisco MAYOR CASADO  N.I.F.:  ${o.nif ?? "51701814E"}
Domicilio:  CALLE de la cijara,14  Código postal:  28522
DATOS DE LA PERSONA QUE REPRESENTA A RCI BANQUE S.A., Sucursal en España
Nombre y Apellidos/Razón Social:  VAZQUEZ AGUILERA, ANA BELEN  N.I.F.:  50826230W
IMPORTE NOMINAL DEL PRÉSTAMO  5.757,67  euros`;

async function escenario(dni = "51701814E") {
  const admin = await crearUsuarioPrueba("administrador");
  const [tipo] = await db.insert(tipoDeVenta).values({ nombreTipoVenta: "Financiado", categoria: "financiado", requiereRciAlMatricular: true }).returning();
  const [cli] = await db.insert(clientes).values({ clienteId: "c1", nombre: "Francisco Mayor Casado", dni }).returning();
  const [exp] = await db.insert(expedientes).values({ idUsuario: admin.idUsuario, idCliente: cli.id, idTipoDeVenta: tipo.idTipoDeVenta }).returning();
  return { admin, cli, exp, tipo };
}
const rci = async (id: number) => (await db.select().from(expedientes).where(eq(expedientes.idExpediente, id)))[0].fechaRci;

describe("pagos de la financiera", () => {
  it("encuentra el expediente por el documento del cliente (con o sin ceros) y fija la fecha RCI con la fecha de pago", async () => {
    const { admin, exp, cli } = await escenario("051701814E");
    await db.update(clientes).set({ dni: "0051701814E" }).where(eq(clientes.id, cli.id));
    const p = await procesarPago(db, admin, { datos: PDF, nombre: "pago_rci.pdf" }, pagoTexto());
    expect(p.estado).toBe("aplicado");
    expect(p.idExpediente).toBe(exp.idExpediente);
    expect(p.fechaPago).toBe("2026-10-10");
    expect(await rci(exp.idExpediente)).toBe("2026-10-10");
    // El PDF pasa al expediente
    expect((await db.select().from(adjuntos).where(eq(adjuntos.id, p.idAdjunto as number)))[0]).toMatchObject({ idExpediente: exp.idExpediente, tipo: "pago_rci" });
  });

  it("por bastidor basta, salvo que el documento lo contradiga", async () => {
    const { admin, exp } = await escenario();
    await db.update(expedientes).set({ vin: "UU1DJF00477657076" }).where(eq(expedientes.idExpediente, exp.idExpediente));
    const bien = await buscarExpedienteDePago(db, admin, { nif: "", bastidor: "UU1DJF00477657076", matricula: "", fechaPago: "2026-10-10" });
    expect(bien.exp?.id).toBe(exp.idExpediente);
    expect(bien.como).toBe("bastidor");
    const mal = await procesarPago(db, admin, { datos: PDF, nombre: "a.pdf" }, pagoTexto({ nif: "11111111H" }));
    expect(mal.estado).toBe("pendiente");
    expect(mal.motivo).toContain("documento del cliente es distinto");
    expect(await rci(exp.idExpediente)).toBeNull();
  });

  it("en un usado busca por matrícula", async () => {
    const { admin, exp } = await escenario();
    await db.update(expedientes).set({ matricula: "3881LYM" }).where(eq(expedientes.idExpediente, exp.idExpediente));
    const p = await procesarPago(db, admin, { datos: PDF, nombre: "a.pdf" }, pagoTexto({ mat: "3881LYM", vin: "UU1DJF00868900901" }));
    expect(p.estado).toBe("aplicado");
    expect(p.motivo).toContain("matricula");
  });

  it("sin expediente del cliente queda pendiente y no se inventa nada; con varios, pide elegir", async () => {
    const { admin, exp, cli, tipo } = await escenario();
    await db.delete(expedientes).where(eq(expedientes.idExpediente, exp.idExpediente));
    const sin = await procesarPago(db, admin, { datos: PDF, nombre: "a.pdf" }, pagoTexto());
    expect(sin.estado).toBe("pendiente");
    expect(sin.idExpediente).toBeNull();
    expect(await db.select().from(expedientes)).toHaveLength(0);

    const [a] = await db.insert(expedientes).values({ idUsuario: admin.idUsuario, idCliente: cli.id, idTipoDeVenta: tipo.idTipoDeVenta }).returning();
    const [b] = await db.insert(expedientes).values({ idUsuario: admin.idUsuario, idCliente: cli.id, idTipoDeVenta: tipo.idTipoDeVenta }).returning();
    const duda = await procesarPago(db, admin, { datos: PDF, nombre: "b.pdf" }, pagoTexto({ op: "202600000002" }));
    expect(duda.estado).toBe("pendiente");
    expect(duda.motivo).toContain("varios expedientes");
    // Se elige a mano y se aplica
    const hecho = await aplicarPago(db, admin, duda.id, { idExpediente: b.idExpediente });
    expect(hecho.estado).toBe("aplicado");
    expect(await rci(b.idExpediente)).toBe("2026-10-10");
    expect(await rci(a.idExpediente)).toBeNull();
  });

  it("un documento que no es un pago se ignora pero se guarda para revisarlo, y un pago repetido no se duplica", async () => {
    const { admin } = await escenario();
    const otro = await procesarPago(db, admin, { datos: PDF, nombre: "pedido.pdf" }, "PEDIDO DE VENTA Renault Retail Group");
    expect(otro.estado).toBe("ignorado");
    expect(otro.idAdjunto).not.toBeNull();
    const primero = await procesarPago(db, admin, { datos: PDF, nombre: "pago.pdf" }, pagoTexto());
    const repetido = await procesarPago(db, admin, { datos: PDF, nombre: "pago copia.pdf" }, pagoTexto());
    expect(repetido.duplicado).toBe(true);
    expect(repetido.id).toBe(primero.id);
    expect((await listarPagos(db, admin)).filter((x) => x.estado !== "ignorado")).toHaveLength(1);
    expect(await db.select().from(adjuntos)).toHaveLength(2);
  });

  it("si el expediente ya tiene otra fecha RCI no la pisa sin preguntar; deshacer devuelve la anterior", async () => {
    const { admin, exp } = await escenario();
    await db.update(expedientes).set({ fechaRci: "2026-09-01" }).where(eq(expedientes.idExpediente, exp.idExpediente));
    const p = await procesarPago(db, admin, { datos: PDF, nombre: "a.pdf" }, pagoTexto());
    expect(p.estado).toBe("pendiente");
    expect(await rci(exp.idExpediente)).toBe("2026-09-01");
    const a = await aplicarPago(db, admin, p.id, { idExpediente: exp.idExpediente });
    expect(a.fechaRciAnterior).toBe("2026-09-01");
    expect(await rci(exp.idExpediente)).toBe("2026-10-10");
    const d = await deshacerPago(db, admin, p.id);
    expect(d.estado).toBe("pendiente");
    expect(await rci(exp.idExpediente)).toBe("2026-09-01");
  });

  it("se puede corregir a mano una fecha mal leída y ignorar o recuperar un pago", async () => {
    const { admin, exp } = await escenario();
    const p = await procesarPago(db, admin, { datos: PDF, nombre: "a.pdf" }, pagoTexto({ fecha: "" }));
    expect(p.estado).toBe("pendiente");
    expect(p.fechaPago).toBeNull();
    await expect(aplicarPago(db, admin, p.id, { idExpediente: exp.idExpediente })).rejects.toThrow("fecha de pago");
    const e = await editarPago(db, admin, { id: p.id, fechaPago: "2026-10-12" });
    expect(e.fechaPago).toBe("2026-10-12");
    expect((await aplicarPago(db, admin, p.id, { idExpediente: exp.idExpediente })).estado).toBe("aplicado");
    expect(await rci(exp.idExpediente)).toBe("2026-10-12");
    await deshacerPago(db, admin, p.id);
    expect((await ignorarPago(db, admin, p.id)).estado).toBe("ignorado");
    expect((await ignorarPago(db, admin, p.id, false)).estado).toBe("pendiente");
    expect((await db.select().from(pagosRci))).toHaveLength(1);
  });

  it("desde la cajita del expediente se aplica a ese expediente y avisa si el documento no es del cliente", async () => {
    const { admin, exp } = await escenario();
    await expect(procesarPago(db, admin, { datos: PDF, nombre: "a.pdf", idExpediente: exp.idExpediente }, pagoTexto({ nif: "11111111H" }))).rejects.toThrow("no es el del cliente");
    const p = await procesarPago(db, admin, { datos: PDF, nombre: "a.pdf", idExpediente: exp.idExpediente, forzar: true }, pagoTexto({ nif: "11111111H", op: "202600000003" }));
    expect(p.estado).toBe("aplicado");
    expect(await rci(exp.idExpediente)).toBe("2026-10-10");
  });
  it("al aplicar un pago a un expediente sin bastidor se anota el bastidor del pago (para que el listado lo encuentre) y al deshacer se quita", async () => {
    const { admin, exp, cli } = await escenario();
    await db.update(clientes).set({ dni: "99999999R" }).where(eq(clientes.id, cli.id));
    const p = await procesarPago(db, admin, { datos: PDF, nombre: "a.pdf" }, pagoTexto());
    expect(p.estado).toBe("pendiente");
    const hecho = await aplicarPago(db, admin, p.id, { idExpediente: exp.idExpediente });
    expect(hecho.estado).toBe("aplicado");
    const vin = async () => (await db.select().from(expedientes).where(eq(expedientes.idExpediente, exp.idExpediente)))[0].vin;
    expect(await vin()).toBe("UU1DJF00477657076");
    await deshacerPago(db, admin, p.id);
    expect(await vin()).toBeNull();
  });

  it("desde la cajita de otro expediente, un pago ya aplicado no se aplica otra vez; uno pendiente sí", async () => {
    const { admin, exp, cli, tipo } = await escenario();
    await procesarPago(db, admin, { datos: PDF, nombre: "a.pdf" }, pagoTexto());
    const [otro] = await db.insert(expedientes).values({ idUsuario: admin.idUsuario, idCliente: cli.id, idTipoDeVenta: tipo.idTipoDeVenta }).returning();
    await expect(procesarPago(db, admin, { datos: PDF, nombre: "a.pdf", idExpediente: otro.idExpediente, forzar: true }, pagoTexto())).rejects.toThrow("ya está aplicado al expediente");
    expect(await rci(otro.idExpediente)).toBeNull();
    // Un pago que quedó pendiente se aplica al expediente elegido y no se duplica
    const pendiente = await procesarPago(db, admin, { datos: PDF, nombre: "b.pdf" }, pagoTexto({ op: "202600000009", nif: "11111111H", vin: "" }));
    expect(pendiente.estado).toBe("pendiente");
    const hecho = await procesarPago(db, admin, { datos: PDF, nombre: "b.pdf", idExpediente: otro.idExpediente, forzar: true }, pagoTexto({ op: "202600000009", nif: "11111111H", vin: "" }));
    expect(hecho.id).toBe(pendiente.id);
    expect(hecho.estado).toBe("aplicado");
    expect(exp.idExpediente).not.toBe(otro.idExpediente);
  });
});
