import { describe, expect, it } from "vitest";
import { enlaceWhatsapp, numeroWhatsapp, PLANTILLA_SEGURO, PLANTILLA_WHATSAPP, redactarSeguro, redactarWhatsapp } from "./whatsapp";

const datos = { nombre: "Ana Ejemplo Prueba", matricula: "0000BBB", fecha_matricula: "26/11/2026", bastidor: "VF1TEST0000000001", dia: "03/12/2026", hora: "16:00" };

describe("mensaje de WhatsApp", () => {
  it("rellena los datos del expediente y quita el bloque del vehículo entregado si no toca", () => {
    const con = redactarWhatsapp(PLANTILLA_WHATSAPP, datos, true);
    expect(con.texto).toContain("Estimad@ Ana Ejemplo Prueba,");
    expect(con.texto).toContain("◦ Hora: 16:00");
    expect(con.texto).toContain("Los 2 juegos de llaves");
    expect(con.faltan).toEqual([]);
    const sin = redactarWhatsapp(PLANTILLA_WHATSAPP, datos, false).texto;
    expect(sin).not.toContain("juegos de llaves");
    expect(sin).not.toContain("retoma");
    expect(sin.endsWith("Rogamos máxima puntualidad.")).toBe(true);
  });
  it("la línea de un dato que falta no sale y se avisa", () => {
    const r = redactarWhatsapp(PLANTILLA_WHATSAPP, { ...datos, hora: "", bastidor: "" }, false);
    expect(r.texto).not.toContain("Hora:");
    expect(r.texto).not.toContain("Bastidor");
    expect(r.faltan).toEqual(["bastidor", "hora de entrega"]);
  });
  it("prepara el número y el enlace", () => {
    expect(numeroWhatsapp("600 00 00 01")).toBe("34600000001");
    expect(numeroWhatsapp("+34 600000001")).toBe("34600000001");
    expect(numeroWhatsapp("0033612345678")).toBe("33612345678");
    expect(numeroWhatsapp("912345678")).toBe("");
    expect(numeroWhatsapp("")).toBe("");
    expect(enlaceWhatsapp("34600000001", "Hola\nadiós")).toBe("https://wa.me/34600000001?text=Hola%0Aadi%C3%B3s");
  });
});

describe("aviso al compañero de los seguros", () => {
  const cliente = { companero: "Pepe", nombre: "Ana Ejemplo Prueba", telefono: "600000001", email: "ana@ejemplo.test", vehiculo: "Dacia Sandero", matricula: "", bastidor: "VF1TEST0000000001", entrega: "" };
  it("lleva los datos del cliente y del vehículo; la entrega es opcional y no avisa", () => {
    const r = redactarSeguro(PLANTILLA_SEGURO, cliente);
    expect(r.texto).toContain("Buenas Pepe,");
    expect(r.texto).toContain("Email: ana@ejemplo.test");
    expect(r.texto).not.toContain("Entrega prevista");
    expect(r.faltan).toEqual(["matrícula"]);
    expect(redactarSeguro(PLANTILLA_SEGURO, { ...cliente, entrega: "03/12/2026 a las 16:00" }).texto).toContain("Entrega prevista: 03/12/2026 a las 16:00");
  });
});
