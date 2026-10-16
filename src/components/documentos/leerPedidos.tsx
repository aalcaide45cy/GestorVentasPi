"use client";

import { useState } from "react";
import { useToast } from "@/components/Toast";
import { abrirDeCola, anadirACola, type EleccionRapida, type ItemCola } from "@/lib/pedidos-cola";
import { leerPedidoDeFichero } from "./BotonLeerDocumento";
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
): Promise<ItemCola[]> {
  const leidos: ItemCola[] = [];
  for (let i = 0; i < ficheros.length; i++) {
    alProgreso(i, ficheros.length);
    try {
      const pedido = await leerPedidoDeFichero(ficheros[i]);
      leidos.push(...anadirACola([{ nombre: ficheros[i].name, pedido, eleccion: destino.eleccion ?? null, idExpediente: destino.idExpediente ?? null }]));
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
    setProgreso({ hechos: 0, total: ficheros.length });
    const leidos = await leerYEncolar(ficheros, destino, (hechos, total) => setProgreso(hechos >= total ? null : { hechos, total }), (m) => mostrar(m, "error"));
    setProgreso(null);
    if (leidos.length > 1) mostrar(`${leidos.length} pedidos leídos: están en la cola de pedidos.`);
    if (leidos.length > 0) abrirDeCola(leidos[0].id);
  };
  return { leer, leyendo: progreso !== null, textoProgreso: progreso && progreso.total > 1 ? `Leyendo ${progreso.hechos + 1} de ${progreso.total}…` : "Leyendo…" };
}

/** Cuadro para arrastrar uno o varios pedidos (PDF o foto) de golpe. */
export function ZonaPedidos({ etiqueta = "Arrastra aquí los pedidos de tus clientes" }: { etiqueta?: string }) {
  const { leer, leyendo, textoProgreso } = useLeerPedidos();
  return (
    <ZonaSoltar
      icono="📄"
      titulo={etiqueta}
      ayuda="Arrastra uno o varios pedidos (PDF o foto). Se leen en este equipo y quedan en la cola de pedidos: de cada uno eliges qué datos se aplican y si crea un expediente nuevo."
      multiple
      ocupado={leyendo}
      textoOcupado={textoProgreso}
      alSoltar={(f) => leer(f)}
    />
  );
}
