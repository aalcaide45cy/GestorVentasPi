import { llamar } from "@/components/comisiones/api";
import { vincularAdjuntos } from "@/components/documentos/BotonLeerDocumento";
import { anotarResolucion } from "@/lib/lecturas-pedidos-cliente";
import { leerCola, quitarDeCola, type ItemCola } from "@/lib/pedidos-cola";
import type { CoincidenciaCliente } from "@/lib/servicios/clientes";

export interface ResultadoCreacionMasiva {
  creados: number;
  omitidos: { nombre: string; motivo: string }[];
}

/** Une el DNI soltado junto con un pedido al expediente que ese pedido ha completado (y a su cliente, de quien pasa a ser la foto). */
export async function vincularDniAlExpediente(adjuntos: number[], idExpediente: number): Promise<void> {
  if (adjuntos.length === 0) return;
  const { data } = await llamar<{ id_cliente: number | null }>(`/api/expedientes?id=${idExpediente}`);
  await vincularAdjuntos(adjuntos, { idExpediente, idCliente: data.id_cliente });
}

/** Crea el expediente de un pedido de la cola solo si no hay ninguna duda; devuelve el motivo si lo deja en la cola. */
async function crearUno(item: ItemCola, vendedorId: number): Promise<string | null> {
  const d = item.pedido.datos;
  if (item.idExpediente) return "es para completar un expediente que ya existe";
  const idModelo = item.eleccion ? item.eleccion.idModelo : d.idModelo;
  const idTipo = item.eleccion ? item.eleccion.tipo.id_tipo_de_venta : d.idTipoDeVenta;
  if (idModelo === null) return "su marca o modelo no está en los catálogos: elígelos a mano";
  if (!item.eleccion && d.avisos.some((a) => a.includes("varios modelos"))) return "el modelo es dudoso (aparecen varios en el pedido): elígelo a mano";
  if (d.avisos.some((a) => a.startsWith("No se pudo leer automáticamente") || a.startsWith("El lector no lo reconoció"))) return "no se pudo leer: rellénalo a mano";
  if (idTipo === null) return "no se ha reconocido la forma de pago";

  // Nunca se duplica: se mira justo ahora, por si uno anterior de esta misma tanda ya lo ha creado
  const { data: similares } = await llamar<{ idExpediente: number; motivo: string }[]>("/api/documentos/similares", {
    method: "POST",
    cuerpo: { vin: d.vin, matricula: d.matricula, dni: d.dni, cliente: d.cliente, fechaExpediente: d.fechaExpediente, idModelo },
  });
  if (similares.length > 0) return `ya existe el expediente nº ${similares[0].idExpediente} (${similares[0].motivo})`;

  const { data: coincidencias } = await llamar<CoincidenciaCliente[]>("/api/clientes/coincidencias", { method: "POST", cuerpo: { dni: d.dni, nombre: d.cliente } });
  let idCliente: number | null = null;
  if (coincidencias.length === 0) {
    if (d.cliente) {
      const { data } = await llamar<{ id: number }>("/api/clientes", {
        method: "POST",
        cuerpo: {
          nombre: d.cliente,
          dni: d.dni,
          domicilio: d.domicilio,
          poblacion: d.poblacion,
          codigo_postal: d.codigoPostal,
          fecha_de_nacimiento: item.dni?.fechaNacimiento ?? undefined,
          emails: d.email ? [{ email: d.email, tipo: "Principal" }] : [],
          telefonos: d.telefono ? [{ telefono: d.telefono, tipo: "Principal" }] : [],
        },
      });
      idCliente = data.id;
    }
  } else if (coincidencias.length === 1 && coincidencias[0].porDni) {
    idCliente = coincidencias[0].id;
  } else {
    return "hay dudas con el cliente (varios parecidos o sin el mismo DNI)";
  }

  const { data: creado } = await llamar<{ id_expediente: number }>("/api/expedientes", {
    method: "POST",
    cuerpo: {
      expediente: {
        id_modelo: idModelo,
        id_tipo_de_venta: idTipo,
        estado_nombre: item.eleccion?.estadoNombre ?? (d.tipoPedido === "usado" ? "usado" : undefined),
        id_usuario: vendedorId,
        vin: d.vin ?? undefined,
        matricula: d.matricula ?? undefined,
        fecha_expediente: d.fechaExpediente ?? undefined,
        fecha_entrega: d.fechaEntrega ?? undefined,
      },
    },
  });
  if (idCliente) await llamar("/api/expedientes", { method: "PUT", cuerpo: { id_expediente: creado.id_expediente, id_cliente: idCliente, expediente: {} } }).catch(() => undefined);
  // El DNI soltado junto con el pedido (si lo hay) se une al mismo expediente y cliente; su foto pasa a ser la del cliente
  await vincularAdjuntos([item.pedido.adjunto.id, ...(item.dni?.adjuntos ?? [])], { idExpediente: creado.id_expediente, idCliente });
  anotarResolucion(item.idLectura, "creado", creado.id_expediente);
  quitarDeCola(item.id);
  return null;
}

/**
 * «Crear todos los demás»: recorre la cola y crea de una vez los expedientes que no ofrecen duda (modelo y pago reconocidos, cliente
 * claro y sin duplicado). Los que tienen alguna duda se quedan en la cola, con su motivo. Funciona aunque «Permitir expedientes
 * duplicados» esté desactivado… y aunque esté activado: aquí nunca se duplica.
 */
export async function crearTodosLosPedidos(vendedorId: number, alProgreso?: (hechos: number, total: number) => void): Promise<ResultadoCreacionMasiva> {
  const items = [...leerCola().items];
  const res: ResultadoCreacionMasiva = { creados: 0, omitidos: [] };
  for (let i = 0; i < items.length; i++) {
    alProgreso?.(i, items.length);
    try {
      const motivo = await crearUno(items[i], vendedorId);
      if (motivo) res.omitidos.push({ nombre: items[i].pedido.datos.cliente ?? items[i].nombre, motivo });
      else res.creados++;
    } catch (e) {
      res.omitidos.push({ nombre: items[i].pedido.datos.cliente ?? items[i].nombre, motivo: e instanceof Error ? e.message : "error al crearlo" });
    }
  }
  alProgreso?.(items.length, items.length);
  return res;
}
