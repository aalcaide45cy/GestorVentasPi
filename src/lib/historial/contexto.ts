import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

/**
 * Contexto de una petición que cambia datos: sirve para que los disparadores de la base de datos sepan a qué grupo y a qué usuario
 * pertenece cada fila cambiada (historial de deshacer y rehacer). Se crea en `manejar` y el usuario se fija al comprobar la sesión.
 */
export interface ContextoHistorial {
  grupo: string;
  accion: string;
  usuario: number | null;
}

const almacen = new AsyncLocalStorage<ContextoHistorial>();

export const contextoHistorial = (): ContextoHistorial | undefined => almacen.getStore();

/** Ejecuta `fn` con un contexto nuevo (un grupo de cambios) para la acción indicada. */
export function conContextoHistorial<T>(accion: string, fn: () => T): T {
  return almacen.run({ grupo: randomUUID(), accion, usuario: null }, fn);
}

/** Lo llama la comprobación de sesión: a partir de aquí, los cambios de la petición se anotan a nombre de este usuario. */
export function fijarUsuarioHistorial(idUsuario: number): void {
  const c = almacen.getStore();
  if (c) c.usuario = idUsuario;
}

const VERBO: Record<string, string> = { POST: "Crear", PUT: "Modificar", PATCH: "Modificar", DELETE: "Eliminar" };

/** Reglas de texto (la primera que coincide gana): ruta y, si hace falta, el método. */
const ETIQUETAS: { ruta: RegExp; metodo?: RegExp; texto: string }[] = [
  { ruta: /^\/api\/expedientes\/duplicar/, texto: "Duplicar expedientes" },
  { ruta: /^\/api\/expedientes\/completar/, texto: "Completar datos de expedientes" },
  { ruta: /^\/api\/expedientes\/(importar-excel|import)/, texto: "Importar expedientes" },
  { ruta: /^\/api\/expedientes\/comisionado/, texto: "Marcar comisionado" },
  { ruta: /^\/api\/expedientes/, metodo: /^POST$/, texto: "Crear expediente" },
  { ruta: /^\/api\/expedientes/, metodo: /^(PUT|PATCH)$/, texto: "Editar expediente" },
  { ruta: /^\/api\/expedientes/, metodo: /^DELETE$/, texto: "Eliminar expedientes" },
  { ruta: /^\/api\/clientes\/import/, texto: "Importar clientes" },
  { ruta: /^\/api\/clientes/, metodo: /^POST$/, texto: "Crear cliente" },
  { ruta: /^\/api\/clientes/, metodo: /^(PUT|PATCH)$/, texto: "Editar cliente" },
  { ruta: /^\/api\/clientes/, metodo: /^DELETE$/, texto: "Eliminar clientes" },
  { ruta: /^\/api\/admin\/catalogos/, metodo: /^POST$/, texto: "Crear en catálogos" },
  { ruta: /^\/api\/admin\/catalogos/, metodo: /^(PUT|PATCH)$/, texto: "Editar catálogos" },
  { ruta: /^\/api\/admin\/catalogos/, metodo: /^DELETE$/, texto: "Eliminar de catálogos" },
  { ruta: /^\/api\/admin\/tiendas/, texto: "Cambiar tiendas" },
  { ruta: /^\/api\/admin\/datos\/importar/, texto: "Importar datos" },
  { ruta: /^\/api\/comisiones\/planes/, metodo: /^POST$/, texto: "Crear plan de comisionamiento" },
  { ruta: /^\/api\/comisiones\/planes/, metodo: /^(PUT|PATCH)$/, texto: "Guardar plan de comisionamiento" },
  { ruta: /^\/api\/comisiones\/planes/, metodo: /^DELETE$/, texto: "Eliminar plan de comisionamiento" },
  { ruta: /^\/api\/comisiones\/plantillas/, texto: "Cambiar plantillas de comisionamiento" },
  { ruta: /^\/api\/comisiones\/pendientes/, texto: "Cambiar pendientes de cobro" },
  { ruta: /^\/api\/comisiones\/(rejillas|verificar|promociones)/, texto: "Cambiar validaciones de comisiones" },
  { ruta: /^\/api\/cotejo/, texto: "Cambiar el cotejo de cobros" },
];

/** Texto legible de lo que hace una petición, para el historial («Editar expediente», «Eliminar clientes»…). */
export function etiquetaDeAccion(metodo: string, ruta: string): string {
  const m = metodo.toUpperCase();
  for (const e of ETIQUETAS) if (e.ruta.test(ruta) && (!e.metodo || e.metodo.test(m))) return e.texto;
  return `${VERBO[m] ?? "Cambiar"} datos (${ruta.replace(/^\/api\//, "")})`;
}
