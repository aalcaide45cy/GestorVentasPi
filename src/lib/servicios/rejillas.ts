import { and, desc, eq, gte, inArray, isNull, ne, sql } from "drizzle-orm";
import { z } from "zod";
import type { Ejecutor } from "@/db";
import { clientes, commissionLiquidations, estadoVehiculo, expedientes, rejillaFilas, rejillas, tipoDeVenta, usuarios, validacionesComision } from "@/db/schema";
import { HttpError } from "@/lib/auth/sesion";
import { sumarMeses } from "@/lib/formato";
import { normalizarMatricula } from "@/lib/rejilla/analizar";
import { cotejo } from "./comisiones-gestion";

/**
 * Validación de comisiones: el vendedor sube la «rejilla» que entrega la empresa y la app la cruza, por matrícula,
 * con la liquidación calculada del mismo mes. Detecta coches sin comisionar, importes distintos y filas que no
 * están en la app, y guarda el estado de cada coche (pagado, pendiente o reclamado).
 */

const mesRegex = /^\d{4}-(0[1-9]|1[0-2])$/;

export const esquemaFilaRejilla = z.object({
  matricula: z.string().trim().min(1, "Falta la matrícula").max(50),
  cliente: z.string().trim().max(255).nullish(),
  financiacion: z.string().trim().max(255).nullish(),
  concepto: z.string().trim().max(500).nullish(),
  importe: z.number().int().min(-100_000_000).max(100_000_000).nullable(),
  textoOriginal: z.string().max(1000).nullish(),
  confianza: z.number().int().min(0).max(100).nullish(),
});

export const esquemaGuardarRejilla = z.object({
  mes: z.string().regex(mesRegex, "Mes no válido (AAAA-MM)"),
  origen: z.enum(["excel", "csv", "pdf", "imagen", "manual"]),
  nombreArchivo: z.string().trim().max(255).nullish(),
  totalHoja: z.number().int().nullish(),
  notas: z.string().trim().max(2000).nullish(),
  filas: z.array(esquemaFilaRejilla).min(1, "La rejilla no tiene ninguna fila").max(5000),
});
export type EntradaGuardarRejilla = z.infer<typeof esquemaGuardarRejilla>;

export const ESTADOS_VALIDACION = ["pagado", "pendiente", "reclamado"] as const;
export type EstadoValidacion = (typeof ESTADOS_VALIDACION)[number];

export const esquemaValidar = z.object({
  mes: z.string().regex(mesRegex, "Mes no válido (AAAA-MM)"),
  idExpediente: z.number().int().positive(),
  estado: z.enum(ESTADOS_VALIDACION),
  nota: z.string().trim().max(1000).nullish(),
});

export type EstadoComprobacion = "ok" | "distinto" | "falta_en_hoja" | "sin_importe" | "no_en_app" | "otro_mes";

export interface FilaComprobacion {
  clave: string;
  estado: EstadoComprobacion;
  idExpediente: number | null;
  matricula: string;
  cliente: string | null;
  financiacion: string | null;
  /** Lo que calcula la app (céntimos); 0 si el coche no está en la liquidación. */
  importeApp: number;
  /** Lo que dice la hoja (céntimos); null si no aparece o no trae importe. */
  importeHoja: number | null;
  diferencia: number;
  conceptosHoja: string[];
  nota: string | null;
  /** Estado que le da el vendedor (por defecto: pagado si cuadra, pendiente en el resto). */
  validacion: EstadoValidacion;
  validacionManual: boolean;
  notaValidacion: string | null;
  /** Meses cuyas otras hojas guardadas traen también esta matrícula (posible coche duplicado de un mes a otro). */
  duplicadaEn: string[];
  /** La matrícula sale más de una vez con el mismo concepto e importe dentro de esta hoja. */
  repetidaEnHoja: boolean;
}

export interface ResultadoRejilla {
  mes: string;
  idUsuario: number;
  hayLiquidacion: boolean;
  rejilla: { id: number; origen: string; nombreArchivo: string | null; creadaEn: string; totalHoja: number | null; filas: number } | null;
  filas: FilaComprobacion[];
  /** Usados (VO) del mes sin matrícula: no bloquean nada, pero sin ella no se pueden cruzar con la hoja de la empresa. */
  sinMatricula: { idExpediente: number; cliente: string | null }[];
  resumen: { duplicados: number; cuadran: number; distintos: number; faltan: number; sobran: number; sinImporte: number; otroMes: number; importeApp: number; importeHoja: number; diferencia: number; pendientes: number };
}

const PROBLEMAS: EstadoComprobacion[] = ["falta_en_hoja", "distinto", "sin_importe", "no_en_app", "otro_mes"];

/** Guarda (sustituyendo la anterior) la rejilla de un vendedor y mes. */
export async function guardarRejilla(ej: Ejecutor, idUsuario: number, creadaPor: number, entrada: EntradaGuardarRejilla): Promise<number> {
  return ej.transaction(async (tx) => {
    const [u] = await tx.select({ id: usuarios.idUsuario }).from(usuarios).where(eq(usuarios.idUsuario, idUsuario));
    if (!u) throw new HttpError(404, "Usuario no encontrado");
    await tx.delete(rejillas).where(and(eq(rejillas.idUsuario, idUsuario), eq(rejillas.mes, entrada.mes)));
    const [r] = await tx
      .insert(rejillas)
      .values({ idUsuario, mes: entrada.mes, origen: entrada.origen, nombreArchivo: entrada.nombreArchivo ?? null, totalHoja: entrada.totalHoja ?? null, notas: entrada.notas ?? null, creadaPor })
      .returning({ id: rejillas.id });
    for (let i = 0; i < entrada.filas.length; i += 500) {
      await tx.insert(rejillaFilas).values(
        entrada.filas.slice(i, i + 500).map((f) => ({
          idRejilla: r.id,
          matricula: f.matricula,
          cliente: f.cliente ?? null,
          financiacion: f.financiacion ?? null,
          concepto: f.concepto ?? null,
          importe: f.importe,
          textoOriginal: f.textoOriginal ?? null,
          confianza: f.confianza ?? null,
        })),
      );
    }
    return r.id;
  });
}

export async function eliminarRejilla(ej: Ejecutor, idUsuario: number, mes: string): Promise<void> {
  const filas = await ej.delete(rejillas).where(and(eq(rejillas.idUsuario, idUsuario), eq(rejillas.mes, mes))).returning({ id: rejillas.id });
  if (filas.length === 0) throw new HttpError(404, "No hay rejilla de ese mes");
}

/** Fija el estado de un coche en un mes (pagado, pendiente o reclamado) con una nota opcional. */
export async function validarCoche(ej: Ejecutor, idUsuario: number, entrada: z.infer<typeof esquemaValidar>): Promise<void> {
  const [e] = await ej.select({ idUsuario: expedientes.idUsuario }).from(expedientes).where(and(eq(expedientes.idExpediente, entrada.idExpediente), isNull(expedientes.eliminadoEn)));
  if (!e) throw new HttpError(404, "Expediente no encontrado");
  if (e.idUsuario !== idUsuario) throw new HttpError(403, "El expediente no pertenece a ese vendedor");
  await ej
    .insert(validacionesComision)
    .values({ idUsuario, mes: entrada.mes, idExpediente: entrada.idExpediente, estado: entrada.estado, nota: entrada.nota ?? null })
    .onConflictDoUpdate({ target: [validacionesComision.idUsuario, validacionesComision.mes, validacionesComision.idExpediente], set: { estado: entrada.estado, nota: entrada.nota ?? null, actualizadoEn: new Date() } });
}

interface GrupoHoja {
  matricula: string;
  cliente: string | null;
  financiacion: string | null;
  importe: number | null;
  conceptos: string[];
}

const SQL_MATRICULA_NORMALIZADA = sql<string>`upper(regexp_replace(${expedientes.matricula}, '[^A-Za-z0-9]', '', 'g'))`;

/** Cruza la liquidación de un vendedor y mes con su rejilla. */
export async function comprobarRejilla(ej: Ejecutor, idUsuario: number, mes: string): Promise<ResultadoRejilla> {
  const [cab] = await ej.select().from(rejillas).where(and(eq(rejillas.idUsuario, idUsuario), eq(rejillas.mes, mes)));
  const hojaFilas = cab ? await ej.select().from(rejillaFilas).where(eq(rejillaFilas.idRejilla, cab.id)).orderBy(rejillaFilas.id) : [];
  const [liq] = await ej.select({ id: commissionLiquidations.idLiquidation }).from(commissionLiquidations).where(and(eq(commissionLiquidations.idUsuario, idUsuario), eq(commissionLiquidations.mes, mes)));
  const coteja = await cotejo(ej, idUsuario, mes);

  // Datos de los expedientes de la liquidación
  const idsApp = coteja.filas.map((f) => f.idExpediente);
  const detalles = idsApp.length
    ? await ej
        .select({ id: expedientes.idExpediente, matricula: expedientes.matricula, cliente: clientes.nombre, tipo: tipoDeVenta.nombreTipoVenta })
        .from(expedientes)
        .leftJoin(clientes, eq(clientes.id, expedientes.idCliente))
        .leftJoin(tipoDeVenta, eq(tipoDeVenta.idTipoDeVenta, expedientes.idTipoDeVenta))
        .where(inArray(expedientes.idExpediente, idsApp))
    : [];
  const detalle = new Map(detalles.map((d) => [d.id, d]));

  // Rejilla agrupada por matrícula normalizada (un coche puede tener varias filas: coche, financiación…)
  const grupos = new Map<string, GrupoHoja>();
  for (const f of hojaFilas) {
    const clave = normalizarMatricula(f.matricula);
    const g = grupos.get(clave) ?? { matricula: f.matricula, cliente: null, financiacion: null, importe: null, conceptos: [] };
    g.cliente ??= f.cliente;
    g.financiacion ??= f.financiacion;
    if (f.importe !== null) g.importe = (g.importe ?? 0) + f.importe;
    if (f.concepto) g.conceptos.push(f.concepto);
    grupos.set(clave, g);
  }

  const validaciones = await ej.select().from(validacionesComision).where(and(eq(validacionesComision.idUsuario, idUsuario), eq(validacionesComision.mes, mes)));
  const manual = new Map(validaciones.map((v) => [v.idExpediente, v]));

  const filas: FilaComprobacion[] = [];
  const usadas = new Set<string>();
  const construir = (base: Omit<FilaComprobacion, "validacion" | "validacionManual" | "notaValidacion" | "diferencia" | "duplicadaEn" | "repetidaEnHoja">): FilaComprobacion => {
    const v = base.idExpediente !== null ? manual.get(base.idExpediente) : undefined;
    return {
      ...base,
      diferencia: base.importeHoja === null ? -base.importeApp : base.importeHoja - base.importeApp,
      validacion: v ? (v.estado as EstadoValidacion) : base.estado === "ok" ? "pagado" : "pendiente",
      validacionManual: !!v,
      notaValidacion: v?.nota ?? null,
      duplicadaEn: [],
      repetidaEnHoja: false,
    };
  };

  for (const f of coteja.filas) {
    const d = detalle.get(f.idExpediente);
    const matricula = d?.matricula ?? "";
    const clave = normalizarMatricula(matricula);
    const g = clave ? grupos.get(clave) : undefined;
    if (g) usadas.add(clave);
    let estado: EstadoComprobacion;
    let nota: string | null = null;
    if (!clave) {
      estado = "falta_en_hoja";
      nota = "El expediente no tiene matrícula: no se puede cruzar con la hoja.";
    } else if (!g) estado = "falta_en_hoja";
    else if (g.importe === null) estado = "sin_importe";
    else estado = g.importe === f.total ? "ok" : "distinto";
    filas.push(
      construir({
        clave: clave || `exp-${f.idExpediente}`,
        estado,
        idExpediente: f.idExpediente,
        matricula: matricula || "(sin matrícula)",
        cliente: d?.cliente ?? g?.cliente ?? null,
        financiacion: g?.financiacion ?? d?.tipo ?? null,
        importeApp: f.total,
        importeHoja: g ? g.importe : null,
        conceptosHoja: g?.conceptos ?? [],
        nota,
      }),
    );
  }

  // Filas de la hoja que no están en la liquidación
  const huerfanas = [...grupos.keys()].filter((k) => !usadas.has(k));
  const enBd = huerfanas.length
    ? await ej
        .select({ id: expedientes.idExpediente, matricula: expedientes.matricula, idUsuario: expedientes.idUsuario, fechaMat: expedientes.fechaMatriculacion, clave: SQL_MATRICULA_NORMALIZADA })
        .from(expedientes)
        .where(and(isNull(expedientes.eliminadoEn), inArray(SQL_MATRICULA_NORMALIZADA, huerfanas)))
    : [];
  for (const clave of huerfanas) {
    const g = grupos.get(clave) as GrupoHoja;
    const propio = enBd.find((e) => e.clave === clave && e.idUsuario === idUsuario);
    const ajeno = enBd.find((e) => e.clave === clave && e.idUsuario !== idUsuario);
    let estado: EstadoComprobacion = "no_en_app";
    let nota: string | null = "No hay ningún expediente con esta matrícula.";
    if (propio) {
      estado = "otro_mes";
      nota = `El expediente existe (matriculado ${propio.fechaMat ?? "sin fecha"}) pero no genera comisión en ${mes}. Revisa la fecha de facturación (en un VN es la que cuenta) o la casilla «contabiliza en otro mes».`;
    } else if (ajeno) nota = "La matrícula pertenece a un expediente de otro vendedor.";
    filas.push(
      construir({
        clave,
        estado,
        idExpediente: propio?.id ?? null,
        matricula: g.matricula,
        cliente: g.cliente,
        financiacion: g.financiacion,
        importeApp: 0,
        importeHoja: g.importe,
        conceptosHoja: g.conceptos,
        nota,
      }),
    );
  }

  // Posibles duplicados: la misma matrícula en la hoja de otro mes, o repetida con lo mismo dentro de esta hoja
  const otrasHojas = await ej
    .select({ mes: rejillas.mes, matricula: rejillaFilas.matricula })
    .from(rejillaFilas)
    .innerJoin(rejillas, eq(rejillas.id, rejillaFilas.idRejilla))
    .where(and(eq(rejillas.idUsuario, idUsuario), ne(rejillas.mes, mes)));
  const mesesPorMatricula = new Map<string, Set<string>>();
  for (const o of otrasHojas) {
    const k = normalizarMatricula(o.matricula);
    if (k) mesesPorMatricula.set(k, (mesesPorMatricula.get(k) ?? new Set()).add(o.mes));
  }
  const veces = new Map<string, number>();
  for (const f of hojaFilas) {
    const k = `${normalizarMatricula(f.matricula)}|${(f.concepto ?? "").trim().toLowerCase()}|${f.importe ?? ""}`;
    veces.set(k, (veces.get(k) ?? 0) + 1);
  }
  for (const f of filas) {
    const k = normalizarMatricula(f.matricula);
    if (!k) continue;
    f.duplicadaEn = [...(mesesPorMatricula.get(k) ?? [])].sort();
    f.repetidaEnHoja = [...veces.entries()].some(([clave, n]) => n > 1 && clave.startsWith(`${k}|`));
  }

  // Usados del vendedor que cuentan en este mes y no tienen matrícula (aunque no hayan generado comisión)
  const usadosMes = await ej
    .select({ id: expedientes.idExpediente, matricula: expedientes.matricula, cliente: clientes.nombre })
    .from(expedientes)
    .innerJoin(estadoVehiculo, and(eq(estadoVehiculo.idEstadoVehiculo, expedientes.idEstadoVehiculo), eq(estadoVehiculo.clase, "VO")))
    .leftJoin(clientes, eq(clientes.id, expedientes.idCliente))
    .where(and(eq(expedientes.idUsuario, idUsuario), isNull(expedientes.eliminadoEn), sql`to_char(coalesce(${expedientes.fechaFacturacion}, ${expedientes.fechaMatriculacion}), 'YYYY-MM') = ${mes}`));
  const sinMatricula = usadosMes.filter((u) => !normalizarMatricula(u.matricula ?? "")).map((u) => ({ idExpediente: u.id, cliente: u.cliente }));

  filas.sort((a, b) => Number(!PROBLEMAS.includes(a.estado)) - Number(!PROBLEMAS.includes(b.estado)) || a.matricula.localeCompare(b.matricula));

  const cuenta = (e: EstadoComprobacion) => filas.filter((f) => f.estado === e).length;
  return {
    mes,
    idUsuario,
    hayLiquidacion: !!liq,
    rejilla: cab ? { id: cab.id, origen: cab.origen, nombreArchivo: cab.nombreArchivo, creadaEn: cab.creadaEn.toISOString(), totalHoja: cab.totalHoja, filas: hojaFilas.length } : null,
    filas,
    sinMatricula,
    resumen: {
      duplicados: filas.filter((f) => f.duplicadaEn.length > 0 || f.repetidaEnHoja).length,
      cuadran: cuenta("ok"),
      distintos: cuenta("distinto"),
      faltan: cuenta("falta_en_hoja"),
      sobran: cuenta("no_en_app"),
      sinImporte: cuenta("sin_importe"),
      otroMes: cuenta("otro_mes"),
      importeApp: filas.reduce((s, f) => s + f.importeApp, 0),
      importeHoja: filas.reduce((s, f) => s + (f.importeHoja ?? 0), 0),
      diferencia: filas.reduce((s, f) => s + (f.importeHoja ?? 0), 0) - filas.reduce((s, f) => s + f.importeApp, 0),
      pendientes: filas.filter((f) => f.estado !== "ok" && f.validacion === "pendiente").length,
    },
  };
}

/* ------------------------------------------------------------------ */
/* Avisos                                                               */
/* ------------------------------------------------------------------ */

export interface AvisoRejilla {
  tipo: "sin_rejilla" | "incidencias";
  idUsuario: number;
  vendedor: string | null;
  mes: string;
  /** Para «incidencias»: coches sin resolver; para «sin_rejilla»: coches de la liquidación. */
  cantidad: number;
  detalle: string;
}

export { sumarMeses };

/**
 * Avisos de validación pendiente (últimos 6 meses de liquidación). Una liquidación del mes M se paga en la nómina
 * de M+1 y la hoja llega a lo largo de M+2: a partir de entonces, si no hay rejilla, se avisa.
 * `idUsuario` = null → todos los vendedores (administrador).
 */
export async function avisosRejilla(ej: Ejecutor, idUsuario: number | null, hoyMes: string): Promise<AvisoRejilla[]> {
  const desde = sumarMeses(hoyMes, -7);
  const hasta = sumarMeses(hoyMes, -2);
  const liquidaciones = await ej
    .select({ idUsuario: commissionLiquidations.idUsuario, mes: commissionLiquidations.mes, neto: commissionLiquidations.neto, vendedor: usuarios.nombre })
    .from(commissionLiquidations)
    .leftJoin(usuarios, eq(usuarios.idUsuario, commissionLiquidations.idUsuario))
    .where(and(gte(commissionLiquidations.mes, desde), idUsuario !== null ? eq(commissionLiquidations.idUsuario, idUsuario) : undefined))
    .orderBy(desc(commissionLiquidations.mes));
  const hojas = await ej
    .select({ idUsuario: rejillas.idUsuario, mes: rejillas.mes })
    .from(rejillas)
    .where(and(gte(rejillas.mes, desde), idUsuario !== null ? eq(rejillas.idUsuario, idUsuario) : undefined));
  const conHoja = new Set(hojas.map((h) => `${h.idUsuario}|${h.mes}`));

  const avisos: AvisoRejilla[] = [];
  for (const l of liquidaciones) {
    if (l.neto <= 0) continue;
    if (conHoja.has(`${l.idUsuario}|${l.mes}`)) {
      const r = await comprobarRejilla(ej, l.idUsuario, l.mes);
      if (r.resumen.pendientes > 0) {
        avisos.push({ tipo: "incidencias", idUsuario: l.idUsuario, vendedor: l.vendedor, mes: l.mes, cantidad: r.resumen.pendientes, detalle: `${r.resumen.pendientes} coche(s) sin resolver en la rejilla de ${l.mes}` });
      }
    } else if (l.mes <= hasta) {
      avisos.push({ tipo: "sin_rejilla", idUsuario: l.idUsuario, vendedor: l.vendedor, mes: l.mes, cantidad: 0, detalle: `Falta validar la rejilla de ${l.mes} (ya cobrada en la nómina de ${sumarMeses(l.mes, 1)})` });
    }
  }
  return avisos;
}
