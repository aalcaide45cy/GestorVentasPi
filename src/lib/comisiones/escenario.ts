import type { Centimos, Centesimas, PlanMotor } from "./tipos";

/**
 * «Laboratorio» de comisiones: cambios hipotéticos sobre el plan que se aplican solo en memoria para ver cómo se mueven
 * los puntos, el tramo y las comisiones. No se guarda nada. Función pura: devuelve una copia del plan con los cambios.
 */
export interface CambiosEscenario {
  /** Objetivo X base del vendedor (centésimas). */
  objetivoBase?: Centesimas;
  arrastre?: Centesimas;
  puntosPorPedido?: Centesimas;
  penalizacionImporte?: Centimos;
  tramoMin?: number;
  tramoMax?: number;
  /** Por marca: objetivo de la tasa de intervención, su tipo y los puntos por defecto. */
  tasas?: Record<string, { objetivo?: number; tipoTasa?: "porcentaje" | "unidades"; puntosDefecto?: Centesimas }>;
  /** Por regla o bonus (identificador del motor). */
  reglas?: Record<string, { activa?: boolean; importe?: Centimos; puntos?: Centesimas }>;
  promociones?: Record<string, { puntosEspeciales?: Centesimas; minimoUnidades?: number; puntosSiNoCumple?: Centesimas }>;
  /** Importe de una tarifa VN en un tramo concreto. */
  tarifas?: { idModelo: number; tasaCumplida: boolean; tramo: number; importe: Centimos }[];
}

/** Número de cambios activos (para mostrar «n cambios» y saber si el escenario difiere del plan real). */
export function contarCambios(c: CambiosEscenario): number {
  const campos = [c.objetivoBase, c.arrastre, c.puntosPorPedido, c.penalizacionImporte, c.tramoMin, c.tramoMax].filter((x) => x !== undefined).length;
  const anidados = (o: Record<string, Record<string, unknown>> | undefined) => Object.values(o ?? {}).reduce((s, v) => s + Object.values(v).filter((x) => x !== undefined).length, 0);
  return campos + anidados(c.tasas) + anidados(c.reglas) + anidados(c.promociones) + (c.tarifas?.length ?? 0);
}

export function aplicarEscenario(plan: PlanMotor, idVendedor: number, c: CambiosEscenario): PlanMotor {
  const p: PlanMotor = structuredClone(plan);
  if (c.puntosPorPedido !== undefined) p.puntosPorPedido = c.puntosPorPedido;
  if (c.penalizacionImporte !== undefined) p.penalizacionImporte = c.penalizacionImporte;
  if (c.tramoMin !== undefined) p.tramoMin = c.tramoMin;
  if (c.tramoMax !== undefined) p.tramoMax = c.tramoMax;
  if (c.objetivoBase !== undefined || c.arrastre !== undefined) {
    const actual = p.objetivos[idVendedor] ?? { base: 0, arrastre: 0 };
    p.objetivos[idVendedor] = { base: c.objetivoBase ?? actual.base, arrastre: c.arrastre ?? actual.arrastre };
  }
  for (const [clave, t] of Object.entries(c.tasas ?? {})) {
    const idMarca = Number(clave);
    const fila = p.tasaIntervencionPorMarca.find((x) => x.idMarca === idMarca);
    if (fila) {
      if (t.objetivo !== undefined) fila.objetivo = t.objetivo;
      if (t.tipoTasa !== undefined) fila.tipoTasa = t.tipoTasa;
    }
    if (t.puntosDefecto !== undefined) p.puntosPorDefectoMarca[idMarca] = t.puntosDefecto;
  }
  for (const [clave, r] of Object.entries(c.reglas ?? {})) {
    const regla = p.reglasYBonus.find((x) => x.id === Number(clave));
    if (!regla) continue;
    if (r.activa !== undefined) regla.activa = r.activa;
    if (r.importe !== undefined) regla.importe = r.importe;
    if (r.puntos !== undefined) regla.puntos = r.puntos;
  }
  for (const [clave, pr] of Object.entries(c.promociones ?? {})) {
    const promo = p.promociones.find((x) => x.id === Number(clave));
    if (!promo) continue;
    if (pr.puntosEspeciales !== undefined) promo.puntosEspeciales = pr.puntosEspeciales;
    if (pr.minimoUnidades !== undefined) promo.minimoUnidades = pr.minimoUnidades;
    if (pr.puntosSiNoCumple !== undefined) promo.puntosSiNoCumple = pr.puntosSiNoCumple;
  }
  for (const t of c.tarifas ?? []) {
    let tarifa = p.tarifasVN.find((x) => x.idModelo === t.idModelo && x.tasaCumplida === t.tasaCumplida);
    if (!tarifa) {
      tarifa = { idModelo: t.idModelo, tasaCumplida: t.tasaCumplida, importes: {}, activo: true };
      p.tarifasVN.push(tarifa);
    }
    tarifa.importes[String(t.tramo)] = t.importe;
  }
  return p;
}
