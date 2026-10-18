"use client";

import { permitirDuplicadosAhora } from "@/lib/preferencias";
import { nuevoControladorLectura } from "@/lib/pedidos-cola";
import { useState } from "react";
import { useToast } from "@/components/Toast";
import { textoError } from "@/components/comisiones/api";
import type { AdjuntoDto } from "@/lib/servicios/adjuntos";
import type { ResultadoDni, ResultadoPedido } from "@/lib/servicios/documentos";
import ZonaSoltar from "./ZonaSoltar";

type Tipo = "dni" | "pedido";

/** Lo que sale de leer un fichero que puede ser un pedido o un DNI: el servidor lo reconoce y lo lee como corresponda. */
type Detectado = { tipo: "dni"; resultado: ResultadoDni } | { tipo: "pedido"; resultado: ResultadoPedido };

/** Sube un fichero al servidor, que reconoce si es un pedido o un DNI y lo lee con OCR local. `aceptar` limita lo que se admite. */
async function leerFichero(f: File, aceptar: Tipo[]): Promise<Detectado> {
  // La lectura se puede cancelar desde la cola o desde el cuadro de arrastrar
  const controlador = nuevoControladorLectura();
  const senal = AbortSignal.any([AbortSignal.timeout(285_000), controlador.signal]);
  const r = await fetch(`/api/documentos/leer?tipo=auto&aceptar=${aceptar.join(",")}&nombre=${encodeURIComponent(f.name)}${permitirDuplicadosAhora() ? "&duplicados=permitir" : ""}`, { method: "POST", headers: { "Content-Type": f.type || "application/octet-stream" }, body: f, credentials: "same-origin", signal: senal }).catch((e: unknown) => {
    if (controlador.signal.aborted) throw new Error("Lectura cancelada");
    throw new Error(e instanceof DOMException && e.name === "TimeoutError" ? "La lectura ha tardado demasiado. Prueba con otro documento o rellena los datos a mano." : "No se pudo contactar con el servidor.");
  });
  const json = (await r.json().catch(() => ({}))) as { message?: string; data?: Detectado };
  if (!r.ok || !json.data) throw new Error(json.message ?? `Error ${r.status}`);
  return json.data;
}

/** Lee un pedido (PDF o foto) en el servidor y devuelve sus datos; el fichero queda como adjunto pendiente. */
export async function leerPedidoDeFichero(f: File): Promise<ResultadoPedido> {
  const r = await leerFichero(f, ["pedido"]);
  return r.resultado as ResultadoPedido;
}

/** Lee un DNI (anverso y reverso, foto o PDF) en el servidor: lo guarda como adjunto pendiente y recorta la foto del cliente. */
export async function leerDniDeFichero(f: File): Promise<ResultadoDni> {
  const r = await leerFichero(f, ["dni"]);
  return r.resultado as ResultadoDni;
}

/** Dice si un fichero es un pedido, un DNI u otra cosa, sin guardarlo. */
export async function clasificarFichero(f: File): Promise<"pedido" | "dni" | "otro"> {
  const r = await fetch(`/api/documentos/leer?tipo=clasificar&nombre=${encodeURIComponent(f.name)}`, { method: "POST", headers: { "Content-Type": f.type || "application/octet-stream" }, body: f, credentials: "same-origin", signal: AbortSignal.timeout(120_000) });
  const json = (await r.json().catch(() => ({}))) as { message?: string; data?: { tipo: "pedido" | "dni" | "otro" } };
  if (!r.ok || !json.data) throw new Error(json.message ?? `Error ${r.status}`);
  return json.data.tipo;
}

interface Props {
  titulo: string;
  ayuda: string;
  icono: string;
  /** Qué se hace con un DNI leído; sin esto, esta casilla no admite DNI. */
  alLeerDni?: (resultado: ResultadoDni) => void | Promise<void>;
  /** Qué se hace con un pedido leído; sin esto, esta casilla no admite pedidos. */
  alLeerPedido?: (resultado: ResultadoPedido) => void | Promise<void>;
  disabled?: boolean;
  compacta?: boolean;
}

/**
 * Cuadro para arrastrar un DNI o un pedido, da igual cuál: el servidor reconoce de qué se trata y cada fichero va a su sitio (el
 * pedido a los datos del expediente, el DNI a sus documentos y a la foto del cliente). Se admiten varios a la vez.
 */
function ZonaLeer({ titulo, ayuda, icono, alLeerDni, alLeerPedido, disabled, compacta }: Props) {
  const { mostrar } = useToast();
  const [leyendo, setLeyendo] = useState(false);
  const aceptar: Tipo[] = [...(alLeerDni ? (["dni"] as const) : []), ...(alLeerPedido ? (["pedido"] as const) : [])];

  const procesar = async (ficheros: File[]) => {
    setLeyendo(true);
    const errores: string[] = [];
    try {
      // Se leen uno tras otro y los datos se van completando (anverso y reverso en ficheros distintos, o el pedido y su DNI)
      for (const f of ficheros) {
        try {
          const r = await leerFichero(f, aceptar);
          if (r.tipo === "dni") await alLeerDni?.(r.resultado);
          else await alLeerPedido?.(r.resultado);
        } catch (e) {
          errores.push(ficheros.length > 1 ? `${f.name}: ${textoError(e)}` : textoError(e));
        }
      }
    } finally {
      setLeyendo(false);
    }
    if (errores.length > 0) mostrar(errores.join(" · "), "error");
  };

  return <ZonaSoltar icono={icono} titulo={titulo} ayuda={ayuda} multiple ocupado={leyendo} disabled={disabled} compacta={compacta} alSoltar={procesar} />;
}

type PropsPublicas = { etiqueta?: string; disabled?: boolean; compacta?: boolean };

const AYUDA_AMBOS = "Arrastra aquí el pedido o el DNI, da igual cuál: la aplicación reconoce de qué se trata. Puedes soltar los dos a la vez. El pedido rellena los datos de la venta y el DNI se guarda como documento y de él se recorta la foto del cliente.";

/** Casilla de DNI: si se le da también `alLeerPedido`, admite igualmente un pedido. */
export const BotonLeerDni = (p: PropsPublicas & { alLeer: (r: ResultadoDni) => void | Promise<void>; alLeerPedido?: (r: ResultadoPedido) => void | Promise<void> }) => (
  <ZonaLeer icono="🪪" titulo={p.etiqueta ?? (p.alLeerPedido ? "Leer DNI o pedido" : "Leer DNI")} ayuda={p.alLeerPedido ? AYUDA_AMBOS : "Arrastra la foto o el PDF del DNI (puedes soltar anverso y reverso a la vez). Se guarda el documento y la foto del cliente; los datos no se rellenan."} alLeerDni={p.alLeer} alLeerPedido={p.alLeerPedido} disabled={p.disabled} compacta={p.compacta} />
);
/** Casilla de pedido: si se le da también `alLeerDni`, admite igualmente un DNI. */
export const BotonLeerPedido = (p: PropsPublicas & { alLeer: (r: ResultadoPedido) => void | Promise<void>; alLeerDni?: (r: ResultadoDni) => void | Promise<void> }) => (
  <ZonaLeer icono="📄" titulo={p.etiqueta ?? (p.alLeerDni ? "Leer pedido o DNI" : "Leer pedido")} ayuda={p.alLeerDni ? AYUDA_AMBOS : "Arrastra el pedido (PDF o foto). Se lee en este equipo y rellena los datos del cliente y del expediente."} alLeerPedido={p.alLeer} alLeerDni={p.alLeerDni} disabled={p.disabled} compacta={p.compacta} />
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
  return <ZonaSoltar icono="📎" titulo="Documentos varios" ayuda="Arrastra aquí todos los documentos que quieras guardar (PDF o imágenes). Solo se guardan, no se leen." multiple ocupado={subiendo} disabled={disabled} compacta alSoltar={procesar} />;
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
