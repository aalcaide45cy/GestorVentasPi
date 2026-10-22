import { eq } from "drizzle-orm";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { commissionFinanceRates, commissionPlans, expedientes, marcas, pendientesCobro, rejillaFilas, rejillas, usuarios } from "@/db/schema";
import { crearUsuarioPrueba, reiniciarBd } from "../../../tests/ayudas";
import { crearPendiente, eliminarPendiente } from "./comisiones-gestion";
import { esquemaCrearExpediente } from "./expedientes";
import { crearExpediente } from "./expedientes-escritura";
import { existsSync, writeFileSync } from "node:fs";
import path from "node:path";
import { copiasSeguridad } from "@/db/schema";
import { borrarCopia, dirCopias } from "./copias";
import { borrarCopiaInterna, crearCopiaInterna } from "./copias-seccion";
import { crearIncidenciaManual, eliminarIncidencias, listarIncidencias } from "./incidencias";
import { eliminarUsuario, eliminarUsuarioConTodo } from "./usuarios";
import { filasPapelera, resumenPapelera, restaurar } from "./papelera";
import { eliminarPlan, guardarPlan } from "./planes";
import { eliminarRejilla, esquemaGuardarRejilla, guardarRejilla } from "./rejillas";

// Las copias de prueba van a una carpeta temporal, nunca a la de copias de verdad
let carpetaTemporal = "";
beforeAll(() => {
  carpetaTemporal = mkdtempSync(path.join(os.tmpdir(), "gv-pap-elem-"));
  process.env.BACKUP_DIR = carpetaTemporal;
});
afterAll(() => rmSync(carpetaTemporal, { recursive: true, force: true }));
beforeEach(reiniciarBd);

const hoja = (mes: string, matriculas: string[]) => esquemaGuardarRejilla.parse({ mes, origen: "excel", filas: matriculas.map((m) => ({ matricula: m, importe: 5000, concepto: "Coche" })) });

describe("papelera de elementos sueltos", () => {
  it("una rejilla eliminada se guarda con sus filas y se restaura igual", async () => {
    const u = await crearUsuarioPrueba("vendedor", "Ana");
    await guardarRejilla(db, u.idUsuario, u.idUsuario, hoja("2026-07", ["1234BCD", "5678FGH"]));
    await eliminarRejilla(db, u.idUsuario, "2026-07");
    expect(await db.select().from(rejillas)).toHaveLength(0);
    const resumen = (await resumenPapelera(db)).find((c) => c.categoria === "elementos");
    expect(resumen).toMatchObject({ cantidad: 1, restaurable: true, porSubtipo: { rejilla: 1 } });
    const fila = (await filasPapelera(db, "elementos")).filas[0];
    expect(fila).toMatchObject({ subtipo: "rejilla", texto: expect.stringContaining("2026-07") });
    const r = await restaurar(db, { accion: "restaurar", categoria: "elementos", ids: [fila.id] });
    expect(r).toMatchObject({ restaurados: 1, bloqueados: 0 });
    const [cab] = await db.select().from(rejillas);
    expect(cab).toMatchObject({ mes: "2026-07", idUsuario: u.idUsuario });
    expect((await db.select().from(rejillaFilas).where(eq(rejillaFilas.idRejilla, cab.id))).map((f) => f.matricula).sort()).toEqual(["1234BCD", "5678FGH"]);
    expect((await filasPapelera(db, "elementos")).total).toBe(0);
  });

  it("al guardar otra rejilla del mismo mes, la anterior queda en la Papelera y no se restaura mientras haya otra", async () => {
    const u = await crearUsuarioPrueba("vendedor", "Ana");
    await guardarRejilla(db, u.idUsuario, u.idUsuario, hoja("2026-07", ["1111AAA"]));
    await guardarRejilla(db, u.idUsuario, u.idUsuario, hoja("2026-07", ["2222BBB"]));
    const fila = (await filasPapelera(db, "elementos")).filas[0];
    expect(fila.detalle).toMatch(/Sustituida/);
    const r = await restaurar(db, { accion: "restaurar", categoria: "elementos", ids: [fila.id] });
    expect(r.restaurados).toBe(0);
    expect(r.bloqueados).toBe(1);
    expect(r.detalle.join(" ")).toMatch(/ya hay otro igual/);
    // Sigue en la Papelera para poder restaurarla cuando se quite la otra
    expect((await filasPapelera(db, "elementos")).total).toBe(1);
  });

  it("un pendiente de cobro eliminado se restaura", async () => {
    const u = await crearUsuarioPrueba("vendedor", "Ana");
    const p = await crearPendiente(db, u.idUsuario, { concepto: "Bonus extra", importe: 12000 });
    await eliminarPendiente(db, u.idUsuario, p.id);
    expect(await db.select().from(pendientesCobro)).toHaveLength(0);
    const fila = (await filasPapelera(db, "elementos")).filas[0];
    expect(fila.subtipo).toBe("pendiente_cobro");
    await restaurar(db, { accion: "restaurar", categoria: "elementos", ids: [fila.id] });
    expect((await db.select().from(pendientesCobro))[0]).toMatchObject({ concepto: "Bonus extra", importe: 12000 });
  });

  it("un plan eliminado se guarda con sus tarifas y se restaura entero", async () => {
    const [marca] = await db.insert(marcas).values({ nombre: "Dacia" }).returning();
    const fila = { idMarca: marca.idMarca, tipoFinanciacion: "CREDITO" as const, aplicaA: "VN", importe: 5000 };
    const g = await guardarPlan(db, null, { nombre: "Octubre 2026", fechaInicio: "2026-10-01", fechaFin: "2026-10-31", financiacion: [fila] });
    const id = g.plan.idPlan;
    await eliminarPlan(db, id);
    expect(await db.select().from(commissionPlans)).toHaveLength(0);
    expect(await db.select().from(commissionFinanceRates)).toHaveLength(0);
    const guardado = (await filasPapelera(db, "elementos")).filas[0];
    expect(guardado).toMatchObject({ subtipo: "plan", texto: expect.stringContaining("Octubre 2026") });
    const r = await restaurar(db, { accion: "restaurar", categoria: "elementos", ids: [guardado.id] });
    expect(r).toMatchObject({ restaurados: 1, bloqueados: 0 });
    expect((await db.select().from(commissionPlans))[0]).toMatchObject({ idPlan: id, nombre: "Octubre 2026" });
    expect((await db.select().from(commissionFinanceRates))[0]).toMatchObject({ idPlan: id, importe: 5000 });
  });

  it("un usuario eliminado con todo lo suyo se restaura con sus credenciales y sus expedientes", async () => {
    const admin = await crearUsuarioPrueba("administrador", "Admin");
    const ana = await crearUsuarioPrueba("vendedor", "Ana");
    const [antes] = await db.select().from(usuarios).where(eq(usuarios.idUsuario, ana.idUsuario));
    const exp = await crearExpediente(db, ana, esquemaCrearExpediente.parse({ cliente: { nombre: "Cliente de Ana", dni: "33333333P" }, expediente: {} }));
    await guardarRejilla(db, ana.idUsuario, ana.idUsuario, hoja("2026-07", ["1234BCD"]));
    await eliminarUsuarioConTodo(db, admin, ana.idUsuario);
    expect(await db.select().from(usuarios).where(eq(usuarios.idUsuario, ana.idUsuario))).toHaveLength(0);
    const fila = (await filasPapelera(db, "elementos")).filas.find((f) => f.subtipo === "usuario");
    expect(fila?.texto).toContain("Ana");
    const r = await restaurar(db, { accion: "restaurar", categoria: "elementos", ids: [(fila as { id: string }).id] });
    expect(r).toMatchObject({ restaurados: 1, bloqueados: 0 });
    const [despues] = await db.select().from(usuarios).where(eq(usuarios.idUsuario, ana.idUsuario));
    // Mismas credenciales de antes: no se cambia ninguna contraseña ni doble factor
    expect(despues).toMatchObject({ loginEmail: antes.loginEmail, passwordHash: antes.passwordHash, rol: antes.rol, totpActivo: antes.totpActivo });
    expect(await db.select().from(rejillas)).toHaveLength(1);
    const [e] = await db.select().from(expedientes).where(eq(expedientes.idExpediente, exp.id_expediente));
    expect(e.idUsuario).toBe(ana.idUsuario);
  });

  it("no se restaura un usuario si ya hay otro con el mismo correo, y se puede eliminar uno simple y restaurarlo", async () => {
    const admin = await crearUsuarioPrueba("administrador", "Admin");
    const beto = await crearUsuarioPrueba("vendedor", "Beto");
    await eliminarUsuario(db, admin, beto.idUsuario);
    const fila = (await filasPapelera(db, "elementos")).filas.find((f) => f.subtipo === "usuario") as { id: string };
    await db.insert(usuarios).values({ loginEmail: beto.loginEmail, nombre: "Otro Beto", passwordHash: "x", rol: "vendedor" });
    const bloqueado = await restaurar(db, { accion: "restaurar", categoria: "elementos", ids: [fila.id] });
    expect(bloqueado).toMatchObject({ restaurados: 0, bloqueados: 1 });
    expect(bloqueado.detalle.join(" ")).toMatch(/ya hay otro igual/);
  });

  it("una incidencia eliminada a mano se restaura con su captura", async () => {
    const id = await crearIncidenciaManual(db, { texto: "Falla algo", ruta: "/x", contexto: {}, idUsuario: null, version: "1", captura: { mime: "image/png", datos: Buffer.from("img") } });
    expect(await eliminarIncidencias(db, [id])).toBe(1);
    expect(await listarIncidencias(db)).toHaveLength(0);
    const fila = (await filasPapelera(db, "elementos")).filas.find((f) => f.subtipo === "incidencia") as { id: string };
    expect(await restaurar(db, { accion: "restaurar", categoria: "elementos", ids: [fila.id] })).toMatchObject({ restaurados: 1 });
    const [i] = await listarIncidencias(db);
    expect(i).toMatchObject({ titulo: "Falla algo" });
    expect(i.capturas).toHaveLength(1);
  });

  it("una copia de seguridad eliminada a mano mueve su fichero a la carpeta de la Papelera y vuelve al restaurar", async () => {
    const dir = dirCopias();
    const nombre = "gv_20261022_120000_manual.dump";
    writeFileSync(path.join(dir, nombre), Buffer.from("PGDMP-de-prueba"));
    const [c] = await db.insert(copiasSeguridad).values({ nombre, tipo: "manual", tamano: 15, sha256: "x".repeat(64) }).returning();
    await borrarCopia(db, c.id, true);
    expect(existsSync(path.join(dir, nombre))).toBe(false);
    expect(existsSync(path.join(dir, "papelera", nombre))).toBe(true);
    const fila = (await filasPapelera(db, "elementos")).filas.find((f) => f.subtipo === "copia") as { id: string };
    expect(await restaurar(db, { accion: "restaurar", categoria: "elementos", ids: [fila.id] })).toMatchObject({ restaurados: 1 });
    expect(existsSync(path.join(dir, nombre))).toBe(true);
    expect(existsSync(path.join(dir, "papelera", nombre))).toBe(false);
  });

  it("una copia interna de sección eliminada se restaura", async () => {
    const u = await crearUsuarioPrueba("administrador", "Admin");
    const c = await crearCopiaInterna(db, "tiendas", u.idUsuario, "Prueba");
    await borrarCopiaInterna(db, c.id);
    const fila = (await filasPapelera(db, "elementos")).filas.find((f) => f.subtipo === "copia_seccion") as { id: string };
    expect(await restaurar(db, { accion: "restaurar", categoria: "elementos", ids: [fila.id] })).toMatchObject({ restaurados: 1 });
  });
});

