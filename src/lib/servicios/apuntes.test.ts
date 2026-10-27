import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { apuntesExpediente, apuntesPredefinidos, papeleraElementos } from "@/db/schema";
import { crearUsuarioPrueba, reiniciarBd } from "../../../tests/ayudas";
import { actualizarApunte, actualizarPredefinido, anadirRapido, anadirVoRetoma, apuntesPorExpediente, crearApunte, crearPredefinido, eliminarApunte, eliminarPredefinido, esquemaApunte, esquemaPredefinido, listarApuntes, listarPredefinidos } from "./apuntes";
import { esquemaCrearExpediente } from "./expedientes";
import { crearExpediente } from "./expedientes-escritura";
import { restaurar } from "./papelera";

beforeEach(reiniciarBd);

async function escenario() {
  const admin = await crearUsuarioPrueba("administrador", "Admin");
  const ana = await crearUsuarioPrueba("vendedor", "Ana");
  const otra = await crearUsuarioPrueba("vendedor", "Otra");
  const exp = await crearExpediente(db, ana, esquemaCrearExpediente.parse({ cliente: { nombre: "Cliente", dni: "33333333P" }, expediente: {} }));
  return { admin, ana, otra, idExpediente: exp.id_expediente };
}

describe("apuntes de los expedientes", () => {
  it("vienen de serie Seguro (sin etiqueta en la lista) y VO de retoma (con etiqueta VO)", async () => {
    const p = await listarPredefinidos(db);
    expect(p.find((x) => x.clave === "seguro")).toMatchObject({ titulo: "Seguro", mostrar_etiqueta: false, rapido: true });
    expect(p.find((x) => x.clave === "vo-retoma")).toMatchObject({ etiqueta: "VO", mostrar_etiqueta: true });
  });

  it("el botón rápido añade el apunte una sola vez por más que se pulse", async () => {
    const { ana, idExpediente } = await escenario();
    const seguro = (await listarPredefinidos(db)).find((x) => x.clave === "seguro")!;
    const resultados = await Promise.all(Array.from({ length: 10 }, () => anadirRapido(db, ana, idExpediente, seguro.id)));
    expect(resultados.filter((r) => r.creado)).toHaveLength(1);
    expect(await listarApuntes(db, idExpediente)).toHaveLength(1);
    expect((await anadirRapido(db, ana, idExpediente, seguro.id)).creado).toBe(false);
  });

  it("las líneas escritas a mano sí pueden repetirse, y se editan", async () => {
    const { ana, idExpediente } = await escenario();
    const e = esquemaApunte.parse({ titulo: "Llamar al cliente", descripcion: "El lunes", etiqueta: "LLAMAR", mostrar_etiqueta: true });
    const a1 = await crearApunte(db, ana, idExpediente, e);
    await crearApunte(db, ana, idExpediente, e);
    expect(await listarApuntes(db, idExpediente)).toHaveLength(2);
    expect((await actualizarApunte(db, ana, a1.id, { ...e, titulo: "Llamar", descripcion: "El martes" })).descripcion).toBe("El martes");
  });

  it("la lista del expediente trae las etiquetas que se deben mostrar", async () => {
    const { ana, idExpediente } = await escenario();
    expect(await anadirVoRetoma(db, ana, idExpediente, "Matrícula 1234ABC.")).toEqual({ creado: true });
    const mapa = await apuntesPorExpediente(db);
    expect(mapa.get(idExpediente)).toMatchObject([{ titulo: "VO de retoma", etiqueta: "VO", mostrar_etiqueta: true }]);
    expect((await listarApuntes(db, idExpediente))[0].descripcion).toContain("1234ABC");
    expect(await anadirVoRetoma(db, ana, idExpediente, null)).toEqual({ creado: false });
  });

  it("solo el vendedor del expediente o el administrador pueden tocarlos", async () => {
    const { admin, otra, idExpediente } = await escenario();
    const e = esquemaApunte.parse({ titulo: "Nota" });
    await expect(crearApunte(db, otra, idExpediente, e)).rejects.toThrow(/vendedor del expediente/);
    await expect(crearApunte(db, admin, idExpediente, e)).resolves.toMatchObject({ titulo: "Nota" });
  });

  it("al eliminar un apunte va a la Papelera y se restaura", async () => {
    const { ana, idExpediente } = await escenario();
    const a = await crearApunte(db, ana, idExpediente, esquemaApunte.parse({ titulo: "Seguro de prueba", etiqueta: "SEG", mostrar_etiqueta: true }));
    await eliminarApunte(db, ana, a.id);
    expect(await listarApuntes(db, idExpediente)).toHaveLength(0);
    const guardados = await db.select().from(papeleraElementos).where(eq(papeleraElementos.tipo, "apunte"));
    expect(guardados).toHaveLength(1);
    const r = await restaurar(db, { accion: "restaurar", categoria: "elementos", ids: [String(guardados[0].id)] });
    expect(r).toMatchObject({ restaurados: 1 });
    expect(await listarApuntes(db, idExpediente)).toMatchObject([{ titulo: "Seguro de prueba", etiqueta: "SEG", mostrar_etiqueta: true }]);
  });

  it("los predefinidos solo los cambia el administrador; los de la aplicación no se borran y los nuevos sí", async () => {
    const { admin, ana } = await escenario();
    const e = esquemaPredefinido.parse({ titulo: "Garantía extendida", etiqueta: "GAR", mostrar_etiqueta: true });
    await expect(crearPredefinido(db, ana, e)).rejects.toThrow(/administrador/);
    const nuevo = await crearPredefinido(db, admin, e);
    expect((await actualizarPredefinido(db, admin, nuevo.id, { ...e, color: "#10b981" })).color).toBe("#10b981");
    const seguro = (await listarPredefinidos(db)).find((x) => x.clave === "seguro")!;
    await expect(eliminarPredefinido(db, admin, seguro.id)).rejects.toThrow(/no se puede borrar/);
    await eliminarPredefinido(db, admin, nuevo.id);
    expect(await db.select().from(apuntesPredefinidos).where(eq(apuntesPredefinidos.id, nuevo.id))).toHaveLength(0);
    expect(await db.select().from(apuntesExpediente)).toHaveLength(0);
  });
});
