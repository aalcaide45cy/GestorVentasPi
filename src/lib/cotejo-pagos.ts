import { nombreMes } from "@/lib/formato";
import { normalizarMatricula } from "@/lib/rejilla/analizar";

/**
 * Cotejo de pagos: cruza, por matrícula, los coches vendidos (expedientes de la app y, si se aportan, listados del
 * fabricante) con las rejillas de comisiones donde la empresa indica qué coches paga cada mes. Es una función pura.
 *
 * - verde (comisionado): la matrícula está en alguna rejilla guardada. Si es de un mes distinto al que le correspondía, sigue en verde
 *   pero con un aviso aparte (`aviso`).
 * - amarillo (dudoso): está repetida, con una letra de diferencia, o es una matrícula de la rejilla que no corresponde a ningún coche.
 * - gris oscuro (no se cobra): el vendedor ha marcado que ese coche nunca se cobra.
 * - rojo (no pagado): hay rejilla de todos los meses en que debía cobrarse y la matrícula no aparece.
 * - gris (sin rejilla): todavía no se ha subido la rejilla del mes que le corresponde, así que no se puede saber.
 */

export interface CocheCotejo {
  origen: "app" | "listado" | "ambos";
  id_expediente: number | null;
  cliente: string;
  /** Forma de pago del expediente (Contado, Crédito, Preference…); vacío si solo viene del listado. */
  tipo_pago: string;
  marca: string;
  modelo: string;
  matricula: string;
  f_expediente: string | null;
  f_afectacion: string | null;
  f_matriculacion: string | null;
  f_entrega: string | null;
  /** Estado del listado del fabricante (Archivado, Anulado…); vacío en un expediente de la app. */
  estado: string;
  usado: boolean;
  /** Expediente deshabilitado en la app: no cuenta (ni para comisiones ni en los listados) salvo que se pida. */
  deshabilitado?: boolean;
  /**
   * Fecha de facturación del expediente (solo los de la app la traen; `undefined` = coche de un listado, que no la tiene). Con ella el coche
   * se comisiona en la rejilla del mes SIGUIENTE al de su facturación (facturado en agosto, rejilla de septiembre).
   */
  f_facturacion?: string | null;
  /** Nuevo cobrado en otra fecha: manda `f_cobro` en lugar de la facturación (misma regla que el motor de comisiones). */
  cobrado_otra_fecha?: boolean;
  f_cobro?: string | null;
  /** El vendedor ha marcado que este coche no se cobra nunca (no sale como pendiente). */
  no_se_cobra?: boolean;
  motivo_no_se_cobra?: string | null;
  /** Marcado a mano como cobrado (aunque no salga en ninguna rejilla guardada). */
  cobrado_manual?: boolean;
  /** Marcado a mano como «reclamado» a la empresa: sigue pendiente, pero ya se ha pedido. */
  reclamado_manual?: boolean;
}

export interface PagoRejilla {
  mes: string;
  matricula: string;
  importe: number | null;
  /** La persona ha confirmado que la hoja trae exactamente esta matrícula (no es un error de lectura). */
  confirmada?: boolean;
}

export type EstadoCotejo = "pagado" | "dudoso" | "no_pagado" | "sin_rejilla" | "no_se_cobra";

export interface FilaCotejo {
  estado: EstadoCotejo;
  motivo: string;
  coche: CocheCotejo | null;
  matricula: string;
  /** Mes de la rejilla donde aparece (null si no aparece). */
  mesRejilla: string | null;
  importe: number | null;
  /** Matrícula tal como la trae la hoja, cuando es una lectura dudosa que se puede corregir o confirmar. */
  matriculaHoja?: string;
  /** Aviso aparte (no cambia el resultado): p. ej. está comisionado pero en la rejilla de otro mes. */
  aviso?: string;
}

export interface ResultadoCotejoPagos {
  filas: FilaCotejo[];
  /** Coches sin matrícula (anulados, pendientes de matricular…): no se pueden cotejar, pero se muestran. */
  sinMatricula: CocheCotejo[];
  mesesConRejilla: string[];
  resumen: { pagados: number; dudosos: number; noPagados: number; sinRejilla: number; noSeCobra: number; sinMatricula: number };
}

const mes = (f: string | null) => (f && /^\d{4}-\d{2}/.test(f) ? f.slice(0, 7) : null);

function sumarMes(m: string, n: number): string {
  const [a, mm] = m.split("-").map(Number);
  const t = a * 12 + (mm - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
}

/** Cuántos meses después de su facturación se comisiona un coche: facturado en agosto, rejilla de septiembre. */
export const MESES_HASTA_REJILLA = 1;

/**
 * Meses en que el coche debería venir en la rejilla. Un expediente de la app (trae `f_facturacion`) cuenta como en el motor de comisiones:
 * por su fecha de facturación (o la de matriculación si no hay), o por la de cobro en un nuevo «cobrado en otra fecha»; y se comisiona
 * en la rejilla del mes siguiente. Un coche de un listado (sin facturación) conserva la regla antigua: un nuevo, el mes de su
 * matriculación; un usado, del mes de afectación al de entrega.
 */
export function mesesEsperados(c: CocheCotejo): string[] {
  if (c.f_facturacion !== undefined) {
    const base = !c.usado && c.cobrado_otra_fecha && c.f_cobro ? c.f_cobro : (c.f_facturacion ?? c.f_matriculacion);
    const m = mes(base);
    return m ? [sumarMes(m, MESES_HASTA_REJILLA)] : [];
  }
  if (c.usado) {
    const ini = mes(c.f_afectacion) ?? mes(c.f_expediente) ?? mes(c.f_entrega);
    const fin = mes(c.f_entrega) ?? ini;
    if (!ini || !fin) return [];
    const salida: string[] = [];
    for (let m = ini; m <= fin && salida.length < 4; m = sumarMes(m, 1)) salida.push(m);
    return salida.length > 0 ? salida : [ini];
  }
  const m = mes(c.f_matriculacion) ?? mes(c.f_entrega);
  return m ? [m] : [];
}

/** Distancia de edición entre dos matrículas. */
export function distancia(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

/** Junta el mismo coche venga de la app y del listado: manda la app y el listado rellena lo que falte. */
function unirCoches(coches: CocheCotejo[]): { conMatricula: Map<string, CocheCotejo>; repetidas: Set<string>; sinMatricula: CocheCotejo[] } {
  const conMatricula = new Map<string, CocheCotejo>();
  const repetidas = new Set<string>();
  const sinMatricula: CocheCotejo[] = [];
  const ordenados = [...coches].sort((a, b) => (a.origen === "app" ? 0 : 1) - (b.origen === "app" ? 0 : 1));
  for (const c of ordenados) {
    const clave = normalizarMatricula(c.matricula);
    if (!clave) {
      sinMatricula.push(c);
      continue;
    }
    const previo = conMatricula.get(clave);
    if (!previo) {
      conMatricula.set(clave, { ...c, matricula: clave });
    } else if (previo.origen !== c.origen && c.origen === "listado") {
      conMatricula.set(clave, {
        ...previo,
        origen: "ambos",
        cliente: previo.cliente || c.cliente,
        marca: previo.marca || c.marca,
        modelo: previo.modelo || c.modelo,
        f_expediente: previo.f_expediente ?? c.f_expediente,
        f_afectacion: previo.f_afectacion ?? c.f_afectacion,
        f_matriculacion: previo.f_matriculacion ?? c.f_matriculacion,
        f_entrega: previo.f_entrega ?? c.f_entrega,
        estado: previo.estado || c.estado,
        usado: previo.usado || c.usado,
      });
    } else {
      repetidas.add(clave);
    }
  }
  return { conMatricula, repetidas, sinMatricula };
}

export function cotejarPagos(coches: CocheCotejo[], pagos: PagoRejilla[]): ResultadoCotejoPagos {
  const { conMatricula, repetidas, sinMatricula } = unirCoches(coches);
  const mesesConRejilla = [...new Set(pagos.map((p) => p.mes))].sort();
  const ultimoMes = mesesConRejilla[mesesConRejilla.length - 1] ?? null;

  const porMatricula = new Map<string, PagoRejilla[]>();
  for (const p of pagos) {
    const clave = normalizarMatricula(p.matricula);
    if (!clave) continue;
    const l = porMatricula.get(clave);
    if (l) l.push(p);
    else porMatricula.set(clave, [p]);
  }

  const cochesSinPago = [...conMatricula.keys()].filter((k) => !porMatricula.has(k));
  const pagosSinCoche = [...porMatricula.keys()].filter((k) => !conMatricula.has(k));
  // Lo que la persona ya ha confirmado como bien leído no se vuelve a emparejar con otra matrícula parecida
  const confirmadas = new Set([...porMatricula].filter(([, l]) => l.some((x) => x.confirmada)).map(([k]) => k));

  // Parejas de «casi iguales» (una o dos letras de diferencia) solo si no hay duda: cada lado tiene un único candidato.
  const parecida = new Map<string, string>();
  for (const k of cochesSinPago) {
    const candidatas = pagosSinCoche.filter((p) => !confirmadas.has(p) && Math.abs(p.length - k.length) <= 1 && distancia(p, k) <= 2);
    if (candidatas.length !== 1) continue;
    const inversas = cochesSinPago.filter((c) => Math.abs(c.length - candidatas[0].length) <= 1 && distancia(c, candidatas[0]) <= 2);
    if (inversas.length === 1) parecida.set(k, candidatas[0]);
  }
  const pagosUsados = new Set<string>(parecida.values());

  const filas: FilaCotejo[] = [];
  for (const [clave, coche] of conMatricula) {
    const esperados = mesesEsperados(coche);
    const encontrados = porMatricula.get(clave);
    if (coche.no_se_cobra && !encontrados) {
      filas.push({ estado: "no_se_cobra", motivo: coche.motivo_no_se_cobra ? `Marcado como «no se cobra»: ${coche.motivo_no_se_cobra}` : "Marcado como «no se cobra»", coche, matricula: clave, mesRejilla: null, importe: null });
      continue;
    }
    if (!encontrados && coche.cobrado_manual) {
      filas.push({ estado: "pagado", motivo: "Marcado a mano como cobrado", coche, matricula: clave, mesRejilla: null, importe: null });
      continue;
    }
    if (encontrados) {
      const p = encontrados[0];
      const motivos: string[] = [];
      if (encontrados.length > 1) motivos.push(`aparece ${encontrados.length} veces en las rejillas (${encontrados.map((x) => nombreMes(x.mes)).join(", ")})`);
      if (repetidas.has(clave)) motivos.push("hay más de un expediente con esta matrícula");
      const dentro = esperados.length === 0 || esperados.includes(p.mes);
      const aviso = dentro ? undefined : `Está en la rejilla de ${nombreMes(p.mes)} y le correspondía ${esperados.map(nombreMes).join(" / ")}`;
      filas.push({ estado: motivos.length > 0 ? "dudoso" : "pagado", motivo: motivos.length > 0 ? motivos.join("; ") : `En la rejilla de ${nombreMes(p.mes)}`, coche, matricula: clave, mesRejilla: p.mes, importe: p.importe, ...(aviso ? { aviso } : {}) });
      continue;
    }
    const casi = parecida.get(clave);
    if (casi) {
      const p = porMatricula.get(casi)![0];
      filas.push({ estado: "dudoso", motivo: `La rejilla de ${nombreMes(p.mes)} trae ${casi}: ¿es esta matrícula mal leída?`, coche, matricula: clave, mesRejilla: p.mes, importe: p.importe, matriculaHoja: casi });
      continue;
    }
    if (esperados.length === 0) {
      filas.push({ estado: "sin_rejilla", motivo: "No tiene fecha para saber en qué rejilla debía cobrarse", coche, matricula: clave, mesRejilla: null, importe: null });
      continue;
    }
    const faltan = esperados.filter((m) => !mesesConRejilla.includes(m));
    if (faltan.length > 0 || (ultimoMes !== null && esperados[0] > ultimoMes)) {
      filas.push({ estado: "sin_rejilla", motivo: `Falta subir la rejilla de ${(faltan.length > 0 ? faltan : esperados).map(nombreMes).join(" / ")}`, coche, matricula: clave, mesRejilla: null, importe: null });
      continue;
    }
    filas.push({ estado: "no_pagado", motivo: `No aparece en la rejilla de ${esperados.map(nombreMes).join(" / ")}${coche.reclamado_manual ? " (ya reclamado a la empresa)" : ""}`, coche, matricula: clave, mesRejilla: null, importe: null });
  }

  for (const clave of pagosSinCoche) {
    if (pagosUsados.has(clave)) continue;
    const p = porMatricula.get(clave)![0];
    filas.push({
      estado: "dudoso",
      motivo: confirmadas.has(clave)
        ? `La rejilla de ${nombreMes(p.mes)} trae esta matrícula (lectura confirmada) y no hay ningún coche tuyo con ella: revisa si la empresa la ha puesto mal`
        : `Está en la rejilla de ${nombreMes(p.mes)} pero no hay ningún coche con esta matrícula (¿mal leída o sin expediente?)`,
      coche: null,
      matricula: clave,
      mesRejilla: p.mes,
      importe: p.importe,
      ...(confirmadas.has(clave) ? {} : { matriculaHoja: clave }),
    });
  }

  const orden: Record<EstadoCotejo, number> = { no_pagado: 0, dudoso: 1, sin_rejilla: 2, pagado: 3, no_se_cobra: 4 };
  const fecha = (f: FilaCotejo) => f.coche?.f_matriculacion ?? f.coche?.f_afectacion ?? f.mesRejilla ?? "";
  filas.sort((a, b) => orden[a.estado] - orden[b.estado] || fecha(b).localeCompare(fecha(a)));

  const cuenta = (e: EstadoCotejo) => filas.filter((f) => f.estado === e).length;
  return {
    filas,
    sinMatricula,
    mesesConRejilla,
    resumen: { pagados: cuenta("pagado"), dudosos: cuenta("dudoso"), noPagados: cuenta("no_pagado"), sinRejilla: cuenta("sin_rejilla"), noSeCobra: cuenta("no_se_cobra"), sinMatricula: sinMatricula.length },
  };
}

/** Mes al que parece corresponder una rejilla: el más repetido entre los meses de cobro de los coches que ya se conocen. */
export interface LecturaAjustada {
  matricula: string;
  confianza: number;
  /** Lo que leyó el OCR, si se ha cambiado por la matrícula de un coche tuyo muy parecida. */
  corregidaDe?: string;
}

/**
 * Las lecturas dudosas del OCR (P por D, 9 por 0…) se ajustan a la matrícula de un coche tuyo si es la única parecida (una letra
 * de diferencia) y esa matrícula no aparece ya leída tal cual en la hoja. Las lecturas seguras no se tocan.
 */
export function ajustarLecturas(lecturas: { matricula: string; confianza: number }[], conocidas: string[]): LecturaAjustada[] {
  const propias = [...new Set(conocidas.map((m) => normalizarMatricula(m)).filter(Boolean))];
  const yaLeidas = new Set(lecturas.map((l) => normalizarMatricula(l.matricula)));
  const usadas = new Set<string>();
  return lecturas.map((l) => {
    const leida = normalizarMatricula(l.matricula);
    if (l.confianza >= 90 || !leida || propias.includes(leida)) return { matricula: l.matricula, confianza: l.confianza };
    const candidatas = propias.filter((p) => !yaLeidas.has(p) && !usadas.has(p) && Math.abs(p.length - leida.length) <= 1 && distancia(p, leida) <= 1);
    if (candidatas.length !== 1) return { matricula: l.matricula, confianza: l.confianza };
    usadas.add(candidatas[0]);
    return { matricula: candidatas[0], confianza: 80, corregidaDe: l.matricula };
  });
}

export function sugerirMes(matriculas: string[], coches: CocheCotejo[]): string | null {
  const porMatricula = new Map(coches.map((c) => [normalizarMatricula(c.matricula), c]));
  const cuenta = new Map<string, number>();
  for (const m of matriculas) {
    const c = porMatricula.get(normalizarMatricula(m));
    const esperado = c ? mesesEsperados(c)[0] : undefined;
    if (esperado) cuenta.set(esperado, (cuenta.get(esperado) ?? 0) + 1);
  }
  let mejor: string | null = null;
  for (const [m, n] of cuenta) if (mejor === null || n > (cuenta.get(mejor) ?? 0)) mejor = m;
  return mejor;
}

/**
 * Mes al que se asigna una fila para verla por meses: el mes de la rejilla donde se pagó si era uno de los que le correspondían; si no,
 * el último mes en que debía cobrarse (donde se echa en falta). Una matrícula de la rejilla sin coche cuenta en el mes de esa rejilla.
 * Devuelve null si el coche no tiene fecha para saber en qué mes cobrarlo.
 */
export function mesDeFila(f: FilaCotejo): string | null {
  if (!f.coche) return f.mesRejilla;
  const esperados = mesesEsperados(f.coche);
  if (esperados.length === 0) return null;
  if (f.mesRejilla && esperados.includes(f.mesRejilla)) return f.mesRejilla;
  return esperados[esperados.length - 1];
}

export interface ResumenMes {
  total: number;
  pagados: number;
  dudosos: number;
  noPagados: number;
  sinRejilla: number;
  /** Marcados «no se cobra»: no entran en `total`. */
  noSeCobra: number;
}

const resumenVacio = (): ResumenMes => ({ total: 0, pagados: 0, dudosos: 0, noPagados: 0, sinRejilla: 0, noSeCobra: 0 });

/** Recuento de filas por estado, mes a mes (las filas sin mes no cuentan). */
export function resumenPorMes(filas: FilaCotejo[]): Map<string, ResumenMes> {
  const m = new Map<string, ResumenMes>();
  for (const f of filas) {
    const mes = mesDeFila(f);
    if (!mes) continue;
    const r = m.get(mes) ?? resumenVacio();
    if (f.estado === "no_se_cobra") {
      r.noSeCobra++;
      m.set(mes, r);
      continue;
    }
    r.total++;
    if (f.estado === "pagado") r.pagados++;
    else if (f.estado === "dudoso") r.dudosos++;
    else if (f.estado === "no_pagado") r.noPagados++;
    else r.sinRejilla++;
    m.set(mes, r);
  }
  return m;
}

export const filasDelMes = (filas: FilaCotejo[], mes: string): FilaCotejo[] => filas.filter((f) => mesDeFila(f) === mes);
export const filasSinMes = (filas: FilaCotejo[]): FilaCotejo[] => filas.filter((f) => mesDeFila(f) === null);

/** Día (AAAA-MM-DD) en que cae un coche en el calendario: la matriculación en un nuevo y la afectación en un usado (si falta, otra fecha del coche). */
export function diaClave(c: CocheCotejo): string | null {
  const valida = (f: string | null) => (f && /^\d{4}-\d{2}-\d{2}/.test(f) ? f.slice(0, 10) : null);
  return c.usado ? (valida(c.f_afectacion) ?? valida(c.f_expediente) ?? valida(c.f_entrega)) : (valida(c.f_matriculacion) ?? valida(c.f_entrega));
}

/** Filas agrupadas por día de un mes (para el calendario) y filas del mes sin coche, que no tienen día. */
export function filasPorDia(filas: FilaCotejo[], mes: string): { dias: Map<string, FilaCotejo[]>; sinDia: FilaCotejo[] } {
  const dias = new Map<string, FilaCotejo[]>();
  const sinDia: FilaCotejo[] = [];
  for (const f of filas) {
    const dia = f.coche ? diaClave(f.coche) : null;
    if (!dia) {
      if (mesDeFila(f) === mes) sinDia.push(f);
      continue;
    }
    if (dia.slice(0, 7) !== mes) continue;
    dias.set(dia, [...(dias.get(dia) ?? []), f]);
  }
  return { dias, sinDia };
}

/* ------------------------------------------------------------------ */
/* Pendientes de cobro                                                 */
/* ------------------------------------------------------------------ */

/** Por qué un coche sigue sin cobrar: reclamar (hay hoja de su mes y no sale), esperando la hoja, sin matrícula, sin fecha o lectura a revisar. */
export type SituacionPendiente = "reclamar" | "esperando_hoja" | "sin_matricula" | "sin_fecha" | "revisar";

export interface Pendiente {
  coche: CocheCotejo;
  matricula: string;
  /** Rejilla donde debía venir (la del mes siguiente a su facturación); null si no tiene fecha. */
  mesEsperado: string | null;
  situacion: SituacionPendiente;
  motivo: string;
  /** Ya se ha reclamado a la empresa (marca manual). */
  reclamado: boolean;
}

export interface ResumenCobros {
  /** Todo lo que sigue sin cobrar: este es el número que importa. */
  pendientes: Pendiente[];
  /** Coches marcados «no se cobra». */
  noSeCobra: CocheCotejo[];
  /** Coches cobrados: su matrícula está en una rejilla guardada (o marcados a mano). */
  cobrados: number;
  /** Coches sin facturar todavía (sin matrícula ni fecha): aún no les toca. */
  aunSinFacturar: CocheCotejo[];
}

/**
 * Lo esencial del cotejo: de los coches que se cobran, cuáles ya están cobrados (su matrícula sale en alguna rejilla guardada, sea del mes que
 * sea) y cuáles no. `esAnulado` deja fuera los anulados; los deshabilitados tampoco cuentan.
 */
export function resumenCobros(coches: CocheCotejo[], pagos: PagoRejilla[], esAnulado: (estado: string) => boolean = () => false): ResumenCobros {
  const validos = coches.filter((c) => !c.deshabilitado && !esAnulado(c.estado));
  const r = cotejarPagos(validos, pagos);
  const pendientes: Pendiente[] = [];
  const noSeCobra: CocheCotejo[] = r.sinMatricula.filter((c) => c.no_se_cobra);
  const aunSinFacturar: CocheCotejo[] = [];
  let cobrados = 0;
  for (const f of r.filas) {
    if (!f.coche) continue;
    if (f.estado === "no_se_cobra") noSeCobra.push(f.coche);
    else if (f.estado === "pagado" || (f.estado === "dudoso" && !f.matriculaHoja)) cobrados++;
    else {
      const esperados = mesesEsperados(f.coche);
      const mesEsperado = esperados[esperados.length - 1] ?? null;
      const situacion: SituacionPendiente = f.estado === "dudoso" ? "revisar" : f.estado === "no_pagado" ? "reclamar" : mesEsperado ? "esperando_hoja" : "sin_fecha";
      pendientes.push({ coche: f.coche, matricula: f.matricula, mesEsperado, situacion, motivo: f.motivo, reclamado: !!f.coche.reclamado_manual });
    }
  }
  for (const c of r.sinMatricula) {
    if (c.no_se_cobra) continue;
    const esperados = mesesEsperados(c);
    if (c.cobrado_manual) cobrados++;
    else if (esperados.length === 0 && !c.f_facturacion) aunSinFacturar.push(c);
    else pendientes.push({ coche: c, matricula: "", mesEsperado: esperados[esperados.length - 1] ?? null, situacion: "sin_matricula", motivo: "Sin matrícula: no se puede buscar en la hoja. Ponla en el expediente o márcalo a mano", reclamado: !!c.reclamado_manual });
  }
  const ordenSituacion: Record<SituacionPendiente, number> = { reclamar: 0, revisar: 1, sin_matricula: 2, sin_fecha: 3, esperando_hoja: 4 };
  pendientes.sort((a, b) => ordenSituacion[a.situacion] - ordenSituacion[b.situacion] || (a.mesEsperado ?? "9999").localeCompare(b.mesEsperado ?? "9999"));
  return { pendientes, noSeCobra, cobrados, aunSinFacturar };
}
