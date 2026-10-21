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
