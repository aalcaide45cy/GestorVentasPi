"use client";

import { useEffect, useState } from "react";
import Modal from "@/components/Modal";
import { tamanoLegible } from "@/lib/biblioteca-cliente";
import type { ArchivoBibliotecaDto } from "@/lib/servicios/biblioteca";

type Vista = { tipo: "pdf" | "imagen" } | { tipo: "texto"; texto: string } | { tipo: "hoja"; hojas: { nombre: string; filas: string[][] }[] } | { tipo: "nada" } | { tipo: "error"; mensaje: string } | null;

const extension = (n: string) => n.split(".").pop()?.toLowerCase() ?? "";

/**
 * Ver un archivo de la biblioteca sin descargarlo, sea del tipo que sea: PDF con el visor del navegador, imágenes, texto y CSV tal cual, y
 * hojas de cálculo (Excel) como tabla completa con una pestaña por hoja. Lo que no se puede enseñar se ofrece para descargar. Sin límite de filas.
 */
export default function VistaPreviaBiblioteca({ archivo, local, alCerrar }: { archivo: Pick<ArchivoBibliotecaDto, "id" | "nombre" | "mime" | "tamano">; local?: File; alCerrar: () => void }) {
  const [vista, setVista] = useState<Vista>(null);
  const [hoja, setHoja] = useState(0);
  // Un archivo todavia sin guardar (el recien elegido en el equipo) se ve desde el propio navegador; un PDF necesita una direccion temporal del servidor
  const [urlLocal, setUrlLocal] = useState<string | null>(null);
  const url = local ? (urlLocal ?? "") : `/api/biblioteca?id=${archivo.id}&ver=1`;

  useEffect(() => {
    let vivo = true;
    const ext = extension(archivo.nombre);
    const poner = (v: Vista) => vivo && setVista(v);
    let objeto: string | null = null;
    void (async () => {
      try {
        if (archivo.mime === "application/pdf" || ext === "pdf") {
          if (local) {
            const r = await fetch("/api/biblioteca/previa", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/pdf" }, body: local });
            const j = (await r.json().catch(() => ({}))) as { data?: { id: string }; message?: string };
            if (!r.ok || !j.data) return poner({ tipo: "error", mensaje: j.message ?? `No se ha podido preparar la vista previa (error ${r.status}).` });
            if (vivo) setUrlLocal(`/api/biblioteca/previa?id=${j.data.id}`);
          }
          return poner({ tipo: "pdf" });
        }
        if (archivo.mime.startsWith("image/") && archivo.mime !== "image/svg+xml") {
          if (local) {
            objeto = URL.createObjectURL(local);
            if (vivo) setUrlLocal(objeto);
          }
          return poner({ tipo: "imagen" });
        }
        const leerBytes = async (): Promise<ArrayBuffer> => {
          if (local) return local.arrayBuffer();
          const r = await fetch(url, { credentials: "same-origin" });
          if (!r.ok) throw new Error(`No se ha podido abrir el archivo (error ${r.status}).`);
          return r.arrayBuffer();
        };
        if (archivo.mime.startsWith("text/") || ext === "txt" || ext === "csv") return poner({ tipo: "texto", texto: new TextDecoder().decode(await leerBytes()) });
        if (["xlsx", "xls", "xlsm", "ods"].includes(ext)) {
          const XLSX = await import("xlsx");
          const libro = XLSX.read(await leerBytes(), { type: "array" });
          const hojas = libro.SheetNames.map((nombre) => ({ nombre, filas: XLSX.utils.sheet_to_json<string[]>(libro.Sheets[nombre], { header: 1, raw: false, defval: "" }) }));
          return poner({ tipo: "hoja", hojas });
        }
        poner({ tipo: "nada" });
      } catch (e) {
        poner({ tipo: "error", mensaje: e instanceof Error ? e.message : "No se ha podido mostrar el archivo." });
      }
    })();
    return () => {
      vivo = false;
      if (objeto) URL.revokeObjectURL(objeto);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [archivo.id, archivo.nombre, archivo.mime, local]);

  const actual = vista?.tipo === "hoja" ? vista.hojas[Math.min(hoja, vista.hojas.length - 1)] : null;

  return (
    <Modal
      titulo={archivo.nombre}
      ancho="1100px"
      pie={
        <>
          {!local && (
            <a className="btn btn-secondary" href={`/api/biblioteca?id=${archivo.id}`} download={archivo.nombre}>
              ⬇️ Descargar
            </a>
          )}
          {(vista?.tipo === "pdf" || vista?.tipo === "imagen") && url && (
            <a className="btn btn-secondary" href={url} target="_blank" rel="noreferrer">
              Abrir en pestaña nueva
            </a>
          )}
          <button type="button" className="btn btn-primary" onClick={alCerrar}>
            Cerrar
          </button>
        </>
      }
    >
      {vista === null && <div style={{ color: "var(--text-muted)" }}>Abriendo…</div>}
      {vista?.tipo === "pdf" && !url && <div style={{ color: "var(--text-muted)" }}>Preparando la vista previa…</div>}
      {vista?.tipo === "pdf" && url && <iframe title={archivo.nombre} src={url} style={{ width: "100%", height: "70vh", border: "1px solid var(--border-light)", borderRadius: "var(--radius-sm)", background: "#fff" }} />}
      {vista?.tipo === "pdf" && url && <div style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>¿No se ve el documento? Pulsa «Abrir en pestaña nueva».</div>}
      {vista?.tipo === "imagen" && url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={archivo.nombre} style={{ maxWidth: "100%", maxHeight: "70vh", objectFit: "contain", alignSelf: "center", borderRadius: "var(--radius-sm)" }} />
      )}
      {vista?.tipo === "texto" && <pre style={{ margin: 0, padding: "12px", maxHeight: "70vh", overflow: "auto", whiteSpace: "pre-wrap", wordBreak: "break-word", fontSize: "0.82rem", border: "1px solid var(--border-light)", borderRadius: "var(--radius-sm)" }}>{vista.texto}</pre>}
      {vista?.tipo === "hoja" && actual && (
        <>
          {vista.hojas.length > 1 && (
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
              {vista.hojas.map((h, i) => (
                <button key={h.nombre} type="button" className={h === actual ? "btn btn-primary" : "btn btn-secondary"} style={{ padding: "4px 12px" }} onClick={() => setHoja(i)}>
                  {h.nombre} ({h.filas.length})
                </button>
              ))}
            </div>
          )}
          <div className="table-container" style={{ maxHeight: "65vh", overflow: "auto" }}>
            <table className="table-premium" style={{ fontSize: "0.8rem" }}>
              <tbody>
                {actual.filas.map((fila, i) => (
                  <tr key={i}>
                    <td style={{ color: "var(--text-muted)", textAlign: "right" }}>{i + 1}</td>
                    {fila.map((c, j) => (
                      <td key={j} style={{ whiteSpace: "nowrap" }}>
                        {String(c)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>
            Hoja «{actual.nombre}»: {actual.filas.length} fila{actual.filas.length === 1 ? "" : "s"}.
          </div>
        </>
      )}
      {vista?.tipo === "nada" && (
        <div style={{ color: "var(--text-secondary)" }}>
          Este formato ({archivo.mime || extension(archivo.nombre) || "desconocido"}, {tamanoLegible(archivo.tamano)}) no se puede mostrar dentro de la aplicación. Puedes descargarlo con el botón de abajo.
        </div>
      )}
      {vista?.tipo === "error" && <div style={{ color: "var(--danger)" }}>{vista.mensaje}</div>}
    </Modal>
  );
}
