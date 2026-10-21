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
