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
import nodemailer from "nodemailer";
import { esquemaCuenta } from "@/lib/correo";
import { crearUsuarioPrueba, reiniciarBd } from "../../../tests/ayudas";
import {
  fijarTransporteDePrueba,
  guardarCuenta,
  guardarPlantilla,
  listarCorreos,
  procesarCola,
  reiniciarRitmoDeEnvio,
} from "./correo";
import { prepararLote } from "./potenciales-envios";
import {
  revisarRespuestas,
  respuestasDe,
  type FabricaBuzon,
  type MensajeEntrante,
} from "./correo-respuestas";
import { enviarCorreo } from "./correo";
import { misAlertas } from "./alertas";
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

  it("un lote escribe a cada potencial con sus campos, deja fuera a quien ha comprado, se ha dado de baja o no tiene correo, y respeta la pausa y la comprobación previa", async () => {
    const enviados: {
      to: unknown;
      subject?: string;
      html?: unknown;
      bcc?: unknown;
      cc?: unknown;
    }[] = [];
    fijarTransporteDePrueba(() => {
      const t = nodemailer.createTransport({ jsonTransport: true });
      return {
        sendMail: (async (op: (typeof enviados)[number]) => {
          enviados.push(op);
          return t.sendMail(op as never);
        }) as never,
      };
    });
    reiniciarRitmoDeEnvio();
    const ana = await crearUsuarioPrueba("vendedor", "Ana");
    const cuenta = await guardarCuenta(
      db,
      ana,
      null,
      esquemaCuenta.parse({
        nombre: "Mi cuenta",
        email: "yo@ejemplo.test",
        proveedor: "otro",
        host: "smtp.ejemplo.test",
        puerto: 587,
        seguro: false,
        usuario_smtp: "yo",
        password: "x",
        firma: "Alfonso",
      }),
    );
    const plantilla = await guardarPlantilla(db, ana, null, {
      nombre: "Promo",
      asunto: "Tu {marca_presupuesto} {modelo_presupuesto}",
      cuerpo:
        "<p>Buenos días {nombre_pila}, estuvimos viendo un {marca_presupuesto} {modelo_presupuesto}. {baja}</p>",
    });
    const a = await registrarPresupuesto(
      db,
      ana,
      "a.png",
      PNG,
      presupuesto({
        numero: "8001-00",
        cliente: "MARTA LOPEZ SANZ",
        email: "marta@ejemplo.test",
        telefono: "600000001",
      }),
    );
    const b = await registrarPresupuesto(
      db,
      ana,
      "b.png",
      PNG,
      presupuesto({
        numero: "8002-00",
        cliente: "Luis Gil Soto",
        email: "luis@ejemplo.test",
        telefono: "600000002",
        codigoPostal: "28002",
        modeloTexto: "DACIA JOGGER extreme",
      }),
    );
    const c = await registrarPresupuesto(
      db,
      ana,
      "c.png",
      PNG,
      presupuesto({
        numero: "8003-00",
        cliente: "Sin Correo Nadie",
        email: "",
        telefono: "",
        codigoPostal: "28003",
      }),
    );
    const d = await registrarPresupuesto(
      db,
      ana,
      "d.png",
      PNG,
      presupuesto({
        numero: "8004-00",
        cliente: "Baja Persona",
        email: "baja@ejemplo.test",
        telefono: "600000004",
        codigoPostal: "28004",
      }),
    );
    await cambiarPotencial(db, ana, d.potencial.id, { accion: "baja" });
    const [cl] = await db
      .insert(clientes)
      .values({ clienteId: "x", nombre: "Otro Nombre Raro" })
      .returning();
    await db
      .insert(emailsClientes)
      .values({ idCliente: cl.id, email: "compro@ejemplo.test" });
    await db
      .insert(expedientes)
      .values({ idUsuario: ana.idUsuario, idCliente: cl.id });
    const e = await registrarPresupuesto(
      db,
      ana,
      "e.png",
      PNG,
      presupuesto({
        numero: "8005-00",
        cliente: "Compro Persona",
        email: "compro@ejemplo.test",
        telefono: "600000005",
        codigoPostal: "28005",
      }),
    );
    expect(e.potencial.estado).toBe("compro");

    const base = {
      todos: true,
      id_plantilla: plantilla.id,
      id_cuenta: cuenta.id,
      espera: 20,
      espera_max: 30,
      lote: "Lote de prueba",
    } as const;
    const pre = await prepararLote(db, ana, { ...base, modo: "previsualizar" });
    expect(pre).toMatchObject({
      incluidos: 2,
      excluidos: {
        compraron: 1,
        baja: 1,
        sinCorreo: 1,
        posibles: 0,
        yaEnviado: 0,
      },
      creados: 0,
    });
    expect(pre.ejemplo?.asunto).toMatch(/^Tu (Renault Symbioz|Dacia Jogger)$/);
    expect(pre.ejemplo?.cuerpo).toContain("BAJA");
    expect((await listarCorreos(db, ana)).length).toBe(0);

    const r = await prepararLote(db, ana, { ...base, modo: "programar" });
    expect(r.creados).toBe(2);
    const cola = await listarCorreos(db, ana, { estados: ["programado"] });
    expect(cola.map((x) => x.para).sort()).toEqual([
      "luis@ejemplo.test",
      "marta@ejemplo.test",
    ]);
    expect(
      cola.every(
        (x) => x.lote === "Lote de prueba" && x.cuerpo.includes("Alfonso"),
      ),
    ).toBe(true);
    // Una segunda vez con la misma plantilla ya no repite
    expect(
      (await prepararLote(db, ana, { ...base, modo: "previsualizar" }))
        .excluidos.yaEnviado,
    ).toBe(2);

    // Sale uno tras otro, respetando la pausa; el segundo ya ha comprado y se cancela sin enviar
    const t0 = Date.now();
    expect(await procesarCola(db, t0)).toBe(true);
    expect(enviados).toHaveLength(1);
    expect(enviados[0].bcc).toEqual([]);
    expect(await procesarCola(db, t0 + 5_000)).toBe(false);
    const [segundo] = await listarCorreos(db, ana, { estados: ["programado"] });
    const [clL] = await db
      .insert(clientes)
      .values({ clienteId: "y", nombre: "Alguien Distinto" })
      .returning();
    await db
      .insert(emailsClientes)
      .values({ idCliente: clL.id, email: segundo.para });
    await db
      .insert(expedientes)
      .values({ idUsuario: ana.idUsuario, idCliente: clL.id });
    expect(await procesarCola(db, t0 + 60_000)).toBe(true);
    expect(enviados).toHaveLength(1);
    const cancelado = (
      await listarCorreos(db, ana, { estados: ["cancelado"] })
    )[0];
    expect(cancelado.error).toMatch(/ya ha comprado/);
  });

  it("lee las respuestas de quien ha recibido un correo: «BAJA» lo da de baja y cancela lo pendiente, lo demás se guarda y avisa, y no se procesa dos veces", async () => {
    fijarTransporteDePrueba(() => ({ sendMail: (async () => ({})) as never }));
    const ana = await crearUsuarioPrueba("vendedor", "Ana");
    const cuenta = await guardarCuenta(
      db,
      ana,
      null,
      esquemaCuenta.parse({
        nombre: "Mi cuenta",
        email: "yo@ejemplo.test",
        proveedor: "otro",
        host: "smtp.ejemplo.test",
        puerto: 587,
        seguro: false,
        usuario_smtp: "yo",
        password: "x",
        leer_respuestas: true,
      }),
    );
    const plantilla = await guardarPlantilla(db, ana, null, {
      nombre: "Promo",
      asunto: "Hola",
      cuerpo: "<p>Hola {nombre_pila}. {baja}</p>",
    });
    const a = await registrarPresupuesto(
      db,
      ana,
      "a.png",
      PNG,
      presupuesto({
        numero: "9001-00",
        cliente: "Marta Lopez Sanz",
        email: "marta@ejemplo.test",
        telefono: "600000001",
      }),
    );
    const b = await registrarPresupuesto(
      db,
      ana,
      "b.png",
      PNG,
      presupuesto({
        numero: "9002-00",
        cliente: "Luis Gil Soto",
        email: "luis@ejemplo.test",
        telefono: "600000002",
        codigoPostal: "28002",
      }),
    );
    await prepararLote(db, ana, {
      todos: true,
      id_plantilla: plantilla.id,
      id_cuenta: cuenta.id,
      espera: 20,
      modo: "borradores",
      lote: "L",
    });
    // Se envía solo el de Marta; el de Luis queda pendiente en la cola
    const cola = await listarCorreos(db, ana, { estados: ["borrador"] });
    await enviarCorreo(
      db,
      ana,
      cola.find((x) => x.para === "marta@ejemplo.test")!.id,
    );

    const mensajes: MensajeEntrante[] = [
      {
        messageId: "<1@x>",
        de: "marta@ejemplo.test",
        asunto: "Re: Hola",
        fecha: new Date(Date.now() + 3_600_000),
        texto:
          "BAJA\n\nEl vie, 6 nov, Ana escribió:\n> Hola Marta. Si no quieres recibir más mensajes, responde con la palabra BAJA.",
      },
      {
        messageId: "<2@x>",
        de: "luis@ejemplo.test",
        asunto: "Re: Hola",
        fecha: new Date(Date.now() + 3_600_000),
        texto: "Me interesa, llámame mañana por favor",
      },
      {
        messageId: "<3@x>",
        de: "otro@ejemplo.test",
        asunto: "Spam",
        fecha: new Date(Date.now() + 3_600_000),
        texto: "BAJA",
      },
    ];
    const pedidas: string[][] = [];
    const fabrica: FabricaBuzon = async () => ({
      mensajes: async (_d, dirs) => {
        pedidas.push([...dirs].sort());
        return mensajes.filter((m) => dirs.has(m.de));
      },
      cerrar: async () => undefined,
    });
    const r1 = await revisarRespuestas(db, { fabrica });
    expect(pedidas[0]).toEqual(["marta@ejemplo.test"]);
    expect(r1).toMatchObject({ cuentas: 1, bajas: 1, errores: [] });
    expect((await leerPotencial(db, ana, a.potencial.id)).estado).toBe("baja");
    expect((await respuestasDe(db, a.potencial.id))[0]).toMatchObject({
      tipo: "baja",
      extracto: "BAJA",
    });
    expect(
      (await misAlertas(db, ana)).pendientes.some((x) =>
        /ha pedido la baja/.test(x.mensaje),
      ),
    ).toBe(true);
    // Segunda pasada con los mismos mensajes: no se repite nada
    expect(await revisarRespuestas(db, { fabrica })).toMatchObject({
      mensajes: 0,
      bajas: 0,
      respuestas: 0,
    });
    // Luis (que no ha recibido nada enviado) no se mira; si se le envía, su respuesta se guarda y avisa
    await enviarCorreo(
      db,
      ana,
      (await listarCorreos(db, ana, { estados: ["borrador"] })).find(
        (x) => x.para === "luis@ejemplo.test",
      )!.id,
    );
    const r3 = await revisarRespuestas(db, { fabrica });
    expect(r3).toMatchObject({ respuestas: 1, bajas: 0 });
    expect((await leerPotencial(db, ana, b.potencial.id)).estado).toBe(
      "activo",
    );
    expect((await respuestasDe(db, b.potencial.id))[0]).toMatchObject({
      tipo: "otra",
      extracto: "Me interesa, llámame mañana por favor",
    });
    // Un fallo del buzón se anota sin romper nada
    const caido: FabricaBuzon = async () => {
      throw new Error("Invalid credentials");
    };
    const r4 = await revisarRespuestas(db, { fabrica: caido });
    expect(r4.errores[0]).toMatch(/usuario o la contraseña/);
  });
});
