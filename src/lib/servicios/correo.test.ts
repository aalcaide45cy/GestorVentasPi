import nodemailer from "nodemailer";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { esquemaCambioCorreo, esquemaCuenta } from "@/lib/correo";
import { crearUsuarioPrueba, reiniciarBd } from "../../../tests/ayudas";
import { crearReglaAlerta, misAlertas } from "./alertas";
import { esquemaReglaAlerta } from "@/lib/alertas";
import { esquemaActualizarExpediente } from "./expedientes";
import { actualizarExpedientes } from "./expedientes-escritura";
import { esquemaCrearExpediente } from "./expedientes";
import { crearExpediente } from "./expedientes-escritura";
import {
  cambiarCorreo,
  cancelarCorreo,
  crearCorreo,
  enviarCorreo,
  extraerImagenesEnLinea,
  ponerCorreoDelCliente,
  fijarTransporteDePrueba,
  guardarAjustesCorreo,
  guardarCuenta,
  guardarPlantilla,
  listarCorreos,
  listarCuentas,
  probarCuenta,
  procesarCola,
  programarCorreos,
  reiniciarRitmoDeEnvio,
} from "./correo";

const enviados: { to: unknown; subject?: string; html?: unknown }[] = [];
let fallar = false;
beforeEach(async () => {
  await reiniciarBd();
  enviados.length = 0;
  fallar = false;
  reiniciarRitmoDeEnvio();
  fijarTransporteDePrueba(() => {
    const t = nodemailer.createTransport({ jsonTransport: true });
    return {
      sendMail: (async (op: {
        to: unknown;
        subject?: string;
        html?: unknown;
      }) => {
        if (fallar)
          throw Object.assign(new Error("Invalid login"), { code: "EAUTH" });
        enviados.push(op);
        return t.sendMail(op as never);
      }) as never,
    };
  });
});

const cuentaEntrada = esquemaCuenta.parse({
  nombre: "Mi Gmail",
  email: "yo@ejemplo.test",
  proveedor: "gmail",
  host: "smtp.gmail.com",
  puerto: 465,
  seguro: true,
  usuario_smtp: "yo@ejemplo.test",
  password: "secreto-123",
  firma: "Alfonso",
});

async function escenario() {
  const ana = await crearUsuarioPrueba("vendedor", "Ana");
  const e = await crearExpediente(
    db,
    ana,
    esquemaCrearExpediente.parse({
      cliente: {
        nombre: "Cliente Uno",
        dni: "33333333P",
        emails: [{ email: "cliente@ejemplo.test" }],
      },
      expediente: {
        vin: "VF1ABC",
        fecha_entrega: "2026-12-15",
        hora_entrega: "10:30",
      },
    }),
  );
  const cuenta = await guardarCuenta(db, ana, null, cuentaEntrada);
  return { ana, id: e.id_expediente, cuenta };
}

describe("correo", () => {
  it("guarda la cuenta sin devolver la contraseña y la prueba", async () => {
    const { ana, cuenta } = await escenario();
    expect(cuenta).toMatchObject({
      email: "yo@ejemplo.test",
      con_password: true,
      enviados_hoy: 0,
    });
    expect(JSON.stringify(await listarCuentas(db, ana))).not.toContain(
      "secreto-123",
    );
    expect(await probarCuenta(db, ana, cuenta.id)).toMatch(/yo@ejemplo.test/);
    expect(enviados).toHaveLength(1);
    // La prueba lleva la firma de la cuenta
    expect(String(enviados[0].html)).toContain("Alfonso");
    // Otra persona no la ve
    const otra = await crearUsuarioPrueba("vendedor", "Berta");
    expect(await listarCuentas(db, otra)).toHaveLength(0);
    await expect(probarCuenta(db, otra, cuenta.id)).rejects.toThrow(
      /no encontrada/,
    );
  });

  it("rellena la plantilla con los datos del cliente y el expediente y la deja en borrador con el correo del cliente", async () => {
    const { ana, id, cuenta } = await escenario();
    const p = await guardarPlantilla(db, ana, null, {
      nombre: "Entrega",
      asunto: "Entrega de {matricula} {cliente}",
      cuerpo:
        "<p>Hola {cliente}, bastidor {bastidor}, entrega el {fecha_entrega_hora}.</p>{firma}",
    });
    const c = await crearCorreo(db, ana, {
      id_plantilla: p.id,
      id_expediente: id,
      id_cuenta: cuenta.id,
    });
    expect(c).toMatchObject({
      estado: "borrador",
      para: "cliente@ejemplo.test",
      cliente: "Cliente Uno",
    });
    expect(c.asunto).toBe("Entrega de  Cliente Uno");
    expect(c.cuerpo).toContain("bastidor VF1ABC");
    expect(c.cuerpo).toContain("15/12/2026 a las 10:30");
    expect(c.cuerpo).toContain("Alfonso");
  });

  it("revisa, edita y envía uno a uno; no se envía dos veces; cancelar lo deja en el histórico", async () => {
    const { ana, id, cuenta } = await escenario();
    const c = await crearCorreo(db, ana, {
      id_expediente: id,
      id_cuenta: cuenta.id,
      asunto: "Hola",
      cuerpo: "<p>Texto</p>",
    });
    const cambiado = await cambiarCorreo(db, ana, c.id, {
      asunto: "Hola de nuevo",
    });
    expect(cambiado.cuerpo).toBe("<p>Texto</p>");
    const e = await enviarCorreo(db, ana, c.id);
    expect(e.estado).toBe("enviado");
    expect(enviados).toHaveLength(1);
    expect(enviados[0].subject).toBe("Hola de nuevo");
    await expect(enviarCorreo(db, ana, c.id)).rejects.toThrow(/ya se envió/);
    const otro = await crearCorreo(db, ana, {
      id_expediente: id,
      id_cuenta: cuenta.id,
      asunto: "Otro",
      cuerpo: "x",
    });
    await cancelarCorreo(db, ana, otro.id);
    expect(
      await listarCorreos(db, ana, { estados: ["cancelado"] }),
    ).toHaveLength(1);
  });

  it("sin destinatario se queda en la cola y no se puede enviar; un cliente marcado como «no enviar» no recibe su dirección", async () => {
    const { ana, id, cuenta } = await escenario();
    const sin = await crearCorreo(db, ana, {
      id_cuenta: cuenta.id,
      asunto: "Hola",
      cuerpo: "x",
    });
    expect(sin.para).toBe("");
    await expect(enviarCorreo(db, ana, sin.id)).rejects.toThrow(
      /No hay destinatario/,
    );
    await db.execute(`update clientes set no_enviar_correos = true` as never);
    const c = await crearCorreo(db, ana, {
      id_expediente: id,
      id_cuenta: cuenta.id,
      asunto: "Hola",
      cuerpo: "x",
    });
    expect(c.para).toBe("");
    expect(c.error).toMatch(/no enviar correos/);
  });

  it("si falla el envío queda con el motivo y avisa en las notificaciones", async () => {
    const { ana, id, cuenta } = await escenario();
    const c = await crearCorreo(db, ana, {
      id_expediente: id,
      id_cuenta: cuenta.id,
      asunto: "Hola",
      cuerpo: "x",
    });
    fallar = true;
    const r = await enviarCorreo(db, ana, c.id);
    expect(r.estado).toBe("error");
    expect(r.error).toMatch(/contraseña/);
    expect((await misAlertas(db, ana)).pendientes[0].mensaje).toMatch(
      /No se pudo enviar el correo «Hola»/,
    );
    // Se corrige y se reintenta
    fallar = false;
    expect((await enviarCorreo(db, ana, c.id)).estado).toBe("enviado");
  });

  it("el envío automático manda uno tras otro respetando la pausa y el límite diario", async () => {
    const { ana, id, cuenta } = await escenario();
    await guardarAjustesCorreo(db, {
      envio_automatico: false,
      pausa_segundos: 10,
    });
    const a = await crearCorreo(db, ana, {
      id_expediente: id,
      id_cuenta: cuenta.id,
      asunto: "Uno",
      cuerpo: "x",
    });
    const b = await crearCorreo(db, ana, {
      id_expediente: id,
      id_cuenta: cuenta.id,
      asunto: "Dos",
      cuerpo: "x",
    });
    expect(await programarCorreos(db, ana, [a.id, b.id])).toBe(2);
    const t0 = Date.now();
    expect(await procesarCola(db, t0)).toBe(true);
    expect(enviados.map((x) => x.subject)).toEqual(["Uno"]);
    expect(await procesarCola(db, t0 + 5_000)).toBe(false);
    expect(await procesarCola(db, t0 + 11_000)).toBe(true);
    expect(enviados.map((x) => x.subject)).toEqual(["Uno", "Dos"]);
    // Límite diario
    await guardarCuenta(db, ana, cuenta.id, {
      ...cuentaEntrada,
      password: "",
      limite_diario: 2,
    });
    const c = await crearCorreo(db, ana, {
      id_expediente: id,
      id_cuenta: cuenta.id,
      asunto: "Tres",
      cuerpo: "x",
    });
    const r = await enviarCorreo(db, ana, c.id);
    expect(r.estado).toBe("error");
    expect(r.error).toMatch(/límite de 2 correos/);
  });

  it("una regla prepara su correo una sola vez por expediente, en la cola de la cuenta elegida", async () => {
    const { ana, id, cuenta } = await escenario();
    const admin = await crearUsuarioPrueba("administrador", "Admin");
    const p = await guardarPlantilla(db, ana, null, {
      nombre: "Matriculado",
      asunto: "Matriculado {matricula}",
      cuerpo: "<p>{cliente}: {matricula}</p>",
    });
    await crearReglaAlerta(
      db,
      admin,
      esquemaReglaAlerta.parse({
        nombre: "Aviso al cliente",
        mensaje: "{expediente} matriculado",
        definicion: {
          combinar: "todas",
          condiciones: [
            { campo: "matricula", operador: "no_vacio", valor: "" },
          ],
          correo: { id_plantilla: p.id, id_cuenta: cuenta.id, para: "cliente" },
        },
      }),
    );
    const guardar = (matricula: string) =>
      actualizarExpedientes(
        db,
        ana,
        esquemaActualizarExpediente.parse({
          modo: "uno",
          id_expediente: id,
          expediente: { matricula },
        }),
      );
    expect(await listarCorreos(db, ana)).toHaveLength(0);
    await guardar("1234ABC");
    const [c] = await listarCorreos(db, ana);
    expect(c).toMatchObject({
      estado: "borrador",
      origen: "regla",
      regla: "Aviso al cliente",
      para: "cliente@ejemplo.test",
      asunto: "Matriculado 1234ABC",
    });
    // Cambiar la matrícula no repite el correo
    await guardar("9999ZZZ");
    expect(await listarCorreos(db, ana)).toHaveLength(1);
    // Con el envío automático, el siguiente sale programado
    await guardarAjustesCorreo(db, {
      envio_automatico: true,
      pausa_segundos: 5,
    });
    const e2 = await crearExpediente(
      db,
      ana,
      esquemaCrearExpediente.parse({
        cliente: {
          nombre: "Cliente Dos",
          dni: "44444444A",
          emails: [{ email: "dos@ejemplo.test" }],
        },
        expediente: {},
      }),
    );
    await actualizarExpedientes(
      db,
      ana,
      esquemaActualizarExpediente.parse({
        modo: "uno",
        id_expediente: e2.id_expediente,
        expediente: { matricula: "1111AAA" },
      }),
    );
    expect(
      (await listarCorreos(db, ana, { estados: ["programado"] }))[0],
    ).toMatchObject({ para: "dos@ejemplo.test" });
  });

  it("las imágenes en línea (firma) pasan a imágenes incrustadas del correo y la firma se añade sola a las plantillas que no la llevan", async () => {
    const { ana, id, cuenta } = await escenario();
    const png =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    const r = extraerImagenesEnLinea(
      `<p>Hola</p><img src="data:image/png;base64,${png}" width="50"><img src="https://ejemplo.test/a.png">`,
    );
    expect(r.incrustadas).toHaveLength(1);
    expect(r.incrustadas[0]).toMatchObject({ contentType: "image/png" });
    expect(r.html).toContain(`src="cid:${r.incrustadas[0].cid}"`);
    expect(r.html).toContain("https://ejemplo.test/a.png");
    expect(r.html).not.toContain("base64");
    // Una plantilla sin {firma} lleva la de la cuenta al final
    const p = await guardarPlantilla(db, ana, null, {
      nombre: "Sin firma",
      asunto: "Hola",
      cuerpo: "<p>Texto</p>",
    });
    const c = await crearCorreo(db, ana, {
      id_plantilla: p.id,
      id_expediente: id,
      id_cuenta: cuenta.id,
    });
    expect(c.cuerpo).toContain("Texto");
    expect(c.cuerpo).toContain("Alfonso");
  });

  it("las plantillas pueden llevar destinatarios: mandan sobre el correo del cliente, admiten campos y se respeta «no enviar»", async () => {
    const { ana, id, cuenta } = await escenario();
    const fija = await guardarPlantilla(db, ana, null, {
      nombre: "A jefe",
      asunto: "Aviso",
      para: "jefe@ejemplo.test, otro@ejemplo.test",
      cuerpo: "<p>x</p>",
    });
    expect(
      (
        await crearCorreo(db, ana, {
          id_plantilla: fija.id,
          id_expediente: id,
          id_cuenta: cuenta.id,
        })
      )?.para,
    ).toBe("jefe@ejemplo.test, otro@ejemplo.test");
    const mixta = await guardarPlantilla(db, ana, null, {
      nombre: "Mixta",
      asunto: "Aviso 2",
      para: "{email_cliente}, jefe@ejemplo.test",
      cuerpo: "<p>x</p>",
    });
    expect(
      (
        await crearCorreo(db, ana, {
          id_plantilla: mixta.id,
          id_expediente: id,
          id_cuenta: cuenta.id,
        })
      )?.para,
    ).toBe("cliente@ejemplo.test, jefe@ejemplo.test");
    // Lo pedido expresamente manda sobre la plantilla
    expect(
      (
        await crearCorreo(db, ana, {
          id_plantilla: mixta.id,
          id_expediente: id,
          id_cuenta: cuenta.id,
          para: "otra@ejemplo.test",
        })
      )?.para,
    ).toBe("otra@ejemplo.test");
    // Cliente marcado como «no enviar»: su dirección no se pone, la fija sí
    await db.execute(`update clientes set no_enviar_correos = true` as never);
    const c = await crearCorreo(db, ana, {
      id_plantilla: mixta.id,
      id_expediente: id,
      id_cuenta: cuenta.id,
    });
    expect(c.para).toBe("jefe@ejemplo.test");
    expect(c.error).toMatch(/no enviar correos/);
  });

  it("la firma de la cuenta es opcional en cada plantilla", async () => {
    const { ana, id, cuenta } = await escenario();
    const con = await guardarPlantilla(db, ana, null, {
      nombre: "Con",
      asunto: "A",
      cuerpo: "<p>Texto</p>",
    });
    const sin = await guardarPlantilla(db, ana, null, {
      nombre: "Sin",
      asunto: "B",
      con_firma: false,
      cuerpo: "<p>Texto</p>",
    });
    expect(
      (
        await crearCorreo(db, ana, {
          id_plantilla: con.id,
          id_expediente: id,
          id_cuenta: cuenta.id,
        })
      ).cuerpo,
    ).toContain("Alfonso");
    expect(
      (
        await crearCorreo(db, ana, {
          id_plantilla: sin.id,
          id_expediente: id,
          id_cuenta: cuenta.id,
        })
      ).cuerpo,
    ).not.toContain("Alfonso");
    // Aunque el cuerpo venga ya escrito (el que se ve al elegir la plantilla), la firma se añade
    expect(
      (
        await crearCorreo(db, ana, {
          id_plantilla: con.id,
          id_expediente: id,
          id_cuenta: cuenta.id,
          cuerpo: "<p>Texto</p>",
        })
      ).cuerpo,
    ).toContain("Alfonso");
  });

  it("las plantillas llevan CC y CCO, el envío los usa y, si el cliente no quiere correos, se avisa y se puede forzar", async () => {
    const { ana, id, cuenta } = await escenario();
    const p = await guardarPlantilla(db, ana, null, {
      nombre: "Con copias",
      asunto: "Aviso",
      para: "{email_cliente}",
      cc: "cc@ejemplo.test",
      cco: "yo@ejemplo.test, {email_cliente}",
      cuerpo: "<p>x</p>",
    });
    const c = await crearCorreo(db, ana, {
      id_plantilla: p.id,
      id_expediente: id,
      id_cuenta: cuenta.id,
    });
    expect(c).toMatchObject({
      para: "cliente@ejemplo.test",
      cc: "cc@ejemplo.test",
      cco: "yo@ejemplo.test, cliente@ejemplo.test",
    });
    await enviarCorreo(db, ana, c.id);
    expect(enviados.at(-1)).toMatchObject({
      to: ["cliente@ejemplo.test"],
      cc: ["cc@ejemplo.test"],
      bcc: ["yo@ejemplo.test", "cliente@ejemplo.test"],
    });
    // Cliente que no quiere correos: no se pone su dirección en ningún sitio, avisa y se puede forzar
    await db.execute(`update clientes set no_enviar_correos = true` as never);
    const m = await crearCorreo(db, ana, {
      id_plantilla: p.id,
      id_expediente: id,
      id_cuenta: cuenta.id,
    });
    expect(m).toMatchObject({
      para: "",
      cc: "cc@ejemplo.test",
      cco: "yo@ejemplo.test",
    });
    expect(m.error).toMatch(/Enviar al cliente igualmente/);
    expect(
      (await misAlertas(db, ana)).pendientes.some((a) =>
        /no enviar correos/.test(a.mensaje),
      ),
    ).toBe(true);
    const forzado = await ponerCorreoDelCliente(db, ana, m.id);
    expect(forzado).toMatchObject({
      para: "cliente@ejemplo.test",
      error: null,
    });
    expect((await enviarCorreo(db, ana, m.id)).estado).toBe("enviado");
  });
});
