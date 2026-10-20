"use client";

import { useEffect, useRef, useState } from "react";
import { useToast } from "@/components/Toast";
import type { AdjuntoDto } from "@/lib/servicios/adjuntos";

/**
 * El PDF (o la foto) del pedido leído, al lado de los datos, para decidir qué se aplica mirando el original. Si el fichero ya no está
 * guardado (por ejemplo, se purgó en la Papelera), lo dice y, cuando quien lo usa lo admite (`alRecargado`), deja volver a cargar el
 * archivo original: se sube de nuevo y el pedido pasa a usar ese documento.
 */
export default function VisorPedido({ idAdjunto, nombre, alRecargado }: { idAdjunto: number; nombre: string; alRecargado?: (adjunto: AdjuntoDto) => void }) {
  const { mostrar, confirmar } = useToast();
  const [idActual, setIdActual] = useState(idAdjunto);
  const [estado, setEstado] = useState<"comprobando" | "ok" | "falta">("comprobando");
  const [subiendo, setSubiendo] = useState(false);
  const entrada = useRef<HTMLInputElement>(null);

  // Se mira si el fichero sigue guardado antes de enseñarlo (un iframe con un 404 sale en blanco y no dice por qué)
  useEffect(() => {
    let vivo = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEstado("comprobando");
    fetch(`/api/adjuntos?id=${idActual}`, { method: "HEAD", credentials: "same-origin", cache: "no-store" })
      .then((r) => vivo && setEstado(r.ok ? "ok" : r.status === 404 ? "falta" : "ok"))
      .catch(() => vivo && setEstado("ok"));
    return () => {
      vivo = false;
    };
  }, [idActual]);

  const recargar = async (f: File | undefined) => {
    if (!f) return;
    // Si el nombre no coincide con el del pedido, se avisa por si se ha elegido otro fichero sin querer
    const mismo = f.name.replace(/\.[^.]+$/, "").toLowerCase() === nombre.replace(/\.[^.]+$/, "").toLowerCase();
    if (!mismo && !await confirmar({ texto: `El archivo elegido se llama «${f.name}» y el pedido leído era «${nombre}». ¿Es el mismo pedido?` })) return;
    setSubiendo(true);
    try {
      const r = await fetch(`/api/adjuntos?tipo=pedido&nombre=${encodeURIComponent(f.name)}`, { method: "POST", headers: { "Content-Type": f.type || "application/octet-stream" }, body: f, credentials: "same-origin" });
      const json = (await r.json().catch(() => ({}))) as { data?: AdjuntoDto; message?: string };
      if (!r.ok || !json.data) throw new Error(json.message ?? "No se pudo subir el archivo");
      setIdActual(json.data.id);
      alRecargado?.(json.data);
      mostrar("Archivo cargado otra vez: el pedido vuelve a tener su documento.");
    } catch (e) {
      mostrar(e instanceof Error ? e.message : "No se pudo subir el archivo", "error");
    } finally {
      setSubiendo(false);
      if (entrada.current) entrada.current.value = "";
    }
  };

  const botonRecargar = alRecargado ? (
    <>
      <input ref={entrada} type="file" accept=".pdf,image/*,application/pdf" style={{ display: "none" }} onChange={(e) => void recargar(e.target.files?.[0])} />
      <button type="button" className="btn btn-secondary" style={{ padding: "3px 10px", fontSize: "0.8rem" }} disabled={subiendo} onClick={() => entrada.current?.click()} title="Elige otra vez el archivo del pedido (el PDF o la foto que se leyó) para que vuelva a verse y se guarde con el expediente">
        {subiendo ? "Subiendo…" : "📎 Volver a cargar el archivo"}
      </button>
    </>
  ) : null;

  return (
    <div style={{ flex: "1.2 1 0", minWidth: 0, display: "flex", flexDirection: "column", gap: "6px", position: "sticky", top: 0 }}>
      <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", display: "flex", justifyContent: "space-between", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
        <span>📄 {nombre}</span>
        <span style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          {estado === "ok" && botonRecargar}
          {estado !== "falta" && (
            <a href={`/api/adjuntos?id=${idActual}`} target="_blank" rel="noreferrer" style={{ color: "var(--primary)" }}>
              Abrir en otra pestaña
            </a>
          )}
        </span>
      </div>
      {estado === "falta" ? (
        <div style={{ height: "72vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "12px", textAlign: "center", padding: "24px", border: "1px dashed var(--border-light)", borderRadius: "var(--radius-sm)", color: "var(--text-secondary)" }}>
          <div style={{ fontSize: "2rem" }}>🗃️</div>
          <strong>El archivo de este pedido ya no está guardado</strong>
          <span style={{ fontSize: "0.88rem", lineHeight: 1.5 }}>Seguramente se purgó desde Configuración › BBDD › Papelera. Los datos leídos siguen aquí, pero el PDF no se puede enseñar.{alRecargado ? " Si todavía lo tienes, puedes volver a cargarlo." : ""}</span>
          {botonRecargar}
        </div>
      ) : (
        <iframe src={`/api/adjuntos?id=${idActual}`} title={`Pedido ${nombre}`} style={{ width: "100%", height: "72vh", border: "1px solid var(--border-light)", borderRadius: "var(--radius-sm)", background: "#fff", opacity: estado === "comprobando" ? 0.4 : 1 }} />
      )}
    </div>
  );
}
