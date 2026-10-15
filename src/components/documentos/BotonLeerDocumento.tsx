"use client";

import { useState } from "react";
import { useToast } from "@/components/Toast";
import { textoError } from "@/components/comisiones/api";
import type { AdjuntoDto } from "@/lib/servicios/adjuntos";
import type { ResultadoDni, ResultadoPedido } from "@/lib/servicios/documentos";
import ZonaSoltar from "./ZonaSoltar";

type Tipo = "dni" | "pedido";

interface Props<T> {
  tipo: Tipo;
  titulo: string;
  ayuda: string;
  icono: string;
  multiple?: boolean;
  /** Datos leídos de cada fichero: la pantalla rellena sus campos con ellos. */
  alLeer: (resultado: T) => void | Promise<void>;
  disabled?: boolean;
}

/** Sube un fichero al servidor, que lo lee con OCR local y devuelve los datos. */
async function leerFichero<T>(tipo: Tipo, f: File): Promise<T> {
  const r = await fetch(`/api/documentos/leer?tipo=${tipo}&nombre=${encodeURIComponent(f.name)}`, { method: "POST", headers: { "Content-Type": f.type || "application/octet-stream" }, body: f, credentials: "same-origin" });
  const json = (await r.json().catch(() => ({}))) as { message?: string; data?: T };
  if (!r.ok || !json.data) throw new Error(json.message ?? `Error ${r.status}`);
  return json.data;
}

/** Lee un pedido (PDF o foto) en el servidor y devuelve sus datos; el fichero queda como adjunto pendiente. */
export const leerPedidoDeFichero = (f: File): Promise<ResultadoPedido> => leerFichero<ResultadoPedido>("pedido", f);

/** Cuadro para arrastrar un DNI o un pedido: se lee en este equipo y se devuelven los datos para rellenar la ficha. */
function ZonaLeer<T>({ tipo, titulo, ayuda, icono, multiple, alLeer, disabled }: Props<T>) {
  const { mostrar } = useToast();
  const [leyendo, setLeyendo] = useState(false);

  const procesar = async (ficheros: File[]) => {
    setLeyendo(true);
    try {
      // Si se sueltan varios (p. ej. anverso y reverso en ficheros distintos) se leen uno tras otro y los datos se van completando
      for (const f of ficheros) await alLeer(await leerFichero<T>(tipo, f));
    } catch (e) {
      mostrar(textoError(e), "error");
    } finally {
      setLeyendo(false);
    }
  };

  return <ZonaSoltar icono={icono} titulo={titulo} ayuda={ayuda} multiple={multiple} ocupado={leyendo} disabled={disabled} alSoltar={procesar} />;
}

type PropsPublicas<T> = Omit<Props<T>, "tipo" | "titulo" | "ayuda" | "icono" | "multiple"> & { etiqueta?: string };

export const BotonLeerDni = (p: PropsPublicas<ResultadoDni>) => (
  <ZonaLeer<ResultadoDni> tipo="dni" icono="🪪" titulo={p.etiqueta ?? "Leer DNI"} ayuda="Arrastra la foto o el PDF del DNI (puedes soltar anverso y reverso a la vez). Se lee en este equipo, rellena los datos del cliente y guarda su foto." multiple alLeer={p.alLeer} disabled={p.disabled} />
);
export const BotonLeerPedido = (p: PropsPublicas<ResultadoPedido>) => (
  <ZonaLeer<ResultadoPedido> tipo="pedido" icono="📄" titulo={p.etiqueta ?? "Leer pedido"} ayuda="Arrastra el pedido (PDF o foto). Se lee en este equipo y rellena los datos del cliente y del expediente." alLeer={p.alLeer} disabled={p.disabled} />
);

/** Vincula adjuntos subidos antes de guardar (pendientes) al cliente o expediente ya creado. */
export async function vincularAdjuntos(ids: number[], destino: { idCliente?: number | null; idExpediente?: number | null }): Promise<void> {
  if (ids.length === 0) return;
  const r = await fetch("/api/adjuntos/vincular", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids, ...destino }), credentials: "same-origin" });
  if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { message?: string }).message ?? "No se han podido vincular los documentos.");
}

/** Sube ficheros como documentos «varios». Sin destino quedan pendientes hasta que se guarde el registro. */
export async function subirDocumentos(ficheros: File[], destino: { idCliente?: number | null; idExpediente?: number | null } = {}): Promise<AdjuntoDto[]> {
  const subidos: AdjuntoDto[] = [];
  for (const f of ficheros) {
    const extra = [destino.idExpediente ? `&idExpediente=${destino.idExpediente}` : "", destino.idCliente ? `&idCliente=${destino.idCliente}` : ""].join("");
    const r = await fetch(`/api/adjuntos?tipo=otro&nombre=${encodeURIComponent(f.name)}${extra}`, { method: "POST", headers: { "Content-Type": f.type || "application/octet-stream" }, body: f, credentials: "same-origin" });
    const json = (await r.json().catch(() => ({}))) as { message?: string; data?: AdjuntoDto };
    if (!r.ok || !json.data) throw new Error(`${f.name}: ${json.message ?? `error ${r.status}`}`);
    subidos.push(json.data);
  }
  return subidos;
}

/**
 * Cuadro «Documentos varios»: sube todos los ficheros que se arrastren. Con `destino` se guardan ya en el cliente o
 * expediente; sin él quedan pendientes y se devuelven para vincularlos al guardar.
 */
export function ZonaDocumentosVarios({ destino, alSubir, disabled }: { destino?: { idCliente?: number | null; idExpediente?: number | null }; alSubir: (docs: AdjuntoDto[]) => void; disabled?: boolean }) {
  const { mostrar } = useToast();
  const [subiendo, setSubiendo] = useState(false);
  const procesar = async (ficheros: File[]) => {
    setSubiendo(true);
    try {
      const docs = await subirDocumentos(ficheros, destino);
      alSubir(docs);
      mostrar(docs.length === 1 ? "Documento adjuntado." : `${docs.length} documentos adjuntados.`);
    } catch (e) {
      mostrar(textoError(e), "error");
    } finally {
      setSubiendo(false);
    }
  };
  return <ZonaSoltar icono="📎" titulo="Documentos varios" ayuda="Arrastra aquí todos los documentos que quieras guardar (PDF o imágenes). Solo se guardan, no se leen." multiple ocupado={subiendo} disabled={disabled} alSoltar={procesar} />;
}

/** Lista de documentos ya subidos pero aún no vinculados (alta de un cliente o expediente), con opción de quitarlos. */
export function ListaPendientes({ docs, alQuitar }: { docs: { id: number; nombre: string }[]; alQuitar: (id: number) => void }) {
  if (docs.length === 0) return null;
  return (
    <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", fontSize: "0.78rem" }}>
      {docs.map((d) => (
        <span key={d.id} style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "3px 8px", borderRadius: "999px", border: "1px solid var(--border-light)", background: "var(--bg-surface-tint)" }}>
          📎 {d.nombre}
          <button type="button" title="Quitar este documento" aria-label={`Quitar ${d.nombre}`} onClick={() => alQuitar(d.id)} style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--danger)", padding: 0 }}>
            ✕
          </button>
        </span>
      ))}
    </div>
  );
}
