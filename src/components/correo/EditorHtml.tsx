"use client";

import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { CAMPOS_CORREO } from "@/lib/correo";

/** Editor sencillo de texto con formato para el cuerpo de un correo o de una plantilla (opcionalmente con un selector de campos). */
export default function EditorHtml({
  valor,
  alCambiar,
  conCampos,
}: {
  valor: string;
  alCambiar: (html: string) => void;
  conCampos?: boolean;
}) {
  const editor = useEditor({
    immediatelyRender: false,
    content: valor,
    extensions: [
      StarterKit.configure({
        link: {
          openOnClick: false,
          autolink: true,
          HTMLAttributes: { target: "_blank", rel: "noopener noreferrer" },
        },
        undoRedo: { depth: 200 },
      }),
    ],
    onUpdate: ({ editor: e }) => alCambiar(e.isEmpty ? "" : e.getHTML()),
  });
  if (!editor)
    return <div className="form-input" style={{ minHeight: "180px" }} />;
  const b = (txt: string, titulo: string, activo: boolean, f: () => void) => (
    <button
      key={titulo}
      type="button"
      title={titulo}
      aria-pressed={activo}
      onMouseDown={(e) => e.preventDefault()}
      onClick={f}
      className={activo ? "btn btn-primary" : "btn btn-secondary"}
      style={{ padding: "2px 9px", fontSize: "0.85rem" }}
    >
      {txt}
    </button>
  );
  const grupos = [...new Set(CAMPOS_CORREO.map((c) => c.grupo))];
  return (
    <div
      style={{
        border: "1px solid var(--border-light)",
        borderRadius: "var(--radius-sm)",
        background: "var(--bg-card)",
      }}
    >
      <div
        style={{
          display: "flex",
          gap: "4px",
          flexWrap: "wrap",
          padding: "6px",
          borderBottom: "1px solid var(--border-light)",
          alignItems: "center",
        }}
      >
        {b("N", "Negrita", editor.isActive("bold"), () =>
          editor.chain().focus().toggleBold().run(),
        )}
        {b("K", "Cursiva", editor.isActive("italic"), () =>
          editor.chain().focus().toggleItalic().run(),
        )}
        {b("S", "Subrayado", editor.isActive("underline"), () =>
          editor.chain().focus().toggleUnderline().run(),
        )}
        {b("H", "Título", editor.isActive("heading"), () =>
          editor.chain().focus().toggleHeading({ level: 3 }).run(),
        )}
        {b("• Lista", "Lista", editor.isActive("bulletList"), () =>
          editor.chain().focus().toggleBulletList().run(),
        )}
        {b("1. Lista", "Lista numerada", editor.isActive("orderedList"), () =>
          editor.chain().focus().toggleOrderedList().run(),
        )}
        {b("🔗", "Enlace", editor.isActive("link"), () => {
          const url = window.prompt(
            "Dirección del enlace (vacío para quitarlo):",
            (editor.getAttributes("link").href as string | undefined) ??
              "https://",
          );
          if (url === null) return;
          if (url.trim() === "") editor.chain().focus().unsetLink().run();
          else
            editor
              .chain()
              .focus()
              .extendMarkRange("link")
              .setLink({ href: url.trim() })
              .run();
        })}
        {b("↶", "Deshacer", false, () => editor.chain().focus().undo().run())}
        {b("↷", "Rehacer", false, () => editor.chain().focus().redo().run())}
        {conCampos && (
          <select
            className="form-input"
            aria-label="Insertar un campo"
            value=""
            onChange={(e) => {
              if (e.target.value)
                editor
                  .chain()
                  .focus()
                  .insertContent(`{${e.target.value}}`)
                  .run();
            }}
            style={{
              width: "auto",
              padding: "2px 8px",
              fontSize: "0.82rem",
              marginLeft: "auto",
            }}
          >
            <option value="">＋ Insertar campo…</option>
            {grupos.map((g) => (
              <optgroup key={g} label={g}>
                {CAMPOS_CORREO.filter((c) => c.grupo === g).map((c) => (
                  <option key={c.clave} value={c.clave}>
                    {c.etiqueta}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        )}
      </div>
      <div
        className="notas-contenido"
        style={{
          minHeight: "180px",
          maxHeight: "45vh",
          overflowY: "auto",
          padding: "8px 12px",
        }}
      >
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
