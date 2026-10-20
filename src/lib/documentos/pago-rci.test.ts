import { describe, expect, it } from "vitest";
import { esPagoRci, parsearPagoRci } from "./pago-rci";
import { parsearPedido } from "./pedido";

// Texto tal como sale del PDF de la financiera
const PAGO = `Nº: 202600072629
DETALLE DE LA LIQUIDACIÓN DE PAGO
Ref.: CRLIQVEN
RCI Banque S.A., Sucursal en España, NIF ES-W0014596A
Mobilize Financial Services es una marca comercial utilizada por RCI Banque S.A., Sucursal en España, bajo licencia
VENDEDOR: 53042524Q
NÚMERO DE OPERACIÓN
202600072629
FECHA DE PAGO
10/10/2026
PUNTO DE RED
5081
AUTOCARPE CONCESIONARIO, S.L.
DATOS VEHÍCULO
Marca
DACIA
Modelo
BI1 - SANDERO FASE 2 fase 2 Stepway Extreme Eco-G 120
Matrícula Fecha Matriculación Número de Chasis
UU1DJF00477657076
DATOS ADQUIRIENTE
Nombre y Apellidos/Razón Social: Francisco MAYOR CASADO N.I.F.: 51701814E
Domicilio: CALLE de la cijara,14 Código postal: 28522
Localidad: Rivas - Vaciamadrid( MADRID ) Provincia: MADRID
DATOS DE LA PERSONA QUE REPRESENTA A RCI BANQUE S.A., Sucursal en España
Nombre y Apellidos/Razón Social: VAZQUEZ AGUILERA, ANA BELEN N.I.F.: 50826230W
Domicilio: AV DE BURGOS, 89-A Código postal: 28050
IMPORTE NOMINAL DEL PRÉSTAMO 5.757,67 euros
TOTAL LÍQUIDO 4.845,55 euros`;

describe("pago de la financiera", () => {
  it("reconoce el documento y no confunde otros", () => {
    expect(esPagoRci(PAGO)).toBe(true);
    expect(esPagoRci("PEDIDO DE VENTA DE VEHÍCULO\nRenault Retail Group")).toBe(false);
    expect(parsearPagoRci("hoja cualquiera")).toBeNull();
  });

  it("lee la fecha de pago, el bastidor y el documento del adquiriente (no el de la persona que representa a la financiera)", () => {
    const p = parsearPagoRci(PAGO);
    expect(p).toMatchObject({ numeroOperacion: "202600072629", fechaPago: "2026-10-10", nif: "51701814E", nombre: "Francisco MAYOR CASADO", domicilio: "CALLE de la cijara,14", codigoPostal: "28522", bastidor: "UU1DJF00477657076", matricula: "", marca: "DACIA", importeNominalCent: 575767, totalLiquidoCent: 484555 });
    expect(p?.modelo).toContain("SANDERO");
    expect(p?.faltan).toEqual([]);
  });

  it("lee la matrícula cuando el pago es de un usado, quitando la E inicial", () => {
    const usado = PAGO.replace("Matrícula Fecha Matriculación Número de Chasis\nUU1DJF00477657076", "Matrícula Fecha Matriculación Número de Chasis\nE9109KFP 28/11/2017 VF37ABHY6HN542688");
    const p = parsearPagoRci(usado);
    expect(p?.matricula).toBe("9109KFP");
    expect(p?.bastidor).toBe("VF37ABHY6HN542688");
  });

  it("avisa de lo que no ha podido leer", () => {
    const p = parsearPagoRci(PAGO.replace("10/10/2026", "").replace("N.I.F.: 51701814E", ""));
    expect(p?.faltan).toEqual(expect.arrayContaining(["fecha de pago", "documento del adquiriente"]));
  });
});

describe("pago de la financiera con los rótulos juntos", () => {
  const JUNTOS = `Nº: 202600060654
DETALLE DE LA LIQUIDACIÓN DE PAGO  VENDEDOR:  53042524Q
RCI Banque S.A., Sucursal en España
NÚMERO DE OPERACIÓN  FECHA DE PAGO  PUNTO DE RED
202600060654  17/08/2026  5081
AUTOCARPE CONCESIONARIO, S.L.
DATOS VEHÍCULO
Marca  Modelo  Matrícula  Fecha Matriculación  Número de Chasis
DACIA  JOGGER GASOLINA/GAS 21-22  - JOGGER 1.0 ECO-G S.L EXTREME 5  3881LYM  10/06/2022  UU1DJF00868900901
DATOS ADQUIRIENTE
Nombre y Apellidos/Razón Social:  Jesus JARA RODRIGUEZ  N.I.F.:  02247312M
Domicilio:  CALLE Del Desengaño,20  Código postal:  28720
DATOS DE LA PERSONA QUE REPRESENTA A RCI BANQUE S.A., Sucursal en España
Nombre y Apellidos/Razón Social:  VAZQUEZ AGUILERA, ANA BELEN  N.I.F.:  50826230W
IMPORTE NOMINAL DEL PRÉSTAMO  8.567,76  euros`;
  it("lee fecha, matrícula, marca y modelo de un usado", () => {
    const p = parsearPagoRci(JUNTOS);
    expect(p).toMatchObject({ numeroOperacion: "202600060654", fechaPago: "2026-08-17", nif: "02247312M", bastidor: "UU1DJF00868900901", matricula: "3881LYM", marca: "DACIA", importeNominalCent: 856776 });
    expect(p?.modelo).toContain("JOGGER");
    expect(p?.faltan).toEqual([]);
  });
});

describe("separación entre pedidos y pagos", () => {
  it("la lectura de pedidos no toma un pago de la financiera por un pedido (se ignora)", () => {
    expect(parsearPedido(PAGO, { modelos: [], tiposVenta: [], aliasModelos: [], marcas: ["Dacia", "Renault"] }).esPedido).toBe(false);
  });
});
