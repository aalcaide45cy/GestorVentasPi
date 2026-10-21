"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useToast } from "@/components/Toast";
import BotonBiblioteca from "@/components/biblioteca/BotonBiblioteca";
import { guardarCopiaEnBiblioteca } from "@/lib/biblioteca-cliente";
import { recogerPendientes, registrarAvisos, solicitarCancelacion, subirPedidos } from "@/lib/lecturas-pedidos-cliente";
import ControlesLectura from "./ControlesLectura";
import { clasificarFichero, leerDniDeFichero } from "./BotonLeerDocumento";
import { textoError } from "@/components/comisiones/api";
import { leerLectura, suscribirLectura, type DniAsociado, type EleccionRapida } from "@/lib/pedidos-cola";
import { useRef } from "react";
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
    // Con la cola llena los pedidos se suben igualmente: se leen en el servidor y pasan a la cola según vaya quedando hueco
    setSubiendo(true);
    try {
      let aSubir = ficheros;
      let dni: DniAsociado | null = null;
      // Dos ficheros son un pedido y su DNI: el pedido sigue su camino y el DNI se lee ahora (se guarda y de él sale la foto del cliente)
      // para unirse al expediente que se cree con ese pedido
      if (ficheros.length === 2) {
        const tipos = await Promise.all(ficheros.map((f) => clasificarFichero(f).catch(() => "otro" as const)));
        if (tipos.includes("pedido") && tipos.includes("dni")) {
          const iDni = tipos.indexOf("dni");
          aSubir = [ficheros[1 - iDni]];
          try {
            const r = await leerDniDeFichero(ficheros[iDni]);
            dni = { adjuntos: r.adjuntos.map((a) => a.id), fotoId: r.fotoId, fechaNacimiento: r.datos.fechaNacimiento };
            mostrar(r.fotoId ? "DNI reconocido: se unirá al expediente del pedido, con la foto del cliente." : "DNI reconocido: se unirá al expediente del pedido (no se ha podido recortar la foto).");
          } catch (e) {
            mostrar(`El pedido sigue adelante, pero no he podido leer el DNI: ${textoError(e)}`, "error");
          }
        } else if (tipos.every((t) => t === "dni")) {
          mostrar("Los dos ficheros son un DNI y falta el pedido. Arrastra el pedido junto con el DNI; para guardar solo un DNI, hazlo desde el cliente o desde su expediente.", "error");
          return;
        }
      }
      guardarCopiaEnBiblioteca(aSubir, "pedido");
      await subirPedidos(aSubir, { ...destino, dni });
    } finally {
      setSubiendo(false);
    }
  };
  return {
    leer,
    cancelar: solicitarCancelacion,
    leyendo: subiendo || lectura !== null,
    subiendo,
    textoProgreso: lectura ? (lectura.total > 1 ? `Leyendo ${Math.min(lectura.hechos + 1, lectura.total)} de ${lectura.total}…` : "Leyendo…") : "Subiendo…",
  };
}

/** Cuadro para arrastrar uno o varios pedidos (PDF o foto) de golpe. */
export function ZonaPedidos({ etiqueta = "Arrastra aquí los pedidos de tus clientes", compacta = false }: { etiqueta?: string; compacta?: boolean }) {
  const { leer, subiendo, cancelar } = useLeerPedidos();
  const lectura = useSyncExternalStore(suscribirLectura, leerLectura, () => null);
  const archivos = useRef<HTMLInputElement>(null);
  const carpeta = useRef<HTMLInputElement>(null);
  const elegidos = (lista: FileList | File[] | null) => {
    const ficheros = Array.from(lista ?? []).filter((f) => f.type.startsWith("image/") || f.type === "application/pdf" || /\.(pdf|jpe?g|png|webp)$/i.test(f.name));
    if (ficheros.length > 0) void leer(ficheros);
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px", flex: "1 1 180px", minWidth: "160px" }}>
      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
        <button type="button" className="btn btn-primary" style={{ padding: "6px 12px", fontSize: "0.82rem" }} disabled={subiendo} onClick={() => archivos.current?.click()} title="Elige uno o varios PDF o fotos de pedidos desde el explorador de archivos (puedes seleccionar muchos a la vez)">
          📂 Cargar pedidos
        </button>
        <button type="button" className="btn btn-secondary" style={{ padding: "6px 12px", fontSize: "0.82rem" }} disabled={subiendo} onClick={() => carpeta.current?.click()} title="Elige una carpeta entera: se cargan todos los PDF y fotos que haya dentro, y lo que no sea un pedido se ignora">
          📁 Cargar carpeta
        </button>
        <BotonBiblioteca categorias={["pedido"]} deshabilitado={subiendo} alElegir={(a) => elegidos(a)} />
        <input ref={archivos} type="file" multiple accept="image/*,.pdf,application/pdf" style={{ display: "none" }} onChange={(e) => { elegidos(e.target.files); e.target.value = ""; }} />
        <input ref={carpeta} type="file" multiple style={{ display: "none" }} {...({ webkitdirectory: "", directory: "" } as Record<string, string>)} onChange={(e) => { elegidos(e.target.files); e.target.value = ""; }} />
      </div>
      <ZonaSoltar
        icono="📄"
        titulo={etiqueta}
        ayuda="Arrastra uno o varios pedidos (PDF o foto), los que quieras. Si sueltas dos ficheros, un pedido y su DNI (en el orden que sea), el DNI se une al expediente que se cree con ese pedido y de él se recorta la foto del cliente. Los que no sean pedidos se ignoran, y los demás quedan en la cola de pedidos."
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
      <ControlesLectura parte="pedidos" />
      <OpcionVentanaPedido />
    </div>
  );
}
