"use client";

import { useState } from "react";
import { useToast } from "@/components/Toast";
import { MAXIMO_COLA, abrirDeCola, anadirACola, fijarLectura, huecosEnCola, type EleccionRapida, type ItemCola } from "@/lib/pedidos-cola";
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
): Promise<ItemCola[]> {
  const leidos: ItemCola[] = [];
  for (let i = 0; i < ficheros.length; i++) {
    alProgreso(i, ficheros.length);
    if (huecosEnCola() === 0) {
      alError(`La cola está llena (${MAXIMO_COLA} pedidos): se han dejado ${ficheros.length - i} sin leer. Procesa algunos y vuelve a soltarlos.`);
      break;
    }
    try {
      const pedido = await leerPedidoDeFichero(ficheros[i]);
      const nuevos = anadirACola([{ nombre: ficheros[i].name, pedido, eleccion: destino.eleccion ?? null, idExpediente: destino.idExpediente ?? null }]);
      leidos.push(...nuevos);
      for (const n of nuevos) alLeer?.(n);
    } catch (e) {
      alError(`${ficheros[i].name}: ${e instanceof Error ? e.message : "no se pudo leer"}`);
    }
  }
  alProgreso(ficheros.length, ficheros.length);
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
    const aceptados = ficheros.slice(0, huecos);
    if (aceptados.length < ficheros.length) mostrar(`La cola admite ${MAXIMO_COLA} pedidos a la vez: se leerán los primeros ${aceptados.length} de ${ficheros.length}.`, "error");
    setProgreso({ hechos: 0, total: aceptados.length });
    fijarLectura({ hechos: 0, total: aceptados.length });
    let abierto = false;
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
    );
    setProgreso(null);
    fijarLectura(null);
    if (leidos.length > 1) mostrar(`${leidos.length} pedidos leídos: están en la cola de pedidos.`);
  };
  return { leer, leyendo: progreso !== null, textoProgreso: progreso && progreso.total > 1 ? `Leyendo ${progreso.hechos + 1} de ${progreso.total}…` : "Leyendo…" };
}

/** Cuadro para arrastrar uno o varios pedidos (PDF o foto) de golpe. */
export function ZonaPedidos({ etiqueta = "Arrastra aquí los pedidos de tus clientes" }: { etiqueta?: string }) {
  const { leer, leyendo, textoProgreso } = useLeerPedidos();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px", flex: "1 1 180px", minWidth: "160px" }}>
      <ZonaSoltar
        icono="📄"
        titulo={etiqueta}
        ayuda="Arrastra uno o varios pedidos (PDF o foto). Se leen en este equipo y quedan en la cola de pedidos: de cada uno eliges qué datos se aplican y si crea un expediente nuevo."
        multiple
        ocupado={leyendo}
        textoOcupado={textoProgreso}
        alSoltar={(f) => leer(f)}
      />
      <OpcionVentanaPedido />
    </div>
  );
}
