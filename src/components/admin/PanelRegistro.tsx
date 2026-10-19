"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "@/components/Toast";
import { llamar, textoError } from "@/components/comisiones/api";

/** «Registro del servidor»: lo que el programa va anotando (errores, avisos, restauraciones…), para verlo, copiarlo o descargarlo. */
export default function PanelRegistro() {
  const { mostrar } = useToast();
  const [entradas, setEntradas] = useState<string[]>([]);
  const [bytes, setBytes] = useState(0);
  const [nivel, setNivel] = useState<"todo" | "avisos" | "errores">("avisos");
  const [texto, setTexto] = useState("");
  const [lineas, setLineas] = useState(300);
  const [auto, setAuto] = useState(false);
  const [cargando, setCargando] = useState(false);
  const caja = useRef<HTMLPreElement>(null);
  const alFinal = useRef(true);

  const leer = useCallback(async () => {
    setCargando(true);
    try {
      const q = new URLSearchParams({ lineas: String(lineas), nivel });
      if (texto.trim()) q.set("q", texto.trim());
      const { data } = await llamar<{ entradas: string[]; bytes: number }>(`/api/admin/registro?${q.toString()}`);
      setEntradas(data.entradas);
      setBytes(data.bytes);
    } catch (e) {
      mostrar(textoError(e), "error");
    } finally {
      setCargando(false);
    }
  }, [lineas, nivel, texto, mostrar]);

  useEffect(() => {
    const t = setTimeout(() => void leer(), 250);
    return () => clearTimeout(t);
  }, [leer]);

  useEffect(() => {
    if (!auto) return;
    const t = setInterval(() => void leer(), 5000);
    return () => clearInterval(t);
  }, [auto, leer]);

  // Si estabas leyendo lo último, al llegar líneas nuevas se baja solo
  useEffect(() => {
    const c = caja.current;
    if (c && alFinal.current) c.scrollTop = c.scrollHeight;
  }, [entradas]);

  const contenido = entradas.join("\n");

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(contenido);
      mostrar(`Copiado: ${entradas.length} entradas del registro.`);
    } catch {
      // Sin permiso del portapapeles (por ejemplo, sin https): se deja el texto seleccionado para copiarlo a mano
      const c = caja.current;
      if (c) {
        const r = document.createRange();
        r.selectNodeContents(c);
        const s = window.getSelection();
        s?.removeAllRanges();
        s?.addRange(r);
      }
      mostrar("No se pudo copiar solo: el texto ha quedado seleccionado, pulsa Ctrl+C.", "aviso");
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      <div>
        <h3 style={{ fontSize: "1.15rem", marginBottom: "8px" }}>📜 Registro del servidor</h3>
        <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", lineHeight: 1.5, margin: 0 }}>
          Lo que el programa va anotando mientras funciona: errores, avisos y sucesos importantes (por ejemplo, por qué falló una restauración). Sirve para copiar y pegar el detalle de un problema. Se conserva al reiniciar y se rota solo al llegar a 5 MB.
        </p>
      </div>
      <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
        <select className="form-input" value={nivel} onChange={(e) => setNivel(e.target.value as typeof nivel)} style={{ padding: "6px 10px", fontSize: "0.85rem" }} title="Qué niveles se ven: todo, solo avisos y errores, o solo errores">
          <option value="todo">Todo</option>
          <option value="avisos">Avisos y errores</option>
          <option value="errores">Solo errores</option>
        </select>
        <input className="form-input" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="🔎 Buscar en el registro…" style={{ flex: "1 1 200px", minWidth: "160px", padding: "6px 10px", fontSize: "0.85rem" }} />
        <select className="form-input" value={lineas} onChange={(e) => setLineas(Number(e.target.value))} style={{ padding: "6px 10px", fontSize: "0.85rem" }} title="Cuántas entradas, las más recientes">
          {[100, 300, 1000, 3000].map((n) => (
            <option key={n} value={n}>
              Últimas {n}
            </option>
          ))}
        </select>
        <label style={{ display: "flex", gap: "6px", alignItems: "center", fontSize: "0.85rem", cursor: "pointer" }} title="Vuelve a leer el registro cada 5 segundos">
          <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} style={{ accentColor: "var(--primary)" }} />
          Actualizar solo
        </label>
        <button type="button" className="btn btn-secondary" style={{ padding: "6px 12px", fontSize: "0.85rem" }} disabled={cargando} onClick={() => void leer()}>
          {cargando ? "Leyendo…" : "🔄 Actualizar"}
        </button>
        <button type="button" className="btn btn-primary" style={{ padding: "6px 12px", fontSize: "0.85rem" }} disabled={entradas.length === 0} onClick={() => void copiar()} title="Copia al portapapeles lo que ves en pantalla (con el filtro aplicado) para pegarlo donde haga falta">
          📋 Copiar
        </button>
        <a className="btn btn-secondary" style={{ padding: "6px 12px", fontSize: "0.85rem", textDecoration: "none" }} href={`/api/admin/registro?descargar=1&nivel=${nivel}${texto.trim() ? `&q=${encodeURIComponent(texto.trim())}` : ""}`} title="Descarga el registro como archivo de texto (hasta 5000 entradas)">
          ⬇️ Descargar
        </a>
      </div>
      <div style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
        {entradas.length} entradas · el archivo pesa {(bytes / 1024).toFixed(0)} KB
      </div>
      <pre
        ref={caja}
        onScroll={(e) => {
          const c = e.currentTarget;
          alFinal.current = c.scrollHeight - c.scrollTop - c.clientHeight < 40;
        }}
        style={{ margin: 0, padding: "12px 14px", maxHeight: "60vh", minHeight: "200px", overflow: "auto", background: "var(--bg-surface-tint)", border: "1px solid var(--border-light)", borderRadius: "var(--radius-sm)", fontSize: "0.78rem", lineHeight: 1.45, whiteSpace: "pre-wrap", wordBreak: "break-word", userSelect: "text" }}
      >
        {contenido || "No hay entradas con este filtro."}
      </pre>
    </div>
  );
}
