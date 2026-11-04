"use client";

import { useEffect, useState } from "react";
import Modal from "@/components/Modal";
import { useToast } from "@/components/Toast";
import { llamar, textoError } from "@/components/comisiones/api";
import type { ComparticionDto } from "@/lib/notas";

type Permiso = "lectura" | "edicion" | "no";

/** Con quién se comparte una nota o un flujo: con todo el equipo o con personas concretas, solo para leer o también para editar. */
export default function ModalCompartir({
  idNota,
  titulo,
  alCerrar,
  alGuardar,
}: {
  idNota: number;
  titulo: string;
  alCerrar: () => void;
  alGuardar: () => void;
}) {
  const { mostrar } = useToast();
  const [datos, setDatos] = useState<ComparticionDto | null>(null);
  const [equipo, setEquipo] = useState<Permiso>("no");
  const [personas, setPersonas] = useState<Record<number, Permiso>>({});
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    llamar<ComparticionDto>(`/api/notas/compartir?id=${idNota}`)
      .then((r) => {
        setDatos(r.data);
        setEquipo(
          r.data.con.find((c) => c.id_usuario === null)?.permiso ?? "no",
        );
        setPersonas(
          Object.fromEntries(
            r.data.con
              .filter((c) => c.id_usuario !== null)
              .map((c) => [c.id_usuario as number, c.permiso]),
          ),
        );
      })
      .catch((e: unknown) => {
        mostrar(textoError(e), "error");
        alCerrar();
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idNota]);

  const guardar = async () => {
    const con: { id_usuario: number | null; permiso: "lectura" | "edicion" }[] =
      [];
    if (equipo !== "no") con.push({ id_usuario: null, permiso: equipo });
    for (const [id, p] of Object.entries(personas))
      if (p !== "no") con.push({ id_usuario: Number(id), permiso: p });
    setOcupado(true);
    try {
      await llamar(`/api/notas/compartir?id=${idNota}`, {
        method: "PUT",
        cuerpo: { con },
      });
      mostrar(
        con.length === 0 ? "Ya no se comparte con nadie." : "Compartido.",
      );
      alGuardar();
      alCerrar();
    } catch (e) {
      mostrar(textoError(e), "error");
    } finally {
      setOcupado(false);
    }
  };

  const selector = (
    valor: Permiso,
    cambiar: (p: Permiso) => void,
    etiqueta: string,
  ) => (
    <select
      className="form-input"
      aria-label={etiqueta}
      value={valor}
      onChange={(e) => cambiar(e.target.value as Permiso)}
      style={{ width: "auto", padding: "4px 8px", fontSize: "0.85rem" }}
    >
      <option value="no">No compartir</option>
      <option value="lectura">Puede leer</option>
      <option value="edicion">Puede editar</option>
    </select>
  );

  return (
    <Modal
      titulo={`👥 Compartir «${titulo || "Sin título"}»`}
      ancho="520px"
      pie={
        <>
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
            disabled={ocupado || !datos}
            onClick={() => void guardar()}
          >
            Guardar
          </button>
        </>
      }
    >
      {!datos ? (
        <span style={{ color: "var(--text-muted)" }}>Cargando…</span>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          <p
            style={{
              margin: 0,
              fontSize: "0.82rem",
              color: "var(--text-secondary)",
            }}
          >
            Quien tenga permiso para editar puede cambiar el contenido y los
            adjuntos; el grupo, el vínculo y el compartir los cambias solo tú.
          </p>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "10px",
              padding: "6px 0",
              borderBottom: "1px solid var(--border-light)",
            }}
          >
            <strong style={{ fontSize: "0.9rem" }}>👥 Todo el equipo</strong>
            {selector(equipo, setEquipo, "Permiso para todo el equipo")}
          </div>
          {datos.usuarios.map((x) => (
            <div
              key={x.id}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "10px",
              }}
            >
              <span style={{ fontSize: "0.9rem" }}>{x.nombre}</span>
              {selector(
                personas[x.id] ?? "no",
                (p) => setPersonas((v) => ({ ...v, [x.id]: p })),
                `Permiso para ${x.nombre}`,
              )}
            </div>
          ))}
          {datos.usuarios.length === 0 && (
            <span style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
              No hay más personas con las que compartir.
            </span>
          )}
        </div>
      )}
    </Modal>
  );
}
