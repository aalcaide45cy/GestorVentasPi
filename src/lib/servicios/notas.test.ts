import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { crearUsuarioPrueba, reiniciarBd } from "../../../tests/ayudas";
import { esquemaCrearExpediente } from "./expedientes";
import { crearExpediente } from "./expedientes-escritura";
import {
  actualizarGrupo,
  actualizarNota,
  crearGrupo,
  crearNota,
  duplicarNota,
  eliminarDefinitivamente,
  eliminarFichero,
  eliminarGrupo,
  enviarAPapelera,
  exportarNotas,
  fijarComparticion,
  importarNotas,
  leerComparticion,
  leerFichero,
  leerNota,
  listarGrupos,
  listarVersiones,
  restaurarVersion,
  listarNotas,
  restaurarNota,
  subirFichero,
  vaciarPapelera,
} from "./notas";

beforeEach(reiniciarBd);

const doc = (texto: string) => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: texto }] }] });
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

describe("notas", () => {
  it("crea, busca y cambia una nota; lleva texto plano, etiquetas y vínculo a un expediente", async () => {
    const ana = await crearUsuarioPrueba("vendedor", "Ana");
    const e = await crearExpediente(db, ana, esquemaCrearExpediente.parse({ cliente: { nombre: "Cliente Uno", dni: "33333333P" }, expediente: {} }));
    const n = await crearNota(db, ana, { tipo: "nota", titulo: "Llamadas", contenido: doc("Llamar al concesionario de Madrid"), etiquetas: ["trabajo", " trabajo ", "urgente"], id_expediente: e.id_expediente, color: "#22c55e" });
    expect(n).toMatchObject({ tipo: "nota", titulo: "Llamadas", etiquetas: ["trabajo", "urgente"], id_expediente: e.id_expediente, permiso: "propietario", color: "#22c55e" });
    const [r] = await listarNotas(db, ana, { tipos: ["nota"] });
    expect(r.extracto).toBe("Llamar al concesionario de Madrid");
    await expect(crearNota(db, ana, { tipo: "nota", titulo: "x", etiquetas: [], id_expediente: 9999 })).rejects.toThrow(/No existe el expediente/);
    const cambio = await actualizarNota(db, ana, n.id, { titulo: "Llamadas del día", contenido: doc("Otra cosa"), fijada: true });
    expect(cambio.actualizado_en).toBeTruthy();
    const despues = await leerNota(db, ana, n.id);
    expect(despues).toMatchObject({ titulo: "Llamadas del día", fijada: true, extracto: "Otra cosa" });
    expect(await listarNotas(db, ana, { tipos: ["diagrama", "tablero"] })).toEqual([]);
  });

  it("no pisa una versión más nueva: avisa si otra persona la ha cambiado", async () => {
    const ana = await crearUsuarioPrueba("vendedor", "Ana");
    const otro = await crearUsuarioPrueba("vendedor", "Otro");
    const n = await crearNota(db, ana, { tipo: "nota", titulo: "Compartida", etiquetas: [] });
    await fijarComparticion(db, ana, n.id, { con: [{ id_usuario: otro.idUsuario, permiso: "edicion" }] });
    const baseAna = (await leerNota(db, ana, n.id)).actualizado_en;
    await actualizarNota(db, otro, n.id, { titulo: "Cambiada por otro" });
    await expect(actualizarNota(db, ana, n.id, { titulo: "Mi versión", base: baseAna })).rejects.toThrow(/Otra persona ha cambiado/);
    expect((await leerNota(db, ana, n.id)).titulo).toBe("Cambiada por otro");
  });

  it("compartir: con una persona o con todo el equipo, solo leer o también editar; solo el dueño cambia lo importante", async () => {
    const ana = await crearUsuarioPrueba("vendedor", "Ana");
    const luis = await crearUsuarioPrueba("vendedor", "Luis");
    const eva = await crearUsuarioPrueba("vendedor", "Eva");
    const n = await crearNota(db, ana, { tipo: "nota", titulo: "Reunión", contenido: doc("Orden del día"), etiquetas: [] });
    await expect(leerNota(db, luis, n.id)).rejects.toThrow(/no encontrada/);
    expect(await listarNotas(db, luis)).toEqual([]);
    await fijarComparticion(db, ana, n.id, { con: [{ id_usuario: luis.idUsuario, permiso: "lectura" }, { id_usuario: null, permiso: "lectura" }] });
    // Luis y Eva la ven; el nombre de quien la creó sale en la lista
    expect((await listarNotas(db, luis))[0]).toMatchObject({ titulo: "Reunión", permiso: "lectura", autor: "Ana", compartida: false });
    expect((await listarNotas(db, eva))).toHaveLength(1);
    expect((await listarNotas(db, ana))[0].compartida).toBe(true);
    await expect(actualizarNota(db, luis, n.id, { titulo: "Cambio" })).rejects.toThrow(/solo para leer/);
    await expect(fijarComparticion(db, luis, n.id, { con: [] })).rejects.toThrow(/Solo quien creó/);
    // Con permiso de edición puede cambiar el contenido pero no el grupo ni fijarla
    await fijarComparticion(db, ana, n.id, { con: [{ id_usuario: luis.idUsuario, permiso: "edicion" }] });
    await actualizarNota(db, luis, n.id, { contenido: doc("Orden del día actualizado") });
    await expect(actualizarNota(db, luis, n.id, { fijada: true })).rejects.toThrow(/Solo quien creó/);
    expect((await leerComparticion(db, ana, n.id)).con).toEqual([{ id_usuario: luis.idUsuario, permiso: "edicion" }]);
    await expect(fijarComparticion(db, ana, n.id, { con: [{ id_usuario: ana.idUsuario, permiso: "lectura" }] })).rejects.toThrow(/contigo/);
    // La papelera del dueño la oculta a los demás
    await enviarAPapelera(db, ana, n.id);
    await expect(leerNota(db, luis, n.id)).rejects.toThrow(/no encontrada/);
  });

  it("papelera: se recupera, se vacía y se borra para siempre solo desde ella", async () => {
    const ana = await crearUsuarioPrueba("vendedor", "Ana");
    const a = await crearNota(db, ana, { tipo: "nota", titulo: "A", etiquetas: [] });
    const b = await crearNota(db, ana, { tipo: "diagrama", titulo: "B", etiquetas: [] });
    await expect(eliminarDefinitivamente(db, ana, a.id)).rejects.toThrow(/papelera/);
    await enviarAPapelera(db, ana, a.id);
    await enviarAPapelera(db, ana, b.id);
    expect(await listarNotas(db, ana)).toEqual([]);
    expect((await listarNotas(db, ana, { papelera: true })).map((x) => x.titulo).sort()).toEqual(["A", "B"]);
    await restaurarNota(db, ana, a.id);
    expect((await listarNotas(db, ana)).map((x) => x.titulo)).toEqual(["A"]);
    expect(await vaciarPapelera(db, ana, ["diagrama"])).toBe(1);
    await enviarAPapelera(db, ana, a.id);
    await eliminarDefinitivamente(db, ana, a.id);
    await expect(leerNota(db, ana, a.id)).rejects.toThrow(/no encontrada/);
  });

  it("grupos de un nivel por sección: las notas se mueven y, al borrar el grupo, quedan sin grupo", async () => {
    const ana = await crearUsuarioPrueba("vendedor", "Ana");
    const g = await crearGrupo(db, ana, { ambito: "notas", nombre: "Clientes", color: "#ef4444" });
    await crearGrupo(db, ana, { ambito: "flujos", nombre: "Procesos", color: "#3b82f6" });
    expect((await listarGrupos(db, ana, "notas")).map((x) => x.nombre)).toEqual(["Clientes"]);
    const n = await crearNota(db, ana, { tipo: "nota", titulo: "Una", etiquetas: [], id_grupo: g.id });
    await expect(crearNota(db, ana, { tipo: "diagrama", titulo: "x", etiquetas: [], id_grupo: g.id })).rejects.toThrow(/otra sección/);
    expect(n.id_grupo).toBe(g.id);
    expect((await actualizarGrupo(db, ana, g.id, { nombre: "Clientes VIP", color: "#a855f7" })).nombre).toBe("Clientes VIP");
    await eliminarGrupo(db, ana, g.id);
    expect((await leerNota(db, ana, n.id)).id_grupo).toBeNull();
    const luis = await crearUsuarioPrueba("vendedor", "Luis");
    await expect(eliminarGrupo(db, luis, (await listarGrupos(db, ana, "flujos"))[0].id)).rejects.toThrow(/Grupo no encontrado/);
  });

  it("adjuntos: cualquier tipo de archivo, cifrado, con miniatura de las imágenes y respetando permisos", async () => {
    const ana = await crearUsuarioPrueba("vendedor", "Ana");
    const luis = await crearUsuarioPrueba("vendedor", "Luis");
    const n = await crearNota(db, ana, { tipo: "nota", titulo: "Con archivos", etiquetas: [] });
    const img = await subirFichero(db, ana, n.id, "foto.png", PNG);
    expect(img).toMatchObject({ nombre: "foto.png", mime: "image/png", tiene_miniatura: true });
    const hoja = await subirFichero(db, ana, n.id, "datos.xlsx", Buffer.from("PK\x03\x04 contenido de ejemplo"));
    expect(hoja).toMatchObject({ mime: "application/octet-stream", tiene_miniatura: false });
    expect((await leerFichero(db, ana, hoja.id)).datos.toString()).toContain("contenido de ejemplo");
    expect((await leerFichero(db, ana, img.id, true)).mime).toBe("image/jpeg");
    expect((await leerNota(db, ana, n.id)).ficheros).toHaveLength(2);
    await expect(leerFichero(db, luis, img.id)).rejects.toThrow(/no encontrada/);
    await expect(subirFichero(db, ana, n.id, "vacío.txt", Buffer.alloc(0))).rejects.toThrow(/vacío/);
    await fijarComparticion(db, ana, n.id, { con: [{ id_usuario: luis.idUsuario, permiso: "lectura" }] });
    expect((await leerFichero(db, luis, img.id)).nombre).toBe("foto.png");
    await expect(eliminarFichero(db, luis, img.id)).rejects.toThrow(/solo para leer/);
    await eliminarFichero(db, ana, img.id);
    expect((await leerNota(db, ana, n.id)).ficheros).toHaveLength(1);
  });

  it("guarda puntos de restauración del texto y se puede volver a una versión anterior", async () => {
    const ana = await crearUsuarioPrueba("vendedor", "Ana");
    const luis = await crearUsuarioPrueba("vendedor", "Luis");
    const n = await crearNota(db, ana, { tipo: "nota", titulo: "Acta", contenido: doc("Texto original importante"), etiquetas: [] });
    // Al cambiar el texto por primera vez se guarda cómo estaba; los cambios siguientes, en menos de cinco minutos, no
    await actualizarNota(db, ana, n.id, { contenido: doc("Borré lo importante") });
    await actualizarNota(db, ana, n.id, { contenido: doc("Y otra cosa después") });
    const v = await listarVersiones(db, ana, n.id);
    expect(v).toHaveLength(1);
    expect(v[0].extracto).toBe("Texto original importante");
    await expect(listarVersiones(db, luis, n.id)).rejects.toThrow(/no encontrada/);
    await expect(restaurarVersion(db, luis, n.id, v[0].id)).rejects.toThrow(/no encontrada/);
    await restaurarVersion(db, ana, n.id, v[0].id);
    expect((await leerNota(db, ana, n.id)).extracto).toBe("Texto original importante");
    // Lo que había justo antes de volver también queda como punto para poder rehacerlo
    expect((await listarVersiones(db, ana, n.id)).map((x) => x.extracto)).toEqual(["Y otra cosa después", "Texto original importante"]);
    await expect(restaurarVersion(db, ana, n.id, 99999)).rejects.toThrow(/Versión no encontrada/);
  });

  it("subir o quitar un adjunto no cuenta como un cambio de la nota (no provoca avisos de conflicto)", async () => {
    const ana = await crearUsuarioPrueba("vendedor", "Ana");
    const n = await crearNota(db, ana, { tipo: "nota", titulo: "Pegar imagen", etiquetas: [] });
    const base = (await leerNota(db, ana, n.id)).actualizado_en;
    const f = await subirFichero(db, ana, n.id, "foto.png", PNG);
    await eliminarFichero(db, ana, f.id);
    await expect(actualizarNota(db, ana, n.id, { titulo: "Sigue guardando", base })).resolves.toBeTruthy();
  });

  it("duplicar una nota copia también sus adjuntos y reapunta las imágenes del texto", async () => {
    const ana = await crearUsuarioPrueba("vendedor", "Ana");
    const n = await crearNota(db, ana, { tipo: "nota", titulo: "Original", etiquetas: [] });
    const f = await subirFichero(db, ana, n.id, "foto.png", PNG);
    await actualizarNota(db, ana, n.id, { contenido: { type: "doc", content: [{ type: "image", attrs: { src: `/api/notas/ficheros?id=${f.id}` } }] } });
    const copia = await duplicarNota(db, ana, n.id);
    expect(copia.titulo).toBe("Original (copia)");
    expect(copia.ficheros).toHaveLength(1);
    expect(copia.ficheros[0].id).not.toBe(f.id);
    expect(JSON.stringify(copia.contenido)).toContain(`/api/notas/ficheros?id=${copia.ficheros[0].id}`);
  });

  it("exporta e importa todo (grupos, notas, flujos y adjuntos) sin pisar nada", async () => {
    const ana = await crearUsuarioPrueba("vendedor", "Ana");
    const luis = await crearUsuarioPrueba("vendedor", "Luis");
    const g = await crearGrupo(db, ana, { ambito: "notas", nombre: "Trabajo", color: "#22c55e" });
    const n = await crearNota(db, ana, { tipo: "nota", titulo: "Con foto", etiquetas: ["a"], id_grupo: g.id });
    const f = await subirFichero(db, ana, n.id, "foto.png", PNG);
    await actualizarNota(db, ana, n.id, { contenido: { type: "doc", content: [{ type: "image", attrs: { src: `/api/notas/ficheros?id=${f.id}` } }] } });
    await crearNota(db, ana, { tipo: "diagrama", titulo: "Organigrama", etiquetas: [], contenido: { nodes: [{ id: "1", data: { label: "Jefe" } }], edges: [] } });
    const paquete = await exportarNotas(db, ana);
    expect(paquete).toMatchObject({ formato: "gestorventas-notas", version: 1 });
    expect(paquete.notas).toHaveLength(2);
    expect(paquete.ficheros).toHaveLength(1);
    expect((await exportarNotas(db, ana, ["diagrama"])).notas).toHaveLength(1);
    expect((await exportarNotas(db, ana, undefined, false)).ficheros).toEqual([]);
    // Luis importa el paquete y recibe copias suyas, con los adjuntos enlazados de nuevo
    const r = await importarNotas(db, luis, JSON.parse(JSON.stringify(paquete)));
    expect(r).toEqual({ notas: 2, grupos: 1, ficheros: 1 });
    const suyas = await listarNotas(db, luis);
    expect(suyas.map((x) => x.titulo).sort()).toEqual(["Con foto", "Organigrama"]);
    const conFoto = await leerNota(db, luis, suyas.find((x) => x.titulo === "Con foto")!.id);
    expect(conFoto.ficheros).toHaveLength(1);
    expect(JSON.stringify(conFoto.contenido)).toContain(`/api/notas/ficheros?id=${conFoto.ficheros[0].id}`);
    expect(await listarGrupos(db, luis, "notas")).toHaveLength(1);
    // Importar otra vez no pisa nada: reutiliza el grupo y añade copias
    expect(await importarNotas(db, luis, JSON.parse(JSON.stringify(paquete)))).toEqual({ notas: 2, grupos: 0, ficheros: 1 });
    expect(await listarNotas(db, luis)).toHaveLength(4);
    await expect(importarNotas(db, luis, { formato: "otra cosa" })).rejects.toThrow(/no es un paquete/);
  });
});
