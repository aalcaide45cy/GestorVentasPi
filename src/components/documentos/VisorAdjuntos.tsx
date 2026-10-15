"use client";

import { useState } from "react";
import Modal from "@/components/Modal";
import { useToast } from "@/components/Toast";
import { llamar, textoError } from "@/components/comisiones/api";
import { useCarga } from "@/components/comisiones/useCarga";
import { formatDate } from "@/lib/date-utils";
import type { AdjuntoDto, TipoAdjunto } from "@/lib/servicios/adjuntos";

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

/** Lista de adjuntos de un cliente o expediente con subida, vista previa integrada y borrado. */
export default function VisorAdjuntos({ idCliente, idExpediente, titulo = "📎 Documentos adjuntos" }: Props) {
  const { mostrar } = useToast();
  const consulta = idExpediente ? `idExpediente=${idExpediente}` : `idCliente=${idCliente}`;
  const { datos, recargar } = useCarga<AdjuntoDto[]>(`/api/adjuntos?${consulta}`, []);
  const [viendo, setViendo] = useState<AdjuntoDto | null>(null);
  const [tipo, setTipo] = useState<TipoAdjunto>("otro");
  const [subiendo, setSubiendo] = useState(false);

  const subir = async (f: File | null) => {
    if (!f) return;
    setSubiendo(true);
    try {
      const r = await fetch(`/api/adjuntos?tipo=${tipo}&nombre=${encodeURIComponent(f.name)}&${consulta}`, { method: "POST", headers: { "Content-Type": f.type || "application/octet-stream" }, body: f, credentials: "same-origin" });
      if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { message?: string }).message ?? `Error ${r.status}`);
      mostrar("Documento adjuntado.");
      recargar();
    } catch (e) {
      mostrar(textoError(e), "error");
    } finally {
      setSubiendo(false);
    }
  };

  const borrar = async (a: AdjuntoDto) => {
    if (!window.confirm(`¿Quitar «${a.nombre}»? Dejará de verse, pero el fichero se conserva en la base de datos.`)) return;
    try {
      await llamar(`/api/adjuntos?id=${a.id}`, { method: "DELETE" });
      recargar();
    } catch (e) {
      mostrar(textoError(e), "error");
    }
  };

  const tipos = (Object.keys(ETIQUETA) as TipoAdjunto[]).filter((t) => t !== "foto_cliente");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
        <strong>{titulo}</strong>
        <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
          <select className="form-select" style={{ padding: "6px 8px" }} value={tipo} onChange={(e) => setTipo(e.target.value as TipoAdjunto)}>
            {tipos.map((t) => (
              <option key={t} value={t}>
                {ETIQUETA[t]}
              </option>
            ))}
          </select>
          <label className="btn btn-secondary" style={{ cursor: "pointer", padding: "6px 14px" }}>
            {subiendo ? "Subiendo…" : "+ Adjuntar"}
            <input type="file" accept="image/*,.pdf,application/pdf" style={{ display: "none" }} onChange={(e) => { void subir(e.target.files?.[0] ?? null); e.target.value = ""; }} />
          </label>
        </div>
      </div>
      {datos.length === 0 ? (
        <span style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>Sin documentos todavía.</span>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: "12px" }}>
          {datos.map((a) => (
            <div key={a.id} className="glass-panel" style={{ padding: "8px", display: "flex", flexDirection: "column", gap: "6px" }}>
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
              <button type="button" className="btn btn-secondary" style={{ padding: "2px 8px", fontSize: "0.75rem" }} onClick={() => void borrar(a)}>
                Quitar
              </button>
            </div>
          ))}
        </div>
      )}
      {viendo && <VistaPrevia adjunto={viendo} alCerrar={() => setViendo(null)} />}
    </div>
  );
}
