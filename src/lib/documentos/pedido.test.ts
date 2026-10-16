import { describe, expect, it } from "vitest";
import { parsearPedido, partirDomicilio } from "./pedido";

const catalogo = {
  modelos: [
    { id: 1, nombre: "Clio", marca: "Renault" },
    { id: 2, nombre: "Captur", marca: "Renault" },
    { id: 3, nombre: "Sandero", marca: "Dacia" },
  ],
  tiposVenta: [
    { id: 10, nombre: "Contado", categoria: "CONTADO" },
    { id: 11, nombre: "Crédito", categoria: "CREDITO" },
    { id: 12, nombre: "Renting", categoria: "RENTING" },
  ],
};

describe("lectura de pedidos", () => {
  it("extrae bastidor, matrícula, DNI, cliente, fechas, modelo y forma de pago", () => {
    const texto = [
      "RENAULT RETAIL GROUP - PEDIDO DE VEHÍCULO",
      "Fecha de pedido: 05/09/2026",
      "Cliente: JUAN PEREZ GARCIA",
      "NIF: 12345678Z",
      "Vehículo: Renault Captur Techno",
      "Bastidor VF1RJA00123456789",
      "Matrícula 1234 BCD",
      "Forma de pago: Financiación RCI",
      "Fecha de entrega prevista: 30/09/2026",
    ].join("\n");
    const d = parsearPedido(texto, catalogo);
    expect(d).toMatchObject({
      vin: "VF1RJA00123456789",
      matricula: "1234BCD",
      dni: "12345678Z",
      cliente: "JUAN PEREZ GARCIA",
      fechaExpediente: "2026-09-05",
      fechaEntrega: "2026-09-30",
      idModelo: 2,
      idTipoDeVenta: 11,
    });
  });

  it("corrige O/I/Q del bastidor y avisa cuando no hay nada útil", () => {
    expect(parsearPedido("VIN VF1RJAOO123456789", catalogo).vin).toBe("VF1RJA0012345678".concat("9"));
    const vacio = parsearPedido("hola mundo", catalogo);
    expect(vacio.vin).toBeNull();
    expect(vacio.avisos.join(" ")).toContain("ningún dato útil");
  });

  it("detecta renting y contado", () => {
    expect(parsearPedido("Operación de renting a 48 meses", catalogo).idTipoDeVenta).toBe(12);
    expect(parsearPedido("Pago al contado", catalogo).idTipoDeVenta).toBe(10);
  });
});

describe("pedido de vehículo nuevo de Renault/Dacia (datos inventados con la misma estructura)", () => {
  const texto = [
    "PEDIDO DE VEHÍCULO NUEVO",
    "Número Pedido 14000001 - 7577-00 - dnt - AAA111111111",
    "Emitido: Jueves, 08 Oct 2026 12:41 hs.",
    "CLIENTE  ESTABLECIMIENTO DE LA RED RENAULT",
    "Sr. Don Pedro De Prueba Ejemplo  CONCESIONARIO DE PRUEBA, S.L. (CALLE 1)",
    "X1234567L  B00000000",
    "Calle Inventada, 12, 3, B  CALLE, 1",
    "Madrid, Madrid (28000)  Rivas, Madrid (28500)",
    "600111222  Tel.: 910000000 / www.ejemplo.es",
    "pedro.prueba@ejemplo.com  L a V: 09:30 a 13:30",
    "Sábado: 10:00 a 14:00",
    "Vendedor Ejemplo Uno",
    "vendedor@ejemplo.es / 655000000",
    "RESUMEN",
    "Modelo:  DACIA SANDERO stepway expression  Eco-G 1202SX NC 6XGS  13.658,68 €",
    "Promociones:  DTO DACIA CREDITO  -350,97 €",
    "Plazo de Entrega:  12 Oct 2026 / 23 Oct 2026",
    "Queda prohibida la reproducción o traducción",
    "ESTIPULACIONES GENERALES: si el vehículo se adquiere al contado ...",
  ].join("\n");

  it("lee cliente, NIE, contacto, vendedor, modelo, forma de pago y fechas", () => {
    const d = parsearPedido(texto, catalogo);
    expect(d).toMatchObject({
      numeroPedido: "14000001",
      cliente: "Pedro De Prueba Ejemplo",
      dni: "X1234567L",
      telefono: "600111222",
      email: "pedro.prueba@ejemplo.com",
      domicilio: "Calle Inventada, 12, 3, B",
      poblacion: "Madrid",
      codigoPostal: "28000",
      vendedor: "Vendedor Ejemplo Uno",
      fechaExpediente: "2026-10-08",
      plazoEntrega: { desde: "2026-10-12", hasta: "2026-10-23" },
      idTipoDeVenta: 11,
    });
    expect(d.modeloTexto).toBe("Sandero");
    expect(d.idModelo).toBe(3);
  });

  it("no toma como bastidor ni matrícula el correo ni el código del modelo, y la forma de pago sale de la primera hoja", () => {
    const d = parsearPedido(texto, catalogo);
    expect(d.vin).toBeNull();
    expect(d.matricula).toBeNull();
    // «contado» aparece en las condiciones generales (segunda hoja): no debe pesar
    expect(d.idTipoDeVenta).toBe(11);
  });
});

describe("el descuento de financiación del pedido cambia el tipo de venta", () => {
  const cat = { ...catalogo, tiposVenta: [...catalogo.tiposVenta, { id: 13, nombre: "Preference", categoria: "PREFERENCE" }] };
  const base = (descuento: string | null) =>
    [
      "CLIENTE  ESTABLECIMIENTO DE LA RED RENAULT",
      "Sra. Doña Ana De Prueba  CONCESIONARIO DE PRUEBA, S.L.",
      "12345678Z  B00000000",
      "Calle Inventada, 1  CALLE, 1",
      "Madrid, Madrid (28000)  Rivas, Madrid (28500)",
      "RESUMEN",
      "Modelo:  RENAULT CLIO equilibre  18.000,00 €",
      ...(descuento ? [descuento] : []),
      "Forma de pago: al contado",
    ].join("\n");

  it("«Descuento crédito» y «dto crédito» → Crédito", () => {
    expect(parsearPedido(base("Promociones:  Descuento crédito  -300,00 €"), cat).idTipoDeVenta).toBe(11);
    expect(parsearPedido(base("Promociones:  dto crédito  -300,00 €"), cat).idTipoDeVenta).toBe(11);
    expect(parsearPedido(base("Descuento Adicional Financiacion y Serv.  -400,00 €"), cat).idTipoDeVenta).toBe(11);
  });

  it("«Preference» → Preference (más específico que crédito)", () => {
    expect(parsearPedido(base("Promociones:  DTO PREFERENCE  -500,00 €"), cat).idTipoDeVenta).toBe(13);
    expect(parsearPedido(base("Promociones:  DTO PREFERENCE crédito  -500,00 €"), cat).idTipoDeVenta).toBe(13);
  });

  it("sin descuento de financiación el tipo no se toca (aunque el texto cite «contado»)", () => {
    expect(parsearPedido(base(null), cat).idTipoDeVenta).toBeNull();
    expect(parsearPedido(base("Promociones:  DTO VENTA DIRECTA  -100,00 €"), cat).idTipoDeVenta).toBeNull();
  });
});

describe("partirDomicilio", () => {
  it("separa calle, población y código postal", () => {
    expect(partirDomicilio("Calle Inventada, 12, 3, B, Madrid, Madrid (28000)")).toEqual({ domicilio: "Calle Inventada, 12, 3, B", poblacion: "Madrid", codigoPostal: "28000" });
    expect(partirDomicilio("Calle Sol 4, Getafe, Madrid (28901)")).toEqual({ domicilio: "Calle Sol 4", poblacion: "Getafe", codigoPostal: "28901" });
    expect(partirDomicilio(null)).toEqual({ domicilio: null, poblacion: null, codigoPostal: null });
  });
});

describe("retoma (vehículo usado que deja el cliente) y tipo de pedido", () => {
  const base = [
    "PEDIDO DE VEHÍCULO NUEVO",
    "Número Pedido 14000002 - 7577-00 - dnt - AAA111111112",
    "Emitido: Martes, 06 Oct 2026 10:00 hs.",
    "CLIENTE  ESTABLECIMIENTO DE LA RED RENAULT",
    "Sr. Don Pedro De Prueba Ejemplo  CONCESIONARIO DE PRUEBA, S.L.",
    "X1234567L  B00000000",
    "Calle Inventada, 12  CALLE, 1",
    "Madrid, Madrid (28000)  Rivas, Madrid (28500)",
    "600111222  Tel.: 910000000",
    "RESUMEN",
    "Modelo:  RENAULT CLIO Techno  16.000,00 €",
  ];
  const valoracion = ["VALORACIÓN VO", "Marca / Modelo: SEAT IBIZA 1.0", "Matrícula: 1234 BCD", "Bastidor: VSSZZZ6JZ9R123456", "Valoración  3.500,00 €"];
  const final = ["TOTAL A PAGAR  12.000,00 €", "En Rivas - Vaciamadrid , a Martes, 06 Octubre 2026"];

  it("no toma como matrícula del expediente la de la sección de valoración VO", () => {
    const d = parsearPedido([...base, ...valoracion, ...final].join("\n"), catalogo);
    expect(d.tipoPedido).toBe("nuevo");
    expect(d.matricula).toBeNull();
    expect(d.retoma).toMatchObject({ matricula: "1234BCD", vin: "VSSZZZ6JZ9R123456" });
    expect(d.avisos.join(" ")).toContain("vehículo de retoma");
  });

  it("sin sección de valoración no hay retoma, y un pedido nuevo nunca lleva matrícula", () => {
    const d = parsearPedido([...base, "Matrícula: 5678 FGH", ...final].join("\n"), catalogo);
    expect(d.retoma).toBeNull();
    expect(d.matricula).toBeNull();
  });

  it("en un pedido de vehículo usado vendido sí se lee la matrícula del coche, y la retoma aparte", () => {
    const texto = ["PEDIDO DE VEHÍCULO USADO", "Emitido: Martes, 06 Oct 2026 10:00 hs.", "CLIENTE  ESTABLECIMIENTO", "Matrícula: 9999 KLM", "Bastidor: VF1RJA00123456789", ...valoracion, ...final].join("\n");
    const d = parsearPedido(texto, catalogo);
    expect(d.tipoPedido).toBe("usado");
    expect(d.matricula).toBe("9999KLM");
    expect(d.vin).toBe("VF1RJA00123456789");
    expect(d.retoma?.matricula).toBe("1234BCD");
  });

  it("toma la fecha del pedido de la firma si no hay «Emitido»", () => {
    const d = parsearPedido(["PEDIDO DE VEHÍCULO NUEVO", "CLIENTE  ESTABLECIMIENTO", "Sr. Don Ana Ejemplo  X", ...final].join("\n"), catalogo);
    expect(d.fechaExpediente).toBe("2026-10-06");
  });
});

describe("modelos abreviados", () => {
  const cat = {
    modelos: [
      { id: 1, nombre: "Renault 5", marca: "Renault" },
      { id: 2, nombre: "4", marca: "Renault" },
      { id: 3, nombre: "Clio", marca: "Renault" },
    ],
    tiposVenta: [],
  };
  it.each([
    ["Modelo:  R5 E-Tech 120cv  25.000,00 €", 1],
    ["Modelo:  R 5 Iconic", 1],
    ["Modelo:  RENAULT 4 E-TECH", 2],
    ["Modelo:  R4 Evolution", 2],
    ["Modelo:  RENAULT CLIO Techno", 3],
  ])("%s", (linea, id) => {
    expect(parsearPedido(["CLIENTE", linea].join("\n"), cat).idModelo).toBe(id);
  });
});
