"use client";

import { useCallback, useEffect, useState } from "react";
import Modal from "@/components/Modal";
import { useToast } from "@/components/Toast";
import { llamar, textoError } from "@/components/comisiones/api";
import type { FirmaDto } from "@/lib/correo";
import EditorHtml from "./EditorHtml";

/** Gestor de firmas: se crean aquí una vez y cada plantilla elige cuál usar. */
export default function PanelFirmas() {
  const { mostrar, confirmar } = useToast();
  const [lista, setLista] = useState<FirmaDto[] | null>(null);
  const [b, setB] = useState<{
    id: number | null;
    nombre: string;
    html: string;
  } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const cargar = useCallback(() => {
    llamar<FirmaDto[]>("/api/correo/firmas")
      .then((r) => setLista(r.data))
      .catch((e: unknown) => mostrar(textoError(e), "error"));
  }, [mostrar]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    cargar();
  }, [cargar]);
  const guardar = async () => {
    if (!b) return;
    setOcupado(true);
    try {
      await llamar(`/api/correo/firmas${b.id ? `?id=${b.id}` : ""}`, {
        method: b.id ? "PUT" : "POST",
        cuerpo: { nombre: b.nombre, html: b.html },
      });
      setB(null);
      cargar();
    } catch (e) {
      mostrar(textoError(e), "error");
    } finally {
      setOcupado(false);
    }
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      <p
        style={{
          margin: 0,
          color: "var(--text-secondary)",
          fontSize: "0.9rem",
        }}
      >
        Crea aquí tus firmas una vez (con su formato, enlaces e imágenes) y, en
        cada plantilla, elige cuál usar. Si cambias una firma, cambia en todas
        las plantillas que la usan. Una plantilla sin firma elegida usa la de la
        cuenta con la que se envía.
      </p>
      <div>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => setB({ id: null, nombre: "", html: "" })}
        >
          ＋ Nueva firma
        </button>
      </div>
      {lista?.length === 0 && (
        <p style={{ color: "var(--text-muted)" }}>Todavía no hay firmas.</p>
      )}
      {lista?.map((f) => (
        <div
          key={f.id}
          className="glass-panel"
          style={{
            padding: "10px 14px",
            display: "flex",
            gap: "12px",
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <div style={{ flex: 1, minWidth: "220px" }}>
            <strong>{f.nombre}</strong>
            <div
              className="notas-contenido"
              style={{
                maxHeight: "110px",
                overflow: "hidden",
                marginTop: "6px",
                fontSize: "0.85rem",
              }}
              dangerouslySetInnerHTML={{ __html: f.html }}
            />
          </div>
          <button
            type="button"
            className="btn btn-secondary"
            style={{ padding: "3px 10px", fontSize: "0.82rem" }}
            onClick={() =>
              setB({
                id: null,
                nombre: `${f.nombre} (copia)`.slice(0, 80),
                html: f.html,
              })
            }
          >
            📄 Duplicar
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            style={{ padding: "3px 10px", fontSize: "0.82rem" }}
            onClick={() => setB({ id: f.id, nombre: f.nombre, html: f.html })}
          >
            ✏️ Editar
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            style={{ padding: "3px 10px", fontSize: "0.82rem" }}
            onClick={async () => {
              if (
                !(await confirmar({
                  titulo: "Quitar la firma",
                  texto: `¿Quitar «${f.nombre}»? Las plantillas que la usaban pasarán a usar la firma de la cuenta.`,
                  aceptar: "Quitar",
                  peligro: true,
                }))
              )
                return;
              await llamar(`/api/correo/firmas?id=${f.id}`, {
                method: "DELETE",
              }).catch((e: unknown) => mostrar(textoError(e), "error"));
              cargar();
            }}
          >
            🗑️
          </button>
        </div>
      ))}
      {b && (
        <Modal
          titulo={b.id ? "Editar la firma" : "Nueva firma"}
          ancho="min(calc(96 * var(--uvw)), 680px)"
          pie={
            <>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setB(null)}
                disabled={ocupado}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => void guardar()}
                disabled={ocupado || !b.nombre.trim()}
              >
                Guardar
              </button>
            </>
          }
        >
          <label
            style={{ display: "flex", flexDirection: "column", gap: "4px" }}
          >
            Nombre (para reconocerla al elegirla)
            <input
              className="form-input"
              value={b.nombre}
              maxLength={80}
              onChange={(e) => setB({ ...b, nombre: e.target.value })}
              placeholder="Ej. Comercial"
            />
          </label>
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            Firma
            <EditorHtml
              valor={b.html}
              alCambiar={(h) => setB((x) => (x ? { ...x, html: h } : x))}
              conImagenes
            />
            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
              Copia tu firma de Gmail (o de Outlook) y pégala aquí: se conservan
              el formato, los colores, los enlaces, las tablas y las imágenes.
            </span>
          </div>
        </Modal>
      )}
    </div>
  );
}
