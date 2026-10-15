"use client";

import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/Toast";
import { llamar, textoError } from "@/components/comisiones/api";

interface Estado {
  disponible: boolean;
  version: string;
  estado: "inactiva" | "en-curso" | "terminada" | "fallida" | string;
  registro: string[];
}

/** «Actualizar la aplicación»: lanza desde aquí la actualización a la última versión (espera a GitHub y la instala sola). */
export default function PanelActualizar() {
  const { mostrar } = useToast();
  const [info, setInfo] = useState<Estado | null>(null);
  const [pidiendo, setPidiendo] = useState(false);

  const leer = useCallback(async () => {
    try {
      const { data } = await llamar<Estado>("/api/admin/actualizar");
      setInfo(data);
      return data;
    } catch {
      // Mientras se reinicia la aplicación no responde: se sigue esperando sin avisar de error
      return null;
    }
  }, []);

  useEffect(() => {
    let vivo = true;
    llamar<Estado>("/api/admin/actualizar")
      .then((r) => vivo && setInfo(r.data))
      .catch((e: unknown) => vivo && mostrar(textoError(e), "error"));
    return () => {
      vivo = false;
    };
  }, [mostrar]);

  // Mientras hay una actualización en curso se consulta el avance cada 5 s
  const enCurso = pidiendo || info?.estado === "en-curso";
  useEffect(() => {
    if (!enCurso) return;
    const t = setInterval(() => void leer(), 5000);
    return () => clearInterval(t);
  }, [enCurso, leer]);

  const lanzar = async () => {
    if (!window.confirm("¿Buscar e instalar la última versión?\n\nSi GitHub todavía la está construyendo, se espera a que termine y se instala sola. Se hace una copia de seguridad antes. Durante la instalación la aplicación puede dejar de responder uno o dos minutos.")) return;
    setPidiendo(true);
    try {
      await llamar("/api/admin/actualizar", { method: "POST", cuerpo: { confirmar: true } });
      mostrar("Actualización solicitada. Puedes seguir usando la aplicación mientras se espera a GitHub.");
      setTimeout(() => void leer().finally(() => setPidiendo(false)), 3000);
    } catch (e) {
      mostrar(textoError(e), "error");
      setPidiendo(false);
    }
  };

  const colorEstado = info?.estado === "fallida" ? "var(--danger)" : info?.estado === "terminada" ? "var(--success)" : "var(--info)";
  const textoEstado: Record<string, string> = { "en-curso": "⏳ Actualización en curso…", terminada: "✅ La última actualización terminó correctamente", fallida: "❌ La última actualización falló (tus datos están intactos; la copia previa está en «Copias de seguridad»)" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      <h3 style={{ fontSize: "1.15rem" }}>🔄 Actualizar la aplicación</h3>
      <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", margin: 0, lineHeight: 1.5 }}>
        Versión instalada: <strong>v{info?.version ?? "…"}</strong>. Equivale a la opción «Actualizar a la última versión» del asistente de la Raspberry: mira si hay una versión nueva en GitHub, espera a que termine de construirse, la descarga y la instala (con copia de seguridad previa).
      </p>
      {info && !info.disponible ? (
        <div style={{ padding: "12px 14px", borderLeft: "4px solid var(--warning)", background: "var(--bg-surface-tint)", fontSize: "0.88rem" }}>
          Esta función se activa al instalar la versión 1.0.3 o posterior con el instalador (o con «sudo gv actualizar» por SSH, que además la deja activada). Hasta entonces, actualiza desde el asistente por SSH.
        </div>
      ) : (
        <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
          <button type="button" className="btn btn-primary" disabled={enCurso || !info} onClick={() => void lanzar()} title="Busca la última versión en GitHub, espera a que termine de construirse y la instala sola">
            {enCurso ? "Actualizando…" : "🔄 Buscar e instalar la última versión"}
          </button>
          {info && textoEstado[info.estado] && <span style={{ fontSize: "0.88rem", color: colorEstado, fontWeight: 600 }}>{textoEstado[info.estado]}</span>}
        </div>
      )}
      {info && info.registro.length > 0 && (
        <pre style={{ margin: 0, padding: "12px", maxHeight: "220px", overflow: "auto", fontSize: "0.78rem", background: "var(--bg-surface-tint)", border: "1px solid var(--border-light)", borderRadius: "var(--radius-sm)", whiteSpace: "pre-wrap" }}>{info.registro.join("\n")}</pre>
      )}
      {info?.estado === "terminada" && (
        <div style={{ fontSize: "0.85rem" }}>
          Para cargar la versión nueva pulsa <strong>Ctrl+F5</strong> en el navegador.{" "}
          <button type="button" className="btn btn-secondary" style={{ padding: "4px 10px", fontSize: "0.8rem" }} onClick={() => window.location.reload()}>
            Recargar ahora
          </button>
        </div>
      )}
    </div>
  );
}
