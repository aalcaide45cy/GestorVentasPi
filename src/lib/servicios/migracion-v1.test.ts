import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { clientes, commissionLiquidations, commissionPlanModelRates, commissionPlanVendedores, commissionPlans, commissionUsedRates, estadoVehiculo, expedientes, marcas, promocionesPuntos, tiendas, usuarios } from "@/db/schema";
import { crearUsuarioPrueba, reiniciarBd } from "../../../tests/ayudas";
import { compararConAntigua, leerLiquidacion } from "./comisiones-gestion";
import { analizarCopiaV1, convertirCopiaV1, esquemaCopiaV1, transformarCopiaV1, type CopiaV1 } from "./migracion-v1";

beforeEach(reiniciarBd);

/** Copia sintética en el formato de la app antigua (v1.0), con las situaciones que hay que convertir. */
function copiaAntigua(): CopiaV1 {
  const exp = (id: number, o: Record<string, unknown>) => ({
    id_expediente: id, id_usuario: 1, id_cliente: 1, id_modelo: 1, id_tienda: 1, fecha_expediente: "2026-06-02", fecha_afectacion: null, fecha_matriculacion: null, fecha_entrega: null,
    fecha_rci: null, fecha_facturacion: null, matricula: null, id_tipo_de_venta: 1, id_estado_vehiculo: 1, vin: null, valor_objetivo: null, min_coches_multiplicador: 0,
    cobrado_otra_fecha: false, fecha_cobrado: null, comision_cobrada: false, comision_coche_cobrada: false, comision_usado_cobrada: false, comision_financiacion_cobrada: false,
    comision_preference_cobrada: false, comision_bonus_cobrada: false, comision_coche_real: null, comision_financiacion_real: null, conceptos_adicionales: null, ...o,
  });
  return {
    version: "1.0",
    timestamp: "2026-07-01T10:00:00Z",
    data: {
      tiendas: [{ id_tienda: 1, nombre: "Madrid Norte", ciudad: "Madrid" }],
      usuarios: [
        { id_usuario: 1, clerk_id: "user_abc", nombre: "Alfonso", rol: "administrador", tipo_vendedor: "VN", patron_vo: "Estándar VO" },
        { id_usuario: 2, clerk_id: "user_def", nombre: "Compañera Antigua", rol: "vendedor", tipo_vendedor: "VN", patron_vo: null },
      ],
      usuariosTiendas: [{ id_usuario_tienda: 1, id_usuario: 1, id_tienda: 1 }],
      clientes: [{ id: 1, cliente_id: "c-1", dni: "1A", nombre: "Ana Ruiz", fecha_de_nacimiento: null, tienda_id: 1 }],
      emailsClientes: [{ id_email_cliente: 1, id_cliente: 1, email: "ana@e.com", tipo_email: "Principal" }],
      telefonosClientes: [{ id_telefono_cliente: 1, id_cliente: 1, telefono: "600", tipo_telefono: null }],
      marcas: [{ id_marca: 1, nombre: "Renault", activo: true, acceso_rapido: true, sistema_comisiones: true }],
      modelos: [{ id_modelo: 1, marca_id: 1, nombre_modelo: "Clio", acceso_rapido: true, orden_acceso_rapido: 1 }],
      tipoDeVenta: [
        { id_tipo_de_venta: 1, nombre_tipo_venta: "Contado", color: "#22c55e", orden: 1 },
        { id_tipo_de_venta: 2, nombre_tipo_venta: "Crédito", color: "#3b82f6", orden: 2 },
      ],
      estadoVehiculo: [
        { id_estado_vehiculo: 1, nombre_estado_vehiculo: "Nuevo", predeterminado: true },
        { id_estado_vehiculo: 2, nombre_estado_vehiculo: "Demo", predeterminado: false },
        { id_estado_vehiculo: 3, nombre_estado_vehiculo: "KM0", predeterminado: false },
      ],
      expedientes: [
        exp(10, { fecha_matriculacion: "2026-06-10" }),
        exp(11, { fecha_matriculacion: "2026-06-11", valor_objetivo: 2, min_coches_multiplicador: 2 }),
        exp(12, { fecha_matriculacion: "2026-06-12", valor_objetivo: 2, min_coches_multiplicador: 2 }),
        exp(13, { id_estado_vehiculo: 2, fecha_matriculacion: "2026-05-01", fecha_facturacion: "2026-06-20", valor_objetivo: 0 }),
        exp(14, { fecha_matriculacion: "2026-06-14", comision_coche_real: 300, comision_financiacion_real: 120.5, id_tipo_de_venta: 2, fecha_rci: "2026-06-05" }),
        exp(15, { fecha_matriculacion: "2026-06-15", conceptos_adicionales: JSON.stringify([{ titulo: "Bonus Rappel", importe: 100, cobrado: true }]) }),
        exp(16, { id_usuario: null, fecha_matriculacion: "2026-06-16" }),
      ],
      commissionPlans: [{ id_plan: 1, nombre: "Junio 2026", fecha_inicio: "2026-06-01", fecha_fin: "2026-06-30", estado: "cerrado", objetivo_base: 13, arrastre: 0, min_matriculaciones: 6, min_coches_multiplicador: 0, penalizacion_importe: 50, penalizacion_titulo: "Penal", penalizacion_descripcion: null, notas_adicionales: "Pendiente de la empresa: 80 €" }],
      commissionPlanModelRates: [
        { id_rate: 1, id_plan: 1, id_modelo: 1, tasa_intervencion_cumplida: true, rate_x_minus_4: 100, rate_x_minus_3: 110, rate_x_minus_2: 120, rate_x_minus_1: 130, rate_x: 140, rate_x_plus_1: 150, rate_x_plus_2: 160, rate_x_plus_3: 170, activo: true },
        { id_rate: 2, id_plan: 1, id_modelo: 1, tasa_intervencion_cumplida: false, rate_x_minus_4: 50, rate_x_minus_3: 60, rate_x_minus_2: 70, rate_x_minus_1: 80, rate_x: 90, rate_x_plus_1: 100, rate_x_plus_2: 110, rate_x_plus_3: 120, activo: true },
      ],
      commissionRules: [{ id_rule: 1, id_plan: 1, nombre: "Regla matric.", tipo_evento: "matriculacion", id_marca: 1, id_modelo: null, afecta_objetivo: true, valor_objetivo: 1, afecta_comision: true, importe: 20, activa: true, tasa_intervencion_cumplida: null, ligar_a_credito: false }],
      commissionBonusRules: [
        { id_bonus: 1, id_plan: 1, nombre: "Bonus campaña", tipo_evento: "financiacion", id_marca: null, id_modelo: null, importe: 30, afecta_objetivo: false, valor_objetivo: 0, fecha_inicio: null, fecha_fin: null, activo: true, tipo_vehiculo: "nuevo", es_penalizacion: false },
        { id_bonus: 2, id_plan: 1, nombre: "Manual", tipo_evento: "manual", id_marca: null, id_modelo: null, importe: 10, afecta_objetivo: false, valor_objetivo: 0, fecha_inicio: null, fecha_fin: null, activo: true, tipo_vehiculo: "cualquiera", es_penalizacion: false },
      ],
      commissionFinanceRules: [{ id_finance: 1, id_plan: 1, importe_normal: 10, importe_preference: 20 }],
      commissionUsedRates: [{ id_used_rate: 1, id_plan: 1, tipo_usado: "KM0", importe_primera: 120, importe_resto: 60, valor_objetivo: 1, min_aplicar: 1, activo: true }],
      commissionFinanceRates: [{ id_finance_rate: 1, id_plan: 1, id_marca: 1, tipo_financiacion: "Crédito", importe: 90 }],
      commissionPreferenceRules: [{ id_pref_rule: 1, id_plan: 1, nombre: "BOX3", id_marca: 1, id_modelo: null, tipo_financiacion: "BOX3", importe: 70, activa: true }],
      commissionVoPatterns: [{ id_vo_pattern: 1, id_plan: 1, nombre: "Estándar VO", aplica_a_vn: false, activo: true, tiers: JSON.stringify([{ unidad: 1, importe: 150 }, { unidad: 2, importe: 170 }]) }],
      commissionBrandInterventionRates: [{ id_intervention_rate: 1, id_plan: 1, id_marca: 1, tasa_intervencion: 65, valor_objetivo_defecto: 1.5, tipo_tasa: "porcentaje" }],
      commissionLiquidations: [{ id_liquidation: 1, id_plan: 1, estado: "cerrada", fecha_calculo: "2026-07-01", objetivo_base_snapshot: 13, arrastre_snapshot: 0, x_calculado_snapshot: 13, total_computables_snapshot: 8, tramo_alcanzado_snapshot: "X-4", matriculaciones_reales_snapshot: 5, cumple_minimo_snapshot: false, total_comision_economica: 0, penalizacion_importe_snapshot: 50, penalizacion_titulo_snapshot: null, penalizacion_descripcion_snapshot: null }],
      commissionLiquidationLines: [
        { id_line: 1, id_liquidation: 1, id_expediente: 10, vendedor_nombre: "Alfonso", cliente_nombre: "Ana", marca_nombre: "Renault", modelo_nombre: "Clio", fecha_pedido: "2026-06-02", fecha_afectacion: null, fecha_matriculacion: "2026-06-10", entra_por_pedido: false, entra_por_afectacion: false, entra_por_matriculacion: true, valor_para_objetivo: 1, comision_base: 0, comision_base_vn: 90, comision_usado: 0, comision_financiacion: 0, comision_preference: 0, bonus_acumulado: 0, total_generado: 90, mes_generacion: "Junio 2026", mes_pago_estimado: "Julio 2026" },
        { id_line: 2, id_liquidation: 1, id_expediente: 14, vendedor_nombre: "Alfonso", cliente_nombre: "Ana", marca_nombre: "Renault", modelo_nombre: "Clio", fecha_pedido: "2026-06-02", fecha_afectacion: null, fecha_matriculacion: "2026-06-14", entra_por_pedido: false, entra_por_afectacion: false, entra_por_matriculacion: true, valor_para_objetivo: 1, comision_base: 0, comision_base_vn: 300, comision_usado: 0, comision_financiacion: 120, comision_preference: 0, bonus_acumulado: 0, total_generado: 420, mes_generacion: "Junio 2026", mes_pago_estimado: "Julio 2026" },
      ],
      commissionLiquidationLineItems: [],
      importacionesBloques: [],
      importacionesRegistros: [],
      ajustes: [],
    },
  };
}

async function adminActual() {
  const admin = await crearUsuarioPrueba("administrador", "Alfonso");
  return admin;
}

describe("análisis", () => {
  it("clasifica estados y tipos, avisa de lo que se pierde y de los expedientes sin vendedor", async () => {
    const admin = await adminActual();
    const inf = analizarCopiaV1(copiaAntigua(), { actuales: [{ id: admin.idUsuario, nombre: "Alfonso" }], idAdmin: admin.idUsuario });
    expect(inf.estados.map((e) => [e.nombre, e.clase, e.subtipo])).toEqual([["Nuevo", "VN", null], ["Demo", "VO", "DEMO"], ["KM0", "VO", "KM0"]]);
    expect(inf.tiposVenta.map((t) => t.categoria)).toEqual(["CONTADO", "CREDITO"]);
    expect(inf.expedientesSinVendedor).toBe(1);
    expect(inf.expedientesConCupo).toBe(2);
    expect(inf.usuarios.find((u) => u.idAntiguo === 1)?.destino).toContain("cuenta actual");
    expect(inf.usuarios.find((u) => u.idAntiguo === 2)?.destino).toContain("bloqueada");
    expect(inf.avisos.join(" ")).toContain("financiación genéricas");
    expect(inf.avisos.join(" ")).toContain("«manual»");
  });

  it("rechaza copias de otro formato o que no parecen de la app antigua", () => {
    const ctx = { actuales: [], idAdmin: 1 };
    expect(() => analizarCopiaV1({ version: "2.0", data: { expedientes: [] } }, ctx)).toThrow(/formato nuevo/);
    expect(() => analizarCopiaV1({ version: "1.0", data: { cosas: [] } }, ctx)).toThrow(/desconocidas/);
    expect(() => analizarCopiaV1({ version: "1.0", data: { tiendas: [] } }, ctx)).toThrow(/no contiene/);
    expect(esquemaCopiaV1.safeParse({ data: 5 }).success).toBe(false);
  });
});

describe("conversión", () => {
  it("convierte unidades, VO, cupos, conceptos y planes según 12.13", async () => {
    const admin = await adminActual();
    const copia = copiaAntigua();
    const t = transformarCopiaV1(copia, { actuales: [{ id: admin.idUsuario, nombre: "Alfonso" }], idAdmin: admin.idUsuario });
    expect(t.promociones).toHaveLength(1);
    expect(t.promociones[0]).toMatchObject({ nombre: "Importada: 2 puntos, mínimo 2", puntos_especiales: 200, minimo_unidades: 2 });

    const r = await convertirCopiaV1(db, admin.idUsuario, { copia, confirmacion: "CONVERTIR" });
    expect(r).toMatchObject({ expedientes: 7, planes: 1, promociones: 1, liquidaciones: 1, usuariosCreados: 1 });

    const e = async (id: number) => (await db.select().from(expedientes).where(eq(expedientes.idExpediente, id)))[0];
    expect((await e(11)).puntos).toBe(200);
    expect((await e(11)).idPromocion).not.toBeNull();
    expect((await e(11)).idPromocion).toBe((await e(12)).idPromocion);
    expect((await e(10)).puntos).toBeNull();
    // El 0 se conserva y la demo pasa a VO con fecha de cobro = facturación
    expect((await e(13)).puntos).toBe(0);
    expect((await e(13)).fechaCobrado).toBe("2026-06-20");
    const [demo] = await db.select().from(estadoVehiculo).where(eq(estadoVehiculo.idEstadoVehiculo, 2));
    expect(demo).toMatchObject({ clase: "VO", subtipoVo: "DEMO" });
    // Importes manuales en céntimos y conceptos adicionales convertidos
    expect((await e(14)).comisionCocheManual).toBe(30000);
    expect((await e(14)).comisionFinanciacionManual).toBe(12050);
    expect((await e(15)).conceptosEspeciales).toEqual([{ titulo: "Bonus Rappel", importe_centimos: 10000, descripcion: "", evento: "matriculacion", cobrado: true }]);
    // Sin vendedor → administrador
    expect((await e(16)).idUsuario).toBe(admin.idUsuario);
    expect((await e(10)).idUsuario).toBe(admin.idUsuario);

    // Plan: objetivo ×100 por vendedor, tarifas en mapa de céntimos, VO y notas históricas
    const [plan] = await db.select().from(commissionPlans);
    expect(plan).toMatchObject({ penalizacionImporte: 5000, estado: "cerrado" });
    expect(plan.notas).toContain("Pendiente de la empresa");
    expect(plan.notas).toContain("Mínimo de matriculaciones");
    const vend = await db.select().from(commissionPlanVendedores);
    expect(vend.every((v) => v.objetivoBase === 1300)).toBe(true);
    const tarifas = await db.select().from(commissionPlanModelRates);
    expect(tarifas.find((x) => x.tasaCumplida)?.importes).toEqual({ "-4": 10000, "-3": 11000, "-2": 12000, "-1": 13000, "0": 14000, "1": 15000, "2": 16000, "3": 17000 });
    const [usado] = await db.select().from(commissionUsedRates);
    expect(usado).toMatchObject({ subtipo: "KM0", importePrimera: 12000, importeResto: 6000, minAplicar: 0 });

    // Liquidación antigua: cerrada, importada, de solo lectura
    const [liq] = await db.select().from(commissionLiquidations);
    expect(liq).toMatchObject({ estado: "cerrada", origen: "importada_antigua", mes: "2026-06", mesPago: "2026-07", puntosMes: 800, objetivoX: 1300, tramo: -4, bruto: 51000, penalizacion: 5000, neto: 46000 });
    await expect(db.update(commissionLiquidations).set({ neto: 1 })).rejects.toThrow();
    const detalle = await leerLiquidacion(db, liq.idLiquidation);
    expect(detalle?.lineas).toHaveLength(2);
    expect(detalle?.lineas[1].conceptos.map((c) => c.importe)).toEqual([30000, 12000]);
  });

  it("es repetible: ejecutarla dos veces no duplica nada", async () => {
    const admin = await adminActual();
    const copia = copiaAntigua();
    const primera = await convertirCopiaV1(db, admin.idUsuario, { copia, confirmacion: "CONVERTIR" });
    const segunda = await convertirCopiaV1(db, admin.idUsuario, { copia, confirmacion: "CONVERTIR" });
    expect(segunda.expedientes).toBe(primera.expedientes);
    expect(await db.select().from(expedientes)).toHaveLength(7);
    expect(await db.select().from(promocionesPuntos)).toHaveLength(1);
    expect(await db.select().from(commissionLiquidations)).toHaveLength(1);
    // La cuenta bloqueada se reutiliza por nombre en la segunda pasada
    const bloqueadas = (await db.select().from(usuarios)).filter((u) => u.bloqueado);
    expect(bloqueadas.length).toBeLessThanOrEqual(2);
  });

  it("permite elegir qué se importa: sin clientes ni comisiones los expedientes quedan sin cliente ni promoción", async () => {
    const admin = await adminActual();
    const r = await convertirCopiaV1(db, admin.idUsuario, { copia: copiaAntigua(), confirmacion: "CONVERTIR", secciones: ["catalogos", "expedientes"] });
    expect(r).toMatchObject({ expedientes: 7, clientes: 0, planes: 0, liquidaciones: 0 });
    const exps = await db.select().from(expedientes);
    expect(exps).toHaveLength(7);
    expect(exps.every((x) => x.idCliente === null && x.idPromocion === null)).toBe(true);
    expect(await db.select().from(commissionPlans)).toHaveLength(0);
    expect(await db.select().from(commissionLiquidations)).toHaveLength(0);
  });

  it("no deja elegir una parte sin aquello de lo que depende", async () => {
    const admin = await adminActual();
    await expect(convertirCopiaV1(db, admin.idUsuario, { copia: copiaAntigua(), confirmacion: "CONVERTIR", secciones: ["expedientes"] })).rejects.toMatchObject({ status: 400 });
    await expect(convertirCopiaV1(db, admin.idUsuario, { copia: copiaAntigua(), confirmacion: "CONVERTIR", secciones: ["catalogos", "liquidaciones"] })).rejects.toMatchObject({ status: 400 });
  });

  it("modo añadir: conserva lo que ya hay, reutiliza catálogos y clientes iguales y no duplica al repetirse", async () => {
    const admin = await adminActual();
    const [t] = await db.insert(tiendas).values({ nombre: "Madrid Norte" }).returning();
    const [renault] = await db.insert(marcas).values({ nombre: "renault" }).returning();
    await db.insert(clientes).values([
      { clienteId: "mio-1", dni: "9Z", nombre: "Pedro Propio", tiendaId: t.idTienda },
      { clienteId: "mio-2", dni: "1A", nombre: "Ana Ruiz (ya existía)", tiendaId: t.idTienda },
    ]);
    const r = await convertirCopiaV1(db, admin.idUsuario, { copia: copiaAntigua(), confirmacion: "CONVERTIR", modo: "anadir" });
    expect(r).toMatchObject({ expedientes: 7, clientes: 0, clientesReutilizados: 1, planes: 0, liquidaciones: 0 });
    const cs = await db.select().from(clientes);
    expect(cs.map((x) => x.nombre).sort()).toEqual(["Ana Ruiz (ya existía)", "Pedro Propio"]);
    expect((await db.select().from(marcas)).map((m) => m.idMarca)).toEqual([renault.idMarca]);
    expect(await db.select().from(tiendas)).toHaveLength(1);
    const exps = await db.select().from(expedientes);
    expect(exps).toHaveLength(7);
    expect(exps.every((e) => e.idCliente === cs.find((x) => x.dni === "1A")?.id)).toBe(true);

    const segunda = await convertirCopiaV1(db, admin.idUsuario, { copia: copiaAntigua(), confirmacion: "CONVERTIR", modo: "anadir" });
    expect(segunda).toMatchObject({ expedientes: 0, expedientesOmitidos: 7 });
    expect(await db.select().from(expedientes)).toHaveLength(7);
  });

  it("modo añadir: no admite planes ni liquidaciones", async () => {
    const admin = await adminActual();
    await expect(convertirCopiaV1(db, admin.idUsuario, { copia: copiaAntigua(), confirmacion: "CONVERTIR", modo: "anadir", secciones: ["catalogos", "comisiones"] })).rejects.toMatchObject({ status: 400 });
  });

  it("exige escribir CONVERTIR", async () => {
    const admin = await adminActual();
    await expect(convertirCopiaV1(db, admin.idUsuario, { copia: copiaAntigua(), confirmacion: "no" })).rejects.toMatchObject({ status: 400 });
  });

  it("tras convertir, comparar con la liquidación antigua muestra totales, puntos, tramo y diferencias por expediente", async () => {
    const admin = await adminActual();
    await convertirCopiaV1(db, admin.idUsuario, { copia: copiaAntigua(), confirmacion: "CONVERTIR" });
    const [liq] = await db.select().from(commissionLiquidations);
    const c = await compararConAntigua(db, liq.idLiquidation);
    expect(c.totalAntes).toBe(46000);
    expect(c.puntosAntes).toBe(800);
    expect(c.tramoAntes).toBe(-4);
    expect(c.filas.find((f) => f.idExpediente === 10)).toMatchObject({ importeAntes: 9000, puntosAntes: 100 });
    expect(c.filas.find((f) => f.idExpediente === 14)?.importeAntes).toBe(42000);
    // El motor nuevo calcula los 6 coches de junio (también los que la antigua no listaba) y no hay mínimo
    expect(c.filas.length).toBeGreaterThan(2);
    expect(c.totalAhora).toBeGreaterThan(0);
    expect(c.explicaciones.length).toBe(6);
  });
});
