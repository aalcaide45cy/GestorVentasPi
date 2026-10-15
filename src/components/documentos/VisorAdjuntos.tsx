"use client";

import { useMemo, useState } from "react";
import Modal from "@/components/Modal";
import { useToast } from "@/components/Toast";
import { llamar, textoError } from "@/components/comisiones/api";
import { useCarga } from "@/components/comisiones/useCarga";
import { formatDate } from "@/lib/date-utils";
import type { AdjuntoDto, TipoAdjunto } from "@/lib/servicios/adjuntos";
import { ZonaDocumentosVarios } from "./BotonLeerDocumento";

const ETIQUETA: Record<TipoAdjunto, string> = {
  dni_frente: "DNI (anverso)",
  dni_reverso: "DNI (reverso)",
  pedido: "Pedido",
  foto_cliente: "Foto del cliente",
  otro: "Otro documento",
};

const kb = (b: number) => (b >= 1048576 ? `${(b / 1048576).toLocaleString("es-ES", { maximumFractionDigits: 1 })} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

/** Vista previa de un adjunto sin descargarlo: imágenes en pantalla y PDF con el visor del navegador. */
export function VistaPrevia({ adjunto, alCerrar }: { adjunto: Pick<AdjuntoDto, "id" | "nombre" | "mime">; alCerrar: () => void }) {
  const esPdf = adjunto.mime === "application/pdf";
  return (
    <Modal
      titulo={adjunto.nombre}
      ancho="980px"
      pie={
        <>
          <a className="btn btn-secondary" href={`/api/adjuntos?id=${adjunto.id}`} target="_blank" rel="noreferrer">
            Abrir en pestaña nueva
          </a>
          <button type="button" className="btn btn-primary" onClick={alCerrar}>
            Cerrar
          </button>
        </>
      }
    >
      {esPdf ? (
        <iframe title={adjunto.nombre} src={`/api/adjuntos?id=${adjunto.id}`} style={{ width: "100%", height: "70vh", border: "1px solid var(--border-light)", borderRadius: "var(--radius-sm)", background: "#fff" }} />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/api/adjuntos?id=${adjunto.id}`} alt={adjunto.nombre} style={{ maxWidth: "100%", maxHeight: "70vh", objectFit: "contain", alignSelf: "center", borderRadius: "var(--radius-sm)" }} />
      )}
    </Modal>
  );
}

interface Props {
  idCliente?: number;
  idExpediente?: number;
  titulo?: string;
}

const normalizar = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Lista de adjuntos de un cliente o expediente: subida (también arrastrando), búsqueda por nombre, vista previa y borrado (uno o varios). */
export default function VisorAdjuntos({ idCliente, idExpediente, titulo = "📎 Documentos adjuntos" }: Props) {
  const { mostrar } = useToast();
  const consulta = idExpediente ? `idExpediente=${idExpediente}` : `idCliente=${idCliente}`;
  const destino = idExpediente ? { idExpediente } : { idCliente };
  const { datos, recargar } = useCarga<AdjuntoDto[]>(`/api/adjuntos?${consulta}`, []);
  const [viendo, setViendo] = useState<AdjuntoDto | null>(null);
  const [tipo, setTipo] = useState<TipoAdjunto>("otro");
  const [subiendo, setSubiendo] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [marcados, setMarcados] = useState<Set<number>>(new Set());
  const [borrando, setBorrando] = useState(false);

  const visibles = useMemo(() => {
    const q = normalizar(busqueda.trim());
    return q ? datos.filter((a) => normalizar(a.nombre).includes(q) || normalizar(ETIQUETA[a.tipo]).includes(q)) : datos;
  }, [datos, busqueda]);

  const subir = async (ficheros: File[]) => {
    setSubiendo(true);
    try {
      // Con el tipo elegido en el desplegable (DNI, pedido…); cada fichero queda ligado a este cliente o expediente
      for (const f of ficheros) {
        const r = await fetch(`/api/adjuntos?tipo=${tipo}&nombre=${encodeURIComponent(f.name)}&${consulta}`, { method: "POST", headers: { "Content-Type": f.type || "application/octet-stream" }, body: f, credentials: "same-origin" });
        if (!r.ok) throw new Error(`${f.name}: ${((await r.json().catch(() => ({}))) as { message?: string }).message ?? `error ${r.status}`}`);
      }
      mostrar(ficheros.length === 1 ? "Documento adjuntado." : `${ficheros.length} documentos adjuntados.`);
      recargar();
    } catch (e) {
      mostrar(textoError(e), "error");
    } finally {
      setSubiendo(false);
    }
  };

  const alternar = (id: number) =>
    setMarcados((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const eliminar = async (lista: AdjuntoDto[]) => {
    if (lista.length === 0) return;
    const texto = lista.length === 1 ? `¿Quitar «${lista[0].nombre}»?` : `¿Quitar ${lista.length} documentos?`;
    if (!window.confirm(`${texto} Dejarán de verse, pero los ficheros se conservan en la base de datos.`)) return;
    setBorrando(true);
    let fallos = 0;
    for (const a of lista) {
      try {
        await llamar(`/api/adjuntos?id=${a.id}`, { method: "DELETE" });
      } catch (e) {
        fallos++;
        mostrar(textoError(e), "error");
      }
    }
    setBorrando(false);
    setMarcados(new Set());
    if (fallos < lista.length) mostrar(lista.length === 1 ? "Documento quitado." : `${lista.length - fallos} documentos quitados.`);
    recargar();
  };

  const tipos = (Object.keys(ETIQUETA) as TipoAdjunto[]).filter((t) => t !== "foto_cliente");
  const seleccionados = datos.filter((a) => marcados.has(a.id));
  const todosMarcados = visibles.length > 0 && visibles.every((a) => marcados.has(a.id));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
        <strong>
          {titulo} {datos.length > 0 && <span style={{ color: "var(--text-muted)", fontWeight: 500 }}>({datos.length})</span>}
        </strong>
        <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
          <select className="form-select" style={{ padding: "6px 8px" }} value={tipo} onChange={(e) => setTipo(e.target.value as TipoAdjunto)} title="Tipo con el que se guardarán los documentos que adjuntes con el botón">
            {tipos.map((t) => (
              <option key={t} value={t}>
                {ETIQUETA[t]}
              </option>
            ))}
          </select>
          <label className="btn btn-secondary" style={{ cursor: subiendo ? "wait" : "pointer", padding: "6px 14px" }} title="Elige uno o varios archivos de tu equipo">
            {subiendo ? "Subiendo…" : "+ Adjuntar"}
            <input
              type="file"
              multiple
              accept="image/*,.pdf,application/pdf"
              style={{ display: "none" }}
              disabled={subiendo}
              onChange={(e) => {
                void subir(Array.from(e.target.files ?? []));
                e.target.value = "";
              }}
            />
          </label>
        </div>
      </div>

      <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
        <ZonaDocumentosVarios destino={destino} alSubir={() => recargar()} />
      </div>

      {datos.length > 0 && (
        <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
          <input
            type="search"
            name="buscar-documento"
            autoComplete="off"
            className="form-input"
            placeholder="🔎 Buscar documento por nombre…"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            style={{ flex: "1 1 200px", padding: "6px 10px" }}
            title="Escribe parte del nombre (o del tipo) para filtrar los documentos"
          />
          <button type="button" className="btn btn-secondary" style={{ padding: "6px 12px", fontSize: "0.8rem" }} onClick={() => setMarcados(todosMarcados ? new Set() : new Set(visibles.map((a) => a.id)))} title="Marca o desmarca todos los documentos que se ven">
            {todosMarcados ? "☐ Quitar marcas" : "☑ Seleccionar todos"}
          </button>
          {seleccionados.length > 0 && (
            <>
              <button type="button" className="btn btn-secondary" style={{ padding: "6px 12px", fontSize: "0.8rem" }} onClick={() => setMarcados(new Set())} title="Deja de seleccionar">
                ✖ Cancelar selección
              </button>
              <button type="button" className="btn btn-secondary" disabled={borrando} style={{ padding: "6px 12px", fontSize: "0.8rem", color: "var(--danger)", borderColor: "var(--danger)" }} onClick={() => void eliminar(seleccionados)} title="Quita los documentos marcados">
                {borrando ? "Quitando…" : `🗑 Eliminar seleccionados (${seleccionados.length})`}
              </button>
            </>
          )}
        </div>
      )}

      {datos.length === 0 ? (
        <span style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>Sin documentos todavía.</span>
      ) : visibles.length === 0 ? (
        <span style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>Ningún documento coincide con «{busqueda}».</span>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: "12px" }}>
          {visibles.map((a) => {
            const marcado = marcados.has(a.id);
            return (
              <div key={a.id} className="glass-panel" style={{ padding: "8px", display: "flex", flexDirection: "column", gap: "6px", position: "relative", outline: marcado ? "2px solid var(--primary)" : "none" }}>
                <input
                  type="checkbox"
                  checked={marcado}
                  onChange={() => alternar(a.id)}
                  aria-label={`Seleccionar ${a.nombre}`}
                  title="Seleccionar este documento"
                  style={{ position: "absolute", top: "12px", left: "12px", width: "18px", height: "18px", accentColor: "var(--primary)", zIndex: 1, cursor: "pointer" }}
                />
                <button type="button" onClick={() => setViendo(a)} title="Ver" style={{ border: "none", background: "transparent", cursor: "zoom-in", padding: 0 }}>
                  {a.tieneMiniatura ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`/api/adjuntos?id=${a.id}&miniatura=1`} alt={a.nombre} style={{ width: "100%", height: "100px", objectFit: "cover", borderRadius: "4px", display: "block" }} />
                  ) : (
                    <div style={{ height: "100px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "2.2rem", background: "var(--bg-card)", borderRadius: "4px" }}>📄</div>
                  )}
                </button>
                <div style={{ fontSize: "0.8rem", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={a.nombre}>
                  {a.nombre}
                </div>
                <div style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
                  {ETIQUETA[a.tipo]} · {kb(a.tamano)} · {formatDate(a.creadoEn.slice(0, 10))}
                </div>
                <button type="button" className="btn btn-secondary" style={{ padding: "2px 8px", fontSize: "0.75rem" }} onClick={() => void eliminar([a])}>
                  Quitar
                </button>
              </div>
            );
          })}
        </div>
      )}
      {viendo && <VistaPrevia adjunto={viendo} alCerrar={() => setViendo(null)} />}
    </div>
  );
}
