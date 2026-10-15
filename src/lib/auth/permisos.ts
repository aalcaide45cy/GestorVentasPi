/** Roles y permisos (sección 7 del informe). Se evalúan siempre en el servidor. */

export const ROLES = [
  "administrador",
  "director",
  "jefe_zona",
  "jefe_tienda",
  "vendedor",
  "invitado",
] as const;

export type Rol = (typeof ROLES)[number];

export const ROLES_ACTIVOS: readonly Rol[] = ["administrador", "director", "jefe_zona", "jefe_tienda", "vendedor"];

/** Etiqueta visible de cada rol (misma capitalización que la app original). */
export const ETIQUETA_ROL: Record<Rol, string> = {
  administrador: "Administrador",
  director: "Director",
  jefe_zona: "Jefe_zona",
  jefe_tienda: "Jefe_tienda",
  vendedor: "Vendedor",
  invitado: "Invitado",
};

/** Clase CSS del badge de rol (Anexo C). */
export const CLASE_BADGE_ROL: Record<Rol, string> = {
  administrador: "badge-admin",
  director: "badge-director",
  jefe_zona: "badge-zona",
  jefe_tienda: "badge-tienda",
  vendedor: "badge-vendedor",
  invitado: "badge-invitado",
};

export function esRol(valor: unknown): valor is Rol {
  return typeof valor === "string" && (ROLES as readonly string[]).includes(valor);
}

/** Rol efectivo: un valor ausente o desconocido se trata como invitado. */
export function normalizarRol(valor: string | null | undefined): Rol {
  return esRol(valor) ? valor : "invitado";
}

export function esAdministrador(rol: string | null | undefined): boolean {
  return rol === "administrador";
}

/** Cualquier rol salvo invitado. */
export function esRolActivo(rol: string | null | undefined): boolean {
  return ROLES_ACTIVOS.includes(normalizarRol(rol));
}

/** Quién ve el botón «Nuevo Expediente» y puede crear expedientes (7.2). */
export function puedeCrearExpedientes(rol: string | null | undefined): boolean {
  return rol === "administrador" || rol === "jefe_tienda" || rol === "vendedor";
}

/** Administradores y directores ven todas las tiendas (7.2). */
export function veTodasLasTiendas(rol: string | null | undefined): boolean {
  return rol === "administrador" || rol === "director";
}

export type Permiso =
  | "sesion"
  | "no_invitado"
  | "administrador"
  | "crear_expedientes";

export function cumplePermiso(rol: string | null | undefined, permiso: Permiso): boolean {
  switch (permiso) {
    case "sesion":
      return true;
    case "no_invitado":
      return esRolActivo(rol);
    case "administrador":
      return esAdministrador(rol);
    case "crear_expedientes":
      return puedeCrearExpedientes(rol);
  }
}
