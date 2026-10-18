import { and, count, desc, eq } from "drizzle-orm";
import { z } from "zod";
import type { Ejecutor } from "@/db";
import { rejillaFilas, rejillas, usuarios } from "@/db/schema";
import { HttpError } from "@/lib/auth/sesion";
import { describirExpedientes } from "./escenario";
import { calcularVendedorMes } from "./liquidaciones";

export interface RejillaGuardada {
  id: number;
  idUsuario: number;
  vendedor: string;
  mes: string;
  origen: string;
  nombreArchivo: string | null;
  filas: number;
  /** Total que traía la hoja (céntimos), si lo traía. */
  totalHoja: number | null;
  notas: string | null;
  creadaEn: string;
}

/** Rejillas guardadas (las del vendedor, o todas si `idUsuario` es null), de la más reciente a la más antigua por mes. */
export async function listarRejillas(ej: Ejecutor, idUsuario: number | null): Promise<RejillaGuardada[]> {
  const filas = await ej
    .select({
      id: rejillas.id,
      idUsuario: rejillas.idUsuario,
      vendedor: usuarios.nombre,
      mes: rejillas.mes,
      origen: rejillas.origen,
      nombreArchivo: rejillas.nombreArchivo,
      totalHoja: rejillas.totalHoja,
      notas: rejillas.notas,
      creadaEn: rejillas.creadaEn,
      n: count(rejillaFilas.id),
    })
    .from(rejillas)
    .leftJoin(rejillaFilas, eq(rejillaFilas.idRejilla, rejillas.id))
    .leftJoin(usuarios, eq(usuarios.idUsuario, rejillas.idUsuario))
    .where(idUsuario === null ? undefined : eq(rejillas.idUsuario, idUsuario))
    .groupBy(rejillas.id, usuarios.nombre)
    .orderBy(desc(rejillas.mes), desc(rejillas.creadaEn));
  return filas.map((f) => ({ id: f.id, idUsuario: f.idUsuario, vendedor: f.vendedor ?? `Usuario ${f.idUsuario}`, mes: f.mes, origen: f.origen, nombreArchivo: f.nombreArchivo, filas: Number(f.n), totalHoja: f.totalHoja, notas: f.notas, creadaEn: f.creadaEn.toISOString() }));
}

export interface FilaRejillaGuardada {
  id: number;
  matricula: string;
  cliente: string | null;
  financiacion: string | null;
  concepto: string | null;
  importe: number | null;
  textoOriginal: string | null;
  confianza: number | null;
}

export async function detalleRejilla(ej: Ejecutor, id: number): Promise<{ rejilla: RejillaGuardada; filas: FilaRejillaGuardada[] }> {
  const [cab] = await ej.select({ idUsuario: rejillas.idUsuario }).from(rejillas).where(eq(rejillas.id, id));
  if (!cab) throw new HttpError(404, "Rejilla no encontrada");
  const [rejilla] = (await listarRejillas(ej, cab.idUsuario)).filter((r) => r.id === id);
  const filas = await ej.select().from(rejillaFilas).where(eq(rejillaFilas.idRejilla, id)).orderBy(rejillaFilas.id);
  return { rejilla, filas: filas.map((f) => ({ id: f.id, matricula: f.matricula, cliente: f.cliente, financiacion: f.financiacion, concepto: f.concepto, importe: f.importe, textoOriginal: f.textoOriginal, confianza: f.confianza })) };
}

export const esquemaCambiarMes = z.object({ id: z.number().int().positive(), mes: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Mes no válido (AAAA-MM)"), notas: z.string().max(2000).nullish() });

/** Cambia el mes al que pertenece una rejilla guardada (por si se le puso mal). Un vendedor solo puede tener una por mes. */
export async function cambiarMesRejilla(ej: Ejecutor, entrada: z.infer<typeof esquemaCambiarMes>): Promise<void> {
  const [r] = await ej.select().from(rejillas).where(eq(rejillas.id, entrada.id));
  if (!r) throw new HttpError(404, "Rejilla no encontrada");
  if (entrada.mes !== r.mes) {
    const [otra] = await ej.select({ id: rejillas.id }).from(rejillas).where(and(eq(rejillas.idUsuario, r.idUsuario), eq(rejillas.mes, entrada.mes)));
    if (otra) throw new HttpError(409, `Ese vendedor ya tiene una rejilla guardada en ${entrada.mes}. Bórrala antes o elige otro mes.`);
  }
  await ej.update(rejillas).set({ mes: entrada.mes, ...(entrada.notas !== undefined ? { notas: entrada.notas ?? null } : {}) }).where(eq(rejillas.id, entrada.id));
}

export interface LineaResumen {
  idExpediente: number;
  matricula: string | null;
  cliente: string;
  vehiculo: string;
}

export interface ResumenLiquidacionMes {
  mes: string;
  hayPlan: boolean;
  /** Tramo del mes (0 = X, positivo = X+n, negativo = X−n). */
  tramo: number;
  objetivoX: number;
  puntosMes: number;
  coches: { total: number; nuevos: number; usados: number };
  creditos: { numero: number; importe: number };
  preference: { numero: number; importe: number };
  /** Reglas Preference / BOX3 (aparte del incentivo de financiación). */
  box3: { numero: number; importe: number };
  /** Bonus, reglas y conceptos especiales, con lo que los origina. */
  bonus: (LineaResumen & { concepto: string; importe: number; puntos: number })[];
  /** Comisión de cada coche, sin financiación ni bonus. */
  porCoche: (LineaResumen & { clase: "VN" | "VO"; cuenta: boolean; importeCoche: number; puntos: number })[];
  totales: { coches: number; bruto: number; penalizacion: number; neto: number };
}

/** Lo que dice TU liquidación de un mes, con las cifras que se cotejan con la rejilla de la empresa. */
export async function resumenLiquidacionMes(ej: Ejecutor, idUsuario: number, mes: string): Promise<ResumenLiquidacionMes> {
  const r = await calcularVendedorMes(ej, idUsuario, mes);
  const vacio: ResumenLiquidacionMes = { mes, hayPlan: false, tramo: 0, objetivoX: 0, puntosMes: 0, coches: { total: 0, nuevos: 0, usados: 0 }, creditos: { numero: 0, importe: 0 }, preference: { numero: 0, importe: 0 }, box3: { numero: 0, importe: 0 }, bonus: [], porCoche: [], totales: { coches: 0, bruto: 0, penalizacion: 0, neto: 0 } };
  if (!r || r.idPlan === null) return vacio;
  const info = await describirExpedientes(ej, r.lineas.map((l) => l.idExpediente));
  const de = (id: number): LineaResumen => ({ idExpediente: id, matricula: info[String(id)]?.matricula ?? null, cliente: info[String(id)]?.cliente ?? "Sin cliente", vehiculo: info[String(id)]?.vehiculo ?? "sin modelo" });
  const res: ResumenLiquidacionMes = { ...vacio, hayPlan: true, tramo: r.tramo, objetivoX: r.objetivoX, puntosMes: r.puntosMes, totales: { coches: 0, bruto: r.bruto, penalizacion: r.penalizacion, neto: r.neto } };
  for (const l of r.lineas) {
    if (l.cuenta) {
      res.coches.total++;
      if (l.clase === "VO") res.coches.usados++;
      else res.coches.nuevos++;
    }
    for (const c of l.conceptos) {
      if (c.concepto === "financiacion") {
        res.creditos.numero++;
        res.creditos.importe += c.importe;
      } else if (c.concepto === "preference") {
        const box3 = c.descripcion.startsWith("Preference / BOX3");
        const destino = box3 ? res.box3 : res.preference;
        destino.numero++;
        destino.importe += c.importe;
      } else if (c.concepto === "regla" || c.concepto === "especial" || c.concepto === "puntos_regla") {
        res.bonus.push({ ...de(l.idExpediente), concepto: c.descripcion, importe: c.importe, puntos: c.puntos });
      }
    }
    const importeCoche = l.conceptos.filter((c) => c.concepto === "coche_vn" || c.concepto === "vo").reduce((s, c) => s + c.importe, 0);
    if (l.cuenta || importeCoche !== 0) res.porCoche.push({ ...de(l.idExpediente), clase: l.clase, cuenta: l.cuenta, importeCoche, puntos: l.puntos });
  }
  res.totales.coches = res.coches.total;
  return res;
}
