"use client";

import { useEffect, useState } from "react";
import Modal from "@/components/Modal";
import { useToast } from "@/components/Toast";
import { llamar, textoError } from "@/components/comisiones/api";
import type { VersionNotaDto } from "@/lib/notas";

/** Versiones anteriores del texto de una nota: cada pocos minutos de edición se guarda un punto, para poder volver atrás aunque ya se haya cerrado la pantalla. */
export default function ModalVersiones({
  idNota,
  puedeEditar,
  alCerrar,
  alRestaurar,
}: {
  idNota: number;
  puedeEditar: boolean;
  alCerrar: () => void;
  alRestaurar: () => void;
}) {
  const { mostrar, confirmar } = useToast();
  const [versiones, setVersiones] = useState<VersionNotaDto[] | null>(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    llamar<VersionNotaDto[]>(`/api/notas/versiones?id=${idNota}`)
      .then((r) => setVersiones(r.data))
      .catch((e: unknown) => {
        mostrar(textoError(e), "error");
        alCerrar();
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idNota]);

  const restaurar = async (v: VersionNotaDto) => {
    if (
      !(await confirmar({
        titulo: "Volver a esta versión",
        texto: `El texto volverá a como estaba el ${new Date(v.creado_en).toLocaleString("es-ES")}. Lo que hay ahora se guarda como otra versión, por si quieres volver.`,
        aceptar: "Volver a esta versión",
      }))
    )
      return;
    setOcupado(true);
    try {
      await llamar(`/api/notas/versiones?id=${idNota}&version=${v.id}`, {
        method: "POST",
        cuerpo: {},
      });
      mostrar("Texto restaurado.");
      alRestaurar();
      alCerrar();
    } catch (e) {
      mostrar(textoError(e), "error");
    } finally {
      setOcupado(false);
    }
  };

  return (
    <Modal
      titulo="🕘 Versiones anteriores"
      ancho="640px"
      pie={
        <button type="button" className="btn btn-primary" onClick={alCerrar}>
          Cerrar
        </button>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        <p
          style={{
            margin: 0,
            fontSize: "0.82rem",
            color: "var(--text-secondary)",
          }}
        >
          Cada pocos minutos de edición se guarda cómo estaba el texto. Aquí
          recuperas algo que borraste, aunque ya hayas cerrado la nota. Dentro
          del texto, Ctrl+Z y Ctrl+Y deshacen y rehacen al momento.
        </p>
        {versiones === null && (
          <span style={{ color: "var(--text-muted)" }}>Cargando…</span>
        )}
        {versiones?.length === 0 && (
          <span style={{ color: "var(--text-muted)" }}>
            Todavía no hay versiones: se guardan al ir cambiando el texto.
          </span>
        )}
        {versiones?.map((v) => (
          <div
            key={v.id}
            style={{
              border: "1px solid var(--border-light)",
              borderRadius: "var(--radius-sm)",
              padding: "8px 10px",
              display: "flex",
              flexDirection: "column",
              gap: "4px",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: "10px",
                flexWrap: "wrap",
                fontSize: "0.82rem",
              }}
            >
              <strong>
                {new Date(v.creado_en).toLocaleString("es-ES", {
                  day: "2-digit",
                  month: "2-digit",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
                {v.autor ? ` · ${v.autor}` : ""}
              </strong>
              {puedeEditar && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={ocupado}
                  onClick={() => void restaurar(v)}
                  style={{ padding: "2px 10px", fontSize: "0.78rem" }}
                >
                  ↩ Volver a esta
                </button>
              )}
            </div>
            <span
              style={{
                fontSize: "0.82rem",
                color: "var(--text-secondary)",
                whiteSpace: "pre-wrap",
                maxHeight: "6.5em",
                overflow: "hidden",
              }}
            >
              {v.extracto || "(sin texto)"}
            </span>
          </div>
        ))}
      </div>
    </Modal>
  );
}
