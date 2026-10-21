/** Categorías de la biblioteca de archivos (módulo sin dependencias, para usarlo tanto en el servidor como en el navegador). */
export const CATEGORIAS = ["pedido", "pago_rci", "rejilla", "listado", "otro"] as const;
export type CategoriaBiblioteca = (typeof CATEGORIAS)[number];

export const ETIQUETA_CATEGORIA: Record<CategoriaBiblioteca, string> = {
  pedido: "Pedidos de clientes",
  pago_rci: "Pagos de RCI",
  rejilla: "Rejillas de comisiones",
  listado: "Listados Excel",
  otro: "Otros",
};

/** Categoría que se propone por el nombre y el tipo del archivo (se puede cambiar a mano). */
export function adivinarCategoria(nombre: string, mime = ""): CategoriaBiblioteca {
  const n = nombre.toLowerCase();
  if (/\.(xlsx|xls|csv)$/.test(n) || /spreadsheet|excel|csv/.test(mime)) return "listado";
  if (/rci|pago/.test(n)) return "pago_rci";
  if (/rejilla|comision|nomina|ren-91/.test(n)) return "rejilla";
  if (/\.(pdf|png|jpe?g|webp|bmp|tiff?)$/.test(n) || /^image\/|pdf/.test(mime)) return "pedido";
  return "otro";
}

const MESES_LARGOS = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

/** «2026-07-07» → «07 Julio 2026» (null si no es una fecha). */
export function fechaLarga(iso: string | null | undefined): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  if (!m || Number(m[2]) < 1 || Number(m[2]) > 12) return null;
  return `${m[3]} ${MESES_LARGOS[Number(m[2]) - 1]} ${m[1]}`;
}

/** «2024-04» → «Abril 2024» (null si no es un mes). */
export function mesLargo(mes: string | null | undefined): string | null {
  const m = /^(\d{4})-(\d{2})$/.exec(mes ?? "");
  if (!m || Number(m[2]) < 1 || Number(m[2]) > 12) return null;
  return `${MESES_LARGOS[Number(m[2]) - 1]} ${m[1]}`;
}

const PARTICULAS = new Set(["de", "del", "la", "las", "los", "el", "y", "e", "da", "do", "di", "van", "von"]);

/** «MARIA  DE LA SOLEDAD delgado» → «Maria de la Soledad Delgado»; sin caracteres que no valen en un nombre de archivo. */
export function nombrePropio(texto: string): string {
  return texto
    .replace(/[\/:*?"<>|]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .map((p, i) => (i > 0 && PARTICULAS.has(p.toLowerCase()) ? p.toLowerCase() : p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()))
    .join(" ");
}

/**
 * Nombre con el que se guarda un documento leído en la biblioteca: «Pedido - Jose Francisco Gomez - 07 Julio 2026.pdf», «Pago RCI - … .pdf» o
 * «Rejilla - Abril 2024.pdf». Devuelve null si falta lo que hace falta para ponerlo (el cliente en pedidos y pagos, el mes en las rejillas):
 * en ese caso el archivo conserva el nombre que tenía.
 */
export function nombreAutomatico(e: { categoria: CategoriaBiblioteca; cliente?: string | null; fecha?: string | null; mes?: string | null; nombreOriginal: string }): string | null {
  const punto = e.nombreOriginal.lastIndexOf(".");
  const extension = punto > 0 && e.nombreOriginal.length - punto <= 6 ? e.nombreOriginal.slice(punto) : "";
  let base: string | null = null;
  if (e.categoria === "rejilla") {
    const mes = mesLargo(e.mes);
    base = mes ? `Rejilla - ${mes}` : null;
  } else if (e.categoria === "pedido" || e.categoria === "pago_rci") {
    const cliente = e.cliente ? nombrePropio(e.cliente) : "";
    if (cliente.length >= 3) base = [e.categoria === "pedido" ? "Pedido" : "Pago RCI", cliente, fechaLarga(e.fecha)].filter(Boolean).join(" - ");
  }
  return base ? `${base}${extension.toLowerCase()}` : null;
}
