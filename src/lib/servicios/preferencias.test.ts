import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { usuarios } from "@/db/schema";
import { esPreferenciaSincronizada } from "@/lib/preferencias-sincronizadas";
import { crearUsuarioPrueba, reiniciarBd } from "../../../tests/ayudas";
import { esquemaGuardarPreferencias, guardarPreferencias, leerPreferencias } from "./preferencias";

beforeEach(reiniciarBd);

describe("preferencias de cada usuario", () => {
  it("cada usuario guarda y lee las suyas, y guardar otra vez la misma clave la cambia", async () => {
    const ana = await crearUsuarioPrueba("vendedor", "Ana");
    const luis = await crearUsuarioPrueba("vendedor", "Luis");
    expect(await guardarPreferencias(db, ana.idUsuario, { "exp-reglas-color": "[1]", "dash-n-recientes": "10" })).toBe(2);
    await guardarPreferencias(db, luis.idUsuario, { "dash-n-recientes": "20" });
    await guardarPreferencias(db, ana.idUsuario, { "dash-n-recientes": "12" });
    expect(await leerPreferencias(db, ana.idUsuario)).toEqual({ "exp-reglas-color": "[1]", "dash-n-recientes": "12" });
    expect(await leerPreferencias(db, luis.idUsuario)).toEqual({ "dash-n-recientes": "20" });
  });

  it("ignora las claves que no se sincronizan y no guarda nada si solo hay de esas", async () => {
    const ana = await crearUsuarioPrueba("vendedor", "Ana");
    expect(await guardarPreferencias(db, ana.idUsuario, { "config-pestana": "dashboard", "subpestana-x": "y" })).toBe(0);
    expect(await leerPreferencias(db, ana.idUsuario)).toEqual({});
  });

  it("al borrar un usuario se van sus preferencias", async () => {
    const ana = await crearUsuarioPrueba("vendedor", "Ana");
    await guardarPreferencias(db, ana.idUsuario, { "clientes-orden": "nombre:asc" });
    await db.delete(usuarios).where(eq(usuarios.idUsuario, ana.idUsuario));
    expect(await leerPreferencias(db, ana.idUsuario)).toEqual({});
  });

  it("valida el cuerpo: valores de texto y no demasiados", () => {
    expect(esquemaGuardarPreferencias.safeParse({ valores: { "exp-x": "1" } }).success).toBe(true);
    expect(esquemaGuardarPreferencias.safeParse({ valores: { "exp-x": 1 } }).success).toBe(false);
    expect(esquemaGuardarPreferencias.safeParse({ valores: Object.fromEntries(Array.from({ length: 201 }, (_, i) => [`exp-${i}`, "1"])) }).success).toBe(false);
  });
});

describe("qué preferencias se sincronizan", () => {
  it("las de ajustes sí y las del momento o del equipo no", () => {
    for (const c of ["exp-reglas-color", "exp-esquemas-color", "exp-filtros-guardados", "exp-filtros-abiertos", "exp-visible-columns", "dash-orden-paneles", "dash-paneles-ocultos", "dash-n-recientes", "dash-colores-filas", "clientes-orden", "tabla-desglose-comisiones", "plegable-dash-recientes", "mostrar-anulados-expedientes", "foto-cliente-retraso-segundos"]) expect(esPreferenciaSincronizada(c), c).toBe(true);
    for (const c of ["config-pestana", "subpestana-config-expedientes", "herramientas-pestana", "dash-docs-pestana", "exp-resumen-mes", "exp-seleccion-desde", "sidebar-collapsed", "visible_expediente_ids", "expedientes-permitir-duplicados", "cotejo-mes", ""]) expect(esPreferenciaSincronizada(c), c).toBe(false);
  });
});
