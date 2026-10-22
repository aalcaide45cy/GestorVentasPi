import { and, eq, isNull, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { clientes, commissionPlans, emailsClientes, estadoVehiculo, expedientes, marcas, modelos, rejillas, tiendas, tipoDeVenta, usuarios } from "@/db/schema";
import { crearUsuarioPrueba, reiniciarBd } from "../../../tests/ayudas";
import { INFO_SECCIONES, SECCIONES, contenidoSeccion, exportarSeccion, importarSeccion, resumenSecciones } from "./intercambio";
import { guardarPlan } from "./planes";

beforeEach(reiniciarBd);

const activos = async () => (await db.select().from(clientes).where(isNull(clientes.eliminadoEn))).length;

describe("exportar e importar por secciones", () => {
  it("todas las secciones se pueden exportar y el resumen coincide con los registros", async () => {
    const resumen = await resumenSecciones(db);
    expect(resumen.map((r) => r.seccion)).toEqual([...SECCIONES]);
    for (const s of SECCIONES) {
      const p = await exportarSeccion(db, s);
      expect(p).toMatchObject({ app: "GestorVentasPi", formato: "gv-seccion-1", seccion: s });
      expect(p.registros).toBe(p.datos.length);
      expect(p.registros).toBe(resumen.find((r) => r.seccion === s)?.registros);
    }
  });

  it("la exportación de usuarios no contiene contraseñas ni secretos", async () => {
    await crearUsuarioPrueba("administrador");
    const texto = JSON.stringify(await exportarSeccion(db, "usuarios"));
    expect(texto).not.toMatch(/password|hash|totp|secreto/i);
    expect(INFO_SECCIONES.usuarios.importable).toBe(false);
  });

  it("clientes: la vista previa no cambia nada y coincide con lo que se aplica; añadir, actualizar y sustituir", async () => {
    const admin = await crearUsuarioPrueba("administrador");
    const archivo = {
      app: "GestorVentasPi",
      formato: "gv-seccion-1",
      seccion: "clientes",
      datos: [
        { dni: "11111111H", nombre: "Ana Uno", emails: [{ email: "ana@ejemplo.com", tipo: "Principal" }], telefonos: [{ telefono: "600111111" }] },
        { dni: "22222222J", nombre: "Beto Dos" },
        { dni: "33333333P" }, // sin nombre: error
        { dni: "11111111-H", nombre: "Repetido" }, // mismo DNI normalizado dentro del archivo
      ],
    };
    const previa = await importarSeccion(db, admin.idUsuario, archivo, "anadir", false);
    expect(previa).toMatchObject({ aplicado: false, total: 4, nuevos: 2, omitidos: 2 });
    expect(previa.totalErrores).toBe(2);
    expect(await activos()).toBe(0);

    const hecho = await importarSeccion(db, admin.idUsuario, archivo, "anadir", true);
    expect(hecho).toMatchObject({ aplicado: true, nuevos: 2 });
    expect(await activos()).toBe(2);

    // Segunda vez: añadir no duplica; actualizar con datos nuevos modifica lo existente
    const otra = { ...archivo, datos: [{ dni: "11111111H", nombre: "Ana Uno Editada", domicilio: "Calle Nueva 1", telefonos: [{ telefono: "699999999" }] }, { dni: "44444444A", nombre: "Carla Tres" }] };
    expect(await importarSeccion(db, admin.idUsuario, otra, "anadir", true)).toMatchObject({ nuevos: 1, omitidos: 1, actualizados: 0 });
    expect((await importarSeccion(db, admin.idUsuario, otra, "actualizar", true)).actualizados).toBe(1);
    const [ana] = await db.select().from(clientes).where(eq(clientes.dni, "11111111H"));
    expect(ana).toMatchObject({ nombre: "Ana Uno Editada", domicilio: "Calle Nueva 1" });

    // Sustituir deja solo lo del archivo (los demás se eliminan de forma lógica)
    const sust = await importarSeccion(db, admin.idUsuario, { ...archivo, datos: [{ dni: "44444444A", nombre: "Carla Tres" }] }, "sustituir", true);
    expect(sust).toMatchObject({ eliminados: 2, sinCambios: 1 });
    expect(await activos()).toBe(1);
  });

  it("acepta un archivo de una versión más nueva del formato, ignorando lo que no conoce", async () => {
    const admin = await crearUsuarioPrueba("administrador");
    const i = await importarSeccion(db, admin.idUsuario, { app: "GestorVentasPi", formato: "gv-seccion-2", campoFuturo: { x: 1 }, seccion: "clientes", datos: [{ dni: "11111111H", nombre: "Ana", campoNuevo: "ignorado" }] }, "anadir", false);
    expect(i.total).toBe(1);
    await expect(importarSeccion(db, admin.idUsuario, { app: "GestorVentasPi", formato: "otra-cosa-1", seccion: "clientes", datos: [] }, "anadir", false)).rejects.toMatchObject({ status: 400 });
  });

  it("clientes: lo exportado se vuelve a importar sin cambios (ida y vuelta)", async () => {
    const admin = await crearUsuarioPrueba("administrador");
    const [t] = await db.insert(tiendas).values({ nombre: "Rivas", ciudad: "Madrid" }).returning();
    await importarSeccion(db, admin.idUsuario, { app: "GestorVentasPi", formato: "gv-seccion-1", seccion: "clientes", datos: [{ dni: "11111111H", nombre: "Ana", tienda: "Rivas", emails: [{ email: "a@b.es", tipo: "Principal" }] }] }, "anadir", true);
    expect(t.idTienda).toBeGreaterThan(0);
    const exp = await exportarSeccion(db, "clientes");
    const r = await importarSeccion(db, admin.idUsuario, exp, "actualizar", false);
    expect(r).toMatchObject({ nuevos: 0, actualizados: 0, sinCambios: 1, totalErrores: 0 });
  });

  it("rechaza archivos que no son de la aplicación, de otra sección o de una sección no importable", async () => {
    const admin = await crearUsuarioPrueba("administrador");
    await expect(importarSeccion(db, admin.idUsuario, { hola: 1 }, "anadir", false)).rejects.toMatchObject({ status: 400 });
    await expect(importarSeccion(db, admin.idUsuario, { app: "GestorVentasPi", formato: "gv-seccion-1", seccion: "tiendas", datos: [] }, "anadir", false, "clientes")).rejects.toMatchObject({ status: 400 });
    await expect(importarSeccion(db, admin.idUsuario, { app: "GestorVentasPi", formato: "gv-seccion-1", seccion: "usuarios", datos: [] }, "anadir", false)).rejects.toMatchObject({ status: 400 });
    await expect(importarSeccion(db, admin.idUsuario, { app: "GestorVentasPi", formato: "gv-seccion-1", seccion: "planes", datos: [] }, "sustituir", false)).rejects.toMatchObject({ status: 400 });
  });

  it("catálogos: marcas y modelos se importan y se actualizan; «sustituir» no elimina nada (grabados a fuego)", async () => {
    const admin = await crearUsuarioPrueba("administrador");
    const base = (datos: unknown[]) => ({ app: "GestorVentasPi", formato: "gv-seccion-1", seccion: "marcas_modelos", datos });
    const a = await importarSeccion(db, admin.idUsuario, base([{ marca: "Alpine", modelos: [{ nombre: "A290" }, { nombre: "A110" }] }]), "anadir", true);
    expect(a.nuevos).toBe(3); // 1 marca + 2 modelos
    const [m] = await db.select().from(marcas).where(eq(marcas.nombre, "Alpine"));
    expect((await db.select().from(modelos).where(eq(modelos.marcaId, m.idMarca))).length).toBe(2);
    const b = await importarSeccion(db, admin.idUsuario, base([{ marca: "alpine", sistemaComisiones: true, modelos: [{ nombre: "A290" }] }]), "actualizar", true);
    expect(b.actualizados).toBe(1);
    const s = await importarSeccion(db, admin.idUsuario, base([{ marca: "Alpine", modelos: [{ nombre: "A290" }] }]), "sustituir", true);
    // Las marcas y los modelos están grabados a fuego: lo que no está en el archivo se conserva
    expect(s.eliminados).toBe(0);
    const vivos = await db.select().from(modelos).where(and(eq(modelos.marcaId, m.idMarca), isNull(modelos.eliminadoEn)));
    expect(vivos.map((x) => x.nombreModelo).sort()).toEqual(["A110", "A290"]);
  });

  it("expedientes: exige que existan modelo, tipo de venta y vendedor, y los importa y actualiza por bastidor", async () => {
    const admin = await crearUsuarioPrueba("administrador");
    const vendedor = await crearUsuarioPrueba("vendedor");
    const [marca] = await db.insert(marcas).values({ nombre: "Dacia" }).returning();
    await db.insert(modelos).values({ marcaId: marca.idMarca, nombreModelo: "Jogger" });
    const [tipo] = await db.select().from(tipoDeVenta).limit(1);
    const fila = { cliente: { dni: "11111111H", nombre: "Ana" }, marca: "Dacia", modelo: "Jogger", tipoVenta: tipo.nombreTipoVenta, vendedor: vendedor.loginEmail, fechaExpediente: "2026-10-01", vin: "VF1TEST0000000001", matricula: "1234BBB" };
    const paquete = (datos: unknown[]) => ({ app: "GestorVentasPi", formato: "gv-seccion-1", seccion: "expedientes", datos });

    const mal = await importarSeccion(db, admin.idUsuario, paquete([{ ...fila, modelo: "Inexistente" }, { ...fila, tipoVenta: "No existe" }, { ...fila, vendedor: "nadie@x.es" }]), "anadir", false);
    expect(mal).toMatchObject({ nuevos: 0, totalErrores: 3 });

    const r = await importarSeccion(db, admin.idUsuario, paquete([fila]), "anadir", true);
    expect(r).toMatchObject({ nuevos: 1, totalErrores: 0 });
    expect((await db.select().from(clientes)).length).toBe(1);
    const [e] = await db.select().from(expedientes);
    expect(e).toMatchObject({ vin: "VF1TEST0000000001", idUsuario: vendedor.idUsuario });

    // Mismo bastidor: añadir lo omite, actualizar cambia las fechas
    expect((await importarSeccion(db, admin.idUsuario, paquete([fila]), "anadir", false)).omitidos).toBe(1);
    const act = await importarSeccion(db, admin.idUsuario, paquete([{ ...fila, fechaAfectacion: "2026-10-05" }]), "actualizar", true);
    expect(act.actualizados).toBe(1);
    expect((await db.select().from(expedientes))[0].fechaAfectacion).toBe("2026-10-05");
    // Ida y vuelta sin cambios
    const exp = await exportarSeccion(db, "expedientes");
    expect(await importarSeccion(db, admin.idUsuario, exp, "actualizar", false)).toMatchObject({ nuevos: 0, actualizados: 0, sinCambios: 1 });
  });

  it("planes: se exporta uno o todos y se reimporta identificando marcas, modelos y vendedores por nombre", async () => {
    const admin = await crearUsuarioPrueba("administrador");
    const vendedor = await crearUsuarioPrueba("vendedor", "Vendedora");
    const [marca] = await db.insert(marcas).values({ nombre: "Dacia" }).returning();
    const [mod] = await db.insert(modelos).values({ marcaId: marca.idMarca, nombreModelo: "Jogger" }).returning();
    const creado = await guardarPlan(db, null, {
      nombre: "Octubre 2026",
      fechaInicio: "2026-10-01",
      fechaFin: "2026-10-31",
      vendedores: [{ idUsuario: vendedor.idUsuario, objetivoBase: 800 }],
      puntosModelo: [{ idModelo: mod.idModelo, puntos: 100 }],
      tasas: [{ idMarca: marca.idMarca }],
    });
    const uno = await exportarSeccion(db, "planes", { ids: [creado.plan.idPlan] });
    expect(uno.registros).toBe(1);
    expect(uno.mapas?.usuarios[String(vendedor.idUsuario)]).toBe(vendedor.loginEmail);

    // Mismo plan: añadir lo omite; actualizar lo vuelve a guardar; la vista previa no cambia nada
    expect(await importarSeccion(db, admin.idUsuario, uno, "anadir", false)).toMatchObject({ omitidos: 1, nuevos: 0 });
    expect(await importarSeccion(db, admin.idUsuario, uno, "actualizar", false)).toMatchObject({ actualizados: 1, totalErrores: 0 });

    // Borrado el plan, la importación lo recrea con las referencias de esta aplicación
    await db.delete(commissionPlans);
    const rec = await importarSeccion(db, admin.idUsuario, uno, "anadir", true);
    expect(rec).toMatchObject({ nuevos: 1, totalErrores: 0 });
    expect((await db.select().from(commissionPlans)).length).toBe(1);

    // Si falta un vendedor, el plan se omite con un mensaje claro y no se crea nada
    await db.delete(commissionPlans);
    await db.update(usuarios).set({ loginEmail: "otro@prueba.test" }).where(eq(usuarios.idUsuario, vendedor.idUsuario));
    const sin = await importarSeccion(db, admin.idUsuario, uno, "anadir", true);
    expect(sin).toMatchObject({ nuevos: 0, totalErrores: 1 });
    expect(sin.errores[0]).toMatch(/vendedor/);
    expect((await db.select().from(commissionPlans)).length).toBe(0);
  });

  it("planes: si faltan marcas o modelos se listan en la vista previa y, si se elige, se crean al importar (y la vista previa no los crea)", async () => {
    const admin = await crearUsuarioPrueba("administrador");
    const vendedor = await crearUsuarioPrueba("vendedor", "Vendedora");
    const [marca] = await db.insert(marcas).values({ nombre: "Dacia" }).returning();
    const [mod] = await db.insert(modelos).values({ marcaId: marca.idMarca, nombreModelo: "Striker" }).returning();
    const creado = await guardarPlan(db, null, {
      nombre: "Septiembre 2026",
      fechaInicio: "2026-09-01",
      fechaFin: "2026-09-30",
      vendedores: [{ idUsuario: vendedor.idUsuario, objetivoBase: 800 }],
      puntosModelo: [{ idModelo: mod.idModelo, puntos: 100 }],
      tasas: [{ idMarca: marca.idMarca }],
    });
    const archivo = JSON.parse(JSON.stringify(await exportarSeccion(db, "planes", { ids: [creado.plan.idPlan] })));
    // En esta instalación no existe ni la marca ni el modelo
    await db.delete(commissionPlans);
    // Las marcas y los modelos están grabados a fuego: para preparar la prueba se vacían sin disparadores (TRUNCATE)
    await db.execute(sql`truncate table modelos, marcas restart identity cascade`);

    const sin = await importarSeccion(db, admin.idUsuario, archivo, "anadir", false);
    expect(sin).toMatchObject({ nuevos: 0, totalErrores: 1 });
    expect(sin.faltan).toMatchObject({ marcas: ["Dacia"], modelos: ["Dacia Striker"], vendedores: [] });
    expect(sin.errores[0]).toMatch(/Crear los modelos y marcas que faltan/);

    const prev = await importarSeccion(db, admin.idUsuario, archivo, "anadir", false, undefined, { crearCatalogo: true });
    expect(prev).toMatchObject({ nuevos: 1, totalErrores: 0 });
    expect(prev.muestra.some((m) => m.texto.includes("Modelo «Dacia Striker»"))).toBe(true);
    // La vista previa no deja nada creado
    expect(await db.select().from(marcas)).toHaveLength(0);

    const hecho = await importarSeccion(db, admin.idUsuario, archivo, "anadir", true, undefined, { crearCatalogo: true });
    expect(hecho).toMatchObject({ nuevos: 1, totalErrores: 0 });
    expect((await db.select().from(marcas)).map((m) => m.nombre)).toEqual(["Dacia"]);
    expect((await db.select().from(modelos)).map((m) => m.nombreModelo)).toEqual(["Striker"]);
    expect(await db.select().from(commissionPlans)).toHaveLength(1);
  });

  it("rejillas y ajustes: ida y vuelta y los ajustes secretos no se exportan ni se importan", async () => {
    const admin = await crearUsuarioPrueba("administrador");
    const v = await crearUsuarioPrueba("vendedor");
    await db.insert(rejillas).values({ idUsuario: v.idUsuario, mes: "2026-09", origen: "manual" });
    const exp = await exportarSeccion(db, "rejillas");
    expect(exp.registros).toBe(1);
    expect(await importarSeccion(db, admin.idUsuario, exp, "anadir", false)).toMatchObject({ omitidos: 1 });
    expect((await importarSeccion(db, admin.idUsuario, exp, "actualizar", true)).actualizados).toBe(1);

    const aj = { app: "GestorVentasPi", formato: "gv-seccion-1", seccion: "ajustes", datos: [{ clave: "ajuste_de_prueba", valor: "true" }, { clave: "google_client_secret", valor: "xxx" }] };
    const r = await importarSeccion(db, admin.idUsuario, aj, "actualizar", true);
    expect(r).toMatchObject({ nuevos: 1, totalErrores: 1 });
    expect(JSON.stringify(await exportarSeccion(db, "ajustes"))).not.toMatch(/secret/i);
  });

  it("clientes y expedientes: un solo archivo que al importarlo recompone clientes (con sus correos) y expedientes enlazados", async () => {
    const admin = await crearUsuarioPrueba("administrador");
    const [marca] = await db.insert(marcas).values({ nombre: "Dacia" }).returning();
    const [modelo] = await db.insert(modelos).values({ marcaId: marca.idMarca, nombreModelo: "Sandero" }).returning();
    const [c1] = await db.insert(clientes).values({ clienteId: "c1", nombre: "Ana Lopez", dni: "12345678Z", domicilio: "Calle Sol 1" }).returning();
    await db.insert(emailsClientes).values({ idCliente: c1.id, email: "ana@correo.com", tipoEmail: "Principal" });
    await db.insert(clientes).values({ clienteId: "c2", nombre: "Sin Compras", dni: "87654321X" });
    const [pago] = await db.insert(tipoDeVenta).values({ nombreTipoVenta: "Contado", categoria: "CONTADO" }).returning();
    const [estado] = await db.insert(estadoVehiculo).values({ nombreEstadoVehiculo: "Nuevo", clase: "VN" }).returning();
    await db.insert(expedientes).values({ idUsuario: admin.idUsuario, idCliente: c1.id, idModelo: modelo.idModelo, idTipoDeVenta: pago.idTipoDeVenta, idEstadoVehiculo: estado.idEstadoVehiculo, matricula: "1234BCD", fechaExpediente: "2026-09-01" });

    const paquete = JSON.parse(JSON.stringify(await exportarSeccion(db, "clientes_expedientes")));
    expect(paquete.registros).toBe(3); // 2 clientes + 1 expediente
    expect(paquete.datos.filter((d: { _tipo: string }) => d._tipo === "cliente")).toHaveLength(2);
    expect((await resumenSecciones(db)).find((r) => r.seccion === "clientes_expedientes")?.detalle).toMatch(/2 clientes y 1 expedientes/);

    // Se borran los expedientes y los clientes y se importa el archivo: vuelve todo, enlazado
    await db.delete(expedientes);
    await db.delete(emailsClientes);
    await db.delete(clientes);
    const previa = await importarSeccion(db, admin.idUsuario, paquete, "anadir", false);
    expect(previa.aplicado).toBe(false);
    expect(await activos()).toBe(0);
    const r = await importarSeccion(db, admin.idUsuario, paquete, "anadir", true);
    expect(r.errores).toEqual([]);
    expect(r.nuevos).toBe(3);
    const ana = (await db.select().from(clientes).where(eq(clientes.dni, "12345678Z")))[0];
    expect(ana.domicilio).toBe("Calle Sol 1");
    expect((await db.select().from(emailsClientes).where(eq(emailsClientes.idCliente, ana.id))).map((e) => e.email)).toEqual(["ana@correo.com"]);
    const exp = (await db.select().from(expedientes))[0];
    expect(exp.idCliente).toBe(ana.id);
    expect(exp.matricula).toBe("1234BCD");
    expect(await activos()).toBe(2);
  });

  it("el contenido de una sección se puede ver como tabla (clientes con sus correos, y clientes y expedientes en dos tablas)", async () => {
    const admin = await crearUsuarioPrueba("administrador");
    const [c1] = await db.insert(clientes).values({ clienteId: "c1", nombre: "Ana Lopez", dni: "12345678Z" }).returning();
    await db.insert(emailsClientes).values([{ idCliente: c1.id, email: "ana@correo.com" }, { idCliente: c1.id, email: "ana2@correo.com" }]);
    await db.insert(expedientes).values({ idUsuario: admin.idUsuario, idCliente: c1.id, matricula: "1234BCD" });

    const c = await contenidoSeccion(db, "clientes");
    expect(c.partes).toHaveLength(1);
    expect(c.partes[0].columnas.map((x) => x.etiqueta)).toEqual(expect.arrayContaining(["DNI/NIF", "Nombre", "Emails"]));
    expect(c.partes[0].filas[0]).toMatchObject({ dni: "12345678Z", nombre: "Ana Lopez", emails: "ana@correo.com, ana2@correo.com" });

    const j = await contenidoSeccion(db, "clientes_expedientes");
    expect(j.partes.map((p) => [p.titulo, p.total])).toEqual([["Clientes", 1], ["Expedientes", 1]]);
    expect(j.partes[1].filas[0]).toMatchObject({ matricula: "1234BCD", cliente: "Ana Lopez (12345678Z)" });
  });
});
