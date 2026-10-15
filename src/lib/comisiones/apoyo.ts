import { calcularMes } from "./motor";
import type { ApuntePuntos, Centimos, ExpedienteMotor, LineaExpediente, Mes, PlanMotor, ResultadoMes, VendedorMotor } from "./tipos";
import { mesDe } from "./util";

/** Meses en los que un expediente genera algo: pedido, afectación, RCI y mes de cómputo. */
export function mesesDeExpediente(e: ExpedienteMotor): Mes[] {
  const usaCobro = e.clase === "VO" || e.cobradoOtraFecha;
  const meses = [e.fechaExpediente, e.fechaAfectacion, e.fechaRci, usaCobro ? e.fechaCobro : e.fechaMatriculacion, e.fechaCobro].map(mesDe);
  return [...new Set(meses.filter((m): m is Mes => m !== null))].sort();
}

export interface VendedorMes {
  idVendedor: number;
  mes: Mes;
}

/**
 * Conjunto de (vendedor, mes) que hay que recalcular al crear, editar o borrar un expediente (12.9.1):
 * los meses de antes y de después, de cada vendedor implicado (si se reasigna, los dos).
 */
export function mesesAfectados(antes: ExpedienteMotor | null, despues: ExpedienteMotor | null): VendedorMes[] {
  const claves = new Map<string, VendedorMes>();
  for (const e of [antes, despues]) {
    if (!e) continue;
    for (const mes of mesesDeExpediente(e)) claves.set(`${e.idVendedor}|${mes}`, { idVendedor: e.idVendedor, mes });
  }
  if (antes && despues && antes.idVendedor !== despues.idVendedor) {
    // Al reasignar, los dos vendedores se recalculan en los meses de ambas versiones.
    for (const idVendedor of [antes.idVendedor, despues.idVendedor]) {
      for (const e of [antes, despues]) for (const mes of mesesDeExpediente(e)) claves.set(`${idVendedor}|${mes}`, { idVendedor, mes });
    }
  }
  return [...claves.values()].sort((a, b) => a.idVendedor - b.idVendedor || a.mes.localeCompare(b.mes));
}

export interface Simulacion {
  mes: Mes | null;
  resultado: ResultadoMes | null;
  linea: LineaExpediente | null;
  aviso: string | null;
}

/**
 * «Desglose estimado de comisión» (12.6): `calcularMes` sobre el mes de cómputo del expediente,
 * con una copia en memoria del expediente (aunque no esté guardado). No toca la BD.
 */
export function simularExpediente(
  plan: PlanMotor | null,
  vendedor: VendedorMotor,
  expedienteEditado: ExpedienteMotor,
  restoExpedientes: ExpedienteMotor[],
): Simulacion {
  const usaCobro = expedienteEditado.clase === "VO" || expedienteEditado.cobradoOtraFecha;
  const mes = mesDe(usaCobro ? expedienteEditado.fechaCobro : expedienteEditado.fechaMatriculacion);
  if (!mes) {
    return { mes: null, resultado: null, linea: null, aviso: usaCobro ? "Falta la fecha de cobro: el coche aún no cuenta en ningún mes" : "Falta la fecha de matriculación: el coche aún no cuenta en ningún mes" };
  }
  const otros = restoExpedientes.filter((x) => x.id !== expedienteEditado.id);
  const resultado = calcularMes(plan, vendedor, mes, [...otros, expedienteEditado]);
  return { mes, resultado, linea: resultado.lineas.find((l) => l.idExpediente === expedienteEditado.id) ?? null, aviso: null };
}

/* ------------------------------------------------------------------ */
/* Libro de puntos (12.10)                                             */
/* ------------------------------------------------------------------ */

export interface ApunteLibro {
  idExpediente: number | null;
  evento: string;
  regla: string | null;
  puntos: number;
}

const claveApunte = (a: { idExpediente: number | null; evento: string; regla: string | null }) => `${a.idExpediente ?? "-"}|${a.evento}|${a.regla ?? "-"}`;

/**
 * Apuntes a insertar para que el libro de (vendedor, mes) sume exactamente lo que dice el motor:
 * uno por la diferencia (positiva o negativa) de cada clave (expediente, evento, regla).
 */
export function apuntesDeSincronizacion(deseados: ApuntePuntos[], actuales: ApunteLibro[], ctx: VendedorMes): ApuntePuntos[] {
  const neto = new Map<string, number>();
  for (const a of actuales) neto.set(claveApunte(a), (neto.get(claveApunte(a)) ?? 0) + a.puntos);
  const objetivo = new Map<string, ApuntePuntos>();
  for (const d of deseados) {
    const k = claveApunte(d);
    const previo = objetivo.get(k);
    objetivo.set(k, previo ? { ...previo, puntos: previo.puntos + d.puntos } : { ...d });
  }
  const res: ApuntePuntos[] = [];
  for (const [k, d] of objetivo) {
    const dif = d.puntos - (neto.get(k) ?? 0);
    if (dif !== 0) res.push({ ...d, puntos: dif });
  }
  // Claves que ya no existen en el motor: se anulan con un apunte negativo.
  for (const a of actuales) {
    const k = claveApunte(a);
    if (objetivo.has(k)) continue;
    const resto = neto.get(k) ?? 0;
    if (resto === 0) continue;
    neto.set(k, 0);
    res.push({ idVendedor: ctx.idVendedor, mes: ctx.mes, fecha: `${ctx.mes}-01`, idExpediente: a.idExpediente, evento: a.evento as ApuntePuntos["evento"], regla: a.regla, puntos: -resto });
  }
  return res;
}

/** Diferencia de neto entre una liquidación anterior y la nueva (para avisos y versiones). */
export function diferenciaNeto(anterior: Centimos, nuevo: Centimos): { anterior: Centimos; nuevo: Centimos; diferencia: Centimos } {
  return { anterior, nuevo, diferencia: nuevo - anterior };
}
