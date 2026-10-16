import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import type { Ejecutor } from "@/db";
import { expedientes, rejillaFilas, rejillas } from "@/db/schema";
import type { CocheCotejo, PagoRejilla } from "@/lib/cotejo-pagos";
import { normalizarMatricula } from "@/lib/rejilla/analizar";
import { aDto, relacionesExpediente } from "./expedientes";
import { guardarRejilla } from "./rejillas";

const mesRegex = /^\d{4}-(0[1-9]|1[0-2])$/;

export const esquemaGuardarRejillaCotejo = z.object({
  mes: z.string().regex(mesRegex, "Mes no válido (AAAA-MM)"),
  nombreArchivo: z.string().trim().max(255).nullish(),
  origen: z.enum(["pdf", "imagen"]).default("pdf"),
  matriculas: z.array(z.string().trim().min(1).max(20)).min(1, "La rejilla no tiene ninguna matrícula").max(500),
});
export type EntradaGuardarRejillaCotejo = z.infer<typeof esquemaGuardarRejillaCotejo>;

export interface RejillaGuardada {
  id: number;
  mes: string;
  nombreArchivo: string | null;
  creadaEn: string;
  filas: number;
}

export interface DatosCotejo {
  coches: CocheCotejo[];
  pagos: PagoRejilla[];
  rejillas: RejillaGuardada[];
}

/** Expedientes del vendedor como «coches» a cotejar, y todas sus rejillas guardadas. Solo lee. */
export async function datosCotejo(ej: Ejecutor, idUsuario: number): Promise<DatosCotejo> {
  const filas = await ej.query.expedientes.findMany({
    where: and(eq(expedientes.idUsuario, idUsuario), isNull(expedientes.eliminadoEn)),
    with: relacionesExpediente,
  });
  const coches: CocheCotejo[] = filas.map(aDto).map((e) => ({
    origen: "app" as const,
    id_expediente: e.id_expediente,
    cliente: e.cliente?.nombre ?? "",
    tipo_pago: e.tipoDeVenta?.nombre_tipo_venta ?? "",
    marca: e.modelo?.marca?.nombre ?? "",
    modelo: e.modelo?.nombre_modelo ?? "",
    matricula: e.matricula ?? "",
    f_expediente: e.fecha_expediente,
    f_afectacion: e.fecha_afectacion,
    f_matriculacion: e.fecha_matriculacion,
    f_entrega: e.fecha_entrega,
    estado: "",
    usado: e.estadoVehiculo?.clase === "VO",
  }));

  const hojas = await ej.select().from(rejillas).where(eq(rejillas.idUsuario, idUsuario)).orderBy(desc(rejillas.mes));
  const pagos: PagoRejilla[] = [];
  const guardadas: RejillaGuardada[] = [];
  for (const h of hojas) {
    const f = await ej.select().from(rejillaFilas).where(eq(rejillaFilas.idRejilla, h.id));
    for (const x of f) pagos.push({ mes: h.mes, matricula: x.matricula, importe: x.importe });
    guardadas.push({ id: h.id, mes: h.mes, nombreArchivo: h.nombreArchivo, creadaEn: h.creadaEn.toISOString(), filas: f.length });
  }
  return { coches, pagos, rejillas: guardadas };
}

/** Guarda (sustituyendo la del mismo mes) las matrículas de una rejilla ya revisadas por el usuario. */
export async function guardarRejillaCotejo(ej: Ejecutor, idUsuario: number, creadaPor: number, entrada: EntradaGuardarRejillaCotejo): Promise<number> {
  const unicas = [...new Set(entrada.matriculas.map(normalizarMatricula).filter(Boolean))];
  return guardarRejilla(ej, idUsuario, creadaPor, {
    mes: entrada.mes,
    origen: entrada.origen,
    nombreArchivo: entrada.nombreArchivo ?? null,
    filas: unicas.map((matricula) => ({ matricula, importe: null })),
  });
}
