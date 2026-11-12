"use client";

import { useState } from "react";
import Modal from "@/components/Modal";
import { useToast } from "@/components/Toast";
import { llamar, textoError } from "@/components/comisiones/api";
import { nombreMes } from "@/lib/formato";
import { normalizarMatricula } from "@/lib/rejilla/analizar";

const FORMA = /^\d{4}[BCDFGHJKLMNPRSTVWXYZ]{3}$/;

interface Props {
  idVendedor: number;
  mes: string;
  /** Las matrículas que tiene guardadas ahora la rejilla de ese mes. */
  matriculas: string[];
  /** Matrículas de los expedientes del vendedor: las que coinciden se marcan con ✔. */
  conocidas: string[];
  alCerrar: () => void;
  alGuardar: () => void;
}

/**
 * Ver y corregir a mano lo que se leyó de una rejilla ya guardada: se cambia una matrícula mal leída, se quita la que sobra y se añade la que
 * el lector no vio. Al guardar solo cambian esas; el resto de la rejilla no se toca.
 */
export default function EditorRejillaGuardada({
  idVendedor,
  mes,
  matriculas,
  conocidas,
  alCerrar,
  alGuardar,
}: Props) {
  const { mostrar } = useToast();
  const [filas, setFilas] = useState<string[]>(() => [...matriculas].sort());
  const [ocupado, setOcupado] = useState(false);
  const deExpediente = new Set(conocidas.map(normalizarMatricula));
  const originales = new Set(matriculas.map(normalizarMatricula));
  const limpias = filas.map(normalizarMatricula).filter(Boolean);
  const repetidas = new Set(limpias.filter((m, i) => limpias.indexOf(m) !== i));
  const actuales = new Set(limpias);
  const nuevas = [...actuales].filter((m) => !originales.has(m)).length;
  const quitadas = [...originales].filter((m) => !actuales.has(m)).length;

  const guardar = async () => {
    if (actuales.size === 0)
      return mostrar(
        "La rejilla no puede quedarse sin matrículas. Si sobra entera, quítala desde «Mi mes».",
        "error",
      );
    setOcupado(true);
    try {
      await llamar(`/api/cotejo/rejillas?usuario=${idVendedor}`, {
        method: "PATCH",
        cuerpo: { mes, matriculas: [...actuales] },
      });
      mostrar(
        `Rejilla de ${nombreMes(mes)} corregida: ${nuevas} añadida(s) o cambiada(s), ${quitadas} quitada(s).`,
        "exito",
      );
      alGuardar();
    } catch (e) {
      mostrar(textoError(e), "error");
    } finally {
      setOcupado(false);
    }
  };

  return (
    <Modal
      titulo={`✏️ Matrículas leídas de la rejilla de ${nombreMes(mes)}`}
      ancho="min(calc(96 * var(--uvw)), 720px)"
      pie={
        <>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={alCerrar}
            disabled={ocupado}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void guardar()}
            disabled={ocupado || (nuevas === 0 && quitadas === 0)}
          >
            {ocupado ? "Guardando…" : "Guardar cambios"}
          </button>
        </>
      }
    >
      <p
        style={{
          margin: 0,
          color: "var(--text-secondary)",
          fontSize: "0.88rem",
        }}
      >
        Compáralas con la hoja de la empresa. Cambia la que esté mal leída,
        quita la que sobre con ✕ y añade la que falte. ✔ = coincide con un
        expediente tuyo; ❓ = no hay ningún expediente con esa matrícula; en
        rojo = no tiene forma de matrícula (4 cifras y 3 letras).
      </p>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "8px",
          maxHeight: "calc(55 * var(--uvh))",
          overflowY: "auto",
          padding: "4px 0",
        }}
      >
        {filas.map((m, i) => {
          const n = normalizarMatricula(m);
          const coincide = deExpediente.has(n);
          const malForma = n !== "" && !FORMA.test(n);
          return (
            <div
              key={i}
              style={{ display: "flex", gap: "4px", alignItems: "center" }}
            >
              <span
                title={
                  coincide
                    ? "Coincide con un expediente tuyo"
                    : "No hay ningún expediente tuyo con esta matrícula"
                }
                style={{
                  width: "16px",
                  textAlign: "center",
                  fontSize: "0.85rem",
                  color: coincide ? "var(--success)" : "var(--warning)",
                }}
              >
                {n === "" ? "" : coincide ? "✔" : "❓"}
              </span>
              <input
                className="form-input"
                style={{
                  width: "112px",
                  padding: "6px 8px",
                  fontWeight: 600,
                  background:
                    malForma || repetidas.has(n)
                      ? "rgba(239, 68, 68, 0.25)"
                      : !originales.has(n) && n !== ""
                        ? "rgba(34, 197, 94, 0.18)"
                        : undefined,
                }}
                value={m}
                aria-label={`Matrícula ${i + 1}`}
                title={
                  repetidas.has(n)
                    ? "Está repetida"
                    : malForma
                      ? "No tiene forma de matrícula (4 cifras y 3 letras): revísala"
                      : !originales.has(n) && n !== ""
                        ? "Cambiada o añadida por ti (aún sin guardar)"
                        : undefined
                }
                onChange={(e) =>
                  setFilas(
                    filas.map((x, j) =>
                      j === i ? e.target.value.toUpperCase() : x,
                    ),
                  )
                }
              />
              <button
                type="button"
                className="btn btn-secondary"
                style={{ padding: "2px 8px" }}
                title="Quitar esta matrícula de la rejilla"
                aria-label={`Quitar ${m || "la matrícula vacía"}`}
                onClick={() => setFilas(filas.filter((_, j) => j !== i))}
              >
                ✕
              </button>
            </div>
          );
        })}
        <button
          type="button"
          className="btn btn-secondary"
          style={{ padding: "4px 10px" }}
          onClick={() => setFilas([...filas, ""])}
        >
          ＋ Añadir matrícula
        </button>
      </div>
      <div style={{ fontSize: "0.82rem", color: "var(--text-secondary)" }}>
        {actuales.size} matrícula(s)
        {nuevas + quitadas > 0
          ? ` · sin guardar: ${nuevas} añadida(s) o cambiada(s), ${quitadas} quitada(s)`
          : " · sin cambios"}
      </div>
    </Modal>
  );
}
