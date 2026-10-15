import { eq } from "drizzle-orm";
import { z } from "zod";
import type { Ejecutor } from "@/db";
import { estadoVehiculo, modelos, tipoDeVenta, usuarios } from "@/db/schema";
import { HttpError } from "@/lib/auth/sesion";
import { simularExpediente, type Clase, type CategoriaVenta, type ExpedienteMotor } from "@/lib/comisiones";
import { cargarExpedientesMotor, planDelMes } from "./liquidaciones";

const fecha = z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal(""), z.null()]).optional();
const entero = z.number().int().nullable().optional();

export const esquemaSimulacion = z.object({
  id_expediente: z.number().int().positive().nullable().optional(),
  id_usuario: z.number().int().positive(),
  id_modelo: entero,
  id_tipo_de_venta: entero,
  id_estado_vehiculo: entero,
  fecha_expediente: fecha,
  fecha_afectacion: fecha,
  fecha_rci: fecha,
  fecha_matriculacion: fecha,
  fecha_cobrado: fecha,
  cobrado_otra_fecha: z.boolean().optional(),
  puntos: entero,
  id_promocion: entero,
  comision_coche_manual: entero,
  comision_financiacion_manual: entero,
  conceptos_especiales: z.array(z.object({ titulo: z.string(), importe_centimos: z.number().int(), evento: z.enum(["afectacion", "matriculacion", "cobro"]).optional() })).max(100).optional(),
});
export type EntradaSimulacion = z.infer<typeof esquemaSimulacion>;

const f = (v: string | null | undefined) => (v ? v : null);

/** «Desglose estimado de comisión»: mismo motor que la liquidación, sobre una copia en memoria. No guarda nada. */
export async function simularDesglose(ej: Ejecutor, entrada: EntradaSimulacion) {
  const [u] = await ej.select({ tipo: usuarios.tipoVendedor, patron: usuarios.patronVo }).from(usuarios).where(eq(usuarios.idUsuario, entrada.id_usuario));
  if (!u) throw new HttpError(404, "Vendedor no encontrado");
  const [estado] = entrada.id_estado_vehiculo ? await ej.select().from(estadoVehiculo).where(eq(estadoVehiculo.idEstadoVehiculo, entrada.id_estado_vehiculo)) : [];
  const [tipo] = entrada.id_tipo_de_venta ? await ej.select().from(tipoDeVenta).where(eq(tipoDeVenta.idTipoDeVenta, entrada.id_tipo_de_venta)) : [];
  const [modelo] = entrada.id_modelo ? await ej.select().from(modelos).where(eq(modelos.idModelo, entrada.id_modelo)) : [];
  const categoria = tipo?.categoria as CategoriaVenta | undefined;
  const motor: ExpedienteMotor = {
    id: entrada.id_expediente ?? -1,
    idVendedor: entrada.id_usuario,
    clase: (estado?.clase === "VO" ? "VO" : "VN") as Clase,
    subtipoVO: estado?.subtipoVo ?? null,
    idMarca: modelo?.marcaId ?? null,
    idModelo: entrada.id_modelo ?? null,
    categoriaVenta: categoria ?? null,
    fechaExpediente: f(entrada.fecha_expediente),
    fechaAfectacion: f(entrada.fecha_afectacion),
    fechaRci: f(entrada.fecha_rci),
    fechaMatriculacion: f(entrada.fecha_matriculacion),
    fechaCobro: f(entrada.fecha_cobrado),
    cobradoOtraFecha: entrada.cobrado_otra_fecha ?? false,
    puntos: entrada.puntos ?? null,
    idPromocion: entrada.id_promocion ?? null,
    comisionCocheManual: entrada.comision_coche_manual ?? null,
    comisionFinanciacionManual: entrada.comision_financiacion_manual ?? null,
    conceptosEspeciales: (entrada.conceptos_especiales ?? []).map((c) => ({ titulo: c.titulo, importe: c.importe_centimos, evento: c.evento })),
  };
  const vendedor = { id: entrada.id_usuario, tipo: (u.tipo === "VO" ? "VO" : "VN") as Clase, patronVo: u.patron };
  const clave = (motor.clase === "VO" || motor.cobradoOtraFecha ? motor.fechaCobro : motor.fechaMatriculacion)?.slice(0, 7) ?? null;
  const plan = clave ? await planDelMes(ej, clave) : null;
  const resto = await cargarExpedientesMotor(ej, entrada.id_usuario);
  const sim = simularExpediente(plan, vendedor, motor, resto);
  return {
    mes: sim.mes,
    aviso: sim.aviso,
    hayPlan: plan !== null,
    tramo: sim.resultado?.tramo ?? null,
    puntosMes: sim.resultado?.puntosMes ?? null,
    objetivoX: sim.resultado?.objetivoX ?? null,
    linea: sim.linea,
    avisos: sim.resultado?.avisos ?? [],
  };
}
