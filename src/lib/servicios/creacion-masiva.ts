import { z } from "zod";
import type { Ejecutor } from "@/db";
import type { UsuarioActual } from "@/lib/auth/sesion";
import { buscarCoincidencias } from "./clientes";
import { hoyIso } from "./comun";
import { buscarExpedientesSimilares } from "./documentos";
import { actualizarExpedientes, crearExpediente } from "./expedientes-escritura";
import { accionLecturas } from "./lecturas-pedidos";
import { vincularPendientes } from "./adjuntos";
import { TareaCancelada, type ContextoTarea } from "./tareas";

/**
 * «Crear expedientes con lo elegido»: crea en el servidor, de una vez y sin depender de que el navegador siga abierto, los expedientes de varios
 * pedidos leídos. Antes lo hacía el navegador con unas siete peticiones por pedido; así es una sola petición y mucho más rápido. Solo se crean
 * los que no ofrecen duda (modelo y pago reconocidos, cliente claro y sin duplicado); los demás se devuelven con su motivo.
 */

const texto = z.string().max(400).nullish();

export const esquemaItemCreacion = z.object({
  /** Identificador del pedido en la cola del navegador (para saber cuáles se han creado). */
  idItem: z.string().min(1).max(80),
  nombre: z.string().max(400),
  idLectura: z.number().int().positive().nullish(),
  datos: z.object({
    vin: texto,
    matricula: texto,
    dni: texto,
    cliente: texto,
    telefono: texto,
    email: texto,
    domicilio: texto,
    poblacion: texto,
    codigoPostal: texto,
    fechaExpediente: z.string().max(10).nullish(),
    fechaEntrega: z.string().max(10).nullish(),
    idModelo: z.number().int().positive().nullish(),
    idTipoDeVenta: z.number().int().positive().nullish(),
    tipoPedido: z.enum(["nuevo", "usado"]).nullish(),
    avisos: z.array(z.string().max(600)).max(40),
  }),
  /** Marca, modelo y forma de pago elegidos al soltar el pedido sobre un botón de acceso rápido. */
  eleccion: z.object({ idModelo: z.number().int().positive().nullable(), idTipoVenta: z.number().int().positive(), estadoNombre: z.string().max(60).nullish() }).nullish(),
  /** Pedido para completar un expediente que ya existe (no se crea nada). */
  idExpediente: z.number().int().positive().nullish(),
  /** Documentos que acompañan al pedido (el propio pedido y los DNI soltados con él). */
  adjuntos: z.array(z.number().int().positive()).max(20),
  fechaNacimiento: z.string().max(10).nullish(),
});
export type ItemCreacion = z.infer<typeof esquemaItemCreacion>;

export const esquemaCreacionMasiva = z.object({
  items: z.array(esquemaItemCreacion).min(1).max(3000),
  /** Vendedor al que se asignan los expedientes. */
  vendedorId: z.number().int().positive(),
});
export type EntradaCreacionMasiva = z.infer<typeof esquemaCreacionMasiva>;

export interface ResultadoCreacionMasiva {
  creados: { idItem: string; idExpediente: number }[];
  omitidos: { idItem: string; nombre: string; motivo: string }[];
  /** Resumen en frases, para el aviso de «tarea terminada». */
  detalle: string[];
}

/** Crea el expediente de un pedido solo si no hay duda; devuelve el id creado o el motivo por el que no se crea. */
async function crearUno(ej: Ejecutor, usuario: UsuarioActual, item: ItemCreacion, vendedorId: number): Promise<{ id: number } | { motivo: string }> {
  const d = item.datos;
  if (item.idExpediente) return { motivo: "es para completar un expediente que ya existe" };
  const idModelo = item.eleccion ? item.eleccion.idModelo : (d.idModelo ?? null);
  const idTipo = item.eleccion ? item.eleccion.idTipoVenta : (d.idTipoDeVenta ?? null);
  if (idModelo === null) return { motivo: "su marca o modelo no está en los catálogos: elígelos a mano" };
  if (!item.eleccion && d.avisos.some((a) => a.includes("varios modelos"))) return { motivo: "el modelo es dudoso (aparecen varios en el pedido): elígelo a mano" };
  if (d.avisos.some((a) => a.startsWith("No se pudo leer automáticamente") || a.startsWith("El lector no lo reconoció"))) return { motivo: "no se pudo leer: rellénalo a mano" };
  if (idTipo === null) return { motivo: "no se ha reconocido la forma de pago" };

  // Nunca se duplica: se mira justo ahora (por si uno anterior de esta misma tanda ya lo ha creado). Un pedido sin fecha se crea con la de hoy,
  // así que se busca con esa: dos copias del mismo pedido sin fecha de «Emitido» ya no se crean dos veces.
  const fecha = d.fechaExpediente ?? hoyIso();
  const similares = await buscarExpedientesSimilares(ej, { vin: d.vin ?? null, matricula: d.matricula ?? null, dni: d.dni ?? null, cliente: d.cliente ?? null, fechaExpediente: fecha, idModelo });
  if (similares.length > 0) return { motivo: `ya existe el expediente nº ${similares[0].idExpediente} (${similares[0].motivo})` };

  const coincidencias = await buscarCoincidencias(ej, { dni: d.dni, nombre: d.cliente });
  let clienteNuevo: Parameters<typeof crearExpediente>[2]["cliente"] = null;
  let idClienteExistente: number | null = null;
  if (coincidencias.length === 0) {
    if (d.cliente) {
      clienteNuevo = {
        nombre: d.cliente,
        dni: d.dni ?? undefined,
        domicilio: d.domicilio ?? undefined,
        poblacion: d.poblacion ?? undefined,
        codigo_postal: d.codigoPostal ?? undefined,
        fecha_de_nacimiento: item.fechaNacimiento ?? undefined,
        emails: d.email ? [{ email: d.email, tipo: "Principal" }] : [],
        telefonos: d.telefono ? [{ telefono: d.telefono, tipo: "Principal" }] : [],
      };
    }
  } else if (coincidencias.length === 1 && coincidencias[0].porDni) {
    idClienteExistente = coincidencias[0].id;
  } else {
    return { motivo: "hay dudas con el cliente (varios parecidos o sin el mismo DNI)" };
  }

  const creado = await crearExpediente(ej, usuario, {
    cliente: clienteNuevo,
    expediente: {
      id_modelo: idModelo,
      id_tipo_de_venta: idTipo,
      estado_nombre: item.eleccion?.estadoNombre ?? (d.tipoPedido === "usado" ? "usado" : undefined),
      id_usuario: vendedorId,
      vin: d.vin ?? undefined,
      matricula: d.matricula ?? undefined,
      fecha_expediente: fecha,
      fecha_entrega: d.fechaEntrega ?? undefined,
    },
  });
  if (idClienteExistente) await actualizarExpedientes(ej, usuario, { modo: "uno", id_expediente: creado.id_expediente, id_cliente: idClienteExistente, expediente: {} }).catch(() => undefined);
  const idCliente = idClienteExistente ?? creado.id_cliente ?? null;
  // Los documentos del pedido (y el DNI soltado con él) pasan al expediente y a su cliente; de 20 en 20 es lo que admite el vínculo
  for (let i = 0; i < item.adjuntos.length; i += 20) await vincularPendientes(ej, item.adjuntos.slice(i, i + 20), { idExpediente: creado.id_expediente, idCliente }, usuario.idUsuario).catch(() => 0);
  if (item.idLectura) await accionLecturas(ej, usuario.idUsuario, { accion: "resolver", resolucion: "creado", ids: [item.idLectura], idExpediente: creado.id_expediente }).catch(() => 0);
  return { id: creado.id_expediente };
}

/** Crea los expedientes de los pedidos indicados, de uno en uno y por orden. Un fallo en uno no para a los demás. */
export async function crearExpedientesDePedidos(ej: Ejecutor, usuario: UsuarioActual, entrada: EntradaCreacionMasiva, ctx?: ContextoTarea): Promise<ResultadoCreacionMasiva> {
  const res: ResultadoCreacionMasiva = { creados: [], omitidos: [], detalle: [] };
  const total = entrada.items.length;
  for (let i = 0; i < total; i++) {
    if (ctx?.cancelada()) throw new TareaCancelada("Creación cancelada: los expedientes ya creados se quedan.");
    const item = entrada.items[i];
    ctx?.avance(i, total, `Creando el expediente de ${item.datos.cliente ?? item.nombre} (${i + 1} de ${total})`);
    try {
      const r = await crearUno(ej, usuario, item, entrada.vendedorId);
      if ("id" in r) res.creados.push({ idItem: item.idItem, idExpediente: r.id });
      else res.omitidos.push({ idItem: item.idItem, nombre: item.datos.cliente ?? item.nombre, motivo: r.motivo });
    } catch (e) {
      res.omitidos.push({ idItem: item.idItem, nombre: item.datos.cliente ?? item.nombre, motivo: e instanceof Error ? e.message : "error al crearlo" });
    }
  }
  ctx?.avance(total, total, "Terminado");
  // Resumen para el aviso: lo creado y, agrupados por motivo, lo que se ha dejado en la cola
  res.detalle.push(`${res.creados.length} expediente${res.creados.length === 1 ? "" : "s"} creado${res.creados.length === 1 ? "" : "s"}`);
  const porMotivo = new Map<string, number>();
  for (const o of res.omitidos) porMotivo.set(o.motivo.replace(/nº \d+/, "nº …"), (porMotivo.get(o.motivo.replace(/nº \d+/, "nº …")) ?? 0) + 1);
  if (res.omitidos.length > 0) res.detalle.push(`${res.omitidos.length} sin crear (se quedan en la cola, elegidos):`);
  for (const [m, n] of [...porMotivo].sort((a, b) => b[1] - a[1]).slice(0, 6)) res.detalle.push(`${n} · ${m}`);
  return res;
}
