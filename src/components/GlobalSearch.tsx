"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

interface Sugerencias {
  clientes: { id: number; nombre: string | null; label: string }[];
  expedientes: { id_expediente: number; label: string }[];
}

const VACIAS: Sugerencias = { clientes: [], expedientes: [] };

const cabeceraGrupo = {
  padding: "6px 16px",
  fontSize: "0.75rem",
  fontWeight: 700,
  color: "var(--primary)",
  textTransform: "uppercase",
  letterSpacing: "0.5px",
} as const;

const filaSugerencia = {
  padding: "8px 16px",
  fontSize: "0.82rem",
  color: "var(--text-primary)",
  cursor: "pointer",
  transition: "background 0.2s",
  borderBottom: "1px solid rgba(255,255,255,0.02)",
} as const;

export default function GlobalSearch() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  const [suggestions, setSuggestions] = useState<Sugerencias>(VACIAS);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setQuery(searchParams.get("q") ?? "");
  }, [searchParams]);

  useEffect(() => {
    function alPulsarFuera(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setIsOpen(false);
    }
    document.addEventListener("mousedown", alPulsarFuera);
    return () => document.removeEventListener("mousedown", alPulsarFuera);
  }, []);

  useEffect(() => {
    if (query.trim().length < 2) {
      setSuggestions(VACIAS);
      setIsOpen(false);
      return;
    }
    const controlador = new AbortController();
    const espera = setTimeout(async () => {
      setLoading(true);
      try {
        const respuesta = await fetch(`/api/buscar?q=${encodeURIComponent(query.trim())}`, { signal: controlador.signal });
        if (respuesta.ok) {
          setSuggestions((await respuesta.json()) as Sugerencias);
          setIsOpen(true);
        }
      } catch {
        /* petición cancelada o sin conexión */
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => {
      clearTimeout(espera);
      controlador.abort();
    };
  }, [query]);

  const enviar = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    setIsOpen(false);
    router.push(`/dashboard/buscar?q=${encodeURIComponent(query.trim())}`);
  };

  const total = suggestions.clientes.length + suggestions.expedientes.length;

  return (
    <div ref={containerRef} style={{ position: "relative", width: "320px" }}>
      <form onSubmit={enviar} style={{ display: "flex", alignItems: "center", position: "relative", width: "100%" }}>
        <input
          type="text"
          className="form-input"
          placeholder="Buscar expediente, matrícula, DNI..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => {
            if (total > 0) setIsOpen(true);
          }}
          style={{
            padding: "10px 40px 10px 16px",
            fontSize: "0.85rem",
            borderRadius: "var(--radius-sm)",
            background: "var(--bg-input)",
            border: "1px solid var(--border-light)",
            color: "var(--text-primary)",
            width: "100%",
          }}
        />
        <button
          type="submit"
          aria-label="Buscar"
          style={{
            position: "absolute",
            right: "12px",
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "var(--text-secondary)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 0,
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </button>
      </form>

      {isOpen && (total > 0 || loading) && (
        <div
          className="glass-panel"
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            left: 0,
            right: 0,
            zIndex: 1000,
            maxHeight: "350px",
            overflowY: "auto",
            boxShadow: "var(--shadow-lg)",
            padding: "8px 0",
            borderRadius: "var(--radius-sm)",
            border: "1px solid var(--border-light)",
            background: "var(--bg-surface)",
          }}
        >
          {loading && (
            <div style={{ padding: "12px 16px", color: "var(--text-secondary)", fontSize: "0.8rem", textAlign: "center" }}>
              ⏳ Buscando...
            </div>
          )}

          {!loading && suggestions.expedientes.length > 0 && (
            <div>
              <div style={cabeceraGrupo}>📄 Expedientes</div>
              {suggestions.expedientes.map((exp) => (
                <div
                  key={`exp-${exp.id_expediente}`}
                  onClick={() => {
                    setIsOpen(false);
                    setQuery("");
                    router.push(`/dashboard/expedientes/editar/${exp.id_expediente}`);
                  }}
                  style={filaSugerencia}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.04)")}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                >
                  {exp.label}
                </div>
              ))}
            </div>
          )}

          {!loading && suggestions.clientes.length > 0 && (
            <div style={{ marginTop: suggestions.expedientes.length > 0 ? "8px" : 0 }}>
              <div style={cabeceraGrupo}>👤 Clientes</div>
              {suggestions.clientes.map((c) => (
                <div
                  key={`cli-${c.id}`}
                  onClick={() => {
                    setIsOpen(false);
                    setQuery(c.nombre ?? "");
                    router.push(`/dashboard/buscar?q=${encodeURIComponent(c.nombre ?? "")}`);
                  }}
                  style={filaSugerencia}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.04)")}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                >
                  {c.label}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
