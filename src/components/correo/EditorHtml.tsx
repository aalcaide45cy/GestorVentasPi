"use client";

import Image from "@tiptap/extension-image";
import {
  Table,
  TableCell,
  TableHeader,
  TableRow,
} from "@tiptap/extension-table";
import { Color, TextStyle } from "@tiptap/extension-text-style";
import { useEffect, useRef } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { CAMPOS_CORREO } from "@/lib/correo";

/** Reduce una imagen subida a un máximo de ancho y la devuelve como dato en línea (para que viaje dentro del correo). */
async function imagenEnLinea(archivo: File, anchoMax = 600): Promise<string> {
  const url = URL.createObjectURL(archivo);
  try {
    const img = await new Promise<HTMLImageElement>((ok, mal) => {
      const i = new window.Image();
      i.onload = () => ok(i);
      i.onerror = () => mal(new Error("No se pudo leer la imagen"));
      i.src = url;
    });
    const escala = Math.min(1, anchoMax / img.naturalWidth);
    const c = document.createElement("canvas");
    c.width = Math.round(img.naturalWidth * escala);
    c.height = Math.round(img.naturalHeight * escala);
    c.getContext("2d")?.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL(
      archivo.type === "image/jpeg" ? "image/jpeg" : "image/png",
      0.9,
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Baja las imágenes de internet que hay en el editor y las deja como datos en línea; las que no se pueden bajar se avisan. */
async function guardarImagenesRemotas(editor: Editor | null): Promise<void> {
  if (!editor || editor.isDestroyed) return;
  const urls: string[] = [];
  editor.state.doc.descendants((n) => {
    if (
      n.type.name === "image" &&
      typeof n.attrs.src === "string" &&
      /^https?:/i.test(n.attrs.src)
    )
      urls.push(n.attrs.src as string);
  });
  if (urls.length === 0) return;
  let datos: Record<string, string> = {};
  try {
    const r = await fetch("/api/correo/imagen", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ urls }),
    });
    datos = ((await r.json()) as { data?: Record<string, string> }).data ?? {};
  } catch {
    /* se avisa abajo */
  }
  const { tr } = editor.state;
  let cambios = 0;
  editor.state.doc.descendants((n, pos) => {
    const src = n.attrs.src as string | undefined;
    if (n.type.name === "image" && src && datos[src]) {
      tr.setNodeMarkup(pos, undefined, { ...n.attrs, src: datos[src] });
      cambios++;
    }
  });
  if (cambios > 0) editor.view.dispatch(tr);
  const fallidas = urls.filter((u) => !datos[u]);
  if (fallidas.length > 0) {
    const sitios = [
      ...new Set(
        fallidas.map((u) => {
          try {
            return new URL(u).hostname;
          } catch {
            return "dirección no válida";
          }
        }),
      ),
    ].join(", ");
    window.alert(
      `${fallidas.length} de ${urls.length} imágenes no se han podido descargar (de: ${sitios}). Suelen ser las que solo se ven con tu sesión de Gmail: copia la firma desde un correo que hayas enviado, o bórralas y súbelas con «🖼️ Subir».`,
    );
  }
}

/** Editor sencillo de texto con formato para el cuerpo de un correo, una plantilla o una firma (con selector de campos o con imágenes y tablas). */
export default function EditorHtml({
  valor,
  alCambiar,
  conCampos,
  conImagenes,
}: {
  valor: string;
  alCambiar: (html: string) => void;
  conCampos?: boolean;
  conImagenes?: boolean;
}) {
  const refEditor = useRef<Editor | null>(null);
  const editor = useEditor({
    immediatelyRender: false,
    content: valor,
    extensions: [
      ...(conImagenes
        ? [
            Image.configure({
              inline: true,
              allowBase64: true,
              HTMLAttributes: { referrerpolicy: "no-referrer" },
            }),
            Table.configure({ resizable: false }),
            TableRow,
            TableHeader,
            TableCell,
            TextStyle,
            Color,
          ]
        : []),
      StarterKit.configure({
        link: {
          openOnClick: false,
          autolink: true,
          HTMLAttributes: { target: "_blank", rel: "noopener noreferrer" },
        },
        undoRedo: { depth: 200 },
      }),
    ],
    editorProps: conImagenes
      ? {
          // Tras pegar (por ejemplo, la firma de Gmail) se bajan las imágenes de internet y se guardan dentro del texto
          handlePaste: () => {
            setTimeout(
              () => void guardarImagenesRemotas(refEditor.current),
              400,
            );
            return false;
          },
        }
      : {},
    onUpdate: ({ editor: e }) => alCambiar(e.isEmpty ? "" : e.getHTML()),
  });
  useEffect(() => {
    refEditor.current = editor;
  }, [editor]);
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
        {conImagenes && (
          <>
            {b("🖼️ Subir", "Insertar una imagen de tu ordenador", false, () => {
              const i = document.createElement("input");
              i.type = "file";
              i.accept = "image/png,image/jpeg,image/gif,image/webp";
              i.onchange = async () => {
                const f = i.files?.[0];
                if (!f) return;
                try {
                  editor
                    .chain()
                    .focus()
                    .setImage({ src: await imagenEnLinea(f) })
                    .run();
                } catch (e) {
                  window.alert(
                    e instanceof Error
                      ? e.message
                      : "No se pudo insertar la imagen",
                  );
                }
              };
              i.click();
            })}
            {b(
              "🖼️ Enlace",
              "Insertar una imagen desde una dirección web",
              false,
              () => {
                const url = window.prompt(
                  "Dirección de la imagen (https://…):",
                  "https://",
                );
                if (url && /^https?:\/\//i.test(url.trim()))
                  editor.chain().focus().setImage({ src: url.trim() }).run();
              },
            )}
          </>
        )}
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
