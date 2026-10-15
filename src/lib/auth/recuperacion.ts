import { randomInt } from "node:crypto";
import { huella } from "./cifrado";

export const NUM_CODIGOS = 10;
const ALFABETO = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Diez códigos de recuperación con formato `XXXX-XXXX`. */
export function generarCodigosRecuperacion(cantidad = NUM_CODIGOS): string[] {
  const trozo = () => Array.from({ length: 4 }, () => ALFABETO[randomInt(ALFABETO.length)]).join("");
  return Array.from({ length: cantidad }, () => `${trozo()}-${trozo()}`);
}

/** Forma canónica: mayúsculas y sin separadores, para aceptar `abcd efgh` o `abcd-efgh`. */
export function normalizarCodigoRecuperacion(codigo: string): string {
  return codigo.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function parecidoACodigoRecuperacion(codigo: string): boolean {
  return /^[A-Z2-9]{8}$/.test(normalizarCodigoRecuperacion(codigo));
}

export function huellaCodigoRecuperacion(codigo: string): string {
  return huella(normalizarCodigoRecuperacion(codigo), "codigos-recuperacion");
}
