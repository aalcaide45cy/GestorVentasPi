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
export default function VistaPreviaBiblioteca({ archivo, alCerrar }: { archivo: Pick<ArchivoBibliotecaDto, "id" | "nombre" | "mime" | "tamano">; alCerrar: () => void }) {
  const [vista, setVista] = useState<Vista>(null);
  const [hoja, setHoja] = useState(0);
  const url = `/api/biblioteca?id=${archivo.id}&ver=1`;

  useEffect(() => {
    let vivo = true;
    const ext = extension(archivo.nombre);
    const poner = (v: Vista) => vivo && setVista(v);
    void (async () => {
      try {
        if (archivo.mime === "application/pdf" || ext === "pdf") return poner({ tipo: "pdf" });
        if (archivo.mime.startsWith("image/") && archivo.mime !== "image/svg+xml") return poner({ tipo: "imagen" });
        const r = await fetch(url, { credentials: "same-origin" });
        if (!r.ok) return poner({ tipo: "error", mensaje: `No se ha podido abrir el archivo (error ${r.status}).` });
        if (archivo.mime.startsWith("text/") || ext === "txt" || ext === "csv") return poner({ tipo: "texto", texto: await r.text() });
        if (["xlsx", "xls", "xlsm", "ods"].includes(ext)) {
          const XLSX = await import("xlsx");
          const libro = XLSX.read(await r.arrayBuffer(), { type: "array" });
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
    };
  }, [archivo.id, archivo.nombre, archivo.mime, url]);

  const actual = vista?.tipo === "hoja" ? vista.hojas[Math.min(hoja, vista.hojas.length - 1)] : null;

  return (
    <Modal
      titulo={archivo.nombre}
      ancho="1100px"
      pie={
        <>
          <a className="btn btn-secondary" href={`/api/biblioteca?id=${archivo.id}`} download={archivo.nombre}>
            ⬇️ Descargar
          </a>
          {(vista?.tipo === "pdf" || vista?.tipo === "imagen") && (
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
      {vista?.tipo === "pdf" && <iframe title={archivo.nombre} src={url} style={{ width: "100%", height: "70vh", border: "1px solid var(--border-light)", borderRadius: "var(--radius-sm)", background: "#fff" }} />}
      {vista?.tipo === "imagen" && (
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
