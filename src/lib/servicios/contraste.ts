import { z } from "zod";
import type { Ejecutor } from "@/db";
import { contrastarListado, type ExpedienteApp, type ResultadoContraste } from "@/lib/contraste-listado";
import { listarExpedientes } from "./expedientes-lectura";

const cadena = z.string().max(500);
const fecha = z.string().max(10).nullable();

export const esquemaContrastarListado = z.object({
  filas: z
    .array(
      z.object({
        fila: z.number().int(),
        numero: cadena,
        cliente: cadena,
        nif: cadena,
        estado: cadena,
        usado: z.boolean(),
        marca: cadena,
        modelo: cadena,
        bastidor: cadena,
        matricula: cadena,
        f_creado: fecha,
        f_afect: fecha,
        f_mat: fecha,
        f_entrega: fecha,
      }),
    )
    .max(20000),
});
export type EntradaContrastarListado = z.infer<typeof esquemaContrastarListado>;

/** Contrasta un listado con todos los expedientes de la app. Solo lee: no modifica nada. */
export async function contrastarConExpedientes(ej: Ejecutor, entrada: EntradaContrastarListado): Promise<ResultadoContraste> {
  const lista = await listarExpedientes(ej);
  const app: ExpedienteApp[] = lista.map((e) => ({
    id_expediente: e.id_expediente,
    cliente: e.cliente?.nombre ?? "",
    nif: e.cliente?.dni ?? "",
    marca: e.modelo?.marca?.nombre ?? "",
    modelo: e.modelo?.nombre_modelo ?? "",
    bastidor: e.vin ?? "",
    matricula: e.matricula ?? "",
    f_expediente: e.fecha_expediente,
    f_afectacion: e.fecha_afectacion,
    f_matriculacion: e.fecha_matriculacion,
    f_entrega: e.fecha_entrega,
  }));
  return contrastarListado(entrada.filas, app);
}
