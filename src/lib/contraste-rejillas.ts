import { esAnulado } from "@/lib/anulados";
import { mesesEsperados, distancia, type CocheCotejo } from "@/lib/cotejo-pagos";
import { nombreMes } from "@/lib/formato";
import { normalizarMatricula } from "@/lib/rejilla/analizar";

/**
 * Contraste de rejillas (Herramientas): ordena TODAS las matrículas leídas de las rejillas guardadas, agrupadas por rejilla, y a cada una le pone al
 * lado el expediente con el que se contrasta. Así se ve en qué mes se ha pagado cada coche, qué matrículas están repetidas en varias rejillas y qué
 * expedientes no han aparecido en ninguna (los que quedan por cobrar). Es una función pura.
 */

export interface RejillaContraste {
  id: number;
  mes: string;
  idUsuario: number;
  vendedor: string;
  nombreArchivo: string | null;
  filas: { matricula: string; importe: number | null; cliente: string | null; concepto: string | null; confirmada: boolean }[];
}

export interface CocheContraste extends CocheCotejo {
  idUsuario: number;
  vendedor: string;
}

export type EstadoFilaRejilla =
  /** La matrícula tiene expediente y se pagó en el mes que le tocaba (o no se sabe cuál le tocaba). */
  | "coincide"
  /** Tiene expediente, pero la rejilla es de un mes distinto al que le correspondía. */
  | "otro_mes"
  /** Ningún expediente tiene esta matrícula. */
  | "sin_expediente"
  /** El único expediente con esa matrícula es de otro vendedor. */
  | "otro_vendedor"
  /** El expediente está anulado en el listado de la intranet (no es una venta), pero sale en una rejilla. */
  | "anulado";

export interface ExpedienteContrastado {
  idExpediente: number | null;
  cliente: string;
  vendedor: string;
  tipoPago: string;
  marca: string;
  modelo: string;
  usado: boolean;
  estado: string;
  /** Anulado en el listado de la intranet del fabricante: no es una venta y los listados lo ocultan salvo que se pida. */
  anulado: boolean;
  fMatriculacion: string | null;
  fAfectacion: string | null;
  /** Meses en que le tocaba cobrarse. */
  mesesEsperados: string[];
}

export interface FilaContraste {
  /** Clave única de la fila (para la tabla). */
  clave: string;
  idRejilla: number;
  mes: string;
  vendedorRejilla: string;
  archivo: string | null;
  /** Primera fila de su rejilla (para marcar el cambio de grupo). */
  primeraDelGrupo: boolean;
  /** Número de orden de la rejilla en la lista (para alternar el fondo). */
  grupo: number;
  matricula: string;
  importe: number | null;
  cliente: string | null;
  concepto: string | null;
  lecturaConfirmada: boolean;
  estado: EstadoFilaRejilla;
  motivo: string;
  expediente: ExpedienteContrastado | null;
  /** Otros expedientes con la misma matrícula (además del mostrado). */
  expedientesExtra: number;
  /** Otras veces que sale esta matrícula en las rejillas, con su mes y vendedor. */
  repetidaEn: { idRejilla: number; mes: string; vendedor: string; mismaRejilla: boolean }[];
  /** Matrícula parecida de un expediente sin pagar, si esta no tiene expediente (posible error de lectura). */
  sugerida: string | null;
}

export type EstadoSinPagar = "no_pagado" | "sin_rejilla" | "sin_fecha";

export interface FilaSinPagar {
  clave: string;
  estado: EstadoSinPagar;
  motivo: string;
  matricula: string;
  expediente: ExpedienteContrastado;
  /** Rejilla con una matrícula parecida (posible error de lectura o de tecleo), si la hay. */
  parecidaEn: { matricula: string; mes: string } | null;
}

export interface ResultadoContraste {
  filas: FilaContraste[];
  sinPagar: FilaSinPagar[];
  /** Coches sin matrícula (no se pueden contrastar). */
  sinMatricula: number;
  resumen: {
    rejillas: number;
    matriculas: number;
    coinciden: number;
    otroMes: number;
    sinExpediente: number;
    otroVendedor: number;
    anulados: number;
    repetidas: number;
    sinPagar: number;
    sinRejilla: number;
  };
}

const mes7 = (f: string | null) => (f && /^\d{4}-\d{2}/.test(f) ? f.slice(0, 7) : null);

const aExpediente = (c: CocheContraste): ExpedienteContrastado => ({
  idExpediente: c.id_expediente,
  cliente: c.cliente,
  vendedor: c.vendedor,
  tipoPago: c.tipo_pago,
  marca: c.marca,
  modelo: c.modelo,
  usado: c.usado,
  estado: c.estado,
  anulado: esAnulado(c.estado),
  fMatriculacion: c.f_matriculacion,
  fAfectacion: c.f_afectacion,
  mesesEsperados: mesesEsperados(c),
});

export function contrastarRejillas(rejillas: RejillaContraste[], coches: CocheContraste[]): ResultadoContraste {
  // Expedientes por matrícula (puede haber más de uno con la misma)
  const porMatricula = new Map<string, CocheContraste[]>();
  let sinMatricula = 0;
  for (const c of coches) {
    const k = normalizarMatricula(c.matricula);
    if (!k) {
      sinMatricula++;
      continue;
    }
    const l = porMatricula.get(k);
    if (l) l.push(c);
    else porMatricula.set(k, [c]);
  }

  // Rejillas de la más reciente a la más antigua; dentro del mismo mes, por vendedor
  const ordenadas = [...rejillas].sort((a, b) => b.mes.localeCompare(a.mes) || a.vendedor.localeCompare(b.vendedor, "es") || a.id - b.id);

  // Dónde sale cada matrícula (para marcar las repetidas)
  const apariciones = new Map<string, { idRejilla: number; mes: string; vendedor: string }[]>();
  for (const r of ordenadas) {
    for (const f of r.filas) {
      const k = normalizarMatricula(f.matricula);
      if (!k) continue;
      const l = apariciones.get(k);
      const a = { idRejilla: r.id, mes: r.mes, vendedor: r.vendedor };
      if (l) l.push(a);
      else apariciones.set(k, [a]);
    }
  }

  // Meses con rejilla de cada vendedor (para saber si lo que falta es que no se ha subido la rejilla o que no figura)
  const mesesDe = new Map<number, Set<string>>();
  for (const r of rejillas) {
    const s = mesesDe.get(r.idUsuario) ?? new Set<string>();
    s.add(r.mes);
    mesesDe.set(r.idUsuario, s);
  }

  const cochesSinPago = [...porMatricula.keys()].filter((k) => !apariciones.has(k));

  const filas: FilaContraste[] = [];
  ordenadas.forEach((r, grupo) => {
    // Una línea por matrícula en cada rejilla (si la hoja la trae repetida dentro de sí misma, se avisa)
    const unicas = new Map<string, { f: RejillaContraste["filas"][number]; veces: number }>();
    for (const f of r.filas) {
      const k = normalizarMatricula(f.matricula);
      if (!k) continue;
      const u = unicas.get(k);
      if (u) u.veces++;
      else unicas.set(k, { f, veces: 1 });
    }
    let primera = true;
    for (const [k, { f, veces }] of [...unicas].sort((a, b) => a[0].localeCompare(b[0]))) {
      const ap = apariciones.get(k) ?? [];
      const repetidaEn = ap.filter((a) => a.idRejilla !== r.id).map((a) => ({ ...a, mismaRejilla: false }));
      if (veces > 1) repetidaEn.push({ idRejilla: r.id, mes: r.mes, vendedor: r.vendedor, mismaRejilla: true });

      // Entre varios expedientes con la misma matrícula, primero los que no están anulados
      const candidatos = [...(porMatricula.get(k) ?? [])].sort((a, b) => Number(esAnulado(a.estado)) - Number(esAnulado(b.estado)));
      const propios = candidatos.filter((c) => c.idUsuario === r.idUsuario);
      const elegido = propios[0] ?? candidatos[0] ?? null;
      let estado: EstadoFilaRejilla;
      let motivo: string;
      let sugerida: string | null = null;
      if (!elegido) {
        estado = "sin_expediente";
        motivo = "Ningún expediente tiene esta matrícula (¿mal leída o sin expediente?)";
        const casi = cochesSinPago.filter((c) => Math.abs(c.length - k.length) <= 1 && distancia(c, k) <= 2);
        if (casi.length === 1) {
          sugerida = casi[0];
          motivo += `. Se parece a ${casi[0]}, que no figura en ninguna rejilla`;
        }
      } else if (esAnulado(elegido.estado)) {
        estado = "anulado";
        motivo = `El expediente está anulado en la intranet, pero la rejilla de ${nombreMes(r.mes)} trae esta matrícula: revisa si te la han pagado por error`;
      } else if (propios.length === 0) {
        estado = "otro_vendedor";
        motivo = `El expediente con esta matrícula es de ${elegido.vendedor}, no del vendedor de la rejilla`;
      } else {
        const esperados = mesesEsperados(elegido);
        if (esperados.length > 0 && !esperados.includes(r.mes)) {
          estado = "otro_mes";
          motivo = `Pagado en ${nombreMes(r.mes)} y le correspondía ${esperados.map(nombreMes).join(" / ")}`;
        } else {
          estado = "coincide";
          motivo = `Pagado en ${nombreMes(r.mes)}`;
        }
      }
      filas.push({
        clave: `${r.id}-${k}`,
        idRejilla: r.id,
        mes: r.mes,
        vendedorRejilla: r.vendedor,
        archivo: r.nombreArchivo,
        primeraDelGrupo: primera,
        grupo,
        matricula: k,
        importe: f.importe,
        cliente: f.cliente,
        concepto: f.concepto,
        lecturaConfirmada: f.confirmada,
        estado,
        motivo,
        expediente: elegido ? aExpediente(elegido) : null,
        expedientesExtra: Math.max(0, candidatos.length - 1),
        repetidaEn,
        sugerida,
      });
      primera = false;
    }
  });

  // Expedientes que no han salido en ninguna rejilla
  const sinPagar: FilaSinPagar[] = [];
  const matriculasRejillas = [...apariciones.keys()];
  for (const [k, lista] of porMatricula) {
    if (apariciones.has(k)) continue;
    for (const c of lista) {
      const esperados = mesesEsperados(c);
      const meses = mesesDe.get(c.idUsuario) ?? new Set<string>();
      let estado: EstadoSinPagar;
      let motivo: string;
      if (esperados.length === 0) {
        estado = "sin_fecha";
        motivo = "No tiene fecha para saber en qué rejilla debía cobrarse";
      } else if (esperados.some((m) => !meses.has(m))) {
        estado = "sin_rejilla";
        motivo = `Falta subir la rejilla de ${esperados.filter((m) => !meses.has(m)).map(nombreMes).join(" / ")}`;
      } else {
        estado = "no_pagado";
        motivo = `No aparece en la rejilla de ${esperados.map(nombreMes).join(" / ")}`;
      }
      const casi = matriculasRejillas.filter((m) => Math.abs(m.length - k.length) <= 1 && distancia(m, k) <= 2 && !porMatricula.has(m));
      const parecida = casi.length === 1 ? { matricula: casi[0], mes: apariciones.get(casi[0])![0].mes } : null;
      sinPagar.push({ clave: `${c.id_expediente ?? "x"}-${k}`, estado, motivo, matricula: k, expediente: aExpediente(c), parecidaEn: parecida });
    }
  }
  const prioridad: Record<EstadoSinPagar, number> = { no_pagado: 0, sin_fecha: 1, sin_rejilla: 2 };
  sinPagar.sort((a, b) => prioridad[a.estado] - prioridad[b.estado] || (mes7(a.expediente.fMatriculacion ?? a.expediente.fAfectacion) ?? "").localeCompare(mes7(b.expediente.fMatriculacion ?? b.expediente.fAfectacion) ?? "") || a.matricula.localeCompare(b.matricula));

  const cuenta = (e: EstadoFilaRejilla) => filas.filter((f) => f.estado === e).length;
  return {
    filas,
    sinPagar,
    sinMatricula,
    resumen: {
      rejillas: rejillas.length,
      matriculas: filas.length,
      coinciden: cuenta("coincide"),
      otroMes: cuenta("otro_mes"),
      sinExpediente: cuenta("sin_expediente"),
      otroVendedor: cuenta("otro_vendedor"),
      anulados: cuenta("anulado") + sinPagar.filter((s) => s.expediente.anulado).length,
      repetidas: filas.filter((f) => f.repetidaEn.length > 0).length,
      sinPagar: sinPagar.filter((s) => s.estado === "no_pagado" && !s.expediente.anulado).length,
      sinRejilla: sinPagar.filter((s) => s.estado !== "no_pagado" && !s.expediente.anulado).length,
    },
  };
}
