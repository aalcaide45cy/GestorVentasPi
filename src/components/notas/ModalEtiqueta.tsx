"use client";

import { useState } from "react";
import Modal from "@/components/Modal";
import { useToast } from "@/components/Toast";
import { llamar, textoError } from "@/components/comisiones/api";
import AyudaEmoticonos from "@/components/expedientes/AyudaEmoticonos";
import type { EtiquetaDto } from "@/lib/notas";
import ChipEtiqueta from "./ChipEtiqueta";

const COLORES = [
  "#ef4444",
  "#f97316",
  "#eab308",
  "#84cc16",
  "#22c55e",
  "#14b8a6",
  "#06b6d4",
  "#3b82f6",
  "#a855f7",
  "#ec4899",
  "#6b7280",
];
const EMOJIS = [
  "🔥",
  "⭐",
  "💡",
  "📌",
  "✅",
  "❗",
  "💰",
  "🚗",
  "📞",
  "📅",
  "👤",
  "🛠️",
];

/** Crear o cambiar una etiqueta: nombre, color y emoticono. Cambiar el nombre lo cambia en todas tus notas; quitarla la saca de todas. */
export default function ModalEtiqueta({
  inicial,
  alCerrar,
  alGuardar,
}: {
  inicial: EtiquetaDto | null;
  alCerrar: () => void;
  alGuardar: () => void;
}) {
  const { mostrar, confirmar } = useToast();
  const [nombre, setNombre] = useState(inicial?.nombre ?? "");
  const [color, setColor] = useState<string | null>(inicial?.color ?? null);
  const [emoji, setEmoji] = useState(inicial?.emoji ?? "");
  const [ocupado, setOcupado] = useState(false);

  const guardar = async () => {
    setOcupado(true);
    try {
      await llamar("/api/notas/etiquetas", {
        method: "PUT",
        cuerpo: {
          nombre: inicial?.nombre ?? nombre.trim(),
          color,
          emoji: emoji.trim() || null,
          nuevo_nombre:
            inicial && nombre.trim() !== inicial.nombre ? nombre.trim() : null,
        },
      });
      mostrar(inicial ? "Etiqueta guardada." : "Etiqueta creada.");
      alGuardar();
      alCerrar();
    } catch (e) {
      mostrar(textoError(e), "error");
    } finally {
      setOcupado(false);
    }
  };
  const quitar = async () => {
    if (!inicial) return;
    if (
      !(await confirmar({
        titulo: "Quitar la etiqueta",
        texto: `¿Quitar la etiqueta «${inicial.nombre}»? Se quita también de todas tus notas.`,
        aceptar: "Quitar",
        peligro: true,
      }))
    )
      return;
    setOcupado(true);
    try {
      await llamar(
        `/api/notas/etiquetas?nombre=${encodeURIComponent(inicial.nombre)}`,
        { method: "DELETE" },
      );
      mostrar("Etiqueta quitada.");
      alGuardar();
      alCerrar();
    } catch (e) {
      mostrar(textoError(e), "error");
    } finally {
      setOcupado(false);
    }
  };

  return (
    <Modal
      titulo={inicial ? `🏷 Etiqueta «${inicial.nombre}»` : "🏷 Nueva etiqueta"}
      ancho="460px"
      pie={
        <>
          {inicial && (
            <button
              type="button"
              className="btn btn-secondary"
              disabled={ocupado}
              onClick={() => void quitar()}
              style={{ marginRight: "auto" }}
            >
              🗑 Quitar
            </button>
          )}
          <button
            type="button"
            className="btn btn-secondary"
            disabled={ocupado}
            onClick={alCerrar}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={ocupado || nombre.trim() === ""}
            onClick={() => void guardar()}
          >
            Guardar
          </button>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        <label
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "4px",
            fontSize: "0.85rem",
          }}
        >
          Nombre
          <input
            className="form-input"
            value={nombre}
            maxLength={30}
            onChange={(e) => setNombre(e.target.value)}
            autoFocus
          />
        </label>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "6px",
            fontSize: "0.85rem",
          }}
        >
          Color
          <div
            style={{
              display: "flex",
              gap: "6px",
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <button
              type="button"
              className={
                color === null ? "btn btn-primary" : "btn btn-secondary"
              }
              onClick={() => setColor(null)}
              style={{ padding: "2px 8px", fontSize: "0.78rem" }}
            >
              Sin color
            </button>
            {COLORES.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Color ${c}`}
                aria-pressed={color === c}
                onClick={() => setColor(c)}
                style={{
                  width: "24px",
                  height: "24px",
                  borderRadius: "50%",
                  background: c,
                  cursor: "pointer",
                  border: `3px solid ${color === c ? "var(--text-primary)" : "var(--border-light)"}`,
                }}
              />
            ))}
            <input
              type="color"
              value={color ?? "#3b82f6"}
              onChange={(e) => setColor(e.target.value)}
              aria-label="Otro color"
              style={{
                width: "32px",
                height: "26px",
                padding: 0,
                border: "1px solid var(--border-light)",
                borderRadius: "var(--radius-sm)",
                background: "transparent",
                cursor: "pointer",
              }}
            />
          </div>
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "6px",
            fontSize: "0.85rem",
          }}
        >
          Emoticono
          <div
            style={{
              display: "flex",
              gap: "6px",
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <input
              className="form-input"
              value={emoji}
              maxLength={8}
              onChange={(e) => setEmoji(e.target.value)}
              aria-label="Emoticono"
              placeholder="🏷"
              style={{
                width: "70px",
                textAlign: "center",
                fontSize: "1.2rem",
                padding: "4px",
              }}
            />
            {EMOJIS.map((x) => (
              <button
                key={x}
                type="button"
                aria-label={`Usar ${x}`}
                onClick={() => setEmoji(x)}
                className={
                  emoji === x ? "btn btn-primary" : "btn btn-secondary"
                }
                style={{
                  padding: "1px 7px",
                  fontSize: "1.05rem",
                  lineHeight: 1.3,
                }}
              >
                {x}
              </button>
            ))}
          </div>
          <AyudaEmoticonos alInsertar={(x) => setEmoji(x)} />
        </div>
        <div style={{ fontSize: "0.85rem" }}>
          Así se verá:{" "}
          <ChipEtiqueta
            nombre={nombre.trim() || "Etiqueta"}
            aspecto={{ nombre, color, emoji: emoji.trim() || null }}
          />
        </div>
      </div>
    </Modal>
  );
}
