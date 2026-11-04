import { describe, expect, it } from "vitest";
import { contenidoInicial, esquemaCambiarNota, esquemaCrearNota, normalizarEtiquetas, textoDeContenido, textoDeFlujo } from "./notas";

describe("notas: utilidades", () => {
  it("saca el texto plano de un documento del editor, separando los bloques", () => {
    const doc = { type: "doc", content: [{ type: "heading", content: [{ type: "text", text: "Título" }] }, { type: "paragraph", content: [{ type: "text", text: "Hola " }, { type: "text", text: "mundo" }] }, { type: "bulletList", content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Uno" }] }] }] }] };
    expect(textoDeContenido(doc)).toBe("Título\nHola mundo\nUno");
    expect(textoDeContenido(null)).toBe("");
  });
  it("saca el texto de un flujo (formas, columnas y tarjetas)", () => {
    expect(textoDeFlujo({ nodes: [{ id: "a", data: { label: "Inicio" } }, { id: "b", data: { label: "Fin" } }], edges: [] })).toBe("Inicio\nFin");
    expect(textoDeFlujo({ columnas: [{ titulo: "Por hacer", tarjetas: [{ titulo: "Llamar", descripcion: "Al banco" }] }] })).toBe("Por hacer\nLlamar\nAl banco");
  });
  it("normaliza las etiquetas y valida las entradas", () => {
    expect(normalizarEtiquetas([" a ", "a", "", "b"])).toEqual(["a", "b"]);
    expect(esquemaCrearNota.safeParse({ tipo: "nota" }).success).toBe(true);
    expect(esquemaCrearNota.safeParse({ tipo: "raro" }).success).toBe(false);
    expect(esquemaCambiarNota.safeParse({ color: "rojo" }).success).toBe(false);
    expect(contenidoInicial("tablero")).toHaveProperty("columnas");
  });
});
