import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { apuntesPredefinidos, papeleraElementos } from "@/db/schema";
import { crearUsuarioPrueba, reiniciarBd } from "../../../tests/ayudas";
import { COLORES_SEMAFORO, actualizarApunte, actualizarPredefinido, anadirOQuitarMasivo, anadirRapido, anadirVoRetoma, apuntesPorExpediente, crearApunte, crearPredefinido, eliminarApunte, eliminarPredefinido, esquemaApunte, esquemaPredefinido, fijarEstadoMasivo, fijarEstadoSemaforo, listarApuntes, listarPredefinidos } from "./apuntes";
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
const predefinido = async (clave: string) => (await listarPredefinidos(db)).find((x) => x.clave === clave)!;

describe("apuntes de los expedientes", () => {
  it("vienen de serie el Seguro (semáforo que llevan todos) y VO de retoma (con etiqueta VO)", async () => {
    const seguro = await predefinido("seguro");
    expect(seguro).toMatchObject({ semaforo: true, por_defecto: true, mostrar_etiqueta: true, lado: "derecha" });
    expect(seguro.semaforo_estados.map((e) => e.color)).toEqual(["#ef4444", "#eab308", "#22c55e", "#9ca3af"]);
    expect(seguro.semaforo_estados[3]).toMatchObject({ texto: "No lleva seguro", apagado: true });
    expect(await predefinido("vo-retoma")).toMatchObject({ etiqueta: "VO", mostrar_etiqueta: true, por_defecto: false });
  });

  it("todo expediente nuevo lleva el Seguro en rojo, y se puede pasar a amarillo y verde", async () => {
    const { ana, idExpediente } = await escenario();
    const [seguro] = await listarApuntes(db, idExpediente);
    expect(seguro).toMatchObject({ titulo: "Seguro", etiqueta: "SEGURO", estado_semaforo: 0, color: "#ef4444", mostrar_etiqueta: true });
    expect((await fijarEstadoSemaforo(db, ana, seguro.id, 1)).color).toBe("#eab308");
    expect((await fijarEstadoSemaforo(db, ana, seguro.id, 2)).color).toBe("#22c55e");
    expect(await fijarEstadoSemaforo(db, ana, seguro.id, 3)).toMatchObject({ color: "#9ca3af", estados: expect.arrayContaining([expect.objectContaining({ apagado: true })]) });
    await expect(fijarEstadoSemaforo(db, ana, seguro.id, 4)).rejects.toThrow(/no válido/);
    await fijarEstadoSemaforo(db, ana, seguro.id, 2);
    expect((await apuntesPorExpediente(db)).get(idExpediente)?.[0]).toMatchObject({ estado_semaforo: 2, color: "#22c55e", lado: "derecha" });
  });

  it("al cambiar los colores o el significado desde Ajustes, todos los expedientes lo ven", async () => {
    const { admin, ana, idExpediente } = await escenario();
    const seguro = await predefinido("seguro");
    const [a] = await listarApuntes(db, idExpediente);
    await fijarEstadoSemaforo(db, ana, a.id, 1);
    const e = esquemaPredefinido.parse({ ...seguro, semaforo_estados: [{ color: "#111111", texto: "Sin pedir" }, { color: "#222222", texto: "Pedido" }, { color: "#333333", texto: "Hecho" }], lado: "izquierda" });
    await actualizarPredefinido(db, admin, seguro.id, e);
    expect((await apuntesPorExpediente(db)).get(idExpediente)?.[0]).toMatchObject({ color: "#222222", lado: "izquierda", estados: [{ texto: "Sin pedir" }, { texto: "Pedido" }, { texto: "Hecho" }] });
    // Quitar el último estado: el expediente que lo tenía pasa al primero
    await fijarEstadoSemaforo(db, ana, a.id, 2);
    await actualizarPredefinido(db, admin, seguro.id, esquemaPredefinido.parse({ ...e, semaforo_estados: e.semaforo_estados.slice(0, 2) }));
    expect((await apuntesPorExpediente(db)).get(idExpediente)?.[0]).toMatchObject({ estado_semaforo: 0, color: "#111111" });
  });

  it("el estado en el que empiezan los expedientes se configura en Ajustes", async () => {
    const { admin, idExpediente } = await escenario();
    const seguro = await predefinido("seguro");
    await actualizarPredefinido(db, admin, seguro.id, esquemaPredefinido.parse({ ...seguro, estado_inicial: 3 }));
    // Los nuevos empiezan en ese estado (aquí, el gris apagado); los que ya había se quedan como estaban
    const otro = await crearExpediente(db, admin, esquemaCrearExpediente.parse({ cliente: { nombre: "Otro", dni: "44444444A" }, expediente: {} }));
    expect((await listarApuntes(db, otro.id_expediente))[0]).toMatchObject({ estado_semaforo: 3, color: "#9ca3af" });
    expect((await listarApuntes(db, idExpediente))[0]).toMatchObject({ estado_semaforo: 0 });
    // Un estado inicial que ya no existe se queda en el último
    await actualizarPredefinido(db, admin, seguro.id, esquemaPredefinido.parse({ ...seguro, semaforo_estados: seguro.semaforo_estados.slice(0, 3), estado_inicial: 3 }));
    expect((await listarPredefinidos(db)).find((p) => p.clave === "seguro")!.estado_inicial).toBe(2);
  });

  it("edición en masa: el mismo estado de un semáforo para varios expedientes, cada vendedor solo con los suyos", async () => {
    const { admin, ana, otra, idExpediente } = await escenario();
    const seguro = await predefinido("seguro");
    const deOtra = await crearExpediente(db, otra, esquemaCrearExpediente.parse({ cliente: { nombre: "De otra", dni: "55555555B" }, expediente: {} }));
    expect(await fijarEstadoMasivo(db, ana, [idExpediente, deOtra.id_expediente], seguro.id, 2)).toBe(1);
    expect((await listarApuntes(db, idExpediente))[0]).toMatchObject({ estado_semaforo: 2, color: "#22c55e" });
    expect((await listarApuntes(db, deOtra.id_expediente))[0]).toMatchObject({ estado_semaforo: 0 });
    expect(await fijarEstadoMasivo(db, admin, [idExpediente, deOtra.id_expediente], seguro.id, 1)).toBe(2);
    expect((await listarApuntes(db, deOtra.id_expediente))[0]).toMatchObject({ estado_semaforo: 1 });
    await expect(fijarEstadoMasivo(db, admin, [idExpediente], seguro.id, 9)).rejects.toThrow(/no válido/);
    await expect(fijarEstadoMasivo(db, admin, [idExpediente], (await predefinido("vo-retoma")).id, 0)).rejects.toThrow(/no es un semáforo/);
  });

  it("la etiqueta admite emoticonos y se pinta con el color del estado (estilo «texto»)", async () => {
    const { admin, ana, idExpediente } = await escenario();
    const seguro = await predefinido("seguro");
    expect(seguro.estilo_etiqueta).toBe("texto");
    const p = await actualizarPredefinido(db, admin, seguro.id, esquemaPredefinido.parse({ ...seguro, etiqueta: "🚗 SEGURO" }));
    expect(p).toMatchObject({ etiqueta: "🚗 SEGURO", estilo_etiqueta: "texto", colorear_emoticonos: true });
    const [a] = await listarApuntes(db, idExpediente);
    await fijarEstadoSemaforo(db, ana, a.id, 1);
    expect((await apuntesPorExpediente(db)).get(idExpediente)?.[0]).toMatchObject({ etiqueta: "🚗 SEGURO", estilo: "texto", estado_semaforo: 1, color: "#eab308", colorear_emoticonos: true });
    // Los emoticonos son opcionales: se puede dejar que conserven sus colores
    await actualizarPredefinido(db, admin, seguro.id, esquemaPredefinido.parse({ ...seguro, etiqueta: "SEGURO", colorear_emoticonos: false }));
    expect((await apuntesPorExpediente(db)).get(idExpediente)?.[0]).toMatchObject({ etiqueta: "SEGURO", colorear_emoticonos: false });
  });

  it("cada estado se define con un color o con un icono, a elegir", async () => {
    const { admin, ana, idExpediente } = await escenario();
    const seguro = await predefinido("seguro");
    const estados = seguro.semaforo_estados.map((e, i) => (i === 2 ? { ...e, modo: "icono" as const, icono: "✅" } : i === 1 ? { ...e, modo: "icono_fondo" as const, icono: "⏳" } : e));
    await actualizarPredefinido(db, admin, seguro.id, esquemaPredefinido.parse({ ...seguro, semaforo_estados: estados }));
    const [a] = await listarApuntes(db, idExpediente);
    await fijarEstadoSemaforo(db, ana, a.id, 2);
    const e = (await apuntesPorExpediente(db)).get(idExpediente)![0];
    expect(e.estados![2]).toMatchObject({ modo: "icono", icono: "✅" });
    expect(e.estados![1]).toMatchObject({ modo: "icono_fondo", icono: "⏳", color: "#eab308" });
    expect(e.estados![0].modo).toBeUndefined();
    expect(() => esquemaPredefinido.parse({ ...seguro, semaforo_estados: [{ color: "#ffffff", texto: "x", modo: "otro" }, { color: "#000000", texto: "y" }] })).toThrow();
  });

  it("un estado puede llevar un efecto animado y el semáforo admite hasta 8 estados", async () => {
    const { admin, ana, idExpediente } = await escenario();
    const seguro = await predefinido("seguro");
    const estados = [...seguro.semaforo_estados, { color: "#ff0000", texto: "Urgente: sin seguro", efecto: "parpadeo" as const }];
    await actualizarPredefinido(db, admin, seguro.id, esquemaPredefinido.parse({ ...seguro, semaforo_estados: estados }));
    const [a] = await listarApuntes(db, idExpediente);
    await fijarEstadoSemaforo(db, ana, a.id, 4);
    expect((await apuntesPorExpediente(db)).get(idExpediente)![0]).toMatchObject({ estado_semaforo: 4, color: "#ff0000", estados: expect.arrayContaining([expect.objectContaining({ efecto: "parpadeo" })]) });
    const nueve = Array.from({ length: 9 }, (_, i) => ({ color: "#123456", texto: `Estado ${i}` }));
    expect(() => esquemaPredefinido.parse({ ...seguro, semaforo_estados: nueve })).toThrow();
    expect(() => esquemaPredefinido.parse({ ...seguro, semaforo_estados: [{ color: "#123456", texto: "a", efecto: "girar" }, { color: "#654321", texto: "b" }] })).toThrow();
  });

  it("cada expediente puede llevar un comentario del estado (por ejemplo, el motivo de una incidencia)", async () => {
    const { ana, otra, idExpediente } = await escenario();
    const [a] = await listarApuntes(db, idExpediente);
    expect(a.comentario).toBe("");
    const r = await fijarEstadoSemaforo(db, ana, a.id, 1, "  Falta el DNI del cliente  ");
    expect(r).toMatchObject({ estado_semaforo: 1, comentario: "Falta el DNI del cliente" });
    expect((await apuntesPorExpediente(db)).get(idExpediente)?.[0]).toMatchObject({ comentario: "Falta el DNI del cliente" });
    // Cambiar el estado sin mandar comentario no lo borra; mandarlo vacío sí
    expect((await fijarEstadoSemaforo(db, ana, a.id, 2)).comentario).toBe("Falta el DNI del cliente");
    expect((await fijarEstadoSemaforo(db, ana, a.id, 2, "")).comentario).toBe("");
    await expect(fijarEstadoSemaforo(db, otra, a.id, 0, "no es mío")).rejects.toThrow(/vendedor del expediente/);
  });

  it("los colores del semáforo se pueden restablecer a rojo, amarillo, verde y gris", async () => {
    const { admin, ana, idExpediente } = await escenario();
    const seguro = await predefinido("seguro");
    const cambiados = seguro.semaforo_estados.map((e) => ({ ...e, color: "#123456" }));
    await actualizarPredefinido(db, admin, seguro.id, esquemaPredefinido.parse({ ...seguro, semaforo_estados: cambiados }));
    expect((await listarApuntes(db, idExpediente))[0].color).toBe("#123456");
    await actualizarPredefinido(db, admin, seguro.id, esquemaPredefinido.parse({ ...seguro, semaforo_estados: seguro.semaforo_estados.map((e, i) => ({ ...e, color: COLORES_SEMAFORO[i] })) }));
    const [a] = await listarApuntes(db, idExpediente);
    expect(a.color).toBe("#ef4444");
    expect((await fijarEstadoSemaforo(db, ana, a.id, 2)).color).toBe("#22c55e");
  });

  it("un predefinido nuevo «por defecto» llega también a los expedientes que ya existen", async () => {
    const { admin, idExpediente } = await escenario();
    const nuevo = await crearPredefinido(db, admin, esquemaPredefinido.parse({ titulo: "Garantía", etiqueta: "GAR", mostrar_etiqueta: true, por_defecto: true }));
    expect((await listarApuntes(db, idExpediente)).map((a) => a.titulo).sort()).toEqual(["Garantía", "Seguro"]);
    const otro = await crearExpediente(db, admin, esquemaCrearExpediente.parse({ cliente: { nombre: "Otro", dni: "44444444A" }, expediente: {} }));
    expect((await listarApuntes(db, otro.id_expediente)).map((a) => a.titulo).sort()).toEqual(["Garantía", "Seguro"]);
    expect(nuevo.por_defecto).toBe(true);
  });

  it("el botón rápido añade el apunte una sola vez por más que se pulse", async () => {
    const { ana, idExpediente } = await escenario();
    const retoma = await predefinido("vo-retoma");
    const resultados = await Promise.all(Array.from({ length: 10 }, () => anadirRapido(db, ana, idExpediente, retoma.id)));
    expect(resultados.filter((r) => r.creado)).toHaveLength(1);
    expect((await listarApuntes(db, idExpediente)).filter((a) => a.id_predefinido === retoma.id)).toHaveLength(1);
    expect((await anadirRapido(db, ana, idExpediente, retoma.id)).creado).toBe(false);
    // El Seguro ya lo lleva por defecto: tampoco se duplica
    expect((await anadirRapido(db, ana, idExpediente, (await predefinido("seguro")).id)).creado).toBe(false);
  });

  it("las líneas escritas a mano sí pueden repetirse, y se editan", async () => {
    const { ana, idExpediente } = await escenario();
    const e = esquemaApunte.parse({ titulo: "Llamar al cliente", descripcion: "El lunes", etiqueta: "LLAMAR", mostrar_etiqueta: true });
    const a1 = await crearApunte(db, ana, idExpediente, e);
    await crearApunte(db, ana, idExpediente, e);
    expect((await listarApuntes(db, idExpediente)).filter((a) => a.titulo === "Llamar al cliente")).toHaveLength(2);
    expect((await actualizarApunte(db, ana, a1.id, { ...e, titulo: "Llamar", descripcion: "El martes" })).descripcion).toBe("El martes");
  });

  it("la retoma deja el apunte VO con la matrícula en la descripción", async () => {
    const { ana, idExpediente } = await escenario();
    expect(await anadirVoRetoma(db, ana, idExpediente, "Matrícula 1234ABC.")).toEqual({ creado: true });
    const vo = (await apuntesPorExpediente(db)).get(idExpediente)!.find((a) => a.titulo === "VO de retoma");
    expect(vo).toMatchObject({ etiqueta: "VO", mostrar_etiqueta: true, estados: null });
    expect((await listarApuntes(db, idExpediente)).find((a) => a.titulo === "VO de retoma")!.descripcion).toContain("1234ABC");
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
    expect((await listarApuntes(db, idExpediente)).some((x) => x.titulo === "Seguro de prueba")).toBe(false);
    const guardados = await db.select().from(papeleraElementos).where(eq(papeleraElementos.tipo, "apunte"));
    expect(guardados).toHaveLength(1);
    expect(await restaurar(db, { accion: "restaurar", categoria: "elementos", ids: [String(guardados[0].id)] })).toMatchObject({ restaurados: 1 });
    expect((await listarApuntes(db, idExpediente)).find((x) => x.titulo === "Seguro de prueba")).toMatchObject({ etiqueta: "SEG", mostrar_etiqueta: true });
  });

  it("los predefinidos solo los cambia el administrador; los de la aplicación no se borran y los nuevos sí", async () => {
    const { admin, ana } = await escenario();
    const e = esquemaPredefinido.parse({ titulo: "Garantía extendida", etiqueta: "GAR", mostrar_etiqueta: true });
    await expect(crearPredefinido(db, ana, e)).rejects.toThrow(/administrador/);
    const nuevo = await crearPredefinido(db, admin, e);
    expect((await actualizarPredefinido(db, admin, nuevo.id, { ...e, color: "#10b981" })).color).toBe("#10b981");
    await expect(eliminarPredefinido(db, admin, (await predefinido("seguro")).id)).rejects.toThrow(/no se puede borrar/);
    await eliminarPredefinido(db, admin, nuevo.id);
    expect(await db.select().from(apuntesPredefinidos).where(eq(apuntesPredefinidos.id, nuevo.id))).toHaveLength(0);
  });
});
