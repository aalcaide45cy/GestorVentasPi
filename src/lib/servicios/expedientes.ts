import { eq } from "drizzle-orm";
import { z } from "zod";
import type { Ejecutor } from "@/db";
import { expedientes } from "@/db/schema";
import type { ExpedienteDto } from "@/lib/dto";
import { esquemaCliente } from "./clientes";
import { fechaOpcional, idOpcional, listaIds, textoOpcional } from "./comun";
import { clienteDto, estadoDto, modeloDto, tipoVentaDto } from "./mapeos";

/* ------------------------------------------------------------------ */
/* Esquemas de entrada                                                 */
/* ------------------------------------------------------------------ */

const booleano = z.boolean().optional();

const camposFecha = {
  fecha_expediente: fechaOpcional.optional(),
  fecha_afectacion: fechaOpcional.optional(),
  fecha_matriculacion: fechaOpcional.optional(),
  fecha_entrega: fechaOpcional.optional(),
  fecha_rci: fechaOpcional.optional(),
  fecha_facturacion: fechaOpcional.optional(),
  fecha_cobrado: fechaOpcional.optional(),
};

const camposComunes = {
  id_usuario: idOpcional.optional(),
  id_modelo: idOpcional.optional(),
  id_tienda: idOpcional.optional(),
  id_tipo_de_venta: idOpcional.optional(),
  id_estado_vehiculo: idOpcional.optional(),
  matricula: textoOpcional(50).optional(),
  vin: textoOpcional(100).optional(),
  cobrado_otra_fecha: booleano,
  ...camposFecha,
};

const esquemaConcepto = z.object({
  titulo: z.string().trim().min(1).max(200),
  importe_centimos: z.number().int(),
  descripcion: z.string().trim().max(1000).default(""),
  evento: z.enum(["afectacion", "matriculacion", "cobro"]),
  cobrado: z.boolean().default(false),
});

export const esquemaCrearExpediente = z.object({
  cliente: esquemaCliente.optional().nullable(),
  expediente: z.object({
    ...camposComunes,
    estado_nombre: z.string().optional(),
  }),
});
export type EntradaCrearExpediente = z.infer<typeof esquemaCrearExpediente>;

const camposEdicion = {
  ...camposComunes,
  comision_cobrada: booleano,
  comision_coche_cobrada: booleano,
  comision_usado_cobrada: booleano,
  comision_financiacion_cobrada: booleano,
  comision_preference_cobrada: booleano,
  comision_bonus_cobrada: booleano,
  puntos: z.number().int().nullable().optional(),
  comision_coche_manual: z.number().int().nullable().optional(),
  comision_financiacion_manual: z.number().int().nullable().optional(),
  conceptos_especiales: z.array(esquemaConcepto).max(100).optional(),
};

export const esquemaActualizarExpediente = z.discriminatedUnion("modo", [
  z.object({
    modo: z.literal("uno"),
    id_expediente: z.number().int().positive(),
    id_cliente: idOpcional.optional(),
    expediente: z.object(camposEdicion),
  }),
  z.object({
    modo: z.literal("lote"),
    ids: listaIds,
    expediente: z.object({
      id_modelo: idOpcional.optional(),
      id_tipo_de_venta: idOpcional.optional(),
      id_usuario: idOpcional.optional(),
      ...camposFecha,
    }),
  }),
]);
export type EntradaActualizarExpediente = z.infer<typeof esquemaActualizarExpediente>;

/* ------------------------------------------------------------------ */
/* Lectura                                                             */
/* ------------------------------------------------------------------ */

const relaciones = {
  cliente: { with: { emails: true, telefonos: true } },
  modelo: { with: { marca: true } },
  tipoDeVenta: true,
  estadoVehiculo: true,
  usuario: { columns: { idUsuario: true, nombre: true } },
} as const;

type FilaExpediente = NonNullable<Awaited<ReturnType<typeof leerFila>>>;

export function leerFila(ej: Ejecutor, id: number) {
  return ej.query.expedientes.findFirst({ where: eq(expedientes.idExpediente, id), with: relaciones });
}

export const relacionesExpediente = relaciones;

export function aDto(e: FilaExpediente): ExpedienteDto {
  return {
    id_expediente: e.idExpediente,
    id_usuario: e.idUsuario,
    id_cliente: e.idCliente,
    id_modelo: e.idModelo,
    id_tienda: e.idTienda,
    id_tipo_de_venta: e.idTipoDeVenta,
    id_estado_vehiculo: e.idEstadoVehiculo,
    fecha_expediente: e.fechaExpediente,
    fecha_afectacion: e.fechaAfectacion,
    fecha_matriculacion: e.fechaMatriculacion,
    fecha_entrega: e.fechaEntrega,
    fecha_rci: e.fechaRci,
    fecha_facturacion: e.fechaFacturacion,
    matricula: e.matricula,
    vin: e.vin,
    cobrado_otra_fecha: e.cobradoOtraFecha,
    fecha_cobrado: e.fechaCobrado,
    comision_cobrada: e.comisionCobrada,
    comision_coche_cobrada: e.comisionCocheCobrada,
    comision_usado_cobrada: e.comisionUsadoCobrada,
    comision_financiacion_cobrada: e.comisionFinanciacionCobrada,
    comision_preference_cobrada: e.comisionPreferenceCobrada,
    comision_bonus_cobrada: e.comisionBonusCobrada,
    cliente: e.cliente ? clienteDto(e.cliente) : null,
    modelo: e.modelo ? modeloDto(e.modelo) : null,
    tipoDeVenta: e.tipoDeVenta ? tipoVentaDto(e.tipoDeVenta) : null,
    estadoVehiculo: e.estadoVehiculo ? estadoDto(e.estadoVehiculo) : null,
    usuario: e.usuario ? { id_usuario: e.usuario.idUsuario, nombre: e.usuario.nombre } : null,
  };
}
