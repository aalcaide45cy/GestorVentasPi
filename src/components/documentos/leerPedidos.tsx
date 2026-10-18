"use client";

import { useState } from "react";
import { useToast } from "@/components/Toast";
import { MAXIMO_COLA, abrirDeCola, anadirACola, cancelarLectura, fijarLectura, huecosEnCola, iniciarLectura, lecturaCancelada, leerCola, type EleccionRapida, type ItemCola } from "@/lib/pedidos-cola";
import { leerPedidoDeFichero } from "./BotonLeerDocumento";
import OpcionVentanaPedido from "./OpcionVentanaPedido";
import ZonaSoltar from "./ZonaSoltar";

interface Destino {
  eleccion?: EleccionRapida | null;
  idExpediente?: number | null;
}

/**
 * Lee uno o varios pedidos (uno tras otro, para no saturar el reconocimiento de texto) y los deja en la cola. Un pedido que no
 * se puede leer no detiene a los demás. Devuelve los pedidos que sí se han leído.
 */
export async function leerYEncolar(
  ficheros: File[],
  destino: Destino,
  alProgreso: (hechos: number, total: number) => void,
  alError: (mensaje: string) => void,
  /** Se llama con cada pedido en cuanto se lee (el primero se puede abrir mientras se leen los demás). */
  alLeer?: (item: ItemCola) => void,
  /** Se llama una vez al terminar con los documentos que no eran pedidos y se han ignorado. */
  alIgnorados?: (ignorados: string[]) => void,
): Promise<ItemCola[]> {
  const leidos: ItemCola[] = [];
  const ignorados: string[] = [];
  for (let i = 0; i < ficheros.length; i++) {
    if (lecturaCancelada()) break;
    alProgreso(i, ficheros.length);
    if (huecosEnCola() === 0) {
      alError(`La cola está llena (${MAXIMO_COLA} pedidos): se han dejado ${ficheros.length - i} sin leer. Procesa algunos y vuelve a soltarlos.`);
      break;
    }
    try {
      const pedido = await leerPedidoDeFichero(ficheros[i]);
      // El mismo pedido leído dos veces (mismo número de pedido, bastidor o matrícula) no se añade otra vez a la cola
      const d = pedido.datos;
      const mismo = (a: string | null, b: string | null) => !!a && !!b && a.replace(/[\s.-]/g, "").toUpperCase() === b.replace(/[\s.-]/g, "").toUpperCase();
      if (leerCola().items.some((x) => mismo(x.pedido.datos.numeroPedido, d.numeroPedido) || mismo(x.pedido.datos.vin, d.vin) || mismo(x.pedido.datos.matricula, d.matricula) || (!!d.dni && !!d.fechaExpediente && mismo(x.pedido.datos.dni, d.dni) && x.pedido.datos.fechaExpediente === d.fechaExpediente && x.pedido.datos.idModelo === d.idModelo))) {
        ignorados.push(ficheros[i].name);
        continue;
      }
      // Si ya existe un expediente de este pedido, la lectura sirve para completarlo: nunca se crea uno duplicado
      const yaExiste = destino.idExpediente ? null : (pedido.similares[0]?.idExpediente ?? null);
      const nuevos = anadirACola([{ nombre: ficheros[i].name, pedido, eleccion: yaExiste ? null : (destino.eleccion ?? null), idExpediente: destino.idExpediente ?? yaExiste }]);
      leidos.push(...nuevos);
      for (const n of nuevos) alLeer?.(n);
    } catch (e) {
      const mensaje = e instanceof Error ? e.message : "no se pudo leer";
      if (lecturaCancelada()) break;
      // Un documento que no es un pedido no es un error: se descarta en silencio y solo se cuenta al final
      if (mensaje.startsWith("No parece un pedido")) ignorados.push(ficheros[i].name);
      else alError(`${ficheros[i].name}: ${mensaje}`);
    }
  }
  alProgreso(ficheros.length, ficheros.length);
  alIgnorados?.(ignorados);
  return leidos;
}

/** Hook con el estado de lectura y la función que lee, encola y abre el primero. */
export function useLeerPedidos() {
  const { mostrar } = useToast();
  const [progreso, setProgreso] = useState<{ hechos: number; total: number } | null>(null);

  const leer = async (ficheros: File[], destino: Destino = {}) => {
    if (ficheros.length === 0) return;
    const huecos = huecosEnCola();
    if (huecos === 0) {
      mostrar(`La cola está llena (${MAXIMO_COLA} pedidos). Procesa o descarta alguno antes de añadir más.`, "error");
      return;
    }
    // Se leen todos: los que no son pedidos se descartan y no ocupan sitio en la cola (la lectura se detiene si se llena de pedidos)
    const aceptados = ficheros;
    iniciarLectura();
    setProgreso({ hechos: 0, total: aceptados.length });
    fijarLectura({ hechos: 0, total: aceptados.length });
    let abierto = false;
    let ignoradosFinal: string[] = [];
    const leidos = await leerYEncolar(
      aceptados,
      destino,
      (hechos, total) => {
        setProgreso(hechos >= total ? null : { hechos, total });
        fijarLectura(hechos >= total ? null : { hechos, total });
      },
      (m) => mostrar(m, "error"),
      (item) => {
        // El primero se abre ya: se puede trabajar con él mientras se leen los demás
        if (!abierto) {
          abierto = true;
          abrirDeCola(item.id);
        }
      },
      (ign) => {
        ignoradosFinal = ign;
      },
    );
    setProgreso(null);
    fijarLectura(null);
    if (lecturaCancelada()) mostrar(`Lectura cancelada: ${leidos.length} pedido${leidos.length === 1 ? "" : "s"} leído${leidos.length === 1 ? "" : "s"} hasta ahora.`);
    else if (ficheros.length > 1 || leidos.length > 1 || ignoradosFinal.length > 0) {
      mostrar(`${leidos.length} pedido${leidos.length === 1 ? "" : "s"} leído${leidos.length === 1 ? "" : "s"}${leidos.length > 0 ? " (están en la cola de pedidos)" : ""}${ignoradosFinal.length > 0 ? ` y ${ignoradosFinal.length} documento${ignoradosFinal.length === 1 ? "" : "s"} que no eran pedidos, ignorado${ignoradosFinal.length === 1 ? "" : "s"}` : ""}.`);
    }
  };
  return { leer, cancelar: cancelarLectura, leyendo: progreso !== null, textoProgreso: progreso && progreso.total > 1 ? `Leyendo ${progreso.hechos + 1} de ${progreso.total}…` : "Leyendo…" };
}

/** Cuadro para arrastrar uno o varios pedidos (PDF o foto) de golpe. */
export function ZonaPedidos({ etiqueta = "Arrastra aquí los pedidos de tus clientes", compacta = false }: { etiqueta?: string; compacta?: boolean }) {
  const { leer, leyendo, textoProgreso, cancelar } = useLeerPedidos();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px", flex: "1 1 180px", minWidth: "160px" }}>
      <ZonaSoltar
        icono="📄"
        titulo={etiqueta}
        ayuda="Arrastra uno o varios pedidos (PDF o foto). Se leen en este equipo y quedan en la cola de pedidos: de cada uno eliges qué datos se aplican y si crea un expediente nuevo."
        multiple
        compacta={compacta}
        ocupado={leyendo}
        textoOcupado={textoProgreso}
        alCancelar={cancelar}
        alSoltar={(f) => leer(f)}
      />
      <OpcionVentanaPedido />
    </div>
  );
}
