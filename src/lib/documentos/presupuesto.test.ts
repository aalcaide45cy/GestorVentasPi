import { describe, expect, it } from "vitest";
import { aCentimos, parsearPresupuesto } from "./presupuesto";

/** Un presupuesto con la misma forma que los de Renault y Dacia, con datos inventados. */
const presupuesto = (
  cab: string,
  cliente: string,
  ciudad: string,
  tel: string,
  mail: string,
  modelo: string,
  color: string,
  total: string,
  vendedor = "Vendedor Ejemplo",
) => `INFORMACIÓN DE VEHÍCULO NUEVO
${cab}
CLIENTE  ESTABLECIMIENTO DE LA RED RENAULT
Sr. Don ${cliente}  CONCESIONARIO EJEMPLO, S.L. (CALLE 1)
${ciudad}  B00000000
${tel}  CALLE 1
${mail}  Ciudad, Madrid (28000)
Tel.: 910000000 / www.ejemplo.test
L a V: 09:30 a 13:30 y 16:00 a 20:00
Sábado: 10:00 a 14:00
${vendedor}
vendedor@ejemplo.test / 600000000
Estimado Sr. Don ${cliente}
RESUMEN
Modelo:  ${modelo}  21.189,17 €
Color:  ${color}  0,00 €
Transporte:  410,00 €
BASE IMPONIBLE  19.864,16 €
TOTAL A PAGAR  ${total} €
Quedamos atentamente a su disposición.`;

describe("parsearPresupuesto", () => {
  it("lee un presupuesto: número, fecha y hora, cliente, contacto, modelo, color y total", () => {
    const r = parsearPresupuesto(
      presupuesto(
        "Viernes, 06 Noviembre 2026 / 11:56 hs - 7639-00 - dnt - ABC123456789",
        "Ana Perez Ruiz",
        "Getafe, Madrid (28901)",
        "600111222",
        "ana@ejemplo.test",
        "RENAULT Symbioz evolution  ECO-G 90 kw (120CV)D2WZ NCH66XS",
        "azul rayo RQH",
        "25.010,63",
      ),
    );
    expect(r).toMatchObject({
      esPresupuesto: true,
      numero: "7639-00",
      referencia: "ABC123456789",
      fecha: "2026-11-06",
      hora: "11:56",
      cliente: "Ana Perez Ruiz",
      telefono: "600111222",
      email: "ana@ejemplo.test",
      poblacion: "Getafe",
      provincia: "Madrid",
      codigoPostal: "28901",
      color: "azul rayo",
      totalCentimos: 2501063,
      vendedor: "Vendedor Ejemplo",
    });
    expect(r.modeloTexto).toBe(
      "RENAULT Symbioz evolution ECO-G 90 kw (120CV)D2WZ NCH66XS",
    );
    expect(r.avisos).toEqual([]);
  });

  it("acepta un presupuesto sin referencia y con otra marca", () => {
    const r = parsearPresupuesto(
      presupuesto(
        "Viernes, 06 Noviembre 2026 / 18:46 hs - 7641-00",
        "Luis Gil Soto",
        "Alcala De Henares, Madrid (28800)",
        "611222333",
        "luis@ejemplo.test",
        "DACIA spring Extreme  extreme electric 100 (75kW) -SSY3 M3 B6D2R",
        "azul pizarra RRN",
        "15.018,53",
      ),
    );
    expect(r).toMatchObject({
      numero: "7641-00",
      referencia: null,
      fecha: "2026-11-06",
      hora: "18:46",
      cliente: "Luis Gil Soto",
      totalCentimos: 1501853,
    });
  });

  it("descarta lo que no es un presupuesto (un pedido, un documento con portada sin precios, nada)", () => {
    expect(
      parsearPresupuesto(
        "PEDIDO DE VEHICULO NUEVO\nCliente: Ana Perez\nMatricula 1234ABC",
      ).esPresupuesto,
    ).toBe(false);
    expect(
      parsearPresupuesto(
        "INFORMACIÓN DE VEHÍCULO NUEVO\nsolo una portada sin precios",
      ).esPresupuesto,
    ).toBe(false);
    expect(parsearPresupuesto("").esPresupuesto).toBe(false);
  });

  it("avisa si falta el contacto o el número", () => {
    const r = parsearPresupuesto(
      "INFORMACIÓN DE VEHÍCULO NUEVO\nCLIENTE  ESTABLECIMIENTO DE LA RED RENAULT\nSr. Don Pepe Prueba  CONCESIONARIO\nTel.: 910000000\nRESUMEN\nModelo:  DACIA SANDERO  16.138,02 €\nTOTAL A PAGAR  16.804,16 €",
    );
    expect(r.cliente).toBe("Pepe Prueba");
    expect(r.avisos.join(" ")).toMatch(/número del presupuesto/);
    expect(r.avisos.join(" ")).toMatch(/correo ni teléfono/);
  });

  it("convierte importes a céntimos", () => {
    expect(aCentimos("21.189,17")).toBe(2118917);
    expect(aCentimos("0,00")).toBe(0);
  });
});
