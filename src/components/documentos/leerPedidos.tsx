"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useToast } from "@/components/Toast";
import { cancelarLecturas, recogerPendientes, registrarAvisos, subirPedidos } from "@/lib/lecturas-pedidos-cliente";
import { MAXIMO_COLA, huecosEnCola, leerLectura, suscribirLectura, type EleccionRapida } from "@/lib/pedidos-cola";
import OpcionVentanaPedido from "./OpcionVentanaPedido";
import ZonaSoltar from "./ZonaSoltar";

interface Destino {
  eleccion?: EleccionRapida | null;
  idExpediente?: number | null;
}

/**
 * Sube uno o varios pedidos: se guardan en el servidor al momento y se leen allí, varios a la vez, en segundo plano; los pedidos
 * leídos van apareciendo en la cola (también si cierras la página y vuelves). Lo que no es un pedido se ignora.
 */
export function useLeerPedidos() {
  const { mostrar } = useToast();
  const [subiendo, setSubiendo] = useState(false);
  const lectura = useSyncExternalStore(suscribirLectura, leerLectura, () => null);

  useEffect(() => {
    registrarAvisos((m, tipo) => mostrar(m, tipo));
    // Al abrir la pantalla se recoge lo que se leyó mientras no estabas
    void recogerPendientes();
  }, [mostrar]);

  const leer = async (ficheros: File[], destino: Destino = {}) => {
    if (ficheros.length === 0) return;
    if (huecosEnCola() === 0) {
      mostrar(`La cola está llena (${MAXIMO_COLA} pedidos). Procesa o descarta alguno antes de añadir más.`, "error");
      return;
    }
    setSubiendo(true);
    try {
      await subirPedidos(ficheros, destino);
    } finally {
      setSubiendo(false);
    }
  };
  return {
    leer,
    cancelar: () => void cancelarLecturas(),
    leyendo: subiendo || lectura !== null,
    subiendo,
    textoProgreso: lectura ? (lectura.total > 1 ? `Leyendo ${Math.min(lectura.hechos + 1, lectura.total)} de ${lectura.total}…` : "Leyendo…") : "Subiendo…",
  };
}

/** Cuadro para arrastrar uno o varios pedidos (PDF o foto) de golpe. */
export function ZonaPedidos({ etiqueta = "Arrastra aquí los pedidos de tus clientes", compacta = false }: { etiqueta?: string; compacta?: boolean }) {
  const { leer, subiendo, cancelar } = useLeerPedidos();
  const lectura = useSyncExternalStore(suscribirLectura, leerLectura, () => null);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px", flex: "1 1 180px", minWidth: "160px" }}>
      <ZonaSoltar
        icono="📄"
        titulo={etiqueta}
        ayuda="Arrastra uno o varios pedidos (PDF o foto), los que quieras. Se guardan al momento y se leen en este equipo varios a la vez; los que no sean pedidos se ignoran, y los demás quedan en la cola de pedidos."
        multiple
        compacta={compacta}
        ocupado={subiendo}
        textoOcupado="Subiendo…"
        alSoltar={(f) => leer(f)}
      />
      {lectura && (
        <div style={{ fontSize: "0.78rem", color: "var(--primary)", display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
          ⏳ Leyendo en segundo plano: {Math.min(lectura.hechos, lectura.total)} de {lectura.total}
          <button type="button" className="btn btn-secondary" style={{ padding: "1px 8px", fontSize: "0.75rem" }} onClick={cancelar}>
            ✖ Cancelar lectura
          </button>
        </div>
      )}
      <OpcionVentanaPedido />
    </div>
  );
}
