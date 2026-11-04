import Image from "@tiptap/extension-image";

/** Cómo se coloca una imagen: en su propio renglón (a la izquierda, centrada o a la derecha) o flotando junto al texto. */
export type AlineacionImagen =
  "izquierda" | "centro" | "derecha" | "flota-izquierda" | "flota-derecha";

const ALINEACIONES: AlineacionImagen[] = [
  "izquierda",
  "centro",
  "derecha",
  "flota-izquierda",
  "flota-derecha",
];

/**
 * La imagen del editor, con tamaño y posición ajustables: el tamaño se cambia arrastrando la esquina o con los botones de la barra (en porcentaje del ancho del
 * texto, así se adapta a cualquier pantalla), y la posición con la alineación o arrastrando la imagen a otro sitio del texto. Siempre se guarda el archivo
 * original, sin comprimir: solo cambia cómo se enseña, así que no pierde calidad.
 */
export const ImagenAjustable = Image.extend({
  group: "block",
  inline: false,
  draggable: true,

  addAttributes() {
    return {
      ...this.parent?.(),
      /** Ancho en porcentaje del texto («50%») o `null` para el tamaño natural (sin pasar del ancho disponible). */
      ancho: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-ancho"),
        renderHTML: (a) =>
          a.ancho
            ? {
                "data-ancho": a.ancho as string,
                style: `width:${a.ancho as string}`,
              }
            : {},
      },
      alineacion: {
        default: "izquierda",
        parseHTML: (el) => el.getAttribute("data-alineacion") ?? "izquierda",
        renderHTML: (a) => ({ "data-alineacion": a.alineacion as string }),
      },
    };
  },

  addNodeView() {
    return ({ node: nodoInicial, getPos, editor }) => {
      let nodo = nodoInicial;
      const dom = document.createElement("div");
      dom.className = "nota-img";
      const img = document.createElement("img");
      img.draggable = false;
      const asa = document.createElement("span");
      asa.className = "nota-img-asa";
      asa.title = "Arrastra para cambiar el tamaño";
      dom.append(img, asa);

      const pintar = () => {
        const a = nodo.attrs as {
          src: string;
          alt?: string;
          title?: string;
          ancho: string | null;
          alineacion: string;
        };
        img.src = a.src;
        img.alt = a.alt ?? "";
        dom.dataset.alineacion = ALINEACIONES.includes(
          a.alineacion as AlineacionImagen,
        )
          ? a.alineacion
          : "izquierda";
        dom.style.width = a.ancho ?? "";
        asa.style.display = editor.isEditable ? "" : "none";
      };
      pintar();

      asa.addEventListener("pointerdown", (ev) => {
        if (!editor.isEditable) return;
        ev.preventDefault();
        ev.stopPropagation();
        const contenedor =
          (dom.closest(".ProseMirror") as HTMLElement | null) ??
          dom.parentElement;
        const anchoMax = contenedor ? contenedor.clientWidth : dom.clientWidth;
        const inicio = ev.clientX;
        const anchoInicial = dom.getBoundingClientRect().width;
        let porcentaje = Math.round((anchoInicial / anchoMax) * 100);
        asa.setPointerCapture(ev.pointerId);
        const mover = (e: PointerEvent) => {
          porcentaje = Math.max(
            5,
            Math.min(
              100,
              Math.round(
                ((anchoInicial + (e.clientX - inicio)) / anchoMax) * 100,
              ),
            ),
          );
          dom.style.width = `${porcentaje}%`;
        };
        const soltar = () => {
          asa.removeEventListener("pointermove", mover);
          asa.removeEventListener("pointerup", soltar);
          const pos = getPos();
          if (typeof pos === "number")
            editor
              .chain()
              .command(
                ({ tr }) => (
                  tr.setNodeMarkup(pos, undefined, {
                    ...nodo.attrs,
                    ancho: `${porcentaje}%`,
                  }),
                  true
                ),
              )
              .run();
        };
        asa.addEventListener("pointermove", mover);
        asa.addEventListener("pointerup", soltar);
      });

      return {
        dom,
        update: (nuevo) => {
          if (nuevo.type !== nodo.type) return false;
          nodo = nuevo;
          pintar();
          return true;
        },
        selectNode: () => dom.classList.add("seleccionada"),
        deselectNode: () => dom.classList.remove("seleccionada"),
        stopEvent: (e) => e.target === asa,
        ignoreMutation: () => true,
      };
    };
  },
});
