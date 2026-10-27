import { llamar } from "@/components/comisiones/api";
import { vincularAdjuntos } from "@/components/documentos/BotonLeerDocumento";
import { leerCola, quitarDeCola, type ItemCola } from "@/lib/pedidos-cola";
import { llamarComoTarea } from "@/lib/tareas-cliente";
import type { ResultadoCreacionMasiva as ResultadoServidor } from "@/lib/servicios/creacion-masiva";

export interface ResultadoCreacionMasiva {
  creados: number;
  /** Los que no se han creado, con su motivo; `idItem` es el pedido de la cola (para dejarlos elegidos). */
  omitidos: { idItem?: string; nombre: string; motivo: string }[];
}

/** Une el DNI soltado junto con un pedido al expediente que ese pedido ha completado (y a su cliente, de quien pasa a ser la foto). */
export async function vincularDniAlExpediente(adjuntos: number[], idExpediente: number): Promise<void> {
  if (adjuntos.length === 0) return;
  const { data } = await llamar<{ id_cliente: number | null }>(`/api/expedientes?id=${idExpediente}`);
  await vincularAdjuntos(adjuntos, { idExpediente, idCliente: data.id_cliente });
}

/**
 * «Crear todos los demás»: crea los expedientes de toda la cola que no ofrecen duda (modelo y pago reconocidos, cliente claro y sin duplicado).
 * Los que tienen alguna duda se quedan en la cola, con su motivo.
 */
export async function crearTodosLosPedidos(vendedorId: number, alProgreso?: (hechos: number, total: number) => void): Promise<ResultadoCreacionMasiva> {
  return crearPedidos([...leerCola().items], vendedorId, alProgreso);
}

/**
 * Crea de una vez los expedientes de los pedidos indicados (los elegidos en la cola). Lo hace el servidor como tarea en segundo plano (una sola
 * petición en lugar de unas siete por pedido; sigue aunque se cambie de pantalla): crea solo los que no ofrecen duda y nunca duplicados, y los
 * pedidos creados salen de la cola. Los demás se quedan en la cola, con su motivo.
 */
export async function crearPedidos(items: ItemCola[], vendedorId: number, alProgreso?: (hechos: number, total: number) => void): Promise<ResultadoCreacionMasiva> {
  if (items.length === 0) return { creados: 0, omitidos: [] };
  const cuerpo = {
    vendedorId,
    items: items.map((i) => ({
      idItem: i.id,
      nombre: i.nombre,
      idLectura: i.idLectura ?? null,
      datos: {
        vin: i.pedido.datos.vin,
        matricula: i.pedido.datos.matricula,
        dni: i.pedido.datos.dni,
        cliente: i.pedido.datos.cliente,
        telefono: i.pedido.datos.telefono,
        email: i.pedido.datos.email,
        domicilio: i.pedido.datos.domicilio,
        poblacion: i.pedido.datos.poblacion,
        codigoPostal: i.pedido.datos.codigoPostal,
        fechaExpediente: i.pedido.datos.fechaExpediente,
        fechaEntrega: i.pedido.datos.fechaEntrega,
        idModelo: i.pedido.datos.idModelo,
        idTipoDeVenta: i.pedido.datos.idTipoDeVenta,
        tipoPedido: i.pedido.datos.tipoPedido,
        avisos: i.pedido.datos.avisos,
        retoma: i.pedido.datos.retoma ? { matricula: i.pedido.datos.retoma.matricula, texto: i.pedido.datos.retoma.texto } : null,
      },
      eleccion: i.eleccion ? { idModelo: i.eleccion.idModelo, idTipoVenta: i.eleccion.tipo.id_tipo_de_venta, estadoNombre: i.eleccion.estadoNombre ?? null } : null,
      idExpediente: i.idExpediente,
      adjuntos: [i.pedido.adjunto.id, ...(i.dni?.adjuntos ?? [])],
      fechaNacimiento: i.dni?.fechaNacimiento ?? null,
    })),
  };
  const r = await llamarComoTarea<ResultadoServidor>("/api/documentos/crear-masivo", cuerpo, (t) => alProgreso?.(t.hecho, t.total));
  // Lo creado sale de la cola (el servidor ya ha unido sus documentos y anotado el resultado en el registro de lecturas)
  for (const c of r.creados) quitarDeCola(c.idItem);
  return { creados: r.creados.length, omitidos: r.omitidos };
}
