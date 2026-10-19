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

  it("un pedido de Renault/Dacia sin financiación se propone como contado (y lo avisa)", () => {
    const sin = parsearPedido(base(null), cat);
    expect(sin.idTipoDeVenta).toBe(10);
    expect(sin.avisos.join(" ")).toContain("Contado");
    expect(parsearPedido(base("Promociones:  DTO VENTA DIRECTA  -100,00 €"), cat).idTipoDeVenta).toBe(10);
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

describe("pedido de vehículo usado con retoma", () => {
  const texto = [
    "PEDIDO DE VEHÍCULO USADO",
    "CLIENTE  ESTABLECIMIENTO DE LA RED RENAULT",
    "Sr. D. Francisco Javier Remedios Garcia  AUTOCARPE CONCESIONARIO, S.L.",
    "DATOS DEL VEHÍCULO",
    "Matrícula  1504JPN  Bastidor  VF12RA11A55506090",
    "Valoración VO:  RENAULT Mégane 1.6 Confort Dynamique - Matrícula 9835DNC  -0,00 €",
    "Pendiente de tasación definitiva del vehículo por parte del concesionario.",
  ].join("\n");
  it("la matrícula es la del coche vendido, aunque comparta línea con el bastidor, y la retoma se guarda aparte", () => {
    const d = parsearPedido(texto, catalogo);
    expect(d.tipoPedido).toBe("usado");
    expect(d.matricula).toBe("1504JPN");
    expect(d.retoma?.matricula).toBe("9835DNC");
  });
  it("un pedido escaneado sin el rótulo «USADO» se reconoce por «Renew» o por el régimen R.E.B.U.", () => {
    expect(parsearPedido("PEDIDO DE VEHÍCULO  renew\nCLIENTE\nSr. D. Jesus Jara Rodriguez\nMatrícula  3881LYM", catalogo).tipoPedido).toBe("usado");
    expect(parsearPedido("PEDIDO DE VEHÍCULO\nUso Anterior  Particular\nMatrícula  3881LYM", catalogo).tipoPedido).toBe("usado");
  });
});

describe("pedidos escaneados con ruido de OCR", () => {
  const texto = [
    "PEDIDO DE VEHÍCULO NUEVO",
    "Emitido: Sábado, 05 Sep 2026 11:31 hs.",
    "CLIENTE  ESTABLECIMIENTO DE LA RED RENAULT",
    "rr roo iovmicicco o rP|f[f[táTZZzZzT7rnvYÁcioóo>e?oe>r£..£xY  —",
    "Sra. Doña Maria Jose Acuña Abadia  AUTOCARPE CONCESIONARIO, S.L.",
    "00687749A  B83747626",
    "Avenida Moratalaz, 135, 5, A  CLAVO, 22-26",
    "Madrid, Madrid (28030)  Rivas - Vaciamadrid, Madrid (28522)",
    "600345731  Tel.: 916665058",
    "mjacunEhotmail.com  LaV:09:30a 13:30",
    "Alfonso Alcaide Cornejo",
    "alfonso.alcaideQautocarpe.es / 655455421",
    "RESUMEN",
  ].join("\n");
  it("salta la línea de basura de encima del nombre y recompone el correo", () => {
    const d = parsearPedido(texto, catalogo);
    expect(d.cliente).toBe("Maria Jose Acuña Abadia");
    expect(d.email).toBe("mjacun@hotmail.com");
  });
  it("recompone correos con «G» en vez de «@» y dominios deformados", () => {
    const t = texto.replace("mjacunEhotmail.com", "f.mayor.casadoGhoimail.com");
    expect(parsearPedido(t, catalogo).email).toBe("f.mayor.casado@hotmail.com");
  });
  it("sin rótulo de tipo, la hoja de «Modelo / Tapicería» es de un coche nuevo", () => {
    const t = ["Número Pedido 14216411", "CLIENTE  ESTABLECIMIENTO DE LA RED RENAULT", "Sra. Doña Luisa Rodriguez", "RESUMEN", "Modelo:  DACIA NUEVO SANDERO Expression  16.138,02 €", "Color:  Blanco  0,00 €", "Tapicería:  Tela  0,00 €"].join("\n");
    expect(parsearPedido(t, catalogo).tipoPedido).toBe("nuevo");
  });
});

describe("documentos que no son pedidos", () => {
  it("un PDF con datos de un cliente pero sin pinta de pedido no es un pedido", () => {
    const ficha = ["FICHA DE CLIENTE", "Nombre: JUAN PEREZ GARCIA", "NIF: 12345678Z", "Teléfono: 600123123", "Matrícula 1234 BCD"].join("\n");
    expect(parsearPedido(ficha, catalogo).esPedido).toBe(false);
  });
  it("un pedido sí lo es", () => {
    expect(parsearPedido("RENAULT RETAIL GROUP - PEDIDO DE VEHÍCULO\nCliente: JUAN PEREZ", catalogo).esPedido).toBe(true);
  });
  it("la hoja de prueba de un vehículo de demostración, el Anexo VO y las ofertas no son pedidos", () => {
    const hoja = "HOJA DE PRUEBA VEHÍCULO DE DEMOSTRACIÓN Viernes, 12 Abril 2024 CLIENTE ESTABLECIMIENTO Sr. D. Juan Perez Número Pedido 12345678";
    const anexo = "ANEXO A LAS CONDICIONES DE COMERCIALIZACIÓN DE LOS VEHÍCULOS DE OCASIÓN Y Toda señal recibida en la venta";
    const oferta = "INFORMACIÓN DE VEHÍCULO NUEVO Viernes, 07 Marzo 2025 / 17:30 hs - 6951-00 CLIENTE ESTABLECIMIENTO";
    for (const t of [hoja, anexo, oferta]) expect(parsearPedido(t, catalogo).esPedido).toBe(false);
  });
  it("un pedido de Renault o Dacia lo es aunque el reconocimiento ensucie la cabecera", () => {
    for (const t of ["PEDIDO DE VEH�CULO NUEVO Número Pedido 14275199 - 7508-00", "e? NETA PEDIDO DE VEHÍCULO NUEVO Número Pedido 12192475", "PEDIDO DE VEHÍCULO renew NÚMERO PEDIDO 19125", "Número Pedido 11556134 - 6653-00 - dnt Emitido: Jueves"]) {
      expect(parsearPedido(t, catalogo).esPedido).toBe(true);
    }
  });

  it("reconoce si es nuevo o usado aunque el OCR lea mal \u00abModelo:\u00bb y sin r\u00f3tulo de cabecera", () => {
    const nuevo = ["N\u00famero Pedido 13893450", "RESUMEN", "Modeto:  DACIA DUSTER Extreme Eco-G 120PD  18.443,30 \u20ac", "Color:  Sandstone HNV  454,55 \u20ac", "Tapicer\u00eda:  Tapicer\u00eda TEP Micro Cloud"].join("\n");
    expect(parsearPedido(nuevo, catalogo).tipoPedido).toBe("nuevo");
    const usado = ["DATOS DEL VEH\u00cdCULO", "Marca / Modelo / Versi\u00f3n  DACIA Spring Electric", "N\u00famero de stock  259269", "Kms  56431"].join("\n");
    expect(parsearPedido(usado, catalogo).tipoPedido).toBe("usado");
  });

  it("ignora la E del distintivo pegada a la matr\u00edcula de los pedidos de ocasi\u00f3n", () => {
    const texto = ["DATOS DEL VEH\u00cdCULO", "Marca / Modelo / Versi\u00f3n  DACIA Jogger", "N\u00famero de stock  259269", "Matr\u00edcula  E5919LZG  Bastidor  UU1RSDCNCN0123456", "Kms  56431"].join("\n");
    expect(parsearPedido(texto, catalogo).matricula).toBe("5919LZG");
  });
});
