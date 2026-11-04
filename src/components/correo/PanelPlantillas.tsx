"use client";

import { useCallback, useEffect, useState } from "react";
import Modal from "@/components/Modal";
import { useToast } from "@/components/Toast";
import { llamar, textoError } from "@/components/comisiones/api";
import type { PlantillaDto } from "@/lib/correo";
import EditorHtml from "./EditorHtml";

/** Plantillas de correo: asunto y cuerpo con campos del cliente, el expediente y las fechas entre llaves. */
export default function PanelPlantillas() {
  const { mostrar, confirmar } = useToast();
  const [lista, setLista] = useState<PlantillaDto[] | null>(null);
  const [b, setB] = useState<{
    id: number | null;
    nombre: string;
    asunto: string;
    cuerpo: string;
  } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const cargar = useCallback(() => {
    llamar<PlantillaDto[]>("/api/correo/plantillas")
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
      await llamar(`/api/correo/plantillas${b.id ? `?id=${b.id}` : ""}`, {
        method: b.id ? "PUT" : "POST",
        cuerpo: { nombre: b.nombre, asunto: b.asunto, cuerpo: b.cuerpo },
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
        Escribe el correo una vez, con campos como {"{cliente}"}, {"{bastidor}"}{" "}
        o {"{fecha_entrega}"}, y se rellena solo con los datos de cada
        expediente.
      </p>
      <div>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => setB({ id: null, nombre: "", asunto: "", cuerpo: "" })}
        >
          ＋ Nueva plantilla
        </button>
      </div>
      {lista?.length === 0 && (
        <p style={{ color: "var(--text-muted)" }}>Todavía no hay plantillas.</p>
      )}
      {lista?.map((p) => (
        <div
          key={p.id}
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
            <strong>{p.nombre}</strong>
            <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
              Asunto: {p.asunto || "(sin asunto)"}
            </div>
          </div>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() =>
              setB({
                id: p.id,
                nombre: p.nombre,
                asunto: p.asunto,
                cuerpo: p.cuerpo,
              })
            }
            style={{ padding: "3px 10px", fontSize: "0.82rem" }}
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
                  titulo: "Quitar la plantilla",
                  texto: `¿Quitar «${p.nombre}»?`,
                  aceptar: "Quitar",
                  peligro: true,
                }))
              )
                return;
              await llamar(`/api/correo/plantillas?id=${p.id}`, {
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
          titulo={b.id ? "Editar la plantilla" : "Nueva plantilla"}
          ancho="min(calc(96 * var(--uvw)), 780px)"
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
                disabled={ocupado}
              >
                Guardar
              </button>
            </>
          }
        >
          <label
            style={{ display: "flex", flexDirection: "column", gap: "4px" }}
          >
            Nombre de la plantilla
            <input
              className="form-input"
              value={b.nombre}
              onChange={(e) => setB({ ...b, nombre: e.target.value })}
            />
          </label>
          <label
            style={{ display: "flex", flexDirection: "column", gap: "4px" }}
          >
            Asunto (admite campos entre llaves)
            <input
              className="form-input"
              value={b.asunto}
              onChange={(e) => setB({ ...b, asunto: e.target.value })}
              placeholder="Ej. Entrega de su {marca} {modelo}"
            />
          </label>
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            Cuerpo
            <EditorHtml
              valor={b.cuerpo}
              alCambiar={(h) => setB((x) => (x ? { ...x, cuerpo: h } : x))}
              conCampos
            />
          </div>
        </Modal>
      )}
    </div>
  );
}
