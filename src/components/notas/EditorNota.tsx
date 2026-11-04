"use client";

import Highlight from "@tiptap/extension-highlight";
import Image from "@tiptap/extension-image";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import {
  Table,
  TableCell,
  TableHeader,
  TableRow,
} from "@tiptap/extension-table";
import TextAlign from "@tiptap/extension-text-align";
import { Color, TextStyle } from "@tiptap/extension-text-style";
import { Placeholder } from "@tiptap/extensions";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "@/components/Toast";
import { llamar, textoError } from "@/components/comisiones/api";
import type { FicheroNotaDto, GrupoDto, NotaDto } from "@/lib/notas";
import {
  esImagen,
  subirFicheroNota,
  tamanoLegible,
  urlFichero,
} from "./api-notas";
import BarraEditor from "./BarraEditor";
import ModalCompartir from "./ModalCompartir";

const COLORES_NOTA = [
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#14b8a6",
  "#3b82f6",
  "#a855f7",
  "#ec4899",
];

type Guardado = "guardado" | "pendiente" | "guardando" | "error" | "conflicto";

interface Props {
  nota: NotaDto;
  grupos: GrupoDto[];
  /** Algo ha cambiado fuera del texto (título, grupo, color, etiquetas…): la lista se vuelve a pedir. */
  alCambiar: () => void;
  alBorrar: () => void;
  alDuplicar: () => void;
  alRecargar: () => void;
}

/** El editor de una nota: título, barra de formato, texto con guardado automático, etiquetas, color, vínculos, compartir y adjuntos. */
export default function EditorNota({
  nota,
  grupos,
  alCambiar,
  alBorrar,
  alDuplicar,
  alRecargar,
}: Props) {
  const { mostrar, confirmar } = useToast();
  const soloLeer = nota.permiso === "lectura";
  const propietario = nota.permiso === "propietario";
  const [titulo, setTitulo] = useState(nota.titulo);
  const [etiquetas, setEtiquetas] = useState(nota.etiquetas);
  const [nuevaEtiqueta, setNuevaEtiqueta] = useState("");
  const [color, setColor] = useState(nota.color);
  const [fijada, setFijada] = useState(nota.fijada);
  const [idGrupo, setIdGrupo] = useState(nota.id_grupo);
  const [expediente, setExpediente] = useState(
    nota.id_expediente ? String(nota.id_expediente) : "",
  );
  const [ficheros, setFicheros] = useState<FicheroNotaDto[]>(nota.ficheros);
  const [estado, setEstado] = useState<Guardado>("guardado");
  const [compartiendo, setCompartiendo] = useState(false);
  const [subidas, setSubidas] = useState<Record<string, number>>({});
  const base = useRef(nota.actualizado_en);
  const pendiente = useRef<{
    titulo?: string;
    contenido?: Record<string, unknown>;
  }>({});
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);
  const guardando = useRef(false);

  const guardar = useCallback(async () => {
    if (guardando.current) return;
    const cambios = pendiente.current;
    if (cambios.titulo === undefined && cambios.contenido === undefined) return;
    pendiente.current = {};
    guardando.current = true;
    setEstado("guardando");
    try {
      const { data } = await llamar<{ actualizado_en: string }>(
        `/api/notas?id=${nota.id}`,
        { method: "PUT", cuerpo: { ...cambios, base: base.current } },
      );
      base.current = data.actualizado_en;
      setEstado(
        pendiente.current.titulo !== undefined ||
          pendiente.current.contenido !== undefined
          ? "pendiente"
          : "guardado",
      );
      alCambiar();
    } catch (e) {
      const texto = textoError(e);
      setEstado(/Otra persona ha cambiado/.test(texto) ? "conflicto" : "error");
      pendiente.current = { ...cambios, ...pendiente.current };
      mostrar(texto, "error");
    } finally {
      guardando.current = false;
      if (
        pendiente.current.titulo !== undefined ||
        pendiente.current.contenido !== undefined
      )
        programar();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nota.id]);

  const programar = useCallback(() => {
    if (temporizador.current) clearTimeout(temporizador.current);
    temporizador.current = setTimeout(() => void guardar(), 1200);
  }, [guardar]);

  // Al salir de la nota (cambiar de nota o cerrar la pantalla) se guarda lo que quedara pendiente
  useEffect(() => {
    const alIrse = () => {
      if (temporizador.current) clearTimeout(temporizador.current);
      const c = pendiente.current;
      if ((c.titulo !== undefined || c.contenido !== undefined) && !soloLeer) {
        void fetch(`/api/notas?id=${nota.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...c, base: base.current }),
          keepalive: true,
          credentials: "same-origin",
        });
        pendiente.current = {};
      }
    };
    window.addEventListener("beforeunload", alIrse);
    return () => {
      window.removeEventListener("beforeunload", alIrse);
      alIrse();
    };
  }, [nota.id, soloLeer]);

  const subirYInsertar = useCallback(
    async (
      archivos: File[],
      enTexto: boolean,
      editorActual?: {
        chain: () => {
          focus: () => {
            setImage: (o: { src: string; alt?: string }) => { run: () => void };
          };
        };
      } | null,
    ) => {
      for (const a of archivos) {
        const clave = `${a.name}-${a.size}-${Math.random()}`;
        setSubidas((s) => ({ ...s, [clave]: 0 }));
        try {
          const f = await subirFicheroNota(nota.id, a, (p) =>
            setSubidas((s) => ({ ...s, [clave]: p })),
          );
          setFicheros((l) => [...l, f]);
          if (enTexto && esImagen(f.mime) && editorActual)
            editorActual
              .chain()
              .focus()
              .setImage({ src: urlFichero(f.id), alt: f.nombre })
              .run();
          alCambiar();
        } catch (e) {
          mostrar(textoError(e), "error");
        } finally {
          setSubidas((s) => {
            const { [clave]: _quitada, ...resto } = s;
            return resto;
          });
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [nota.id],
  );
  const refEditor = useRef<ReturnType<typeof useEditor>>(null);

  const editor = useEditor({
    immediatelyRender: false,
    editable: !soloLeer,
    content: nota.contenido as Record<string, unknown>,
    extensions: [
      StarterKit.configure({
        link: {
          openOnClick: false,
          autolink: true,
          HTMLAttributes: {
            target: "_blank",
            rel: "noopener noreferrer nofollow",
          },
        },
      }),
      Highlight.configure({ multicolor: true }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Image.configure({ allowBase64: false }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      TextStyle,
      Color,
      TaskList,
      TaskItem.configure({ nested: true }),
      Placeholder.configure({
        placeholder: "Escribe aquí… (pega o arrastra imágenes y archivos)",
      }),
    ],
    onUpdate: ({ editor: e }) => {
      pendiente.current.contenido = e.getJSON() as Record<string, unknown>;
      setEstado("pendiente");
      programar();
    },
    editorProps: {
      handlePaste: (_vista, ev) => {
        const archivos = Array.from(ev.clipboardData?.files ?? []);
        if (archivos.length === 0 || soloLeer) return false;
        void subirYInsertar(archivos, true, refEditor.current as never);
        return true;
      },
      handleDrop: (_vista, ev) => {
        const archivos = Array.from(
          (ev as DragEvent).dataTransfer?.files ?? [],
        );
        if (archivos.length === 0 || soloLeer) return false;
        void subirYInsertar(archivos, true, refEditor.current as never);
        return true;
      },
    },
  });
  useEffect(() => {
    (refEditor as { current: unknown }).current = editor;
  }, [editor]);

  const cambiarAjuste = async (cuerpo: Record<string, unknown>) => {
    try {
      const { data } = await llamar<{ actualizado_en: string }>(
        `/api/notas?id=${nota.id}`,
        { method: "PUT", cuerpo },
      );
      base.current = data.actualizado_en;
      alCambiar();
    } catch (e) {
      mostrar(textoError(e), "error");
    }
  };
  const añadirEtiqueta = () => {
    const t = nuevaEtiqueta.trim().slice(0, 30);
    setNuevaEtiqueta("");
    if (!t || etiquetas.includes(t)) return;
    const nuevas = [...etiquetas, t];
    setEtiquetas(nuevas);
    void cambiarAjuste({ etiquetas: nuevas });
  };
  const quitarEtiqueta = (t: string) => {
    const nuevas = etiquetas.filter((x) => x !== t);
    setEtiquetas(nuevas);
    void cambiarAjuste({ etiquetas: nuevas });
  };
  const fijarExpediente = () => {
    const n =
      expediente.trim() === ""
        ? null
        : Number(expediente.replace(/\D/g, "")) || null;
    if ((n ?? null) === (nota.id_expediente ?? null)) return;
    void cambiarAjuste({ id_expediente: n });
  };
  const quitarFichero = async (f: FicheroNotaDto) => {
    if (
      !(await confirmar({
        titulo: "Quitar el adjunto",
        texto: `¿Quitar «${f.nombre}» de la nota?`,
        aceptar: "Quitar",
        peligro: true,
      }))
    )
      return;
    try {
      await llamar(`/api/notas/ficheros?id=${f.id}`, { method: "DELETE" });
      setFicheros((l) => l.filter((x) => x.id !== f.id));
      alCambiar();
    } catch (e) {
      mostrar(textoError(e), "error");
    }
  };

  const textoEstado = {
    guardado: "✓ Guardado",
    pendiente: "Cambios sin guardar…",
    guardando: "Guardando…",
    error: "⚠ No se ha podido guardar",
    conflicto: "⚠ Otra persona la ha cambiado",
  }[estado];

  return (
    <div
      className="notas-editor"
      style={{
        display: "flex",
        flexDirection: "column",
        minWidth: 0,
        minHeight: 0,
        height: "100%",
        background: "var(--bg-card)",
        borderRadius: "var(--radius-sm)",
        border: "1px solid var(--border-light)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          gap: "8px",
          alignItems: "center",
          padding: "8px 10px",
          flexWrap: "wrap",
          borderBottom: "1px solid var(--border-light)",
        }}
      >
        <input
          aria-label="Título"
          value={titulo}
          readOnly={soloLeer}
          maxLength={200}
          placeholder="Título"
          onChange={(e) => {
            setTitulo(e.target.value);
            pendiente.current.titulo = e.target.value;
            setEstado("pendiente");
            programar();
          }}
          style={{
            flex: "1 1 220px",
            minWidth: 0,
            fontSize: "1.25rem",
            fontWeight: 700,
            background: "transparent",
            border: "none",
            outline: "none",
            color: "var(--text-primary)",
          }}
        />
        <span
          aria-live="polite"
          style={{
            fontSize: "0.75rem",
            color:
              estado === "error" || estado === "conflicto"
                ? "var(--danger)"
                : "var(--text-muted)",
          }}
        >
          {soloLeer ? "👁 Solo lectura" : textoEstado}
        </span>
        {estado === "conflicto" && (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={alRecargar}
            style={{ padding: "2px 10px", fontSize: "0.78rem" }}
          >
            Recargar su versión
          </button>
        )}
      </div>

      <div
        style={{
          display: "flex",
          gap: "8px 12px",
          alignItems: "center",
          padding: "6px 10px",
          flexWrap: "wrap",
          fontSize: "0.8rem",
          borderBottom: "1px solid var(--border-light)",
        }}
      >
        {nota.permiso !== "propietario" && nota.autor && (
          <span style={{ color: "var(--text-muted)" }}>👥 De {nota.autor}</span>
        )}
        {propietario && (
          <>
            <label
              style={{ display: "flex", alignItems: "center", gap: "4px" }}
            >
              Grupo
              <select
                className="form-input"
                value={idGrupo ?? ""}
                onChange={(e) => {
                  const v =
                    e.target.value === "" ? null : Number(e.target.value);
                  setIdGrupo(v);
                  void cambiarAjuste({ id_grupo: v });
                }}
                style={{
                  width: "auto",
                  padding: "2px 6px",
                  fontSize: "0.8rem",
                }}
              >
                <option value="">Sin grupo</option>
                {grupos.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.nombre}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                const v = !fijada;
                setFijada(v);
                void cambiarAjuste({ fijada: v });
              }}
              aria-pressed={fijada}
              title={
                fijada ? "Quitar de las fijadas" : "Fijar arriba de la lista"
              }
              style={{
                padding: "2px 8px",
                fontSize: "0.8rem",
                background: fijada ? "var(--primary)" : undefined,
                color: fijada ? "#fff" : undefined,
              }}
            >
              📌 {fijada ? "Fijada" : "Fijar"}
            </button>
            <span
              style={{ display: "flex", alignItems: "center", gap: "4px" }}
              title="Color de la nota en la lista"
            >
              {COLORES_NOTA.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={`Color ${c}`}
                  aria-pressed={color === c}
                  onClick={() => {
                    const v = color === c ? null : c;
                    setColor(v);
                    void cambiarAjuste({ color: v });
                  }}
                  style={{
                    width: "16px",
                    height: "16px",
                    borderRadius: "50%",
                    background: c,
                    cursor: "pointer",
                    border: `2px solid ${color === c ? "var(--text-primary)" : "transparent"}`,
                  }}
                />
              ))}
            </span>
            <label
              style={{ display: "flex", alignItems: "center", gap: "4px" }}
              title="Vincula la nota a un expediente: escribe su número"
            >
              Expediente
              <input
                className="form-input"
                inputMode="numeric"
                value={expediente}
                onChange={(e) => setExpediente(e.target.value)}
                onBlur={fijarExpediente}
                onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                placeholder="nº"
                style={{
                  width: "64px",
                  padding: "2px 6px",
                  fontSize: "0.8rem",
                }}
              />
            </label>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setCompartiendo(true)}
              style={{ padding: "2px 8px", fontSize: "0.8rem" }}
            >
              👥 Compartir{nota.compartida ? " ✓" : ""}
            </button>
          </>
        )}
        {nota.id_expediente && (
          <a
            href={`/dashboard/expedientes/editar/${nota.id_expediente}`}
            style={{ fontSize: "0.8rem" }}
          >
            🔗 Ir al expediente #EXP-
            {String(nota.id_expediente).padStart(4, "0")}
          </a>
        )}
        <span style={{ marginLeft: "auto", display: "flex", gap: "6px" }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={alDuplicar}
            title="Hacer una copia en tu cuenta"
            style={{ padding: "2px 8px", fontSize: "0.8rem" }}
          >
            ⧉ Duplicar
          </button>
          {propietario && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={alBorrar}
              style={{ padding: "2px 8px", fontSize: "0.8rem" }}
            >
              🗑 A la papelera
            </button>
          )}
        </span>
      </div>

      <div
        style={{
          display: "flex",
          gap: "6px",
          alignItems: "center",
          padding: "6px 10px",
          flexWrap: "wrap",
          fontSize: "0.8rem",
          borderBottom: "1px solid var(--border-light)",
        }}
      >
        <span style={{ color: "var(--text-muted)" }}>🏷 Etiquetas</span>
        {etiquetas.map((t) => (
          <span
            key={t}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
              padding: "1px 8px",
              borderRadius: "999px",
              background: "rgba(var(--primary-rgb), 0.15)",
              border: "1px solid var(--primary)",
            }}
          >
            {t}
            {!soloLeer && (
              <button
                type="button"
                aria-label={`Quitar la etiqueta ${t}`}
                onClick={() => quitarEtiqueta(t)}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "inherit",
                  padding: 0,
                  lineHeight: 1,
                }}
              >
                ✕
              </button>
            )}
          </span>
        ))}
        {!soloLeer && (
          <input
            className="form-input"
            value={nuevaEtiqueta}
            maxLength={30}
            placeholder="Añadir…"
            onChange={(e) => setNuevaEtiqueta(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === ",") {
                e.preventDefault();
                añadirEtiqueta();
              }
            }}
            onBlur={añadirEtiqueta}
            style={{ width: "110px", padding: "2px 8px", fontSize: "0.8rem" }}
          />
        )}
      </div>

      {editor && !soloLeer && (
        <BarraEditor
          editor={editor}
          deshabilitada={false}
          alSubirImagen={(l) => void subirYInsertar(l, true, editor as never)}
        />
      )}
      <div
        className="notas-contenido"
        style={{
          flex: 1,
          minHeight: "200px",
          overflowY: "auto",
          padding: "10px 16px",
        }}
        onClick={() => editor?.commands.focus()}
      >
        <EditorContent editor={editor} />
      </div>

      <div
        style={{
          borderTop: "1px solid var(--border-light)",
          padding: "8px 10px",
          display: "flex",
          flexDirection: "column",
          gap: "6px",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            flexWrap: "wrap",
            fontSize: "0.8rem",
          }}
        >
          <strong>📎 Adjuntos ({ficheros.length})</strong>
          {!soloLeer && (
            <label
              className="btn btn-secondary"
              style={{
                padding: "2px 10px",
                fontSize: "0.78rem",
                cursor: "pointer",
              }}
            >
              + Añadir archivos
              <input
                type="file"
                multiple
                hidden
                onChange={(e) => {
                  const l = Array.from(e.target.files ?? []);
                  e.target.value = "";
                  if (l.length > 0) void subirYInsertar(l, false);
                }}
              />
            </label>
          )}
          <span style={{ color: "var(--text-muted)" }}>
            Hasta 500 MB por archivo. También puedes pegar o arrastrar archivos
            al texto.
          </span>
        </div>
        {Object.entries(subidas).map(([k, p]) => (
          <div
            key={k}
            style={{ fontSize: "0.78rem", color: "var(--text-secondary)" }}
          >
            Subiendo {k.split("-")[0]}… {p}%
            <div
              style={{
                height: "4px",
                background: "var(--border-light)",
                borderRadius: "2px",
              }}
            >
              <div
                style={{
                  width: `${p}%`,
                  height: "100%",
                  background: "var(--primary)",
                  borderRadius: "2px",
                }}
              />
            </div>
          </div>
        ))}
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          {ficheros.map((f) => (
            <div
              key={f.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "4px 8px",
                border: "1px solid var(--border-light)",
                borderRadius: "var(--radius-sm)",
                maxWidth: "300px",
                fontSize: "0.78rem",
              }}
            >
              {f.tiene_miniatura ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={urlFichero(f.id, true)}
                  alt=""
                  width={36}
                  height={36}
                  style={{ objectFit: "cover", borderRadius: "4px" }}
                />
              ) : (
                <span aria-hidden style={{ fontSize: "1.3rem" }}>
                  {f.mime === "application/pdf" ? "📄" : "📎"}
                </span>
              )}
              <span
                style={{
                  display: "flex",
                  flexDirection: "column",
                  minWidth: 0,
                }}
              >
                <a
                  href={`${urlFichero(f.id)}${esImagen(f.mime) || f.mime === "application/pdf" ? "" : "&descargar=1"}`}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {f.nombre}
                </a>
                <span style={{ color: "var(--text-muted)" }}>
                  {tamanoLegible(f.tamano)}
                </span>
              </span>
              {!soloLeer && esImagen(f.mime) && (
                <button
                  type="button"
                  title="Insertar en el texto"
                  onClick={() =>
                    editor
                      ?.chain()
                      .focus()
                      .setImage({ src: urlFichero(f.id), alt: f.nombre })
                      .run()
                  }
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                  }}
                >
                  ↳
                </button>
              )}
              {!soloLeer && (
                <button
                  type="button"
                  aria-label={`Quitar ${f.nombre}`}
                  onClick={() => void quitarFichero(f)}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: "var(--danger)",
                  }}
                >
                  🗑
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
      {compartiendo && (
        <ModalCompartir
          idNota={nota.id}
          titulo={titulo}
          alCerrar={() => setCompartiendo(false)}
          alGuardar={alCambiar}
        />
      )}
    </div>
  );
}
