"use client";

import { useState } from "react";
import { useToast } from "@/components/Toast";
import { llamar, textoError } from "@/components/comisiones/api";
import type { ResultadoRepetidos } from "@/lib/servicios/contenidos";

const mb = (bytes: number) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toLocaleString("es-ES", { maximumFractionDigits: 1 })} MB` : `${Math.round(bytes / 1024).toLocaleString("es-ES")} KB`);

/** Documentos repetidos: el mismo archivo guardado más de una vez (el pedido del expediente y su copia en la biblioteca, por ejemplo). */
export default function PanelDocumentosRepetidos() {
  const { mostrar, confirmar } = useToast();
  const [r, setR] = useState<ResultadoRepetidos | null>(null);
  const [ocupado, setOcupado] = useState<"ver" | "quitar" | null>(null);
  const [hecho, setHecho] = useState<ResultadoRepetidos | null>(null);

  const llamarA = async (accion: "ver" | "quitar") => {
    setOcupado(accion);
    try {
      const d = (await llamar<ResultadoRepetidos>("/api/admin/documentos/repetidos", { method: "POST", cuerpo: { accion } })).data;
      if (accion === "ver") {
        setR(d);
        setHecho(null);
      } else {
        setHecho(d);
        setR(null);
        mostrar(`Listo: ${d.copiasSobrantes} copia(s) repetida(s) quitadas, ${mb(d.bytesLiberados)} liberados.`);
      }
    } catch (e) {
      mostrar(textoError(e), "error");
    } finally {
      setOcupado(null);
    }
  };

  const quitar = async () => {
    if (!r) return;
    if (!(await confirmar({ texto: `Se van a quitar ${r.copiasSobrantes} copia(s) repetida(s) de ${r.grupos} documento(s) y se liberan unos ${mb(r.bytesLiberados)}.\n\nAntes se hace una copia de seguridad completa (la verás en «Copias de seguridad»). No se cambia ni un byte de los archivos: cada documento sigue donde estaba, pero guardado una sola vez. Las rejillas no se tocan. ¿Continuar?` }))) return;
    await llamarA("quitar");
  };

  return (
    <div className="glass-panel" style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: "10px", border: "1px solid var(--border-light)" }}>
      <div>
        <h4 style={{ fontSize: "1rem", margin: "0 0 4px 0" }}>📄 Documentos repetidos</h4>
        <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem", margin: 0, lineHeight: 1.5 }}>
          Cada pedido que se lee se guarda en el expediente y otra vez en la biblioteca, y un mismo PDF subido dos veces ocupa el doble. Aquí se deja cada archivo guardado <b>una sola vez</b>, sin tocar el documento ni reducir su calidad. Las rejillas no se tocan nunca. Lo que se guarde a partir de ahora ya no se repite.
        </p>
      </div>
      <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
        <button type="button" className="btn btn-secondary" disabled={ocupado !== null} onClick={() => void llamarA("ver")} style={{ padding: "6px 14px" }}>
          {ocupado === "ver" ? "Mirando…" : "🔍 Ver cuántos hay"}
        </button>
        {r && r.copiasSobrantes > 0 && (
          <button type="button" className="btn btn-primary" disabled={ocupado !== null} onClick={() => void quitar()} style={{ padding: "6px 14px" }}>
            {ocupado === "quitar" ? "Quitando…" : `🧹 Quitar ${r.copiasSobrantes} copia(s) repetida(s) (${mb(r.bytesLiberados)})`}
          </button>
        )}
      </div>
      {r && (
        <div style={{ fontSize: "0.88rem", color: r.copiasSobrantes > 0 ? "var(--warning)" : "var(--success)" }}>
          {r.copiasSobrantes > 0 ? `Hay ${r.grupos} documento(s) repetidos: sobran ${r.copiasSobrantes} copia(s) y se liberarían unos ${mb(r.bytesLiberados)}.` : "No hay documentos repetidos."}
        </div>
      )}
      {hecho && <div style={{ fontSize: "0.88rem", color: "var(--success)" }}>✔ Hecho: {hecho.grupos} documento(s) guardados una sola vez; se han liberado unos {mb(hecho.bytesLiberados)}.</div>}
    </div>
  );
}
