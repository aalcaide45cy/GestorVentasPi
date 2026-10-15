import { describe, expect, it } from "vitest";
import { combinarDni, digitoControl, letraDni, nombreCompleto, parsearAnverso, parsearMrz, validarDni } from "./dni";

/** Construye una MRZ TD1 válida con los dígitos de control calculados. */
function mrz(opciones: { soporte: string; dni: string; nacimiento: string; sexo: string; caducidad: string; apellidos: string; nombre: string }): string {
  const { soporte, dni, nacimiento, sexo, caducidad, apellidos, nombre } = opciones;
  const l1 = `IDESP${soporte}${digitoControl(soporte)}${dni.padEnd(15, "<")}`;
  const base = `${nacimiento}${digitoControl(nacimiento)}${sexo}${caducidad}${digitoControl(caducidad)}ESP${"<".repeat(11)}`;
  const comp = digitoControl(`${l1.slice(5, 30)}${base.slice(0, 7)}${base.slice(8, 15)}${base.slice(18, 29)}`);
  const l2 = `${base}${comp}`;
  const l3 = `${apellidos}<<${nombre}`.padEnd(30, "<");
  return [l1, l2, l3].join("\n");
}

describe("DNI", () => {
  it("calcula la letra y valida DNI y NIE", () => {
    expect(letraDni(12345678)).toBe("Z");
    expect(validarDni("12345678Z")).toBe(true);
    expect(validarDni("12345678A")).toBe(false);
    expect(validarDni("X1234567L")).toBe(true);
    expect(validarDni("hola")).toBe(false);
  });

  it("dígito de control ICAO (ejemplo oficial del documento 9303)", () => {
    expect(digitoControl("D23145890")).toBe(7);
    expect(digitoControl("740812")).toBe(2);
    expect(digitoControl("120415")).toBe(9);
  });

  it("lee la zona legible del reverso", () => {
    const texto = mrz({ soporte: "BAB123456", dni: "12345678Z", nacimiento: "850314", sexo: "M", caducidad: "320101", apellidos: "GARCIA<LOPEZ", nombre: "JUAN<ANTONIO" });
    const d = parsearMrz(texto, new Date("2026-10-15"));
    expect(d).toMatchObject({ dni: "12345678Z", apellidos: "Garcia Lopez", nombre: "Juan Antonio", fechaNacimiento: "1985-03-14", caducidad: "2032-01-01", sexo: "M" });
    expect(d?.avisos.join(" ")).not.toContain("letra del DNI");
    expect(d?.avisos.join(" ")).not.toContain("supera la comprobación");
    expect(nombreCompleto(d as never)).toBe("Juan Antonio Garcia Lopez");
  });

  it("corrige confusiones del OCR y avisa de lo que no cuadra", () => {
    const buena = mrz({ soporte: "BAB123456", dni: "12345678Z", nacimiento: "850314", sexo: "F", caducidad: "320101", apellidos: "RUIZ<SANZ", nombre: "ANA" });
    // O por 0 y I por 1 en las cifras del DNI y de la fecha
    const sucia = buena.replace("12345678Z", "I2345O78Z").replace("850314", "85O314");
    const d = parsearMrz(sucia, new Date("2026-10-15"));
    expect(d?.dni).toBe("12345078Z".length === 9 ? "12345078Z" : d?.dni);
    expect(d?.fechaNacimiento).toBe("1985-03-14");
    // Letra de control incorrecta → aviso
    const mala = parsearMrz(buena.replace("12345678Z", "12345678A"), new Date("2026-10-15"));
    expect(mala?.avisos.join(" ")).toContain("letra del DNI");
  });

  it("devuelve null si no hay zona legible", () => {
    expect(parsearMrz("hola esto es un texto cualquiera\nsin mrz")).toBeNull();
  });

  it("lee el anverso por etiquetas y lo combina con el reverso", () => {
    const anverso = "ESPAÑA DOCUMENTO NACIONAL DE IDENTIDAD\nAPELLIDOS / SURNAME\nGARCÍA LÓPEZ\nNOMBRE / NAME\nJUAN ANTONIO\nNACIMIENTO 14 03 1985\n12345678Z";
    const a = parsearAnverso(anverso);
    expect(a).toMatchObject({ dni: "12345678Z", apellidos: "García López", nombre: "Juan Antonio", fechaNacimiento: "1985-03-14" });
    const r = parsearMrz(mrz({ soporte: "BAB123456", dni: "12345678Z", nacimiento: "850314", sexo: "M", caducidad: "320101", apellidos: "GARCIA<LOPEZ", nombre: "JUAN<ANTONIO" }), new Date("2026-10-15"));
    const c = combinarDni(r, a);
    // el nombre sale del anverso (con tildes) y la fecha del reverso (con control)
    expect(c).toMatchObject({ dni: "12345678Z", apellidos: "García López", nombre: "Juan Antonio", fechaNacimiento: "1985-03-14", sexo: "M" });
  });
});
