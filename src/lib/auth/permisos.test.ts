import { describe, expect, it } from "vitest";
import {
  cumplePermiso,
  esRolActivo,
  normalizarRol,
  puedeCrearExpedientes,
  ROLES,
  veTodasLasTiendas,
} from "./permisos";

describe("matriz de permisos (sección 7.2)", () => {
  it("solo administrador, jefe_tienda y vendedor crean expedientes", () => {
    const quienes = ROLES.filter((r) => puedeCrearExpedientes(r));
    expect(quienes).toEqual(["administrador", "jefe_tienda", "vendedor"]);
  });

  it("el invitado no es un rol activo y los demás sí", () => {
    expect(esRolActivo("invitado")).toBe(false);
    expect(esRolActivo(null)).toBe(false);
    expect(esRolActivo("vendedor")).toBe(true);
  });

  it("solo el administrador cumple el permiso 'administrador'", () => {
    expect(ROLES.filter((r) => cumplePermiso(r, "administrador"))).toEqual(["administrador"]);
  });

  it("un rol desconocido se trata como invitado", () => {
    expect(normalizarRol("superjefe")).toBe("invitado");
    expect(normalizarRol(undefined)).toBe("invitado");
  });

  it("administrador y director ven todas las tiendas", () => {
    expect(ROLES.filter((r) => veTodasLasTiendas(r))).toEqual(["administrador", "director"]);
  });
});
