import { describe, expect, it } from "vitest";
import { enlaceWhatsapp, numeroWhatsapp, PLANTILLA_WHATSAPP, redactarWhatsapp } from "./whatsapp";

const datos = { nombre: "Marcos Boleas Ramon", matricula: "0439NVL", fecha_matricula: "26/11/2026", bastidor: "VF1RJB00778132943", dia: "03/12/2026", hora: "16:00" };

describe("mensaje de WhatsApp", () => {
  it("rellena los datos del expediente y quita el bloque del vehículo entregado si no toca", () => {
    const con = redactarWhatsapp(PLANTILLA_WHATSAPP, datos, true);
    expect(con.texto).toContain("Estimad@ Marcos Boleas Ramon,");
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
    expect(numeroWhatsapp("620 48 83 13")).toBe("34620488313");
    expect(numeroWhatsapp("+34 620488313")).toBe("34620488313");
    expect(numeroWhatsapp("0033612345678")).toBe("33612345678");
    expect(numeroWhatsapp("912345678")).toBe("");
    expect(numeroWhatsapp("")).toBe("");
    expect(enlaceWhatsapp("34620488313", "Hola\nadiós")).toBe("https://wa.me/34620488313?text=Hola%0Aadi%C3%B3s");
  });
});
