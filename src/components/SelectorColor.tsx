"use client";

import { useState, type ReactNode } from "react";
import Modal from "@/components/Modal";
import { guardarPreferencia, usePreferencia } from "@/lib/preferencias";

const CLAVE_PALETA = "paleta-colores";
const MAX_GUARDADOS = 24;
const RE_COLOR = /^#([0-9a-fA-F]{6})([0-9a-fA-F]{2})?$/;

/** Separa un color `#RRGGBB` o `#RRGGBBAA` en su color y su opacidad (0 a 100). */
export function partirColor(valor: string | null | undefined): { hex: string; alfa: number } {
  const m = valor ? RE_COLOR.exec(valor.trim()) : null;
  if (!m) return { hex: "#3b82f6", alfa: 100 };
  return { hex: `#${m[1].toLowerCase()}`, alfa: m[2] ? Math.round((parseInt(m[2], 16) * 100) / 255) : 100 };
}

/** Junta color y opacidad: `#RRGGBB` si es opaco, `#RRGGBBAA` si no. */
export function juntarColor(hex: string, alfa: number): string {
  if (alfa >= 100) return hex.toLowerCase();
  return `${hex.toLowerCase()}${Math.round((Math.max(0, alfa) * 255) / 100).toString(16).padStart(2, "0")}`;
}

const DAMERO = "repeating-conic-gradient(#8884 0% 25%, transparent 0% 50%) 50% / 10px 10px";

/** Cuadradito con el color (se ve la transparencia sobre un damero). */
export function MuestraColor({ valor, tamano = 28 }: { valor: string | null | undefined; tamano?: number }) {
  return (
    <span style={{ display: "inline-block", width: `${tamano}px`, height: `${tamano}px`, borderRadius: "6px", border: "1px solid var(--border-light)", background: DAMERO, position: "relative", overflow: "hidden", flexShrink: 0 }}>
      {valor && <span style={{ position: "absolute", inset: 0, background: valor }} />}
    </span>
  );
}

interface Props {
  /** Color actual (`#RRGGBB` o `#RRGGBBAA`) o null si no hay. */
  valor: string | null;
  /** Se llama una sola vez, al pulsar «Aplicar» (o «Sin color»). */
  alCambiar: (nuevo: string | null) => void;
  titulo: string;
  /** Permite dejarlo sin color. */
  permitirVacio?: boolean;
  /** Lo que se ve junto a la muestra cuando no hay color. */
  textoVacio?: ReactNode;
  disabled?: boolean;
}

/**
 * Elegir un color: muestra clicable que abre una ventana con el selector, el código, la opacidad y los colores guardados (se recuerdan en
 * este navegador). Los cambios no se aplican hasta pulsar «Aplicar», así no salen avisos mientras se arrastra el selector.
 */
export default function SelectorColor({ valor, alCambiar, titulo, permitirVacio = true, textoVacio, disabled }: Props) {
  const [abierto, setAbierto] = useState(false);
  const [borrador, setBorrador] = useState(() => partirColor(valor));
  const [escrito, setEscrito] = useState<string | null>(null);
  const [paletaTexto] = usePreferencia(CLAVE_PALETA);
  let paleta: string[] = [];
  try {
    const p = paletaTexto ? (JSON.parse(paletaTexto) as unknown) : [];
    if (Array.isArray(p)) paleta = p.filter((c): c is string => typeof c === "string" && RE_COLOR.test(c));
  } catch {
    paleta = [];
  }

  const actual = juntarColor(borrador.hex, borrador.alfa);
  const abrir = () => {
    setBorrador(partirColor(valor));
    setEscrito(null);
    setAbierto(true);
  };
  const guardarEnPaleta = (c: string) => guardarPreferencia(CLAVE_PALETA, JSON.stringify([c, ...paleta.filter((x) => x !== c)].slice(0, MAX_GUARDADOS)));
  const quitarDePaleta = (c: string) => guardarPreferencia(CLAVE_PALETA, JSON.stringify(paleta.filter((x) => x !== c)));
  const aplicarCodigo = (texto: string) => {
    setEscrito(texto);
    const t = texto.trim().startsWith("#") ? texto.trim() : `#${texto.trim()}`;
    if (RE_COLOR.test(t)) setBorrador(partirColor(t));
  };

  return (
    <>
      <button type="button" onClick={abrir} disabled={disabled} title={titulo} className="btn btn-secondary" style={{ display: "inline-flex", alignItems: "center", gap: "8px", padding: "3px 8px", fontSize: "0.78rem" }}>
        <MuestraColor valor={valor} />
        {valor ? <span style={{ fontFamily: "monospace", fontSize: "0.72rem" }}>{valor}</span> : (textoVacio ?? <span style={{ color: "var(--text-muted)" }}>sin color</span>)}
      </button>
      {abierto && (
        <Modal
          titulo={titulo}
          ancho="440px"
          pie={
            <>
              {permitirVacio && valor !== null && (
                <button type="button" className="btn btn-secondary" onClick={() => { setAbierto(false); alCambiar(null); }}>
                  Sin color
                </button>
              )}
              <button type="button" className="btn btn-secondary" onClick={() => setAbierto(false)}>
                Cancelar
              </button>
              <button type="button" className="btn btn-primary" onClick={() => { setAbierto(false); if (actual !== (valor ?? "").toLowerCase()) alCambiar(actual); }}>
                Aplicar
              </button>
            </>
          }
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            <div style={{ display: "flex", gap: "12px", alignItems: "stretch" }}>
              <input type="color" value={borrador.hex} onChange={(e) => { setEscrito(null); setBorrador({ ...borrador, hex: e.target.value }); }} style={{ width: "96px", height: "96px", padding: 0, border: "1px solid var(--border-light)", borderRadius: "8px", cursor: "pointer", background: "transparent" }} title="Arrastra para elegir el color" />
              <div style={{ display: "flex", flexDirection: "column", gap: "8px", flex: 1, justifyContent: "space-between" }}>
                <label style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                  Código del color
                  <input className="form-input" value={escrito ?? actual} onChange={(e) => aplicarCodigo(e.target.value)} onBlur={() => setEscrito(null)} maxLength={9} style={{ fontFamily: "monospace" }} />
                </label>
                <label style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                  Opacidad: {borrador.alfa} %
                  <input type="range" min={0} max={100} value={borrador.alfa} onChange={(e) => setBorrador({ ...borrador, alfa: Number(e.target.value) })} style={{ accentColor: "var(--primary)" }} />
                </label>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <MuestraColor valor={actual} tamano={40} />
              <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>Así se verá</span>
              <button type="button" className="btn btn-secondary" style={{ marginLeft: "auto", padding: "3px 10px", fontSize: "0.78rem" }} onClick={() => guardarEnPaleta(actual)} title="Guarda este color para elegirlo rápido en cualquier sitio">
                ★ Guardar este color
              </button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>Colores guardados {paleta.length === 0 && "(todavía ninguno)"}</span>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                {paleta.map((c) => (
                  <span key={c} style={{ position: "relative", display: "inline-flex" }}>
                    <button type="button" onClick={() => { setEscrito(null); setBorrador(partirColor(c)); }} title={`Usar ${c}`} style={{ all: "unset", cursor: "pointer", display: "inline-flex" }}>
                      <MuestraColor valor={c} tamano={30} />
                    </button>
                    <button type="button" onClick={() => quitarDePaleta(c)} title="Quitar de los guardados" aria-label={`Quitar ${c}`} style={{ position: "absolute", top: "-6px", right: "-6px", width: "16px", height: "16px", borderRadius: "50%", border: "1px solid var(--border-light)", background: "var(--bg-card)", color: "var(--danger)", fontSize: "0.65rem", lineHeight: 1, cursor: "pointer", padding: 0 }}>
                      ✕
                    </button>
                  </span>
                ))}
              </div>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
