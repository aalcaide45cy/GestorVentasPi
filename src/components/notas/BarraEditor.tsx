"use client";

import type { Editor } from "@tiptap/react";
import { useEditorState } from "@tiptap/react";
import { useState } from "react";

const COLORES_TEXTO = [
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#14b8a6",
  "#3b82f6",
  "#a855f7",
  "#ec4899",
  "#6b7280",
];
const COLORES_RESALTE = [
  "#fef08a",
  "#bbf7d0",
  "#bfdbfe",
  "#fbcfe8",
  "#fed7aa",
  "#e9d5ff",
];

const estiloBoton = (activo: boolean) =>
  ({
    padding: "3px 8px",
    minWidth: "28px",
    fontSize: "0.85rem",
    lineHeight: 1.3,
    border: "1px solid var(--border-light)",
    borderRadius: "var(--radius-sm)",
    background: activo ? "var(--primary)" : "transparent",
    color: activo ? "#fff" : "var(--text-primary)",
    cursor: "pointer",
  }) as const;

/** La barra de herramientas del editor de notas: formato de texto, listas, tablas, enlaces, imágenes y colores. */
export default function BarraEditor({
  editor,
  alSubirImagen,
  deshabilitada,
}: {
  editor: Editor;
  alSubirImagen: (archivos: File[]) => void;
  deshabilitada: boolean;
}) {
  const estado = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      negrita: e.isActive("bold"),
      cursiva: e.isActive("italic"),
      subrayado: e.isActive("underline"),
      tachado: e.isActive("strike"),
      codigo: e.isActive("code"),
      h1: e.isActive("heading", { level: 1 }),
      h2: e.isActive("heading", { level: 2 }),
      h3: e.isActive("heading", { level: 3 }),
      lista: e.isActive("bulletList"),
      numerada: e.isActive("orderedList"),
      tareas: e.isActive("taskList"),
      cita: e.isActive("blockquote"),
      bloque: e.isActive("codeBlock"),
      enlace: e.isActive("link"),
      tabla: e.isActive("table"),
      izquierda: e.isActive({ textAlign: "left" }),
      centro: e.isActive({ textAlign: "center" }),
      derecha: e.isActive({ textAlign: "right" }),
      puedeDeshacer: e.can().undo(),
      puedeRehacer: e.can().redo(),
    }),
  });
  const [paleta, setPaleta] = useState<"texto" | "resalte" | null>(null);
  const cadena = () => editor.chain().focus();

  const poner = (
    activo: boolean,
    titulo: string,
    texto: string,
    accion: () => void,
    bloqueado = false,
  ) => (
    <button
      key={titulo}
      type="button"
      title={titulo}
      aria-label={titulo}
      aria-pressed={activo}
      disabled={deshabilitada || bloqueado}
      onClick={accion}
      style={{
        ...estiloBoton(activo),
        opacity: deshabilitada || bloqueado ? 0.4 : 1,
      }}
    >
      {texto}
    </button>
  );
  const separador = (
    <span
      aria-hidden
      style={{
        width: "1px",
        alignSelf: "stretch",
        background: "var(--border-light)",
        margin: "0 2px",
      }}
    />
  );

  const enlace = () => {
    const previo = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt(
      "Dirección del enlace (déjala vacía para quitarlo):",
      previo ?? "https://",
    );
    if (url === null) return;
    if (url.trim() === "" || url.trim() === "https://")
      cadena().extendMarkRange("link").unsetLink().run();
    else
      cadena()
        .extendMarkRange("link")
        .setLink({
          href: /^(https?:|mailto:|tel:|\/)/i.test(url.trim())
            ? url.trim()
            : `https://${url.trim()}`,
        })
        .run();
  };

  return (
    <div
      role="toolbar"
      aria-label="Formato"
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: "4px",
        alignItems: "center",
        padding: "6px 8px",
        borderBottom: "1px solid var(--border-light)",
        position: "relative",
      }}
    >
      {poner(
        false,
        "Deshacer",
        "↶",
        () => cadena().undo().run(),
        !estado.puedeDeshacer,
      )}
      {poner(
        false,
        "Rehacer",
        "↷",
        () => cadena().redo().run(),
        !estado.puedeRehacer,
      )}
      {separador}
      {poner(estado.h1, "Título grande", "H1", () =>
        cadena().toggleHeading({ level: 1 }).run(),
      )}
      {poner(estado.h2, "Título mediano", "H2", () =>
        cadena().toggleHeading({ level: 2 }).run(),
      )}
      {poner(estado.h3, "Título pequeño", "H3", () =>
        cadena().toggleHeading({ level: 3 }).run(),
      )}
      {separador}
      {poner(estado.negrita, "Negrita (Ctrl+B)", "B", () =>
        cadena().toggleBold().run(),
      )}
      {poner(estado.cursiva, "Cursiva (Ctrl+I)", "I", () =>
        cadena().toggleItalic().run(),
      )}
      {poner(estado.subrayado, "Subrayado (Ctrl+U)", "U", () =>
        cadena().toggleUnderline().run(),
      )}
      {poner(estado.tachado, "Tachado", "S", () =>
        cadena().toggleStrike().run(),
      )}
      {poner(estado.codigo, "Código", "‹›", () => cadena().toggleCode().run())}
      {separador}
      <span style={{ position: "relative" }}>
        {poner(paleta === "texto", "Color del texto", "A", () =>
          setPaleta(paleta === "texto" ? null : "texto"),
        )}
        {paleta === "texto" && (
          <span
            style={{
              position: "absolute",
              top: "100%",
              left: 0,
              zIndex: 20,
              display: "flex",
              gap: "4px",
              padding: "6px",
              background: "var(--bg-card)",
              border: "1px solid var(--border-light)",
              borderRadius: "var(--radius-sm)",
              boxShadow: "0 6px 16px rgba(0,0,0,0.3)",
            }}
          >
            {COLORES_TEXTO.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Texto ${c}`}
                onClick={() => {
                  cadena().setColor(c).run();
                  setPaleta(null);
                }}
                style={{
                  width: "22px",
                  height: "22px",
                  borderRadius: "50%",
                  background: c,
                  border: "2px solid var(--border-light)",
                  cursor: "pointer",
                }}
              />
            ))}
            <button
              type="button"
              onClick={() => {
                cadena().unsetColor().run();
                setPaleta(null);
              }}
              title="Quitar el color"
              style={{ ...estiloBoton(false), padding: "0 6px" }}
            >
              ✖
            </button>
          </span>
        )}
      </span>
      <span style={{ position: "relative" }}>
        {poner(paleta === "resalte", "Resaltar", "🖍", () =>
          setPaleta(paleta === "resalte" ? null : "resalte"),
        )}
        {paleta === "resalte" && (
          <span
            style={{
              position: "absolute",
              top: "100%",
              left: 0,
              zIndex: 20,
              display: "flex",
              gap: "4px",
              padding: "6px",
              background: "var(--bg-card)",
              border: "1px solid var(--border-light)",
              borderRadius: "var(--radius-sm)",
              boxShadow: "0 6px 16px rgba(0,0,0,0.3)",
            }}
          >
            {COLORES_RESALTE.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Resaltado ${c}`}
                onClick={() => {
                  cadena().setHighlight({ color: c }).run();
                  setPaleta(null);
                }}
                style={{
                  width: "22px",
                  height: "22px",
                  borderRadius: "4px",
                  background: c,
                  border: "2px solid var(--border-light)",
                  cursor: "pointer",
                }}
              />
            ))}
            <button
              type="button"
              onClick={() => {
                cadena().unsetHighlight().run();
                setPaleta(null);
              }}
              title="Quitar el resaltado"
              style={{ ...estiloBoton(false), padding: "0 6px" }}
            >
              ✖
            </button>
          </span>
        )}
      </span>
      {separador}
      {poner(estado.lista, "Lista con puntos", "• —", () =>
        cadena().toggleBulletList().run(),
      )}
      {poner(estado.numerada, "Lista numerada", "1.", () =>
        cadena().toggleOrderedList().run(),
      )}
      {poner(estado.tareas, "Lista de tareas (casillas)", "☑", () =>
        cadena().toggleTaskList().run(),
      )}
      {poner(estado.cita, "Cita", "❝", () => cadena().toggleBlockquote().run())}
      {poner(estado.bloque, "Bloque de código", "{ }", () =>
        cadena().toggleCodeBlock().run(),
      )}
      {separador}
      {poner(estado.izquierda, "Alinear a la izquierda", "⇤", () =>
        cadena().setTextAlign("left").run(),
      )}
      {poner(estado.centro, "Centrar", "≡", () =>
        cadena().setTextAlign("center").run(),
      )}
      {poner(estado.derecha, "Alinear a la derecha", "⇥", () =>
        cadena().setTextAlign("right").run(),
      )}
      {separador}
      {poner(estado.enlace, "Enlace", "🔗", enlace)}
      <label
        title="Insertar una imagen"
        style={{
          ...estiloBoton(false),
          opacity: deshabilitada ? 0.4 : 1,
          display: "inline-flex",
          alignItems: "center",
        }}
      >
        🖼
        <input
          type="file"
          accept="image/*"
          multiple
          hidden
          disabled={deshabilitada}
          onChange={(e) => {
            const l = Array.from(e.target.files ?? []);
            e.target.value = "";
            if (l.length > 0) alSubirImagen(l);
          }}
        />
      </label>
      {poner(false, "Línea horizontal", "―", () =>
        cadena().setHorizontalRule().run(),
      )}
      {poner(estado.tabla, "Insertar una tabla de 3×3", "▦", () =>
        cadena().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
      )}
      {estado.tabla && (
        <>
          {poner(false, "Añadir columna", "+║", () =>
            cadena().addColumnAfter().run(),
          )}
          {poner(false, "Añadir fila", "+═", () =>
            cadena().addRowAfter().run(),
          )}
          {poner(false, "Quitar columna", "−║", () =>
            cadena().deleteColumn().run(),
          )}
          {poner(false, "Quitar fila", "−═", () => cadena().deleteRow().run())}
          {poner(false, "Quitar la tabla", "🗑▦", () =>
            cadena().deleteTable().run(),
          )}
        </>
      )}
      {separador}
      {poner(false, "Quitar el formato", "Tx", () =>
        cadena().unsetAllMarks().clearNodes().run(),
      )}
    </div>
  );
}
